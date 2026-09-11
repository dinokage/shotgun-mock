// Captures User Guide screenshots from the live deployment with every real
// staff name, project name and shot code replaced at render time.
//
// Masking happens in the page, after load, immediately before the shot is
// taken. Nothing in the database is altered -- this is a display-layer
// substitution for documentation purposes only, so there is no possibility of
// the anonymisation itself corrupting production data.
import { chromium } from "../node_modules/.pnpm/playwright@1.62.1/node_modules/playwright/index.mjs";
import * as fs from "fs";
import * as path from "path";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = "http://10.180.9.120";
const OUT = path.resolve("docs-build/img");
fs.mkdirSync(OUT, { recursive: true });

const ACCOUNTS = {
  artist: { email: "umashankargudivada@gmail.com", pw: "ForgeTest2026!" },
  lead: { email: "nagesh.kondaka@symbiosystech.com", pw: "ForgeTest2026!" },
  prodhead: { email: "yerradinesh01@gmail.com", pw: "ForgeTest2026!" },
  admin: { email: "krishna.akshath11@gmail.com", pw: "Password@69" },
};

// Real name -> pseudonym. Longest-first replacement at run time stops
// "Dipanjan Das" being partially rewritten by the "Dipanjan Pan" rule.
const PSEUDONYMS = [
  "A. Sharma", "B. Nair", "C. Iyer", "D. Rao", "E. Bose", "F. Menon",
  "G. Pillai", "H. Reddy", "J. Chandra", "K. Varma", "L. Sen", "M. Dutta",
  "N. Joshi", "P. Kulkarni", "R. Banerjee", "S. Krishnan", "T. Mehta",
  "U. Ghosh", "V. Anand", "W. Prasad", "X. Roy", "Y. Naidu", "Z. Kapoor",
];

async function maskPage(page, realNames) {
  await page.evaluate(
    ({ names, pseudos }) => {
      const map = new Map();
      names.forEach((n, i) => map.set(n, pseudos[i % pseudos.length]));
      // Longest first so a shorter name that is a substring of a longer one
      // cannot rewrite half of it.
      const ordered = [...map.keys()].sort((a, b) => b.length - a.length);

      const substitute = (text) => {
        let out = text;
        for (const real of ordered) {
          if (!real || real.length < 3) continue;
          const safe = real.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          out = out.replace(new RegExp(safe, "gi"), map.get(real));
        }
        // Project and shot identifiers carry the client's series name.
        out = out.replace(/PES Animation/gi, "Demo Series");
        out = out.replace(/PES Studios/gi, "Demo Client Ltd");
        out = out.replace(/pes1_/gi, "dmo1_");
        out = out.replace(/PES /g, "DMO ");
        out = out.replace(/Symbiosys Technologies/gi, "Demo Studio");
        // Email addresses are personal data even when the name is masked.
        out = out.replace(/[\w.+-]+@[\w.-]+\.\w+/g, "user@demo-studio.example");
        return out;
      };

      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      for (const n of nodes) {
        const next = substitute(n.nodeValue);
        if (next !== n.nodeValue) n.nodeValue = next;
      }
      // Placeholder and value attributes are not text nodes.
      for (const el of document.querySelectorAll("input, textarea")) {
        if (el.placeholder) el.placeholder = substitute(el.placeholder);
        if (el.value) el.value = substitute(el.value);
      }
      // Avatar images can be personal photographs.
      for (const img of document.querySelectorAll("img")) {
        if (/avatar|profile|user/i.test(img.src + img.alt + img.className)) {
          img.style.filter = "blur(6px)";
        }
      }

      // Avatar fallbacks render the real initial, which both leaks a letter
      // and contradicts the pseudonym beside it. Re-derive each initial from
      // the pseudonym in the same card so the figure reads consistently.
      const initialEls = [...document.querySelectorAll("span, div")].filter((el) => {
        const t = (el.textContent || "").trim();
        return t.length >= 1 && t.length <= 2 && el.children.length === 0 && /^[A-Za-z]{1,2}$/.test(t);
      });
      for (const el of initialEls) {
        let card = el;
        for (let i = 0; i < 6 && card.parentElement; i++) card = card.parentElement;
        const m = (card.textContent || "").match(/\b([A-Z])\.\s[A-Z][a-z]+/);
        if (m) el.textContent = m[1];
      }
    },
    { names: realNames, pseudos: PSEUDONYMS },
  );
}

async function login(page, who) {
  const acct = ACCOUNTS[who];
  await page.goto(BASE + "/login", { waitUntil: "networkidle" });
  await page.fill('input[type="email"], input#email, input[name="email"]', acct.email).catch(async () => {
    const inputs = page.locator("input");
    await inputs.nth(0).fill(acct.email);
  });
  const pw = page.locator('input[type="password"]');
  await pw.fill(acct.pw);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForTimeout(2500);
}

async function logout(page) {
  // Navigating to /login while a valid session exists does not reliably
  // switch accounts -- the session cookie persists. Clearing cookies is the
  // deterministic equivalent of clicking Log out.
  await page.context().clearCookies();
}

async function shoot(page, name, realNames) {
  await page.waitForTimeout(1400);
  await maskPage(page, realNames);
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(OUT, name + ".png") });
  console.log("  captured " + name);
}

const realNames = fs
  .readFileSync(path.resolve("docs-build/realnames.txt"), "utf8")
  .split("|")
  .map((s) => s.trim())
  .filter((s) => s.length > 2);

const browser = await chromium.launch({ executablePath: CHROME });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

const PLAN = [
  ["artist", [
    ["/login", "01-signin", true],
    ["/tasks", "10-artist-tasks"],
    ["/review", "11-artist-reviews"],
    ["/shots?mine=1", "12-artist-shots"],
    ["/timesheets", "13-artist-timesheets"],
    ["/daily-standup", "14-artist-standup"],
  ]],
  ["lead", [
    ["/production", "20-lead-dashboard"],
    ["/review", "21-lead-reviews"],
    ["/tracking", "22-lead-tracking"],
    ["/scheduling", "23-lead-scheduling"],
  ]],
  ["prodhead", [
    ["/", "30-ph-dashboard"],
    ["/tracking", "31-ph-tracking"],
    ["/projects", "32-ph-projects"],
    ["/people", "33-ph-roster"],
    ["/analytics", "34-ph-analytics"],
    ["/delivery", "35-ph-deliveries"],
  ]],
  ["admin", [
    ["/", "40-admin-dashboard"],
    ["/people", "41-admin-roster"],
    ["/settings", "42-admin-settings"],
    ["/audit", "43-admin-audit"],
    ["/integrations", "44-admin-integrations"],
  ]],
];

for (const [who, screens] of PLAN) {
  console.log("Capturing as " + who);
  await logout(page);
  for (const [route, name, preLogin] of screens) {
    if (preLogin) {
      await page.goto(BASE + route, { waitUntil: "networkidle" });
      await shoot(page, name, realNames);
      continue;
    }
    if (!page.url().includes(BASE) || page.url().includes("/login")) {
      await login(page, who);
    }
    await page.goto(BASE + route, { waitUntil: "networkidle" });
    await shoot(page, name, realNames);
  }
}

await browser.close();
console.log("Done. Images in " + OUT);
