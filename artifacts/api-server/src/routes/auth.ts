import { Router } from "express";
import { prisma } from "@workspace/db";
import * as crypto from "crypto";
import {
  hashPassword,
  verifyPassword,
  signSession,
  verifySession,
} from "../lib/auth";
import { createNotification, findProductionManagers } from "./notifications";
import { postAutoStandupUpdate } from "./standup-updates";
import { cacheGet, cacheSet, cacheDel, cacheKeys } from "../lib/cache";
import { sendPasswordResetEmail } from "../lib/mailer";
import { isSessionStillValid } from "../middleware/tenant";
import { openShift, closeShift } from "../lib/attendance";
import {
  rateLimitByIp,
  checkRateLimit,
  peekRateLimit,
  consumeRateLimit,
  resetRateLimit,
  rejectRateLimited,
  clientIp,
} from "../lib/rateLimit";

export const authRouter = Router();

// Everyone who actually works a shift is clocked in by signing in -- the
// studio treats logging into the portal as the start of the working day.
// admin is an account-administration role that keeps no timesheet, and
// `client` is an external reviewer, so neither is ever punched in.
const AUTO_CLOCK_IN_ROLES = ["artist", "lead", "production_head", "producer"];

// Self-registration can only ever mint the least-privileged real role.
// Anything above artist is granted deliberately, by someone holding
// manage_members (PATCH /users/:id) or by an invite that names the role.
const SELF_REGISTER_ROLE = "artist";

const MIN_PASSWORD_LENGTH = 8;

// Hash of a value nobody can supply, verified against when the email isn't
// found so the unknown-account path does the same argon2 work as the real
// one. Built lazily and once: hashing costs ~110ms, and doing it per failed
// login would hand back the timing signal it exists to remove.
let decoyHash: Promise<string> | null = null;
function getDecoyHash(): Promise<string> {
  if (!decoyHash) decoyHash = hashPassword(crypto.randomBytes(32).toString("hex"));
  return decoyHash;
}

/**
 * Invalidates every session the user currently holds.
 *
 * Sessions are stateless JWTs, so there is nothing to delete -- the version
 * in the token stops matching the column and `tenantAuthMiddleware` rejects
 * it. The cached copy is deleted too so this takes effect on the very next
 * request rather than whenever the 5-minute cache entry happens to expire.
 *
 * Note this is "sign out everywhere" by design: logging out on a laptop also
 * ends the phone session. For a studio tool that is the safer default, and
 * it is what makes offboarding and password changes actually cut access.
 */
export async function revokeSessions(userId: string, tenantId: string) {
  await prisma.user.updateMany({
    where: { id: userId, tenantId },
    data: { tokenVersion: { increment: 1 } },
  });
  await cacheDel(cacheKeys.tokenVersion(userId));
  await cacheDel(cacheKeys.userMe(tenantId, userId));
}

// Two independent buckets, and only FAILED attempts spend either one. The IP
// bucket stops broad credential-stuffing; the per-account bucket is the one
// that matters for a targeted attack, because it holds even if the attacker
// rotates source addresses (the API port is published directly, so
// X-Forwarded-For is spoofable there).
//
// Counting successes too would have been an availability bug: a studio sits
// behind one office IP, so the 9am sign-in rush would trip a shared bucket
// and lock the team out of its own tool.
const LOGIN_IP_RULE = { name: "login:ip", limit: 60, windowSeconds: 900 };
const LOGIN_ACCOUNT_RULE = { name: "login:account", limit: 8, windowSeconds: 900 };

// Self-registration is unauthenticated and creates rows, so it needs its own
// ceiling independent of login's. Same shared-office-IP reality as login:ip
// above applies here too -- a handful of new hires onboarding the same
// afternoon from one studio connection must not exhaust this bucket for
// everyone else trying to sign up. In this deployment that is not a
// hypothetical: Docker Desktop NATs every machine in the studio to one
// gateway address, so "per IP" here means "per studio".
const REGISTER_RULE = { name: "register:ip", limit: 100, windowSeconds: 3600 };

