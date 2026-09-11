import { Router } from "express";
import multer from "multer";
import * as fs from "fs";
import * as path from "path";
import { prisma } from "@workspace/db";
import { tenantAuthMiddleware } from "../middleware/tenant";
import { denyClientAccess } from "../middleware/rbac";
import * as crypto from "crypto";

export const chatRouter = Router();

chatRouter.use(tenantAuthMiddleware);
// Team chat is internal studio conversation -- an external client redeeming
// an access code has no business reading or posting in it.
chatRouter.use(denyClientAccess);

// Mirrors LEADERSHIP_ROLES in artifacts/forge/src/store/permissions.ts, which
// is what chat.tsx already used to decide who sees every department channel
// versus only their own.
const LEADERSHIP_ROLES = ["admin", "production_head", "producer", "lead"];

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

// Chat gets its own attachment upload rather than reusing POST /uploads:
// that route is gated on create_tasks, which artists -- the bulk of chat
// users -- deliberately don't hold, so every artist attachment would 403.
// Same on-disk volume and layout as routes/uploads.ts.
const UPLOAD_DIR = process.env.UPLOAD_DIR || "/app/uploads";

// Only these extensions are ever served with a real media Content-Type; the
// allowlist is applied at READ time and paired with nosniff, so a file
// uploaded as "evil.html" (or an HTML document renamed to .png) can never be
// rendered as a same-origin document with access to the session cookie.
// Everything else is forced to download, exactly as uploads.ts does.
const INLINE_MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
};

const chatUpload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const dir = path.join(UPLOAD_DIR, req.tenantId!, "chat");
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      // Never trust the client's filename for storage; the original name is
      // kept separately on the message row for display.
      cb(null, `${crypto.randomUUID()}${path.extname(file.originalname)}`);
    },
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
});

const MAX_ATTACHMENT_URL_LENGTH = 2048;

async function callerRoleName(roleId: string): Promise<string> {
  const role = await prisma.tenantRole.findFirst({
    where: { id: roleId },
    select: { name: true },
  });
  return role?.name ?? "";
}

/**
 * The department channels and the studio-wide "Everyone" channel are implied
 * by the org chart rather than created by hand, so they're materialized here
 * with deterministic ids -- a plain insert that skips duplicates, so two
 * concurrent callers can't end up with two #Animation channels.
 */
async function ensureStandingChannels(tenantId: string) {
  const [departments, existing] = await Promise.all([
    prisma.department.findMany({
      where: { tenantId },
      select: { id: true, name: true },
      orderBy: { pipelineOrder: "asc" },
    }),
    prisma.chatChannel.findMany({
      where: { tenantId, kind: "channel" },
      select: { id: true },
    }),
  ]);

  const have = new Set(existing.map((c) => c.id));
  const wanted = [
    {
      id: `chan:all:${tenantId}`,
      tenantId,
      kind: "channel",
      name: "Everyone",
      description: "All studio members",
      departmentId: null as string | null,
    },
    ...departments.map((d) => ({
      id: `chan:dept:${d.id}`,
      tenantId,
      kind: "channel",
      name: d.name,
      description: `${d.name} department channel`,
      departmentId: d.id,
    })),
  ].filter((c) => !have.has(c.id));

  if (wanted.length > 0) {
    await prisma.chatChannel.createMany({ data: wanted, skipDuplicates: true });
  }
}

/**
 * Puts the caller in the two channels they belong to by definition -- the
 * studio-wide one and their own department's -- so the sidebar reads the same
 * as it always has. Every other channel still needs an explicit join.
 */
async function ensureStandingMemberships(
  tenantId: string,
  userId: string,
  departmentId: string | null | undefined,
) {
  const channelIds = [`chan:all:${tenantId}`];
  if (departmentId) channelIds.push(`chan:dept:${departmentId}`);

  const existing = await prisma.chatChannelMember.findMany({
    where: { tenantId, userId, channelId: { in: channelIds } },
    select: { channelId: true },
  });
  const have = new Set(existing.map((m) => m.channelId));
  const missing = channelIds.filter((id) => !have.has(id));
  if (missing.length === 0) return;

  await prisma.chatChannelMember.createMany({
    data: missing.map((channelId) => ({
      id: crypto.randomUUID(),
      tenantId,
      channelId,
      userId,
    })),
    skipDuplicates: true,
  });
}

/**
 * A public ("channel"-kind) channel is joinable by studio leadership, or by
 * anyone in the department it belongs to. Groups and DMs are never joinable
 * -- you're added at creation time or not at all.
 */
