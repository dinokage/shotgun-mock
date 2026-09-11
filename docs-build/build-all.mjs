// Rebuilds all four documents. Run this after replacing docs-build/logo.*
// with the official Symbiosys Technologies mark — every document picks the
// new logo up from that one file, so nothing else needs editing.
//
//   node docs-build/build-all.mjs
import { execFileSync } from "child_process";

const DOCS = [
  ["marketing-analysis", "Forge-Marketing-Analysis", "Forge — Marketing Analysis", "Confidential · Commercial"],
  ["requirements", "Forge-Requirements-Document", "Forge — Requirements Document", "Internal"],
  ["srs", "Forge-SRS", "Forge — Software Requirements Specification", "Internal"],
  ["user-guide", "Forge-User-Guide", "Forge — Product Usage & User Guide", "Internal"],
];

const failed = [];
for (const [src, out, title, classification] of DOCS) {
  console.log("\nBuilding " + title);
  try {
    execFileSync(
      process.execPath,
      [
        "docs-build/build-pdf.mjs",
        `docs-build/src/${src}.html`,
        `docs-build/out/${out}.pdf`,
        title,
        classification,
      ],
      { stdio: "inherit" },
    );
  } catch {
    // One locked output file should not abandon the other three.
    failed.push(out);
  }
}

if (failed.length === 0) {
  console.log("\nAll four documents rebuilt into docs-build/out/");
} else {
  console.log(
    "\nRebuilt " + (DOCS.length - failed.length) + " of " + DOCS.length +
    ". Could not replace: " + failed.join(", ") +
    "\nClose those files and run this again.",
  );
}