// Loading the form's department/role pickers is a public, read-only call that
// creates nothing. It used to share REGISTER_RULE, which meant simply
// *opening* the register page spent account-creation budget: roughly twenty
// page views -- not twenty sign-ups -- locked the whole studio out for an
// hour. Worse, the failure was silent, because register.tsx only renders the
// department and role fields when the options call succeeds, so a 429 here
// showed up as a form that had quietly lost half its inputs.
const REGISTER_OPTIONS_RULE = {
  name: "register:options",
  limit: 600,
  windowSeconds: 3600,
};

// The bucket that actually constrains abuse, now that the IP ceiling has to
// be loose enough for a shared address. Keyed per email, so hammering one
// address is bounded no matter where the requests come from, while a room
// full of new hires signing themselves up never collides.
const REGISTER_EMAIL_RULE = {
  name: "register:email",
  limit: 5,
  windowSeconds: 3600,
};

// change-password also does a verifyPassword() comparison and had no ceiling
// at all -- unlike /login, a stolen or idle session cookie let an attacker
// guess the account's real password an unlimited number of times against
// this route. Keyed per-account like login's account bucket: the caller
// already holds a session, so an IP bucket would just punish everyone
// sharing that session's network for one bad actor.
const CHANGE_PASSWORD_RULE = { name: "change-password:account", limit: 8, windowSeconds: 900 };

