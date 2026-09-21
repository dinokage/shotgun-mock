import { Router } from "express";
import multer from "multer";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { execFile } from "child_process";
import { promisify } from "util";
import { tenantAuthMiddleware } from "../middleware/tenant";
import { requireCapability } from "../middleware/rbac";

const execFileAsync = promisify(execFile);

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
// (never trust it to render inline) but means a <video> or <img> element can
// never show it. Serving review media inline is safe here specifically
// because only these formats are accepted, and each file's own leading bytes
// must match its format (see matchesSignature). Video, PNG and JPEG byte
// streams can't execute as script the way an uploaded HTML/SVG could, which
// is also why SVG is deliberately absent.
const REVIEW_MEDIA: Record<string, { mime: string; kind: "video" | "image" }> = {
  ".mp4": { mime: "video/mp4", kind: "video" },
  ".m4v": { mime: "video/mp4", kind: "video" },
  ".mov": { mime: "video/quicktime", kind: "video" },
  ".webm": { mime: "video/webm", kind: "video" },
  ".avi": { mime: "video/x-msvideo", kind: "video" },
  ".png": { mime: "image/png", kind: "image" },
  ".jpg": { mime: "image/jpeg", kind: "image" },
  ".jpeg": { mime: "image/jpeg", kind: "image" },
  // The review player already renders these two as stills; the upload route
  // refusing them was the only reason they could never get there.
  ".gif": { mime: "image/gif", kind: "image" },
  ".webp": { mime: "image/webp", kind: "image" },
  // Never served inline as-is -- no browser can decode EXR. Listed here only
  // so fileFilter/reviewMediaExt accept it onto disk; the actual response
  // (see the /video handler) is a transcoded PNG proxy, not this file.
  ".exr": { mime: "image/x-exr", kind: "image" },
};
const MIME_TO_REVIEW_EXT: Record<string, string> = {
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "video/quicktime": ".mov",
  "video/x-msvideo": ".avi",
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
};

// The extension decides the format, with the browser-reported MIME type only
// as a fallback. Filtering on MIME alone rejected real .mov files from
// Windows machines, which often report none, while accepting anything a
// client chose to label video/quicktime.
function reviewMediaExt(file: { originalname: string; mimetype: string }): string | null {
  const ext = path.extname(file.originalname).toLowerCase();
  if (REVIEW_MEDIA[ext]) return ext;
  return MIME_TO_REVIEW_EXT[file.mimetype] ?? null;
}

/** True when the file's leading bytes are what its extension claims. */
function matchesSignature(filePath: string, ext: string): boolean {
  const fd = fs.openSync(filePath, "r");
  try {
    const head = Buffer.alloc(16);
    const n = fs.readSync(fd, head, 0, head.length, 0);
    const ascii = (start: number, end: number) =>
      n >= end ? head.subarray(start, end).toString("latin1") : "";
    switch (ext) {
      case ".mp4":
      case ".m4v":
      case ".mov":
        // ISO base media / QuickTime: a 4-byte box size, then the box type.
        // "ftyp" is standard; older QuickTime files open straight into one of
        // the others.
        return ["ftyp", "moov", "mdat", "wide", "free", "skip", "pnot"].includes(
          ascii(4, 8),
        );
      case ".webm":
        return n >= 4 && head.readUInt32BE(0) === 0x1a45dfa3;
      case ".avi":
        return ascii(0, 4) === "RIFF" && ascii(8, 12) === "AVI ";
      case ".png":
        return (
          n >= 8 &&
          head
            .subarray(0, 8)
            .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
        );
      case ".jpg":
      case ".jpeg":
        return n >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
      case ".gif":
        return ascii(0, 6) === "GIF87a" || ascii(0, 6) === "GIF89a";
      case ".webp":
        // RIFF container whose form type is WEBP.
        return ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP";
      case ".exr":
        // OpenEXR's magic number is fixed at these four bytes for every
        // version, compression and layer layout.
        return (
          n >= 4 &&
          head[0] === 0x76 &&
          head[1] === 0x2f &&
          head[2] === 0x31 &&
          head[3] === 0x01
        );
      default:
        return false;
    }
  } finally {
    fs.closeSync(fd);
  }
}

const UNSUPPORTED_REVIEW_FILE =
  "Review uploads must be MP4, MOV, WebM or AVI video, a PNG, JPEG, GIF, WebP or single-frame EXR still. DPX and ProRes need a review copy exported first, and an EXR image sequence needs to be uploaded frame by frame for now.";

// EXR is linear, high-dynamic-range and has no browser decoder at all.
// ffmpeg's own EXR decoder only understands a plain RGB(A) EXR -- a real
// studio render carries AOVs (Cryptomatte, Depth, Mist, ...) as extra
// channels in the same file, which ffmpeg refuses outright ("Uncommon
// channel combination is not implemented"). oiiotool (OpenImageIO) reads
// the channel list first, picks out just the beauty/colour layer, and does
// a real linear -> sRGB colour transform (not ffmpeg's flat -gamma 2.2
// approximation) before handing off a plain RGB PNG ffmpeg-class tools can
// display. 40+ minutes of confirming this against this studio's own real
// render output (Blender's "ViewLayer.Combined.*" convention, 18 channels,
// 4K) before writing this -- ffmpeg alone never worked on it.
const EXR_TRANSCODE_TIMEOUT_MS = 60_000;

/** Channel names oiiotool reports, in "channel list: a, b, c" order. */
async function exrChannelList(exrPath: string): Promise<string[]> {
  const { stdout } = await execFileAsync("oiiotool", ["--info", "-v", exrPath], {
    timeout: EXR_TRANSCODE_TIMEOUT_MS,
  });
  const match = /channel list:\s*(.+)/.exec(stdout);
  if (!match) return [];
  return match[1].split(",").map((c) => c.trim());
}