function canJoinChannel(
  channel: { kind: string; departmentId: string | null },
  roleName: string,
  callerDepartmentId: string | null | undefined,
): boolean {
  if (channel.kind !== "channel") return false;
  if (LEADERSHIP_ROLES.includes(roleName)) return true;
  if (!channel.departmentId) return true;
  return channel.departmentId === callerDepartmentId;
}

/**
 * The single authorization gate for everything that reads or writes a
 * channel's contents. Tenant ownership alone proves the channel exists, not
 * that the caller may see inside it -- without the membership row, a known
 * (or guessed) channel id would otherwise hand over a private group's or
 * someone else's DM's entire history.
 */
async function requireMembership(
  tenantId: string,
  channelId: string,
  userId: string,
): Promise<{ status: 200 | 403 | 404 }> {
  const channel = await prisma.chatChannel.findFirst({
    where: { id: channelId, tenantId },
    select: { id: true },
  });
  if (!channel) return { status: 404 };

  const membership = await prisma.chatChannelMember.findFirst({
    where: { tenantId, channelId, userId },
    select: { id: true },
  });
  if (!membership) return { status: 403 };

  return { status: 200 };
}

function messageDTO(m: {
  id: string;
  channelId: string;
  authorId: string | null;
  body: string;
  attachmentUrl: string | null;
  attachmentName: string | null;
  createdAt: Date;
  editedAt: Date | null;
}) {
  return {
    id: m.id,
    channelId: m.channelId,
    authorId: m.authorId,
    body: m.body,
    attachmentUrl: m.attachmentUrl,
    attachmentName: m.attachmentName,
    createdAt: m.createdAt,
    editedAt: m.editedAt,
  };
}

