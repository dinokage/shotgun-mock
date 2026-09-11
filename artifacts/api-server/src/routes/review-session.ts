import { Router } from "express";
import multer from "multer";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { prisma } from "@workspace/db";
import { tenantAuthMiddleware } from "../middleware/tenant";
import { denyClientAccess, requireCapability } from "../middleware/rbac";
import { getClientScope, ClientScope } from "../lib/clientScope";
import {
  getVisibilityScope,
  entityRefScopeWhere,
  visibleEntityIds,
} from "../lib/visibilityScope";

// Presentation Mode, the review timeline's comment stream, and the client
// portal's notes used to live in one browser's localStorage, cross-tab-synced
// via a `storage` event. Everything here is the server-backed replacement, so
// a presenter's playhead and a reviewer's notes actually reach other people's
// machines.

export const reviewSessionRouter = Router();
reviewSessionRouter.use(tenantAuthMiddleware);

const UPLOAD_DIR = process.env.UPLOAD_DIR || "/app/uploads";

// Voice notes get their own upload route rather than reusing POST /uploads:
// that route is gated on create_tasks, which artists -- who record most of
// the voice notes on their own submissions -- deliberately don't hold.
const AUDIO_MIME_EXT: Record<string, string> = {
  "audio/webm": ".webm",
  "audio/ogg": ".ogg",
  "audio/mp4": ".m4a",
  "audio/mpeg": ".mp3",
  "audio/wav": ".wav",
  "audio/x-wav": ".wav",
};

// MediaRecorder hands back "audio/webm;codecs=opus" -- the codecs parameter
// is part of the multipart Content-Type and has to come off before the
// allowlist lookup.
function baseMimeType(mimetype: string): string {
  return mimetype.split(";")[0].trim().toLowerCase();
}

const audioUpload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const dir = path.join(UPLOAD_DIR, req.tenantId!, "review-audio");
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      cb(null, `${crypto.randomUUID()}${AUDIO_MIME_EXT[baseMimeType(file.mimetype)]}`);
    },
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!(baseMimeType(file.mimetype) in AUDIO_MIME_EXT)) {
      cb(new Error("Only WebM, OGG, MP4/M4A, MP3, or WAV audio is allowed"));
      return;
    }
    cb(null, true);
  },
});

const MAX_AUDIO_URL_LENGTH = 2048;
const MAX_WAVEFORM_SAMPLES = 400;
const MAX_ANNOTATIONS = 200;

// Confirms an id off the request body belongs to the caller's tenant before
// it's linked onto a presentation/comment/note row. A foreign key only proves
// the referenced row exists, not who owns it -- same pattern as
// routes/shots.ts and routes/reviews.ts.
async function versionInTenant(id: string, tenantId: string) {
  const row = await prisma.version.findFirst({ where: { id, tenantId }, select: { id: true } });
  return !!row;
}

async function shotInTenant(id: string, tenantId: string) {
  const row = await prisma.shot.findFirst({
    where: { id, tenantId },
    select: { id: true, name: true, projectId: true, episodeId: true },
  });
  return row;
}

// A client-access session may only touch a shot inside its granted
// project/episode/version -- the same resolution reviews.ts applies to
// versions, expressed against the shot itself since a client note is
// shot-scoped.
function shotInClientScope(
  shot: { id: string; projectId: string; episodeId: string | null },
  scope: ClientScope,
): boolean {
  if (scope.shotId) return scope.shotId === shot.id;
  if (shot.projectId !== scope.projectId) return false;
  if (scope.episodeId && shot.episodeId !== scope.episodeId) return false;
  return true;
}

async function versionInClientScope(
  tenantId: string,
  versionId: string,
  scope: ClientScope,
): Promise<boolean> {
  if (scope.versionId) return scope.versionId === versionId;
  const version = await prisma.version.findFirst({
    where: { id: versionId, tenantId },
    select: { entityId: true, entityType: true },
  });
  if (!version || version.entityType !== "shot") return false;
  const shot = await prisma.shot.findFirst({
    where: {
      id: version.entityId,
      tenantId,
      projectId: scope.projectId,
      ...(scope.episodeId ? { episodeId: scope.episodeId } : {}),
    },
    select: { id: true },
  });
  return !!shot;
}