/**
 * Picks the beauty/colour channels to extract for a preview, from whatever
 * channel names the file actually has:
 *  - A plain "R"/"G"/"B" triplet (simple single-layer EXR) -- most common
 *    non-Blender case, and what ffmpeg alone already handled.
 *  - A "<anything>.Combined.R/G/B" triplet -- Blender's own AOV naming for
 *    its beauty pass, the case that broke ffmpeg outright.
 *  - Otherwise, the first three channels in file order, best-effort, rather
 *    than refusing a file from a naming convention neither case covers.
 */
function pickBeautyChannels(channels: string[]): string[] {
  const has = (name: string) => channels.includes(name);
  if (has("R") && has("G") && has("B")) {
    return has("A") ? ["R", "G", "B", "A"] : ["R", "G", "B"];
  }
  const combined = channels.find((c) => c.endsWith(".Combined.R"));
  if (combined) {
    const prefix = combined.slice(0, -".Combined.R".length);
    const [r, g, b, a] = [
      `${prefix}.Combined.R`,
      `${prefix}.Combined.G`,
      `${prefix}.Combined.B`,
      `${prefix}.Combined.A`,
    ];
    if (has(r) && has(g) && has(b)) return has(a) ? [r, g, b, a] : [r, g, b];
  }
  return channels.slice(0, Math.min(3, channels.length));
}

async function transcodeExrToPng(exrPath: string, pngPath: string): Promise<void> {
  const channels = await exrChannelList(exrPath);
  if (channels.length === 0) {
    throw new Error("Could not read this EXR's channel list");
  }
  const beauty = pickBeautyChannels(channels);
  await execFileAsync(
    "oiiotool",
    [
      exrPath,
      "--ch",
      beauty.join(","),
      "--colorconvert",
      "linear",
      "sRGB",
      "-o",
      pngPath,
    ],
    { timeout: EXR_TRANSCODE_TIMEOUT_MS },
  );
}

const videoUpload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const tenantId = req.tenantId!;
      const dir = path.join(UPLOAD_DIR, tenantId, "videos");
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      cb(null, `${crypto.randomUUID()}${reviewMediaExt(file)}`);
    },
  }),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB -- real dailies/playblasts run larger than reference attachments
  fileFilter: (_req, file, cb) => {
    if (!reviewMediaExt(file)) {
      cb(new Error(UNSUPPORTED_REVIEW_FILE));
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
    videoUpload.single("file")(req, res, async (err) => {
      if (err) {
        const tooLarge = (err as { code?: string }).code === "LIMIT_FILE_SIZE";
        return res.status(tooLarge ? 413 : 400).json({
          error: tooLarge ? "Review uploads are limited to 500 MB" : err.message,
        });
      }
      if (!req.file) return res.status(400).json({ error: "No file provided" });

      const ext = path.extname(req.file.filename).toLowerCase();
      let genuine = false;
      try {
        genuine = matchesSignature(req.file.path, ext);
      } catch (sniffErr) {
        req.log.error(sniffErr, "Failed to read uploaded review media");
      }
      if (!genuine) {
        fs.rm(req.file.path, { force: true }, () => {});
        return res.status(400).json({
          error: `This file's contents aren't a real ${ext.slice(1).toUpperCase()}. ${UNSUPPORTED_REVIEW_FILE}`,
        });
      }

      const tenantId = req.tenantId!;

      if (ext === ".exr") {
        const pngPath = req.file.path.replace(/\.exr$/i, ".png");
        try {
          await transcodeExrToPng(req.file.path, pngPath);
        } catch (transcodeErr) {
          req.log.error(transcodeErr, "EXR transcode failed");
          // The original stays on disk deliberately -- see the comment below
          // on the success path for why -- but a failed transcode leaves an
          // orphaned .png attempt (if ffmpeg partially wrote one) that's
          // worth clearing.
          fs.rm(pngPath, { force: true }, () => {});
          return res.status(422).json({
            error:
              "Could not generate a preview from this EXR. It may use a compression or channel layout ffmpeg doesn't support, or be corrupt.",
          });
        }
        let pngSize = 0;
        try {
          pngSize = fs.statSync(pngPath).size;
        } catch {
          // fallthrough to the pngSize === 0 check below
        }
        if (pngSize === 0) {
          fs.rm(pngPath, { force: true }, () => {});
          return res.status(422).json({
            error: "ffmpeg produced an empty preview for this EXR -- treating it as a failed transcode.",
          });
        }
        // The original EXR is kept, not deleted: it's the studio's actual
        // render output, and there is no "download original" feature yet
        // (a known gap) to hand it back if this discarded it. originalUrl is
        // included now so that feature has something to point at later; the
        // review player itself only ever needs `url`, the proxy.
        return res.status(201).json({
          url: `/api/uploads/videos/${tenantId}/${path.basename(pngPath)}`,
          originalUrl: `/api/uploads/videos/${tenantId}/${req.file.filename}`,
          name: req.file.originalname,
          size: pngSize,
          mimeType: "image/png",
          kind: "image",
        });
      }

      const url = `/api/uploads/videos/${tenantId}/${req.file.filename}`;
      return res.status(201).json({
        url,
        name: req.file.originalname,
        size: req.file.size,
        mimeType: REVIEW_MEDIA[ext].mime,
        kind: REVIEW_MEDIA[ext].kind,
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
  const contentType = REVIEW_MEDIA[ext]?.mime ?? "application/octet-stream";
  res.setHeader("Content-Type", contentType);
  // The stated type is the only one the browser may use -- no sniffing a
  // mislabelled file into something that renders as a document.
  res.setHeader("X-Content-Type-Options", "nosniff");
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