// Lists every channel the caller can act on: the ones they're a member of
// (with an unread count driven by lastReadAt) plus the public channels they
// are allowed to join but haven't.
chatRouter.get("/channels", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    await ensureStandingChannels(tenantId);
    await ensureStandingMemberships(tenantId, userId, req.departmentId);

    const roleName = await callerRoleName(req.roleId!);
    const channels = await prisma.chatChannel.findMany({
      where: { tenantId, archivedAt: null },
      include: { members: { select: { userId: true, lastReadAt: true } } },
      orderBy: { createdAt: "asc" },
    });

    const visible = channels.filter((c) => {
      const isMember = c.members.some((m) => m.userId === userId);
      return isMember || canJoinChannel(c, roleName, req.departmentId);
    });

    const dtos = await Promise.all(
      visible.map(async (c) => {
        const own = c.members.find((m) => m.userId === userId);
        const unreadCount = own
          ? await prisma.chatMessage.count({
              where: {
                tenantId,
                channelId: c.id,
                deletedAt: null,
                authorId: { not: userId },
                ...(own.lastReadAt ? { createdAt: { gt: own.lastReadAt } } : {}),
              },
            })
          : 0;
        return {
          id: c.id,
          kind: c.kind,
          name: c.name,
          description: c.description,
          departmentId: c.departmentId,
          createdById: c.createdById,
          createdAt: c.createdAt,
          memberIds: c.members.map((m) => m.userId),
          isMember: !!own,
          unreadCount,
        };
      }),
    );

    return res.json(dtos);
  } catch (err) {
    req.log.error(err, "Failed to list chat channels");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Creates a named channel or a private group. DMs go through /channels/dm
// below, which is get-or-create rather than create.
chatRouter.post("/channels", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { kind, name, description, departmentId, memberIds } = req.body;
    if (kind !== "channel" && kind !== "group")
      return res.status(400).json({ error: "kind must be 'channel' or 'group'" });
    if (typeof name !== "string" || !name.trim())
      return res.status(400).json({ error: "name is required" });

    if (departmentId) {
      const dept = await prisma.department.findFirst({
        where: { id: departmentId, tenantId },
        select: { id: true },
      });
      if (!dept) return res.status(400).json({ error: "Invalid departmentId" });
    }

    // Every member id off the request body is verified to be a real user in
    // THIS tenant -- the FK alone would happily accept another tenant's user
    // id and quietly grant them a seat in this studio's conversation.
    const requested: string[] = Array.isArray(memberIds)
      ? memberIds.filter((id: unknown): id is string => typeof id === "string")
      : [];
    if (requested.length > 0) {
      const found = await prisma.user.findMany({
        where: { id: { in: requested }, tenantId, deletedAt: null },
        select: { id: true },
      });
      if (found.length !== new Set(requested).size)
        return res.status(400).json({ error: "Invalid memberIds" });
    }

    const members = Array.from(new Set([userId, ...requested]));
    const channelId = crypto.randomUUID();
    const created = await prisma.chatChannel.create({
      data: {
        id: channelId,
        tenantId,
        kind,
        name: name.trim(),
        description: typeof description === "string" ? description : "",
        departmentId: departmentId || null,
        createdById: userId,
        members: {
          create: members.map((memberId) => ({
            id: crypto.randomUUID(),
            tenantId,
            userId: memberId,
          })),
        },
      },
      include: { members: { select: { userId: true } } },
    });

    return res.status(201).json({
      id: created.id,
      kind: created.kind,
      name: created.name,
      description: created.description,
      departmentId: created.departmentId,
      createdById: created.createdById,
      createdAt: created.createdAt,
      memberIds: created.members.map((m) => m.userId),
      isMember: true,
      unreadCount: 0,
    });
  } catch (err) {
    req.log.error(err, "Failed to create chat channel");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Get-or-create the 1:1 channel between the caller and one other user. The
// pair is matched on membership rather than a derived id so the same channel
// is found regardless of who opened it first.
chatRouter.post("/channels/dm", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { userId: otherUserId } = req.body;
    if (typeof otherUserId !== "string" || !otherUserId)
      return res.status(400).json({ error: "userId is required" });
    if (otherUserId === userId)
      return res.status(400).json({ error: "Cannot DM yourself" });

    const other = await prisma.user.findFirst({
      where: { id: otherUserId, tenantId, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!other) return res.status(400).json({ error: "Invalid userId" });

    const existing = await prisma.chatChannel.findFirst({
      where: {
        tenantId,
        kind: "dm",
        members: { every: { userId: { in: [userId, otherUserId] } } },
        AND: [
          { members: { some: { userId } } },
          { members: { some: { userId: otherUserId } } },
        ],
      },
      include: { members: { select: { userId: true } } },
    });

    const channel =
      existing ??
      (await prisma.chatChannel.create({
        data: {
          id: crypto.randomUUID(),
          tenantId,
          kind: "dm",
          name: "Direct Message",
          createdById: userId,
          members: {
            create: [userId, otherUserId].map((memberId) => ({
              id: crypto.randomUUID(),
              tenantId,
              userId: memberId,
            })),
          },
        },
        include: { members: { select: { userId: true } } },
      }));

    return res.status(existing ? 200 : 201).json({
      id: channel.id,
      kind: channel.kind,
      name: channel.name,
      description: channel.description,
      departmentId: channel.departmentId,
      createdById: channel.createdById,
      createdAt: channel.createdAt,
      memberIds: channel.members.map((m) => m.userId),
      isMember: true,
      unreadCount: 0,
    });
  } catch (err) {
    req.log.error(err, "Failed to open direct message");
    return res.status(500).json({ error: "Internal server error" });
  }
});

chatRouter.post("/channels/:id/join", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const channelId = req.params.id;
    const channel = await prisma.chatChannel.findFirst({
      where: { id: channelId, tenantId, archivedAt: null },
      select: { id: true, kind: true, departmentId: true },
    });
    if (!channel) return res.status(404).json({ error: "Not found" });

    const roleName = await callerRoleName(req.roleId!);
    if (!canJoinChannel(channel, roleName, req.departmentId))
      return res.status(403).json({ error: "Forbidden: channel is not open to you" });

    await prisma.chatChannelMember.createMany({
      data: [{ id: crypto.randomUUID(), tenantId, channelId, userId }],
      skipDuplicates: true,
    });
    return res.status(204).send();
  } catch (err) {
    req.log.error(err, "Failed to join chat channel");
    return res.status(500).json({ error: "Internal server error" });
  }
});