authRouter.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Missing email or password" });
    }

    const accountKey = String(email).trim().toLowerCase();
    const ip = clientIp(req);

    // Read both budgets without spending them; only a failure below spends.
    const [ipLimit, accountLimit] = await Promise.all([
      peekRateLimit(LOGIN_IP_RULE, ip),
      peekRateLimit(LOGIN_ACCOUNT_RULE, accountKey),
    ]);
    if (!ipLimit.allowed || !accountLimit.allowed) {
      req.log?.warn(
        { ip, email: accountKey, ipBlocked: !ipLimit.allowed },
        "login rate limit exceeded",
      );
      return rejectRateLimited(
        res,
        Math.max(ipLimit.retryAfter, accountLimit.retryAfter),
      );
    }

    // Matched case-insensitively so someone who registered as "A.Sharma@x.com"
    // can sign in as "a.sharma@x.com"; registration already rejects duplicates
    // on the same basis, so this can't match two different accounts.
    const user = await prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
    });

    // Returning early on an unknown email skipped the ~110ms argon2 verify,
    // making a registered address distinguishable from an unregistered one
    // by response time alone (measured: 118ms vs 6ms) -- an enumeration
    // oracle for the studio's real staff addresses, which defeats the point
    // of the identical error message below. Verifying against a decoy hash
    // makes both paths cost the same.
    const isValid = user
      ? await verifyPassword(password, user.hashedPassword)
      : await verifyPassword(password, await getDecoyHash());

    if (!user || !isValid) {
      await Promise.all([
        consumeRateLimit(LOGIN_IP_RULE, ip),
        consumeRateLimit(LOGIN_ACCOUNT_RULE, accountKey),
      ]);
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // A correct password clears the account's failure budget so a legitimate
    // user who fumbled a few times isn't left locked out for the window.
    await resetRateLimit(LOGIN_ACCOUNT_RULE, accountKey);

    // Checked only after a correct password, deliberately: doing it earlier
    // would let a wrong-password guess distinguish a deactivated account
    // from an active one, reopening the enumeration gap the decoy-hash
    // timing fix above just closed. Only someone who already proved they
    // know the password learns the account itself is what's blocking them.
    if (user.status !== "active") {
      return res.status(403).json({
        error: "This account has been deactivated. Contact your studio admin.",
      });
    }

    // Resolve tenant and role details
    const tenant = await prisma.tenant.findFirst({ where: { id: user.tenantId } });
    const role = await prisma.tenantRole.findFirst({ where: { id: user.roleId } });
    const roleCaps = await prisma.tenantRoleCapability.findMany({
      where: { roleId: user.roleId },
    });
    const capabilities = roleCaps.map((c) => c.capabilityId);

    const sessionPayload = {
      userId: user.id,
      tenantId: user.tenantId,
      roleId: user.roleId,
      departmentId: user.departmentId,
      tv: user.tokenVersion,
    };

    // Idempotent by construction: the `punchedInAt: null` guard means a
    // second login while a punch session is already open is a no-op rather
    // than a restarted clock, so the elapsed time the header widget shows
    // (and whatever the eventual punch-out logs) stays continuous.
    let punchedInAt = user.punchedInAt;
    if (role && AUTO_CLOCK_IN_ROLES.includes(role.name) && !punchedInAt) {
      const punchedAt = new Date();
      const result = await prisma.user.updateMany({
        where: { id: user.id, tenantId: user.tenantId, punchedInAt: null },
        data: { punchedInAt: punchedAt },
      });
      if (result.count > 0) {
        punchedInAt = punchedAt;
        await cacheDel(cacheKeys.userMe(user.tenantId, user.id));
      }
    }

    // The durable half of the same punch. `punchedInAt` above is only the
    // current state and is erased on sign-out; this writes the shift itself
    // so the hours survive it. Best-effort on purpose -- attendance is never
    // a reason to fail a sign-in.
    if (role && AUTO_CLOCK_IN_ROLES.includes(role.name)) {
      try {
        await openShift(user.tenantId, user.id, "login");
      } catch (err) {
        req.log.error(err, "Failed to open attendance shift on login");
      }
    }

    const token = signSession(sessionPayload);
    res.cookie("session", token, {
      httpOnly: true,
      secure: process.env.COOKIE_SECURE === "true",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    // Fire-and-forget: never let a notification failure block login itself.
    // Skip notifying a production_head that they logged in themselves --
    // that's not a signal anyone (including them) needs to see.
    if (role?.name !== "production_head") {
      (async () => {
        try {
          const dept = user.departmentId
            ? await prisma.department.findFirst({ where: { id: user.departmentId } })
            : null;
          const recipients = await findProductionManagers(
            user.tenantId,
            dept?.name,
          );
          for (const recipient of recipients) {
            await createNotification({
              tenantId: user.tenantId,
              recipientUserId: recipient.id,
              category: "system",
              title: `${user.name} logged in`,
              description: `${user.name} (${role?.name || "member"}${dept ? `, ${dept.name}` : ""}) just signed in.`,
              entityType: "user",
              entityId: user.id,
            });
          }
        } catch (err) {
          req.log.error(err, "Failed to send login notification");
        }
      })();
    }

    return res.status(200).json({
      user: {
        id: user.id,
        name: user.name,
        role: role?.name || "admin",
        departmentId: user.departmentId,
        capabilities,
        punchedInAt,
        onboardedAt: user.onboardedAt,
      },
      tenant: {
        id: tenant!.id,
        name: tenant!.name,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Signing out ends the working day: it files the day's standup update from
// whatever the user really did (nothing is posted when there's nothing to
// report) and closes any open punch session, so someone who just closes the
// tab isn't left permanently clocked in. Both steps are best-effort -- a
// failure here must still clear the cookie and log the user out.
authRouter.post("/logout", async (req, res) => {
  const token = req.cookies?.session;
  const session = token ? verifySession(token) : null;

  // A client-access session carries a null userId: no timesheet, no standup.
  if (session?.userId) {
    try {
      await postAutoStandupUpdate(session.tenantId, session.userId);
    } catch (err) {
      req.log.error(err, "Failed to post automatic standup update on logout");
    }
    try {
      const result = await prisma.user.updateMany({
        where: {
          id: session.userId,
          tenantId: session.tenantId,
          punchedInAt: { not: null },
        },
        data: { punchedInAt: null },
      });
      if (result.count > 0) {
        await cacheDel(cacheKeys.userMe(session.tenantId, session.userId));
      }
    } catch (err) {
      req.log.error(err, "Failed to clock out on logout");
    }
    // Closes the attendance row the login opened, writing the shift's length.
    // Separate from the punch reset above so that a failure in either one
    // still leaves the other consistent -- and so the hours are recorded even
    // if the punch column was somehow already cleared.
    try {
      await closeShift(session.tenantId, session.userId, "logout");
    } catch (err) {
      req.log.error(err, "Failed to close attendance shift on logout");
    }
    // Clearing the cookie only asks the browser to forget the token; the JWT
    // itself stayed valid for its full 7 days, so a copy taken from a shared
    // machine or captured in transit kept working after "logging out".
    // Bumping the version is what actually ends the session.
    try {
      await revokeSessions(session.userId, session.tenantId);
    } catch (err) {
      req.log.error(err, "Failed to revoke sessions on logout");
    }
  }

  res.clearCookie("session");
  return res.status(200).json({ message: "Logged out" });
});

// Self-service signup for new joiners. Deliberately narrow: the request body
// contributes nothing but name/email/password -- tenant, role, department and
// capabilities are all resolved server-side, so no registrant can hand
// themselves a privileged role or cross into another studio's tenant.
// Populates the registration form's department and role pickers. Necessarily
// unauthenticated -- the person calling it has no account yet. It exposes only
// names and identifiers of departments and roles, never any person or
// production data. It carries its own generous budget rather than sharing
// registration's: see REGISTER_OPTIONS_RULE.
authRouter.get("/registration-options", rateLimitByIp(REGISTER_OPTIONS_RULE), async (req, res) => {
  try {
    const registrationSlug = process.env.REGISTRATION_TENANT_SLUG;
    const tenants = registrationSlug
      ? await prisma.tenant.findMany({ where: { slug: registrationSlug, deletedAt: null }, take: 2 })
      : await prisma.tenant.findMany({ where: { deletedAt: null }, take: 2 });
    if (tenants.length !== 1) return res.json({ departments: [], roles: [] });

    const [departments, roles] = await Promise.all([
      prisma.department.findMany({
        where: { tenantId: tenants[0].id },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      prisma.tenantRole.findMany({
        where: { tenantId: tenants[0].id },
        select: { name: true },
      }),
    ]);

    // The client role is an external-reviewer construct reached through an
    // access link, never through self-registration, so offering it here would
    // only produce accounts that cannot be used.
    return res.json({
      departments,
      roles: roles.map((r) => r.name).filter((n) => n !== "client"),
    });
  } catch (err) {
    req.log.error(err, "Failed to load registration options");
    return res.status(500).json({ error: "Internal server error" });
  }
});

authRouter.post("/register", rateLimitByIp(REGISTER_RULE), async (req, res) => {
  // One response shape for "created" and "email already taken" alike:
  // a differing status or message here would turn this endpoint into an
  // account-enumeration oracle for the whole studio roster.
  const genericSuccess = {
    message:
      "Registration received. If this email isn't already registered, you can now sign in.",
  };

  try {
    const { name, email, password, departmentId, requestedRole } = req.body;
    if (
      typeof name !== "string" ||
      !name.trim() ||
      typeof email !== "string" ||
      !email.trim() ||
      typeof password !== "string"
    ) {
      return res
        .status(400)
        .json({ error: "name, email, and password are required" });
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({
        error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
      });
    }

    const trimmedEmail = email.trim();

    // Per-address ceiling. This is the bucket doing the real work now that
    // the IP one has to stay loose for a studio behind a single NAT address
    // -- and it rejects identically whether or not the account exists, so it
    // stays consistent with the generic success response below rather than
    // becoming an enumeration oracle of its own.
    const emailKey = trimmedEmail.toLowerCase();
    const emailBudget = await checkRateLimit(REGISTER_EMAIL_RULE, emailKey);
    if (!emailBudget.allowed) {
      req.log.warn({ rule: REGISTER_EMAIL_RULE.name }, "registration rate limit exceeded");
      return rejectRateLimited(res, emailBudget.retryAfter);
    }

    // Which studio a self-registration lands in can't come from the request.
    // A single-tenant deployment (the common case) resolves unambiguously;
    // anything else has to name the tenant in the environment rather than
    // guess.
    const registrationSlug = process.env.REGISTRATION_TENANT_SLUG;
    const tenants = registrationSlug
      ? await prisma.tenant.findMany({
          where: { slug: registrationSlug, deletedAt: null },
          take: 2,
        })
      : await prisma.tenant.findMany({ where: { deletedAt: null }, take: 2 });
    if (tenants.length !== 1) {
      req.log.error(
        { matched: tenants.length },
        "Registration could not resolve a single tenant; set REGISTRATION_TENANT_SLUG",
      );
      return res
        .status(503)
        .json({ error: "Self-registration is not available on this instance" });
    }
    const tenant = tenants[0];

    const role = await prisma.tenantRole.findFirst({
      where: { tenantId: tenant.id, name: SELF_REGISTER_ROLE },
      select: { id: true },
    });
    if (!role) {
      req.log.error(
        { tenantId: tenant.id },
        `Registration blocked: tenant has no "${SELF_REGISTER_ROLE}" role`,
      );
      return res
        .status(503)
        .json({ error: "Self-registration is not available on this instance" });
    }

    // Case-insensitive on purpose, even though the stored value keeps the
    // casing the registrant typed (matching invites.ts and POST /users):
    // users.email is uniquely indexed on the exact string, so a
    // case-sensitive check here would happily create a second account for
    // what is, to every human involved, the same address.
    const existing = await prisma.user.findFirst({
      where: { email: { equals: trimmedEmail, mode: "insensitive" } },
      select: { id: true },
    });
    if (existing) return res.status(201).json(genericSuccess);

    // Department is safe to self-select: it scopes what a person sees, it
    // grants no authority, and without it a new hire's lead cannot even find
    // them to assign work. Validated against this tenant so the field cannot
    // be used to point at another studio's department.
    let resolvedDepartmentId: string | null = null;
    if (typeof departmentId === "string" && departmentId.trim()) {
      const dept = await prisma.department.findFirst({
        where: { id: departmentId, tenantId: tenant.id },
        select: { id: true },
      });
      if (!dept) return res.status(400).json({ error: "Unknown department" });
      resolvedDepartmentId = dept.id;
    }

    // Role is NOT safe to self-select. Anyone who can reach this page could
    // otherwise grant themselves studio-wide authority. The account is always
    // created at SELF_REGISTER_ROLE; a request for anything more authoritative
    // is recorded for an administrator to approve deliberately.
    let recordedRequest: string | null = null;
    if (typeof requestedRole === "string" && requestedRole.trim()) {
      const wanted = requestedRole.trim();
      if (wanted !== SELF_REGISTER_ROLE) {
        const wantedRole = await prisma.tenantRole.findFirst({
          where: { tenantId: tenant.id, name: wanted },
          select: { name: true },
        });
        // An unrecognised role name is recorded as nothing rather than
        // rejected: the registration itself is still valid, and refusing it
        // would turn this into a probe for which roles exist.
        if (wantedRole) recordedRequest = wantedRole.name;
      }
    }

    await prisma.user.create({
      data: {
        id: crypto.randomUUID(),
        tenantId: tenant.id,
        roleId: role.id,
        departmentId: resolvedDepartmentId,
        email: trimmedEmail,
        hashedPassword: await hashPassword(password),
        name: name.trim(),
        status: "active",
        requestedRole: recordedRequest,
      },
    });

    return res.status(201).json(genericSuccess);
  } catch (err) {
    // Two registrations for the same address racing each other land on
    // users_email_unique -- the loser still has to get the same response the
    // "already taken" branch above returns, not a 500 that reveals the race.
    if ((err as { code?: string }).code === "P2002") {
      return res.status(201).json(genericSuccess);
    }
    req.log.error(err, "Failed to register user");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Marks the first-run walkthrough as seen. Deliberately idempotent and
// deliberately not undoable by accident: `replay` re-arms it so a user can
// take the tour again from Settings without an administrator clearing a
// column by hand.
authRouter.post("/onboarding", async (req, res) => {
  const token = req.cookies?.session;
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  const session = verifySession(token);
  if (!session?.userId) return res.status(401).json({ error: "Invalid session" });
  if (!(await isSessionStillValid(session.userId, session.tv ?? 0)))
    return res.status(401).json({ error: "Session expired" });

  const replay = req.body?.replay === true;
  try {
    await prisma.user.update({
      where: { id: session.userId },
      data: { onboardedAt: replay ? null : new Date() },
    });
    // /me is cached for 15s and carries onboardedAt, so without this the
    // tour would reappear on the next poll for up to a quarter of a minute
    // after the user dismissed it.
    await cacheDel(cacheKeys.userMe(session.tenantId, session.userId));
    return res.status(200).json({ ok: true });
  } catch (err) {
    req.log.error(err, "Failed to update onboarding state");
    return res.status(500).json({ error: "Internal server error" });
  }
});

authRouter.get("/me", async (req, res) => {
  const token = req.cookies?.session;
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  const session = verifySession(token);
  if (!session) return res.status(401).json({ error: "Invalid session" });
  // /me is for real-user sessions only; client-access-link sessions carry a
  // null userId and have no users row to look up.
  if (!session.userId) return res.status(401).json({ error: "Invalid session" });

  // This route verifies the cookie itself rather than going through
  // tenantAuthMiddleware, so it needs the same revocation + deactivation
  // check -- otherwise the one endpoint the whole frontend polls every 10s
  // would keep answering for a session that logout, a password change, or
  // an admin deactivating the account already ended.
  if (!(await isSessionStillValid(session.userId, session.tv ?? 0)))
    return res.status(401).json({ error: "Session expired" });

  // App.tsx polls this endpoint every 10s for every logged-in session,
  // regardless of role -- artist, lead, production_head, producer, admin
  // all hit it identically, and the 4 DB queries below return the same
  // result on almost every one of those polls. A short TTL cache turns most
  // of that polling traffic into a single Redis read; the write paths that
  // actually change this payload (profile edit, avatar upload, an admin
  // changing someone's role/department) call cacheDel on this same key so
  // real changes still show up immediately rather than waiting out the TTL.
  const cacheKey = cacheKeys.userMe(session.tenantId, session.userId);
  const cached = await cacheGet<Record<string, unknown>>(cacheKey);
  if (cached) return res.status(200).json(cached);

  const user = await prisma.user.findFirst({ where: { id: session.userId } });
  if (!user) return res.status(401).json({ error: "User deleted" });

  const tenant = await prisma.tenant.findFirst({ where: { id: session.tenantId } });
  const role = await prisma.tenantRole.findFirst({ where: { id: session.roleId } });
  const roleCaps = await prisma.tenantRoleCapability.findMany({
    where: { roleId: session.roleId },
  });
  const capabilities = roleCaps.map((c) => c.capabilityId);

  const payload = {
    user: {
      id: user.id,
      name: user.name,
      role: role?.name || "admin",
      departmentId: user.departmentId,
      capabilities,
      punchedInAt: user.punchedInAt,
      onboardedAt: user.onboardedAt,
    },
    tenant: {
      id: tenant?.id ?? "",
      name: tenant?.name || "",
    },
  };
  await cacheSet(cacheKey, payload, 15);
  return res.status(200).json(payload);
});

// ---------------------------------------------------------------------------
// Password change and reset
//
// Neither existed before: a user who forgot their password had no route back
// in short of an admin editing the database, and one who suspected their
// account was compromised had no way to rotate the credential. Both paths end
// by revoking every existing session, so changing a password actually locks
// out whoever else was holding one.
// ---------------------------------------------------------------------------

const RESET_REQUEST_RULE = { name: "pwreset:ip", limit: 5, windowSeconds: 900 };
const RESET_CONSUME_RULE = { name: "pwreset-consume:ip", limit: 10, windowSeconds: 900 };
const RESET_TOKEN_TTL_MINUTES = 30;

/** Reset tokens are stored hashed; only the emailed copy is usable. */
function hashResetToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

authRouter.post("/change-password", async (req, res) => {
  try {
    const token = req.cookies?.session;
    const session = token ? verifySession(token) : null;
    if (!session?.userId) return res.status(401).json({ error: "Unauthorized" });

    const { currentPassword, newPassword } = req.body ?? {};
    if (!currentPassword || !newPassword)
      return res
        .status(400)
        .json({ error: "currentPassword and newPassword are required" });
    if (String(newPassword).length < MIN_PASSWORD_LENGTH)
      return res.status(400).json({
        error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters`,
      });

    const guessLimit = await peekRateLimit(CHANGE_PASSWORD_RULE, session.userId);
    if (!guessLimit.allowed)
      return rejectRateLimited(res, guessLimit.retryAfter);

    const user = await prisma.user.findFirst({
      where: { id: session.userId, tenantId: session.tenantId, deletedAt: null },
    });
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    // Proving knowledge of the current password is what stops someone who
    // borrowed an unlocked laptop from silently taking the account over.
    if (!(await verifyPassword(currentPassword, user.hashedPassword))) {
      await consumeRateLimit(CHANGE_PASSWORD_RULE, session.userId);
      return res.status(403).json({ error: "Current password is incorrect" });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { hashedPassword: await hashPassword(newPassword) },
    });
    await revokeSessions(user.id, user.tenantId);

    // The caller's own session is now invalid too, which is correct -- they
    // sign in again with the new password.
    res.clearCookie("session");
    return res
      .status(200)
      .json({ message: "Password changed. Please sign in again." });
  } catch (err) {
    req.log.error(err, "Failed to change password");
    return res.status(500).json({ error: "Internal server error" });
  }
});

authRouter.post(
  "/forgot-password",
  rateLimitByIp(RESET_REQUEST_RULE),
  async (req, res) => {
    // Always the same response, whether or not the address exists -- a
    // differing message here would rebuild the account-enumeration oracle
    // that the login timing fix and the register endpoint both close.
    const genericResponse = {
      message: "If that email matches an account, a reset link is on its way.",
    };
    try {
      const { email } = req.body ?? {};
      if (!email) return res.status(200).json(genericResponse);

      const user = await prisma.user.findFirst({
        where: {
          email: { equals: String(email), mode: "insensitive" },
          deletedAt: null,
        },
      });
      if (!user) return res.status(200).json(genericResponse);

      // Any outstanding token is retired first, so a reset request always
      // leaves exactly one usable link.
      await prisma.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      });

      const rawToken = crypto.randomBytes(32).toString("base64url");
      await prisma.passwordResetToken.create({
        data: {
          id: crypto.randomUUID(),
          tenantId: user.tenantId,
          userId: user.id,
          tokenHash: hashResetToken(rawToken),
          expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60_000),
          requestedIp: clientIp(req),
        },
      });

      try {
        await sendPasswordResetEmail({
          to: user.email,
          name: user.name,
          resetUrl: `${process.env.FRONTEND_URL || ""}/reset-password?token=${rawToken}`,
          expiresInMinutes: RESET_TOKEN_TTL_MINUTES,
        });
      } catch (err) {
        // A mail outage must not tell the caller whether the address exists.
        req.log.error(err, "Failed to send password reset email");
      }

      return res.status(200).json(genericResponse);
    } catch (err) {
      req.log.error(err, "Failed to handle password reset request");
      return res.status(200).json(genericResponse);
    }
  },
);

authRouter.post(
  "/reset-password",
  rateLimitByIp(RESET_CONSUME_RULE),
  async (req, res) => {
    try {
      const { token, newPassword } = req.body ?? {};
      if (!token || !newPassword)
        return res
          .status(400)
          .json({ error: "token and newPassword are required" });
      if (String(newPassword).length < MIN_PASSWORD_LENGTH)
        return res.status(400).json({
          error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
        });

      // Looked up by hash: the raw token exists only in the recipient's inbox.
      const record = await prisma.passwordResetToken.findFirst({
        where: {
          tokenHash: hashResetToken(String(token)),
          usedAt: null,
          expiresAt: { gt: new Date() },
        },
      });
      if (!record)
        return res
          .status(400)
          .json({ error: "This reset link is invalid or has expired." });

      const newHash = await hashPassword(newPassword);
      // Marking used and setting the password go together: a half-applied
      // reset would either burn a valid link or leave a spent one usable.
      await prisma.$transaction([
        prisma.passwordResetToken.update({
          where: { id: record.id },
          data: { usedAt: new Date() },
        }),
        prisma.user.update({
          where: { id: record.userId },
          data: { hashedPassword: newHash },
        }),
      ]);
      await revokeSessions(record.userId, record.tenantId);

      return res.status(200).json({
        message: "Password reset. You can sign in with your new password.",
      });
    } catch (err) {
      req.log.error(err, "Failed to reset password");
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);
