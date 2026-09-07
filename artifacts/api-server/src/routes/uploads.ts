import { Router } from "express";
import multer from "multer";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { tenantAuthMiddleware } from "../middleware/tenant";
import { requireCapability } from "../middleware/rbac";

// Files live outside the pruned `pnpm deploy` output (/app/prod/api-server)
// so they survive independently of the app tree, on a dedicated Docker
// volume (see docker-compose.yml's UPLOAD_DIR-mounted volume) -- otherwise
// a redeploy/rebuild would wipe every previously uploaded attachment.
const UPLOAD_DIR = process.env.UPLOAD_DIR || "/app/uploads";

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const tenantId = req.tenantId!;
    const dir = path.join(UPLOAD_DIR, tenantId);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    // Randomize the on-disk name (never trust the client's filename for
    // storage) but keep the original extension so browsers/DCC tools that
    // sniff by extension still work, and keep the original name in a
    // Content-Disposition-friendly query param handled at download time.
    const ext = path.extname(file.originalname);
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 }, // 200MB -- generous for DCC/reference files, not unbounded
});

// Separate from the generic attachment upload above for the same reason
// avatars are separate (see routes/users.ts's avatar upload): that route
// forces every download as application/octet-stream + a forced
// Content-Disposition, which is correct for an arbitrary uploaded file
// (never trust it to render inline) but means a <video> element can never
// play it back. Serving real video/* inline is safe here specifically
// because this route's fileFilter rejects anything that isn't a
// whitelisted video mimetype at write time -- a video byte stream can't
// execute as script the way an uploaded HTML/SVG document could.
const VIDEO_MIME_EXT: Record<string, string> = {
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "video/quicktime": ".mov",
  "video/x-msvideo": ".avi",
};
const videoUpload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const tenantId = req.tenantId!;
      const dir = path.join(UPLOAD_DIR, tenantId, "videos");
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      cb(null, `${crypto.randomUUID()}${VIDEO_MIME_EXT[file.mimetype]}`);
    },
  }),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB -- real dailies/playblasts run larger than reference attachments
  fileFilter: (_req, file, cb) => {
    if (!(file.mimetype in VIDEO_MIME_EXT)) {
      cb(new Error("Only MP4, WebM, MOV, or AVI videos are allowed"));
      return;
    }
    cb(null, true);
  },
});

export const uploadsRouter = Router();

uploadsRouter.use(tenantAuthMiddleware);

// Gated on submit_reviews (not create_tasks like the generic attachment
// route above) -- uploading review footage is an artist submitting their
// own work, not a task-creation action.
uploadsRouter.post(
  "/video",
  requireCapability("submit_reviews"),
  (req, res) => {
    videoUpload.single("file")(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message });
      if (!req.file) return res.status(400).json({ error: "No file provided" });
      const tenantId = req.tenantId!;
      const url = `/api/uploads/videos/${tenantId}/${req.file.filename}`;
      return res.status(201).json({
        url,
        name: req.file.originalname,
        size: req.file.size,
        mimeType: req.file.mimetype,
      });
    });
  },
);

// Path-scoped by tenantId, same as /files/:tenantId/:filename below, but
// served with its real Content-Type and no forced Content-Disposition so
// the Review Player's <video> element can actually play it -- and, unlike a
// plain res.sendFile of an arbitrary attachment, Range requests need to work
// correctly here for scrubbing (Express's sendFile already honors Range/
// Accept-Ranges out of the box, so no extra handling needed).
uploadsRouter.get("/videos/:tenantId/:filename", (req, res) => {
  const { tenantId, filename } = req.params;
  if (tenantId !== req.tenantId) return res.status(404).end();
  const safeName = path.basename(filename);
  const filePath = path.join(UPLOAD_DIR, tenantId, "videos", safeName);
  if (!fs.existsSync(filePath)) return res.status(404).end();

  const ext = path.extname(safeName).toLowerCase();
  const contentType =
    Object.entries(VIDEO_MIME_EXT).find(([, e]) => e === ext)?.[0] ||
    "application/octet-stream";
  res.setHeader("Content-Type", contentType);
  res.setHeader("Cache-Control", "private, max-age=3600");
  return res.sendFile(filePath);
});

// The only current consumer (CreateTaskModal.tsx, via useUploadFile) attaches
// files to a task being created, so gate this the same way task creation
// itself is gated -- without this, any authenticated tenant member could
// write arbitrarily many 200MB files to the shared upload volume with no
// capability check at all. A per-tenant storage quota is a bigger feature
// (would need tracking total bytes per tenant) and is out of scope here; the
// per-file 200MB cap above is the only size guard in place for now.
uploadsRouter.post("/", requireCapability("create_tasks"), upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file provided" });
  const tenantId = req.tenantId!;
  const url = `/api/uploads/files/${tenantId}/${req.file.filename}?name=${encodeURIComponent(req.file.originalname)}`;
  return res.status(201).json({
    url,
    name: req.file.originalname,
    size: req.file.size,
    mimeType: req.file.mimetype,
  });
});

// Path-scoped by tenantId so one tenant can never guess/access another's
// uploaded file, even though filenames themselves are already unguessable
// UUIDs -- defense in depth, and it also lets the route reject outright
// before touching the filesystem if the caller's session tenant doesn't
// match the path.
//
// Always forces a download rather than letting the browser render the file
// inline. An attacker-uploaded .html/.svg attachment served with its
// natural sniffed content-type and rendered inline would execute as a
// same-origin page with access to the session cookie (stored XSS) -- since
// this route sits behind the same nginx origin as the rest of the app
// (same cookie jar), the file's original extension/mimetype is never
// trusted for how the response gets rendered.
uploadsRouter.get("/files/:tenantId/:filename", (req, res) => {
  const { tenantId, filename } = req.params;
  if (tenantId !== req.tenantId) return res.status(404).end();
  // path.basename strips any directory traversal a crafted filename param
  // could otherwise smuggle in.
  const safeName = path.basename(filename);
  const filePath = path.join(UPLOAD_DIR, tenantId, safeName);
  if (!fs.existsSync(filePath)) return res.status(404).end();

  const displayName =
    typeof req.query.name === "string" ? req.query.name : safeName;
  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${displayName.replace(/["\\]/g, "_")}"`,
  );
  res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
  return res.sendFile(filePath);
});

export default uploadsRouter;
