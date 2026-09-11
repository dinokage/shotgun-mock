import { Router } from "express";
import { prisma } from "@workspace/db";

// Mirrors STUDIO_LEADERSHIP_ROLES in artifacts/forge/src/store/permissions.ts
// -- the only roster rows an external client has any legitimate reason to
// see (their studio points of contact), matching what people.tsx/profile.tsx
// already filter down to on the frontend.
const STUDIO_LEADERSHIP_ROLES = ["admin", "production_head"];
import { tenantAuthMiddleware } from "../middleware/tenant";
import { requireCapability } from "../middleware/rbac";
import { hashPassword, verifyPassword } from "../lib/auth";
import { getVisibilityScope } from "../lib/visibilityScope";
import { getClientScope } from "../lib/clientScope";
import { revokeSessions } from "./auth";
import { cacheDel, cacheKeys } from "../lib/cache";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import multer from "multer";

const router = Router();

router.use(tenantAuthMiddleware);

// Separate from uploads.ts's generic attachment endpoint on purpose: that
// route forces every download as application/octet-stream + Content-
// Disposition: attachment (correct there -- an arbitrary uploaded file must
// never render inline, since an .html/.svg attachment served inline would
// execute as same-origin stored XSS). An avatar has to render inline as an
// <img>, which is safe here specifically because this route accepts nothing
// but a whitelisted image mimetype -- an image byte stream can't execute as
// script the way an uploaded HTML/SVG document could.
const AVATAR_UPLOAD_DIR = path.join(
  process.env.UPLOAD_DIR || "/app/uploads",
  "avatars",
);
const AVATAR_MIME_EXT: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
};
const avatarUpload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const tenantId = req.tenantId!;
      const dir = path.join(AVATAR_UPLOAD_DIR, tenantId);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      cb(null, `${crypto.randomUUID()}${AVATAR_MIME_EXT[file.mimetype]}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB -- a profile picture, not a DCC asset
  fileFilter: (_req, file, cb) => {
    if (!(file.mimetype in AVATAR_MIME_EXT)) {
      cb(new Error("Only PNG, JPEG, WebP, or GIF images are allowed"));
      return;
    }
    cb(null, true);
  },
});

router.get("/", async (req, res) => {
  try {
    const tenantId = req.tenantId!;

    // The client portal is review-only (spec: client feedback routes to the
    // Production Head, who reassigns internally) -- an external client has no
    // legitimate reason to read the full internal staff roster. They do
    // legitimately need their studio points of contact (people.tsx/
    // profile.tsx already filter to STUDIO_LEADERSHIP_ROLES for a client on
    // the frontend), so scope the query itself rather than blocking the
    // whole endpoint -- a full 403 would otherwise fall through fetchMe()'s
    // `.catch(() => [])` and leave the client looking at stale mock names.
    const callerRole = await prisma.tenantRole.findFirst({
      where: { id: req.roleId! },
      select: { name: true },
    });
    const isClient = callerRole?.name === "client";

    // Revoking a link must actually cut it off here too. This route keyed
    // only off the role name, so a revoked client kept reading the roster
    // until its 7-day JWT expired, while every getClientScope-based route
    // had already gone empty.
    if (req.clientAccessLinkId && !(await getClientScope(req))) return res.json([]);

    const rows = await prisma.user.findMany({
      where: {
        tenantId,
        ...(isClient ? { role: { name: { in: STUDIO_LEADERSHIP_ROLES } } } : {}),
      },
      select: {
        id: true,
        tenantId: true,
        roleId: true,
        role: { select: { name: true } },
        departmentId: true,
        email: true,
        name: true,
        title: true,
        avatar: true,
        status: true,
        punchedInAt: true,
        lastSeenAt: true,
        requestedRole: true,
        createdAt: true,
      },
    });
    // The roster itself stays whole for every internal role -- names,
    // avatars, titles and departments are what assignee pickers, chat and
    // the standup board are built on, and hiding rows would break them.
    // What a non-studio-wide role must not get in bulk is the personal data
    // hanging off those rows:
    //   * email -- direct contact PII; only the caller's own is returned.
    //     Blanked to "" rather than dropped so the UserDTO's `email: string`
    //     shape (and callers that .toLowerCase() it) still holds.
    //   * punchedInAt / lastSeenAt -- attendance and live-activity data. Not
    //     blanked outright, because the payroll & attendance views leads
    //     legitimately use are built on them; they instead follow the
    //     caller's normal visibility scope (own row for an artist, own
    //     department for a lead).
    // A client's row set is narrowed to STUDIO_LEADERSHIP_ROLES above so it
    // can see who its studio contacts are -- names and titles, nothing more.
    // Treating a client as studio-wide here handed an external party every
    // leadership email address and live punch-in time, i.e. a ready-made
    // phishing list plus staff working hours.
    const scope = isClient ? null : await getVisibilityScope(req);
    const users = rows.map((u) => {
      const isSelf = !!req.userId && u.id === req.userId;
      const seesAttendance =
        !!scope &&
        (scope.kind === "all" ||
          isSelf ||
          (scope.kind === "department" && u.departmentId === scope.departmentId));
      return {
        ...u,
        role: u.role?.name ?? null,
        email: scope && (scope.kind === "all" || isSelf) ? u.email : "",
        punchedInAt: seesAttendance ? u.punchedInAt : null,
        lastSeenAt: seesAttendance ? u.lastSeenAt : null,
        // Only those who can act on a role request should see one pending.
        requestedRole: scope?.kind === "all" ? u.requestedRole : null,
      };
    });
    return res.json(users);
  } catch (err) {
    req.log.error(err, "Failed to fetch users");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", requireCapability("manage_members"), async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const { email, name, password, roleId, departmentId, title } = req.body;

    if (!email || !name || !password || !roleId) {
      return res
        .status(400)
        .json({ error: "Missing email, name, password, or roleId" });
    }

    // The caller supplies roleId, so it must be proven to belong to the
    // caller's OWN tenant. Without this, a `manage_members` holder in tenant B
    // could pass a roleId from tenant A and mint a user in tenant B whose
    // capability set is defined by a role tenant B does not own.
    const role = await prisma.tenantRole.findFirst({
      where: { id: roleId, tenantId },
    });

    if (!role) {
      return res.status(400).json({ error: "Invalid roleId" });
    }

    if (departmentId) {
      const dept = await prisma.department.findFirst({
        where: { id: departmentId, tenantId },
      });
      if (!dept) {
        return res.status(400).json({ error: "Invalid departmentId" });
      }
    }

    // usersTable.email is globally unique. Reject duplicates here so the caller
    // gets a clean 409 rather than a raw constraint-violation 500, and so login
    // (which looks users up by email with no tenant scoping) can never become
    // ambiguous between two tenants.
    const existing = await prisma.user.findFirst({ where: { email } });

    if (existing) {
      return res.status(409).json({ error: "Email already in use" });
    }

    const hashedPassword = await hashPassword(password);
    const newUser = await prisma.user.create({
      data: {
        id: crypto.randomUUID(),
        tenantId,
        roleId,
        departmentId: departmentId ?? null,
        email,
        name,
        title,
        hashedPassword,
      },
    });

    const { hashedPassword: _omit, ...user } = newUser;
    return res.status(201).json(user);
  } catch (err) {
    req.log.error(err, "Failed to create user");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Self-service profile edit -- any authenticated user may update their own
// name/title/avatar, no manage_members capability required. Registered
// BEFORE `PATCH /:id` below: Express matches routes in registration order,
// and `/:id` would otherwise swallow this as a request for the user whose id
// is literally "me".
router.patch("/me", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { name, title, avatar } = req.body;
    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name;
    if (title !== undefined) data.title = title;
    if (avatar !== undefined) data.avatar = avatar;

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: "No valid fields to update" });
    }

    const result = await prisma.user.updateMany({
      where: { id: userId, tenantId },
      data,
    });
    if (result.count === 0) return res.status(404).json({ error: "Not found" });
    const updated = await prisma.user.findFirstOrThrow({ where: { id: userId, tenantId } });

    await cacheDel(cacheKeys.userMe(tenantId, userId));
    const { hashedPassword: _omit, ...user } = updated;
    return res.json(user);
  } catch (err) {
    req.log.error(err, "Failed to update profile");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Real punch-clock state. Previously this lived entirely in a per-browser
// localStorage key (TimeClockWidget.tsx), which meant: reloading the page
// or opening a second device lost the session, and no other user could ever
// see whether someone was actually punched in -- daily-standup.tsx's
// "Payroll" table fell back to reading `status` (an account-enabled flag,
// true for basically every real employee) and showed everyone as punched in
// permanently. `punchedInAt` on the users table is the single source of
// truth every session and every viewer now reads from.
router.post("/me/punch-in", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const result = await prisma.user.updateMany({
      where: { id: userId, tenantId },
      data: { punchedInAt: new Date() },
    });
    if (result.count === 0) return res.status(404).json({ error: "Not found" });
    const updated = await prisma.user.findFirstOrThrow({ where: { id: userId, tenantId } });

    await cacheDel(cacheKeys.userMe(tenantId, userId));
    const { hashedPassword: _omit, ...user } = updated;
    return res.json(user);
  } catch (err) {
    req.log.error(err, "Failed to punch in");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/me/punch-out", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const result = await prisma.user.updateMany({
      where: { id: userId, tenantId },
      data: { punchedInAt: null },
    });
    if (result.count === 0) return res.status(404).json({ error: "Not found" });
    const updated = await prisma.user.findFirstOrThrow({ where: { id: userId, tenantId } });

    await cacheDel(cacheKeys.userMe(tenantId, userId));
    const { hashedPassword: _omit, ...user } = updated;
    return res.json(user);
  } catch (err) {
    req.log.error(err, "Failed to punch out");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/me/avatar", (req, res) => {
  avatarUpload.single("file")(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: "No file provided" });

    try {
      const tenantId = req.tenantId!;
      const userId = req.userId;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const url = `/api/users/me/avatar/${tenantId}/${req.file.filename}`;
      const result = await prisma.user.updateMany({
        where: { id: userId, tenantId },
        data: { avatar: url },
      });
      if (result.count === 0) return res.status(404).json({ error: "Not found" });
      const updated = await prisma.user.findFirstOrThrow({ where: { id: userId, tenantId } });

      await cacheDel(cacheKeys.userMe(tenantId, userId));
      const { hashedPassword: _omit, ...user } = updated;
      return res.status(201).json(user);
    } catch (innerErr) {
      req.log.error(innerErr, "Failed to save avatar");
      return res.status(500).json({ error: "Internal server error" });
    }
  });
});

// Path-scoped by tenantId (defense in depth on top of the already-unguessable
// UUID filename) and, unlike uploads.ts's generic file route, served with its
// real image Content-Type and no forced Content-Disposition -- an <img> tag
// needs to render this inline, and that's safe only because avatarUpload's
// fileFilter above already rejects anything that isn't a whitelisted image
// mimetype at write time.
router.get("/me/avatar/:tenantId/:filename", (req, res) => {
  const { tenantId, filename } = req.params;
  if (tenantId !== req.tenantId) return res.status(404).end();
  const safeName = path.basename(filename);
  const filePath = path.join(AVATAR_UPLOAD_DIR, tenantId, safeName);
  if (!fs.existsSync(filePath)) return res.status(404).end();

  const ext = path.extname(safeName).toLowerCase();
  const contentType =
    Object.entries(AVATAR_MIME_EXT).find(([, e]) => e === ext)?.[0] ||
    "application/octet-stream";
  res.setHeader("Content-Type", contentType);
  res.setHeader("Cache-Control", "private, max-age=3600");
  return res.sendFile(filePath);
});

router.patch("/:id", requireCapability("manage_members"), async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    // Cast needed: combining requireCapability() (typed against the generic,
    // path-agnostic Express Request) with this route's "/:id" path typing
    // makes TS widen req.params.id to `string | string[]` for overload
    // resolution purposes, even though a plain ":id" segment is always a
    // single string at runtime.
    const userId = req.params.id as string;
    const { roleId, departmentId, status } = req.body;

    const existing = await prisma.user.findFirst({ where: { tenantId, id: userId } });
    if (!existing) return res.status(404).json({ error: "Not found" });

    const data: Record<string, unknown> = {};

    if (roleId !== undefined) {
      const role = await prisma.tenantRole.findFirst({
        where: { id: roleId, tenantId },
      });
      if (!role) return res.status(400).json({ error: "Invalid roleId" });
      data.roleId = roleId;
      // An administrator setting the role IS the decision on any role this
      // person requested at registration, whether they granted it or chose
      // something else. Leaving the request pending afterwards would keep
      // showing them in the roster as awaiting a decision that was made.
      data.requestedRole = null;
    }

    if (departmentId !== undefined) {
      if (departmentId !== null) {
        const dept = await prisma.department.findFirst({
          where: { id: departmentId, tenantId },
        });
        if (!dept) return res.status(400).json({ error: "Invalid departmentId" });
      }
      data.departmentId = departmentId;
    }

    // Deliberately a fixed two-value enum, not a free string -- login's own
    // gate only recognizes "active", so any other value the caller invented
    // would deactivate the account anyway but read as a typo in the roster.
    if (status !== undefined) {
      if (status !== "active" && status !== "inactive")
        return res.status(400).json({ error: "status must be 'active' or 'inactive'" });
      data.status = status;
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: "No valid fields to update" });
    }

    await prisma.user.updateMany({
      where: { tenantId, id: userId },
      data,
    });

    const updated = await prisma.user.findFirstOrThrow({ where: { tenantId, id: userId } });
    // roleId/departmentId directly change what GET /auth/me returns for this
    // user (capabilities, departmentId) -- without this, someone the admin
    // just promoted/reassigned would keep seeing their old capabilities
    // until the 15s cache entry happened to expire.
    await cacheDel(cacheKeys.userMe(tenantId, userId));
    // A role change must also end that user's existing sessions. The role is
    // baked into the session token itself, so a demoted user would otherwise
    // keep acting with their old capabilities for the rest of the token's
    // 7-day life -- which makes demotion and offboarding cosmetic.
    if (
      (data.roleId !== undefined && data.roleId !== existing.roleId) ||
      data.status === "inactive"
    ) {
      // Same reasoning as the role-change case above, applied to
      // deactivation: the middleware check catches it within 5 minutes via
      // the cache TTL regardless, but revoking immediately means a
      // deactivated account's existing session dies on its very next
      // request rather than whenever that cache entry happens to expire.
      await revokeSessions(userId, tenantId);
    }
    const { hashedPassword: _omit, ...user } = updated;
    return res.json(user);
  } catch (err) {
    req.log.error(err, "Failed to update user");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