/**
 * An employee may only reach a version whose shot/asset their role can see --
 * without this an artist could read (or drive) any review session in the
 * studio just by knowing a version id. Mirrors reviews.ts's annotations GET.
 */
async function versionVisibleToEmployee(
  req: import("express").Request,
  versionId: string,
): Promise<boolean> {
  const tenantId = req.tenantId!;
  const scopeWhere = await entityRefScopeWhere(tenantId, await getVisibilityScope(req));
  const row = await prisma.version.findFirst({
    where: { id: versionId, tenantId, ...(scopeWhere ?? {}) },
    select: { id: true },
  });
  return !!row;
}

// A session on a role literally named "client" -- the portal's other entry
// point, alongside a redeemed access link. They hold no employee visibility
// scope (getVisibilityScope would narrow them to "shots I hold tasks on",
// which for a client is always none), so the employee narrowing below has to
// skip them rather than silently return an empty list.
async function isClientRole(req: import("express").Request): Promise<boolean> {
  if (!req.roleId) return false;
  const role = await prisma.tenantRole.findFirst({
    where: { id: req.roleId, tenantId: req.tenantId! },
    select: { name: true },
  });
  return role?.name === "client";
}

function asNumberArray(value: unknown, cap: number): number[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((n): n is number => typeof n === "number" && Number.isFinite(n))
    .slice(0, cap);
}

function asObjectArray(value: unknown, cap: number): unknown[] {
  if (!Array.isArray(value)) return [];
  return value.filter((a) => a !== null && typeof a === "object").slice(0, cap);
}

function clampFrame(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(100000, Math.round(n)));
}

// ---------------------------------------------------------------------------
// Presentation Mode
// ---------------------------------------------------------------------------

const INACTIVE_PRESENTATION = {
  isActive: false,
  versionId: null as string | null,
  presenterId: null as string | null,
  presenterName: null as string | null,
  frame: 1,
  startedAt: null as string | null,
};

function presentationDTO(row: {
  versionId: string;
  presenterId: string | null;
  presenterName: string;
  frame: number;
  isActive: boolean;
  startedAt: Date;
}) {
  if (!row.isActive) return { ...INACTIVE_PRESENTATION, versionId: row.versionId };
  return {
    isActive: true,
    versionId: row.versionId,
    presenterId: row.presenterId,
    presenterName: row.presenterName || null,
    frame: row.frame,
    startedAt: row.startedAt.toISOString(),
  };
}

