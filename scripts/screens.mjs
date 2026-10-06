// Usage: node scripts/screens.mjs <outDir> <email> <password> <path...>  (theme via THEME=light|dark, WIDTH)
import { chromium } from "playwright-core";
const [outDir, email, password, ...paths] = process.argv.slice(2);
const base = process.env.BASE_URL ?? "http://localhost:3000";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await browser.newContext({ viewport: { width: Number(process.env.WIDTH ?? 1440), height: Number(process.env.HEIGHT ?? 900) }, deviceScaleFactor: Number(process.env.SCALE ?? 1), colorScheme: process.env.THEME ?? "dark" });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });
if (email !== "-") {
  const r = await page.request.post(`${base}/api/auth/login`, { data: { email, password }, headers: { origin: base } });
  if (!r.ok()) console.log("login failed", r.status(), await r.text());
}
if (process.env.THEME) await page.addInitScript((t) => localStorage.setItem("theme", t), process.env.THEME);
let i = 0;
for (const p of paths) {
  const res = await page.goto(base + p, { waitUntil: "networkidle" });
  await page.waitForTimeout(Number(process.env.WAIT ?? 300));
  const name = `${String(i++).padStart(2, "0")}-${p.replace(/[^a-z0-9]+/gi, "_").slice(0, 60) || "root"}.png`;
  await page.screenshot({ path: `${outDir}/${name}`, fullPage: process.env.FULL === "1" });
  console.log(res?.status(), p, "→", name);
}
if (errors.length) console.log(errors.join("\n"));
await browser.close();
