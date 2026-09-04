import { Router } from "express";
import { db, usersTable, tenantRolesTable, departmentsTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";

// Mirrors STUDIO_LEADERSHIP_ROLES in artifacts/forge/src/store/permissions.ts
// -- the only roster rows an external client has any legitimate reason to
// see (their studio points of contact), matching what people.tsx/profile.tsx
// already filter down to on the frontend.
const STUDIO_LEADERSHIP_ROLES = ["admin", "production_head"];
import { tenantAuthMiddleware } from "../middleware/tenant";
import { requireCapability } from "../middleware/rbac";
import { hashPassword, verifyPassword } from "../lib/auth";
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
    const [callerRole] = await db
      .select({ name: tenantRolesTable.name })
      .from(tenantRolesTable)
      .where(eq(tenantRolesTable.id, req.roleId!));
    const isClient = callerRole?.name === "client";

    const users = await db
      .select({
        id: usersTable.id,
        tenantId: usersTable.tenantId,
        roleId: usersTable.roleId,
        role: tenantRolesTable.name,
        departmentId: usersTable.departmentId,
        email: usersTable.email,
        name: usersTable.name,
        title: usersTable.title,
        avatar: usersTable.avatar,
        status: usersTable.status,
        punchedInAt: usersTable.punchedInAt,
        createdAt: usersTable.createdAt,
      })
      .from(usersTable)
      .leftJoin(tenantRolesTable, eq(usersTable.roleId, tenantRolesTable.id))
      .where(
        isClient
          ? and(
              eq(usersTable.tenantId, tenantId),
              inArray(tenantRolesTable.name, STUDIO_LEADERSHIP_ROLES),
            )
          : eq(usersTable.tenantId, tenantId),
      );
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
    const [role] = await db
      .select()
      .from(tenantRolesTable)
      .where(
        and(
          eq(tenantRolesTable.id, roleId),
          eq(tenantRolesTable.tenantId, tenantId),
        ),
      );

    if (!role) {
      return res.status(400).json({ error: "Invalid roleId" });
    }

    if (departmentId) {
      const [dept] = await db
        .select()
        .from(departmentsTable)
        .where(
          and(
            eq(departmentsTable.id, departmentId),
            eq(departmentsTable.tenantId, tenantId),
          ),
        );
      if (!dept) {
        return res.status(400).json({ error: "Invalid departmentId" });
      }
    }

    // usersTable.email is globally unique. Reject duplicates here so the caller
    // gets a clean 409 rather than a raw constraint-violation 500, and so login
    // (which looks users up by email with no tenant scoping) can never become
    // ambiguous between two tenants.
    const [existing] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email));

    if (existing) {
      return res.status(409).json({ error: "Email already in use" });
    }

    const hashedPassword = await hashPassword(password);
    const [newUser] = await db
      .insert(usersTable)
      .values({
        id: crypto.randomUUID(),
        tenantId,
        roleId,
        departmentId: departmentId ?? null,
        email,
        name,
        title,
        hashedPassword,
      })
      .returning();

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
    const updates: Partial<typeof usersTable.$inferInsert> = {};
    if (name !== undefined) updates.name = name;
    if (title !== undefined) updates.title = title;
    if (avatar !== undefined) updates.avatar = avatar;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "No valid fields to update" });
    }

    const [updated] = await db
      .update(usersTable)
      .set(updates)
      .where(and(eq(usersTable.id, userId), eq(usersTable.tenantId, tenantId)))
      .returning();
    if (!updated) return res.status(404).json({ error: "Not found" });

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

    const [updated] = await db
      .update(usersTable)
      .set({ punchedInAt: new Date() })
      .where(and(eq(usersTable.id, userId), eq(usersTable.tenantId, tenantId)))
      .returning();
    if (!updated) return res.status(404).json({ error: "Not found" });

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

    const [updated] = await db
      .update(usersTable)
      .set({ punchedInAt: null })
      .where(and(eq(usersTable.id, userId), eq(usersTable.tenantId, tenantId)))
      .returning();
    if (!updated) return res.status(404).json({ error: "Not found" });

    await cacheDel(cacheKeys.userMe(tenantId, userId));
    const { hashedPassword: _omit, ...user } = updated;
    return res.json(user);
  } catch (err) {
    req.log.error(err, "Failed to punch out");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Every imported-roster/newly-invited account starts on a shared studio
// default password (the admin hands it out) with no way to change it -- this
// is that missing self-service change. Deliberately its own route rather
// than a field on PATCH /me: it requires proving the current password,
// which the general profile-fields route has no business checking.
router.put("/me/password", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res
        .status(400)
        .json({ error: "Missing currentPassword or newPassword" });
    }
    if (typeof newPassword !== "string" || newPassword.length < 8) {
      return res
        .status(400)
        .json({ error: "New password must be at least 8 characters" });
    }

    const [user] = await db
      .select()
      .from(usersTable)
      .where(and(eq(usersTable.id, userId), eq(usersTable.tenantId, tenantId)));
    if (!user) return res.status(404).json({ error: "Not found" });

    const isValid = await verifyPassword(currentPassword, user.hashedPassword);
    if (!isValid) {
      return res.status(401).json({ error: "Current password is incorrect" });
    }

    const hashedPassword = await hashPassword(newPassword);
    await db
      .update(usersTable)
      .set({ hashedPassword })
      .where(and(eq(usersTable.id, userId), eq(usersTable.tenantId, tenantId)));

    return res.json({ ok: true });
  } catch (err) {
    req.log.error(err, "Failed to change password");
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
      const [updated] = await db
        .update(usersTable)
        .set({ avatar: url })
        .where(and(eq(usersTable.id, userId), eq(usersTable.tenantId, tenantId)))
        .returning();
      if (!updated) return res.status(404).json({ error: "Not found" });

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
    const { roleId, departmentId } = req.body;

    const [existing] = await db
      .select()
      .from(usersTable)
      .where(and(eq(usersTable.tenantId, tenantId), eq(usersTable.id, userId)));
    if (!existing) return res.status(404).json({ error: "Not found" });

    const updates: Partial<typeof usersTable.$inferInsert> = {};

    if (roleId !== undefined) {
      const [role] = await db
        .select()
        .from(tenantRolesTable)
        .where(
          and(
            eq(tenantRolesTable.id, roleId),
            eq(tenantRolesTable.tenantId, tenantId),
          ),
        );
      if (!role) return res.status(400).json({ error: "Invalid roleId" });
      updates.roleId = roleId;
    }

    if (departmentId !== undefined) {
      if (departmentId !== null) {
        const [dept] = await db
          .select()
          .from(departmentsTable)
          .where(
            and(
              eq(departmentsTable.id, departmentId),
              eq(departmentsTable.tenantId, tenantId),
            ),
          );
        if (!dept) return res.status(400).json({ error: "Invalid departmentId" });
      }
      updates.departmentId = departmentId;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "No valid fields to update" });
    }

    await db
      .update(usersTable)
      .set(updates)
      .where(and(eq(usersTable.tenantId, tenantId), eq(usersTable.id, userId)));

    const [updated] = await db
      .select()
      .from(usersTable)
      .where(and(eq(usersTable.tenantId, tenantId), eq(usersTable.id, userId)));
    // roleId/departmentId directly change what GET /auth/me returns for this
    // user (capabilities, departmentId) -- without this, someone the admin
    // just promoted/reassigned would keep seeing their old capabilities
    // until the 15s cache entry happened to expire.
    await cacheDel(cacheKeys.userMe(tenantId, userId));
    const { hashedPassword: _omit, ...user } = updated;
    return res.json(user);
  } catch (err) {
    req.log.error(err, "Failed to update user");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
