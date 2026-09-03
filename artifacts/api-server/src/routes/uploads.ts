import { Router } from "express";
import multer from "multer";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { tenantAuthMiddleware } from "../middleware/tenant";

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

export const uploadsRouter = Router();

uploadsRouter.use(tenantAuthMiddleware);

uploadsRouter.post("/", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file provided" });
  const tenantId = req.tenantId!;
  const url = `/api/uploads/files/${tenantId}/${req.file.filename}`;
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
uploadsRouter.get("/files/:tenantId/:filename", (req, res) => {
  const { tenantId, filename } = req.params;
  if (tenantId !== req.tenantId) return res.status(404).end();
  // path.basename strips any directory traversal a crafted filename param
  // could otherwise smuggle in.
  const filePath = path.join(UPLOAD_DIR, tenantId, path.basename(filename));
  if (!fs.existsSync(filePath)) return res.status(404).end();
  return res.sendFile(filePath);
});

export default uploadsRouter;
