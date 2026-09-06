import { execSync } from "child_process";
import path from "path";

// This package is ESM ("type": "module" in package.json), so the brief's
// original CommonJS `__dirname` throws `ReferenceError: __dirname is not
// defined` under tsx/node's ESM loader. `import.meta.dirname` is the direct
// ESM equivalent (Node 20.11+/21.2+, confirmed against Node v24 here).
const dirname = import.meta.dirname;

console.log("Running migrations...");
try {
  execSync("./node_modules/.bin/prisma migrate deploy --schema=./schema.prisma", {
    cwd: path.join(dirname, ".."),
    stdio: "inherit",
  });
  console.log("Migrations complete.");
  process.exit(0);
} catch (err) {
  console.error("Migration failed:", err);
  process.exit(1);
}