// Readable by a client-access session as well as an employee: the client
// portal shows the same "you are locked to <presenter>" banner, so denying
// clients here would silently delete half the feature. A client still only
// ever reaches a version inside its own grant.
reviewSessionRouter.get("/presentation/:versionId", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const versionId = req.params.versionId as string;

    if (req.clientAccessLinkId) {
      const scope = await getClientScope(req);
      if (!scope || !(await versionInClientScope(tenantId, versionId, scope)))
        return res.json({ ...INACTIVE_PRESENTATION, versionId });
    } else if (
      !(await isClientRole(req)) &&
      !(await versionVisibleToEmployee(req, versionId))
    ) {
      return res.json({ ...INACTIVE_PRESENTATION, versionId });
    }

    const row = await prisma.reviewPresentation.findFirst({
      where: { tenantId, versionId },
    });
    if (!row) return res.json({ ...INACTIVE_PRESENTATION, versionId });
    return res.json(presentationDTO(row));
  } catch (err) {
    req.log.error(err, "Failed to read review presentation");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Claiming the floor. The @@unique([tenantId, versionId]) row is the lock:
// two people can't both present the same version, so a second presenter is
// rejected rather than silently stealing the first one's viewers.
reviewSessionRouter.post(
  "/presentation/:versionId/start",
  denyClientAccess,
  requireCapability("submit_reviews"),
  async (req, res) => {
    try {
      const tenantId = req.tenantId!;
      const userId = req.userId;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const versionId = req.params.versionId as string;

      if (!(await versionInTenant(versionId, tenantId)))
        return res.status(400).json({ error: "Invalid versionId" });
      if (!(await versionVisibleToEmployee(req, versionId)))
        return res.status(403).json({ error: "Forbidden" });

      const existing = await prisma.reviewPresentation.findFirst({
        where: { tenantId, versionId },
      });
      if (existing?.isActive && existing.presenterId !== userId)
        return res.status(409).json({
          error: `${existing.presenterName || "Someone else"} is already presenting this version`,
        });

      // The presenter's display name is snapshotted onto the row so locked
      // viewers -- including client sessions, which can't read the user
      // roster at all -- don't need a user lookup to render the banner.
      const presenter = await prisma.user.findFirst({
        where: { id: userId, tenantId },
        select: { name: true },
      });
      const frame = clampFrame(req.body?.frame);
      const row = await prisma.reviewPresentation.upsert({
        where: { tenantId_versionId: { tenantId, versionId } },
        create: {
          id: crypto.randomUUID(),
          tenantId,
          versionId,
          presenterId: userId,
          presenterName: presenter?.name ?? "",
          frame,
          isActive: true,
        },
        update: {
          presenterId: userId,
          presenterName: presenter?.name ?? "",
          frame,
          isActive: true,
          startedAt: new Date(),
        },
      });
      return res.status(201).json(presentationDTO(row));
    } catch (err) {
      req.log.error(err, "Failed to start review presentation");
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);

// The presenter's playhead moved. Scoped to the presenter's own row, so a
// viewer can't drive everyone else's playhead.
reviewSessionRouter.post(
  "/presentation/:versionId/frame",
  denyClientAccess,
  async (req, res) => {
    try {
      const tenantId = req.tenantId!;
      const userId = req.userId;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const updated = await prisma.reviewPresentation.updateMany({
        where: {
          tenantId,
          versionId: req.params.versionId as string,
          presenterId: userId,
          isActive: true,
        },
        data: { frame: clampFrame(req.body?.frame) },
      });
      if (updated.count === 0)
        return res.status(409).json({ error: "You are not presenting this version" });
      return res.status(204).send();
    } catch (err) {
      req.log.error(err, "Failed to push presenter frame");
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);

// Idempotent: the review page also calls this on unmount so navigating away
// never leaves the room stuck "presenting", and that cleanup must not 404
// when the presentation was already ended.
reviewSessionRouter.post(
  "/presentation/:versionId/stop",
  denyClientAccess,
  async (req, res) => {
    try {
      const tenantId = req.tenantId!;
      const userId = req.userId;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      await prisma.reviewPresentation.updateMany({
        where: {
          tenantId,
          versionId: req.params.versionId as string,
          presenterId: userId,
        },
        data: { isActive: false },
      });
      return res.status(204).send();
    } catch (err) {
      req.log.error(err, "Failed to stop review presentation");
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);

// ---------------------------------------------------------------------------
// Internal timeline comments
//
// This stream is internal-only, and it is the ONLY place a transferred client
// note is ever readable: untransferred notes live in `client_notes` and are
// never joined in here, so the moderation gate can't be bypassed by reading
// the comment endpoint directly.
// ---------------------------------------------------------------------------

interface CommentRow {
  id: string;
  versionId: string;
  authorId: string | null;
  frame: number;
  text: string;
  audioUrl: string | null;
  waveform: unknown;
  annotations: unknown;
  fromClientAuthorName: string | null;
  fromClientShotName: string | null;
  transferredById: string | null;
  transferredAt: Date | null;
  createdAt: Date;
}

function commentDTO(row: CommentRow, transferrerName: string | null) {
  return {
    id: row.id,
    versionId: row.versionId,
    authorId: row.authorId,
    frame: row.frame,
    text: row.text,
    audioUrl: row.audioUrl,
    waveform: asNumberArray(row.waveform, MAX_WAVEFORM_SAMPLES),
    annotations: asObjectArray(row.annotations, MAX_ANNOTATIONS),
    fromClient: row.fromClientAuthorName
      ? {
          authorName: row.fromClientAuthorName,
          shotName: row.fromClientShotName ?? "",
          transferredByUserName: transferrerName ?? "Unknown",
          transferredAt: (row.transferredAt ?? row.createdAt).toISOString(),
        }
      : null,
    createdAt: row.createdAt.toISOString(),
  };
}

reviewSessionRouter.get("/comments", denyClientAccess, async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const { versionId } = req.query;
    if (typeof versionId !== "string" || !versionId)
      return res.status(400).json({ error: "versionId is required" });
    if (!(await versionVisibleToEmployee(req, versionId))) return res.json([]);

    const rows = await prisma.reviewComment.findMany({
      where: { tenantId, versionId },
      orderBy: { createdAt: "asc" },
      include: { transferredBy: { select: { name: true } } },
    });
    return res.json(rows.map((r) => commentDTO(r, r.transferredBy?.name ?? null)));
  } catch (err) {
    req.log.error(err, "Failed to list review comments");
    return res.status(500).json({ error: "Internal server error" });
  }
});

reviewSessionRouter.post(
  "/comments",
  denyClientAccess,
  requireCapability("submit_reviews"),
  async (req, res) => {
    try {
      const tenantId = req.tenantId!;
      const userId = req.userId;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const { versionId, frame, text, audioUrl, waveform } = req.body ?? {};
      if (typeof versionId !== "string" || !versionId)
        return res.status(400).json({ error: "versionId is required" });
      if (!(await versionInTenant(versionId, tenantId)))
        return res.status(400).json({ error: "Invalid versionId" });
      if (!(await versionVisibleToEmployee(req, versionId)))
        return res.status(403).json({ error: "Forbidden" });

      const body = typeof text === "string" ? text.trim() : "";
      const url = typeof audioUrl === "string" && audioUrl ? audioUrl : null;
      if (!body && !url)
        return res.status(400).json({ error: "Comment text or a voice note is required" });
      // Only a path this API itself minted is accepted: the client plays
      // audioUrl back in an <audio> element, so an arbitrary string would
      // turn every comment into an attacker-controlled fetch for everyone
      // else on the review.
      if (
        url &&
        (url.length > MAX_AUDIO_URL_LENGTH ||
          !url.startsWith(`/api/review-session/audio/${tenantId}/`))
      )
        return res.status(400).json({ error: "Invalid audioUrl" });

      const created = await prisma.reviewComment.create({
        data: {
          id: crypto.randomUUID(),
          tenantId,
          versionId,
          authorId: userId,
          frame: clampFrame(frame),
          text: body,
          audioUrl: url,
          waveform: asNumberArray(waveform, MAX_WAVEFORM_SAMPLES),
        },
      });
      return res.status(201).json(commentDTO(created, null));
    } catch (err) {
      req.log.error(err, "Failed to post review comment");
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);

// A voice note recorded in the browser is a MediaRecorder blob: URL, which
// dies with the tab that made it. Uploading it here is what lets a comment
// still play back after a reload, or on anybody else's machine.
reviewSessionRouter.post(
  "/audio",
  denyClientAccess,
  requireCapability("submit_reviews"),
  (req, res) => {
    audioUpload.single("file")(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message });
      if (!req.file) return res.status(400).json({ error: "No file provided" });
      const tenantId = req.tenantId!;
      return res.status(201).json({
        url: `/api/review-session/audio/${tenantId}/${req.file.filename}`,
        size: req.file.size,
      });
    });
  },
);

// Path-scoped by tenantId on top of the UUID filename, and served only with
// a Content-Type from the same allowlist the upload enforced, plus nosniff --
// so a file that somehow landed here under another extension can never be
// rendered as a same-origin document.
reviewSessionRouter.get("/audio/:tenantId/:filename", denyClientAccess, (req, res) => {
  const { tenantId, filename } = req.params;
  if (tenantId !== req.tenantId) return res.status(404).end();
  // path.basename strips any directory traversal a crafted filename smuggles in.
  // Cast for the same reason routes/shots.ts casts req.params.id: combining
  // a middleware typed against the generic Express Request with this route's
  // own path typing widens the param to `string | string[]`.
  const safeName = path.basename(filename as string);
  const ext = path.extname(safeName).toLowerCase();
  const contentType = Object.entries(AUDIO_MIME_EXT).find(([, e]) => e === ext)?.[0];
  if (!contentType) return res.status(404).end();

  const filePath = path.join(UPLOAD_DIR, tenantId, "review-audio", safeName);
  if (!fs.existsSync(filePath)) return res.status(404).end();

  res.setHeader("Content-Type", contentType);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "private, max-age=3600");
  return res.sendFile(filePath);
});

// ---------------------------------------------------------------------------
// Client notes (the moderation queue)
// ---------------------------------------------------------------------------

interface ClientNoteRow {
  id: string;
  shotId: string;
  versionId: string | null;
  frame: number;
  text: string;
  authorName: string;
  annotations: unknown;
  transferred: boolean;
  transferredAt: Date | null;
  createdAt: Date;
}

function clientNoteDTO(
  row: ClientNoteRow,
  shotName: string,
  transferrerName: string | null,
) {
  return {
    id: row.id,
    shotId: row.shotId,
    shotName,
    versionId: row.versionId,
    frame: row.frame,
    text: row.text,
    authorName: row.authorName,
    annotations: asObjectArray(row.annotations, MAX_ANNOTATIONS),
    transferred: row.transferred,
    transferredAt: row.transferredAt ? row.transferredAt.toISOString() : null,
    transferredByUserName: transferrerName,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Deliberately NOT behind denyClientAccess: this is the one path a client
 * portal session legitimately reads and writes. A client sees only the notes
 * left through the link they themselves redeemed (links are code-based, not
 * per-person -- the same ownership model annotations use), and only on shots
 * inside that link's grant. An employee sees every note on the shot, which is
 * the moderation queue the review page's Client tab renders.
 */
reviewSessionRouter.get("/client-notes", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const { shotId } = req.query;
    if (typeof shotId !== "string" || !shotId)
      return res.status(400).json({ error: "shotId is required" });

    const shot = await shotInTenant(shotId, tenantId);
    if (!shot) return res.json([]);

    if (req.clientAccessLinkId) {
      const scope = await getClientScope(req);
      if (!scope || !shotInClientScope(shot, scope)) return res.json([]);
    } else if (!(await isClientRole(req))) {
      // Employee: a client note belongs to the shot it was left on, so it
      // follows that shot's visibility -- without this an artist could read
      // every client's feedback in the studio by guessing a shot id.
      const visibleShotIds = await visibleEntityIds(
        tenantId,
        await getVisibilityScope(req),
        "shot",
      );
      if (visibleShotIds && !visibleShotIds.includes(shotId)) return res.json([]);
    }

    const rows = await prisma.clientNote.findMany({
      where: {
        tenantId,
        shotId,
        ...(req.clientAccessLinkId
          ? { clientAccessLinkId: req.clientAccessLinkId }
          : {}),
      },
      orderBy: { createdAt: "asc" },
      include: { transferredBy: { select: { name: true } } },
    });
    return res.json(
      rows.map((r) => clientNoteDTO(r, shot.name, r.transferredBy?.name ?? null)),
    );
  } catch (err) {
    req.log.error(err, "Failed to list client notes");
    return res.status(500).json({ error: "Internal server error" });
  }
});

reviewSessionRouter.post("/client-notes", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const { shotId, versionId, frame, text, annotations } = req.body ?? {};
    if (typeof shotId !== "string" || !shotId)
      return res.status(400).json({ error: "shotId is required" });
    const body = typeof text === "string" ? text.trim() : "";
    if (!body) return res.status(400).json({ error: "Note text is required" });

    const shot = await shotInTenant(shotId, tenantId);
    if (!shot) return res.status(400).json({ error: "Invalid shotId" });
    if (versionId != null && typeof versionId !== "string")
      return res.status(400).json({ error: "Invalid versionId" });
    if (versionId && !(await versionInTenant(versionId, tenantId)))
      return res.status(400).json({ error: "Invalid versionId" });

    // The author is never taken from the request body. A redeemed link is
    // attributed to whoever the producer shared it with (its clientEmail);
    // a signed-in 'client'-role account is attributed to that account.
    let authorName: string;
    let clientAccessLinkId: string | null = null;
    if (req.clientAccessLinkId) {
      const scope = await getClientScope(req);
      if (!scope || !shotInClientScope(shot, scope))
        return res.status(403).json({ error: "Forbidden" });
      if (versionId && !(await versionInClientScope(tenantId, versionId, scope)))
        return res.status(403).json({ error: "Forbidden" });
      const link = await prisma.clientAccessLink.findFirst({
        where: { id: req.clientAccessLinkId, tenantId },
        select: { clientEmail: true },
      });
      authorName = link?.clientEmail || "Client Reviewer";
      clientAccessLinkId = req.clientAccessLinkId;
    } else {
      if (!req.userId) return res.status(401).json({ error: "Unauthorized" });
      const user = await prisma.user.findFirst({
        where: { id: req.userId, tenantId },
        select: { name: true },
      });
      authorName = user?.name || "Client Reviewer";
    }

    const created = await prisma.clientNote.create({
      data: {
        id: crypto.randomUUID(),
        tenantId,
        shotId,
        versionId: versionId || null,
        frame: clampFrame(frame),
        text: body,
        authorName,
        clientAccessLinkId,
        annotations: asObjectArray(annotations, MAX_ANNOTATIONS) as never,
      },
    });
    return res.status(201).json(clientNoteDTO(created, shot.name, null));
  } catch (err) {
    req.log.error(err, "Failed to create client note");
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * The moderation gate itself: a client note becomes visible to the team only
 * here, and only when an internal reviewer asks for it. The resulting
 * ReviewComment carries the provenance (who wrote it, on which shot, who let
 * it through) so a transferred note is never mistaken for an internal one.
 */
reviewSessionRouter.post(
  "/client-notes/:id/transfer",
  denyClientAccess,
  requireCapability("submit_reviews"),
  async (req, res) => {
    try {
      const tenantId = req.tenantId!;
      const userId = req.userId;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const noteId = req.params.id as string;
      const { versionId } = req.body ?? {};
      if (typeof versionId !== "string" || !versionId)
        return res.status(400).json({ error: "versionId is required" });

      const note = await prisma.clientNote.findFirst({ where: { id: noteId, tenantId } });
      if (!note) return res.status(404).json({ error: "Not found" });
      if (note.transferred)
        return res.status(409).json({ error: "This note has already been transferred" });

      const version = await prisma.version.findFirst({
        where: { id: versionId, tenantId },
        select: { id: true, entityId: true, entityType: true },
      });
      if (!version) return res.status(400).json({ error: "Invalid versionId" });
      // A note may only be published onto a version of the shot it was left
      // on -- otherwise a caller could file a client's feedback against an
      // unrelated shot's review.
      if (version.entityType !== "shot" || version.entityId !== note.shotId)
        return res.status(400).json({ error: "Version does not belong to this note's shot" });
      if (!(await versionVisibleToEmployee(req, versionId)))
        return res.status(403).json({ error: "Forbidden" });

      const shot = await prisma.shot.findFirst({
        where: { id: note.shotId, tenantId },
        select: { name: true },
      });
      const transferredAt = new Date();

      // One transaction: the note is marked transferred and the comment
      // appears together, so a failure can't leave feedback visible
      // internally with nothing recording that it was let through (or a note
      // flagged as transferred that never actually reached the team).
      const [, comment] = await prisma.$transaction([
        prisma.clientNote.updateMany({
          where: { id: noteId, tenantId, transferred: false },
          data: { transferred: true, transferredAt, transferredById: userId },
        }),
        prisma.reviewComment.create({
          data: {
            id: crypto.randomUUID(),
            tenantId,
            versionId,
            authorId: null,
            frame: note.frame,
            text: note.text,
            annotations: note.annotations as never,
            fromClientAuthorName: note.authorName,
            fromClientShotName: shot?.name ?? "",
            transferredById: userId,
            transferredAt,
          },
        }),
      ]);

      const transferrer = await prisma.user.findFirst({
        where: { id: userId, tenantId },
        select: { name: true },
      });
      return res.status(201).json(commentDTO(comment, transferrer?.name ?? null));
    } catch (err) {
      req.log.error(err, "Failed to transfer client note");
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);
