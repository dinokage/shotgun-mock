// Finds layout faults that only appear in print: blocks marked
// page-break-inside:avoid that are taller than the printable area (Chrome
// cannot honour the rule, so they overflow into the footer or get clipped),
// and anything wider than the text column.
//
// Measuring is more reliable than reading rendered pages by eye, and it names
// the exact table or figure at fault.
import { chromium } from "../node_modules/.pnpm/playwright@1.62.1/node_modules/playwright/index.mjs";
import * as path from "path";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

// A4 at 96 CSS dpi, less the margins the PDF build applies.
const PAGE_W = 794;
const PAGE_H = 1123;
const MARGIN_TOP = 98;   // 26mm
const MARGIN_BOT = 68;   // 18mm
const CONTENT_H = PAGE_H - MARGIN_TOP - MARGIN_BOT;

const files = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: CHROME });
let totalProblems = 0;

for (const file of files) {
  const page = await browser.newPage({ viewport: { width: PAGE_W, height: PAGE_H } });
  await page.emulateMedia({ media: "print" });
  await page.goto("file:///" + path.resolve(file).replace(/\\/g, "/"), { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);

  const problems = await page.evaluate((contentH) => {
    const out = [];
    const label = (el) => {
      const cap = el.querySelector("caption, figcaption");
      if (cap) return cap.textContent.trim().slice(0, 70);
      const h = el.querySelector("h2, h3, h4, h5");
      if (h) return h.textContent.trim().slice(0, 70);
      return (el.textContent || "").trim().slice(0, 60).replace(/\s+/g, " ");
    };
    // Read the computed break rule rather than assuming from a selector list,
    // so the check stays true after the stylesheet changes.
    const candidates = document.querySelectorAll(
      "table, figure, div, section, dl, ol, ul",
    );
    for (const el of candidates) {
      const cs = getComputedStyle(el);
      const guarded =
        cs.breakInside === "avoid" || cs.pageBreakInside === "avoid";
      if (!guarded) continue;
      const r = el.getBoundingClientRect();
      if (r.height > contentH) {
        out.push({
          kind: "TOO TALL TO FIT ON ONE PAGE",
          tag: el.tagName.toLowerCase() + (el.className ? "." + String(el.className).split(" ")[0] : ""),
          height: Math.round(r.height),
          limit: contentH,
          what: label(el),
        });
      }
    }
    // Anything spilling past the right edge of the text column.
    const body = document.querySelector(".page") || document.body;
    const bodyRight = body.getBoundingClientRect().right;
    for (const el of document.querySelectorAll(".page *")) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > bodyRight + 2) {
        out.push({
          kind: "OVERFLOWS RIGHT EDGE",
          tag: el.tagName.toLowerCase() + (el.className ? "." + String(el.className).split(" ")[0] : ""),
          height: Math.round(r.width),
          limit: Math.round(bodyRight),
          what: label(el),
        });
      }
    }

    // Content wider or taller than the box drawn around it: an unbroken
    // string in a narrow table cell, or text taller than a fixed-height
    // container. This is what reads as "overlapping" on the page.
    for (const el of document.querySelectorAll("td, th, p, li, div, figcaption, caption, dd, dt")) {
      if (el.children.length > 0) continue; // leaf text nodes only
      const spillX = el.scrollWidth - el.clientWidth;
      const spillY = el.scrollHeight - el.clientHeight;
      if (el.clientWidth > 0 && (spillX > 1 || spillY > 1)) {
        out.push({
          kind: spillX > 1 ? "TEXT WIDER THAN ITS CELL" : "TEXT TALLER THAN ITS BOX",
          tag: el.tagName.toLowerCase() + (el.className ? "." + String(el.className).split(" ")[0] : ""),
          height: spillX > 1 ? el.scrollWidth : el.scrollHeight,
          limit: spillX > 1 ? el.clientWidth : el.clientHeight,
          what: (el.textContent || "").trim().slice(0, 70).replace(/\s+/g, " "),
        });
      }
    }

    // Genuine geometric overlap between block siblings that should stack.
    const blocks = [...document.querySelectorAll(".page > section > *, .page > div > *")]
      .filter((el) => {
        const cs = getComputedStyle(el);
        return cs.position === "static" && cs.display !== "inline" && el.getBoundingClientRect().height > 4;
      });
    for (let i = 0; i < blocks.length - 1; i++) {
      const a = blocks[i].getBoundingClientRect();
      const b = blocks[i + 1].getBoundingClientRect();
      // Siblings in normal flow: the next one must start at or below the end
      // of this one. More than a couple of px of intrusion is a real overlap.
      if (b.top < a.bottom - 2 && b.height > 0 && a.height > 0) {
        out.push({
          kind: "BLOCKS OVERLAP",
          tag: blocks[i].tagName.toLowerCase() + " / " + blocks[i + 1].tagName.toLowerCase(),
          height: Math.round(a.bottom - b.top),
          limit: 0,
          what: label(blocks[i]) + "  ||  " + label(blocks[i + 1]),
        });
      }
    }
    return out;
  }, CONTENT_H);

  console.log("\n=== " + path.basename(file) + " ===");
  if (problems.length === 0) {
    console.log("  no unbreakable block exceeds the printable height");
  } else {
    for (const p of problems) {
      console.log(`  [${p.kind}] ${p.tag} — ${p.height}px vs limit ${p.limit}px`);
      console.log(`      ${p.what}`);
    }
  }
  totalProblems += problems.length;
  await page.close();
}

await browser.close();
console.log("\nTotal problems: " + totalProblems);
