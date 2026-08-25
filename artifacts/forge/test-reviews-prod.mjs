import { chromium } from "playwright";

const browser = await chromium.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) =>
  errors.push({ type: "PAGEERROR", message: e.message, stack: e.stack }),
);
page.on("console", (msg) => {
  if (msg.type() === "error")
    errors.push({ type: "CONSOLE", text: msg.text() });
});
page.on("requestfailed", (req) =>
  errors.push({
    type: "REQFAIL",
    url: req.url(),
    reason: req.failure()?.errorText,
  }),
);

await page.goto("http://localhost:4173/login", { waitUntil: "networkidle" });
console.log("Loaded login (prod build)");

await page.click("text=Production");
await page.waitForTimeout(1200);
console.log("Logged in as Production Manager");

await page
  .goto("http://localhost:4173/review", { waitUntil: "networkidle" })
  .catch((e) => console.log("nav error:", e.message));
await page.waitForTimeout(1500);
console.log("URL:", page.url());

const bodyText = await page
  .locator("body")
  .innerText()
  .catch(() => "(could not read body)");
console.log("Body text (first 500 chars):", bodyText.slice(0, 500));

await page.screenshot({ path: "/tmp/review-prod-crash.png", fullPage: true });

console.log("=== ERRORS CAPTURED ===");
console.log(JSON.stringify(errors, null, 2));

await browser.close();
