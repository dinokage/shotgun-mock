// Renders a branded PDF from an HTML source document.
//
// Uses the system Chrome through Playwright rather than Playwright's own
// bundled browser: this office network has restricted internet access, so a
// `playwright install` download would fail. Chrome's CDP printToPDF is what
// gives us a running header/footer on EVERY page (a CSS position:fixed block
// repeats visually but cannot carry a page number -- Chrome does not
// implement @page margin boxes, so the header/footer template is the only
// route to "Page n of N").
//
// Usage: node docs-build/build-pdf.mjs <input.html> <output.pdf> "<Doc title>" "<Classification>"
// Resolved through the pnpm store path rather than a bare "playwright"
// specifier: pnpm's strict layout only links a package into the workspace
// package that declares it, and docs-build declares nothing.
import { chromium } from "../node_modules/.pnpm/playwright@1.62.1/node_modules/playwright/index.mjs";
import * as fs from "fs";
import * as path from "path";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

const [, , inFile, outFile, docTitle, classification] = process.argv;
if (!inFile || !outFile) {
  console.error('Usage: build-pdf.mjs <input.html> <output.pdf> "<title>" "<classification>"');
  process.exit(1);
}

// The logo travels inside the header template as a data URI. Chrome renders
// header/footer templates in an isolated context with no access to the page's
// own network or stylesheet, so an external <img src> or CSS file silently
// renders blank -- inlining is mandatory, not a preference.
// Accepts whatever format the brand team actually hands over, in preference
// order, so swapping in the official mark needs no conversion step first.
const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\//, ""));
const LOGO_TYPES = [
  ["logo.svg", "image/svg+xml"],
  ["logo.png", "image/png"],
  ["logo.jpg", "image/jpeg"],
  ["logo.jpeg", "image/jpeg"],
  ["logo.webp", "image/webp"],
];
let logoDataUri = null;
let logoUsed = "none";
for (const [file, mime] of LOGO_TYPES) {
  const p = path.join(here, file);
  if (fs.existsSync(p)) {
    logoDataUri = `data:${mime};base64,` + fs.readFileSync(p).toString("base64");
    logoUsed = file;
    break;
  }
}
console.log("Logo: " + logoUsed);

const headerTemplate = `
<div style="width:100%; font-family: Arial, Helvetica, sans-serif; font-size:8px;
            padding:0 14mm; margin:0; color:#5F6E7B; -webkit-print-color-adjust:exact;">
  <div style="display:flex; align-items:center; justify-content:space-between;
              border-bottom:0.6px solid #C6CFD6; padding-bottom:5px;">
    <div style="display:flex; align-items:center; gap:7px;">
      ${logoDataUri ? `<img src="${logoDataUri}" style="height:30px; display:block;">` : ""}
    </div>
    <div style="text-align:right; line-height:1.35;">
      <div style="color:#0F161B; font-weight:700; font-size:8px;">${docTitle || ""}</div>
      <div style="font-size:7px; letter-spacing:.08em; text-transform:uppercase;">${classification || ""}</div>
    </div>
  </div>
</div>`;

const footerTemplate = `
<div style="width:100%; font-family: Arial, Helvetica, sans-serif; font-size:7.5px;
            padding:0 14mm; margin:0; color:#5F6E7B; -webkit-print-color-adjust:exact;">
  <div style="display:flex; align-items:center; justify-content:space-between;
              border-top:0.6px solid #C6CFD6; padding-top:5px;">
    <span>&copy; Symbiosys Technologies &middot; Forge Production Tracking Platform</span>
    <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
  </div>
</div>`;

const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage();
const abs = path.resolve(inFile);
await page.goto("file:///" + abs.replace(/\\/g, "/"), { waitUntil: "networkidle" });
// Webfonts resolve after networkidle in some cases; this makes the wait explicit
// rather than hoping the race lands the right way on every run.
await page.evaluate(() => document.fonts.ready);

// Render to a temporary file first, then move it into place. Writing straight
// to the target fails with EBUSY whenever the previous PDF is still open in a
// viewer, which silently aborted a whole rebuild the first time it happened.
const tmpFile = outFile + ".building";
await page.pdf({
  path: tmpFile,
  format: "A4",
  printBackground: true,
  displayHeaderFooter: true,
  headerTemplate,
  footerTemplate,
  margin: { top: "26mm", bottom: "18mm", left: "0mm", right: "0mm" },
});
await browser.close();

try {
  fs.renameSync(tmpFile, outFile);
  console.log("Wrote " + outFile);
} catch (err) {
  if (err.code === "EBUSY" || err.code === "EPERM") {
    console.error(
      "\n  CANNOT REPLACE: " + path.basename(outFile) +
      "\n  That file is open in another application (a PDF viewer holds a lock on it)." +
      "\n  Close it and run this again. The new version is waiting at:" +
      "\n    " + tmpFile + "\n",
    );
    process.exitCode = 2;
  } else {
    throw err;
  }
}