chatRouter.post("/channels/:id/leave", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    await prisma.chatChannelMember.deleteMany({
      where: { tenantId, channelId: req.params.id, userId },
    });
    return res.status(204).send();
  } catch (err) {
    req.log.error(err, "Failed to leave chat channel");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Paginated newest-first internally, returned oldest-first so the transcript
// renders in reading order. `before` (an ISO timestamp) walks backwards
// through history -- a channel with 40k messages never ships more than one
// page.
chatRouter.get("/channels/:id/messages", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const gate = await requireMembership(tenantId, req.params.id, userId);
    if (gate.status === 404) return res.status(404).json({ error: "Not found" });
    if (gate.status === 403)
      return res.status(403).json({ error: "Forbidden: not a member of this channel" });

    const rawLimit = Number(req.query.limit);
    const limit = Math.min(
      Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
    );
    const before =
      typeof req.query.before === "string" ? new Date(req.query.before) : null;
    if (before && Number.isNaN(before.getTime()))
      return res.status(400).json({ error: "Invalid before cursor" });

    // One extra row tells us whether an older page exists without a
    // second count query.
    const rows = await prisma.chatMessage.findMany({
      where: {
        tenantId,
        channelId: req.params.id,
        deletedAt: null,
        ...(before ? { createdAt: { lt: before } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    return res.json({
      messages: page.reverse().map(messageDTO),
      hasMore,
    });
  } catch (err) {
    req.log.error(err, "Failed to list chat messages");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// The author is always the session user -- there is no "post as" case.
chatRouter.post("/channels/:id/messages", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const gate = await requireMembership(tenantId, req.params.id, userId);
    if (gate.status === 404) return res.status(404).json({ error: "Not found" });
    if (gate.status === 403)
      return res.status(403).json({ error: "Forbidden: not a member of this channel" });

    const { body, attachmentUrl, attachmentName } = req.body;
    const text = typeof body === "string" ? body.trim() : "";
    const url = typeof attachmentUrl === "string" ? attachmentUrl : null;
    if (!text && !url)
      return res.status(400).json({ error: "Message body or attachment is required" });
    // Only a URL this API itself minted is accepted. The client renders
    // attachments in <img>/<video>/<a>, so letting an arbitrary string
    // through would turn every message into an attacker-controlled fetch
    // (or a data:text/html link) for everyone else in the channel.
    if (
      url &&
      (url.length > MAX_ATTACHMENT_URL_LENGTH ||
        !url.startsWith(`/api/chat/attachments/${tenantId}/`))
    )
      return res.status(400).json({ error: "Invalid attachment" });

    const created = await prisma.chatMessage.create({
      data: {
        id: crypto.randomUUID(),
        tenantId,
        channelId: req.params.id,
        authorId: userId,
        body: text,
        attachmentUrl: url,
        attachmentName:
          typeof attachmentName === "string" ? attachmentName : null,
      },
    });

    // Posting counts as having read everything up to and including your own
    // message, otherwise the sender's own send leaves the badge lit.
    await prisma.chatChannelMember.updateMany({
      where: { tenantId, channelId: req.params.id, userId },
      data: { lastReadAt: created.createdAt },
    });

    return res.status(201).json(messageDTO(created));
  } catch (err) {
    req.log.error(err, "Failed to post chat message");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Uploads a file to attach to a message in this channel. Membership is
// checked BEFORE multer touches the disk, so a non-member can't write into
// the shared upload volume by posting at a channel they can't read.
chatRouter.post("/channels/:id/attachments", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const gate = await requireMembership(tenantId, req.params.id, userId);
    if (gate.status === 404) return res.status(404).json({ error: "Not found" });
    if (gate.status === 403)
      return res.status(403).json({ error: "Forbidden: not a member of this channel" });

    chatUpload.single("file")(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message });
      if (!req.file) return res.status(400).json({ error: "No file provided" });
      return res.status(201).json({
        url: `/api/chat/attachments/${tenantId}/${req.file.filename}`,
        name: req.file.originalname,
        size: req.file.size,
      });
    });
    return;
  } catch (err) {
    req.log.error(err, "Failed to upload chat attachment");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Path-scoped by tenantId (defense in depth on top of the UUID filename) and
// behind this router's own auth + denyClientAccess, so a chat attachment is
// only ever readable by a logged-in employee of the same studio.
chatRouter.get("/attachments/:tenantId/:filename", (req, res) => {
  const { tenantId, filename } = req.params;
  if (tenantId !== req.tenantId) return res.status(404).end();
  // path.basename strips any directory traversal a crafted filename could
  // otherwise smuggle in.
  const safeName = path.basename(filename);
  const filePath = path.join(UPLOAD_DIR, tenantId, "chat", safeName);
  if (!fs.existsSync(filePath)) return res.status(404).end();

  const inlineType = INLINE_MIME_BY_EXT[path.extname(safeName).toLowerCase()];
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (inlineType) {
    res.setHeader("Content-Type", inlineType);
  } else {
    const displayName =
      typeof req.query.name === "string" ? req.query.name : safeName;
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${displayName.replace(/["\\]/g, "_")}"`,
    );
    res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
  }
  res.setHeader("Cache-Control", "private, max-age=3600");
  return res.sendFile(filePath);
});

chatRouter.post("/channels/:id/read", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const updated = await prisma.chatChannelMember.updateMany({
      where: { tenantId, channelId: req.params.id, userId },
      data: { lastReadAt: new Date() },
    });
    if (updated.count === 0)
      return res.status(403).json({ error: "Forbidden: not a member of this channel" });

    return res.status(204).send();
  } catch (err) {
    req.log.error(err, "Failed to mark channel read");
    return res.status(500).json({ error: "Internal server error" });
  }
});
