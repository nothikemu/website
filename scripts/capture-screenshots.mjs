// Regenerates the landing-page screenshots from the running app + demo seed.
// Usage: npm run dev & npm run db:seed && node scripts/capture-screenshots.mjs
import { chromium } from "playwright-core";
const base = process.env.BASE_URL ?? "http://localhost:3000";
const out = "public/screenshots";
const P = "/project/cargo-transport-robot";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5, colorScheme: "dark" });
const page = await ctx.newPage();
await page.addInitScript(() => localStorage.setItem("theme", "dark"));
await page.request.post(`${base}/api/auth/login`, { data: { email: "demo@forgebase.dev", password: "forgebase-demo" }, headers: { origin: base } });
const q = async (sql) => (await page.request.get(`${base}/api/v1/search?q=${encodeURIComponent(sql)}&limit=5`)).json();
const fileId = async (name) => (await q(name)).hits.find((h) => h.entityType === "file" && h.title === name)?.entityId;
const shot = async (path, name, opts = {}) => {
  await page.goto(base + path, { waitUntil: "networkidle" });
  await page.waitForTimeout(opts.wait ?? 600);
  if (opts.before) await opts.before();
  await page.screenshot({ path: `${out}/${name}.jpg`, type: "jpeg", quality: 88, clip: opts.clip });
  console.log("✓", name);
};
await shot(P, "overview");
await shot(`${P}/requirements?view=trace`, "traceability");
await shot(`${P}/tests/1`, "test");
await shot(`${P}/files/${await fileId("drive-module.stl")}`, "cad", { wait: 2500 });
const cpp = await fileId("main.cpp");
const detail = await (await page.request.get(`${base}/api/v1/projects/cargo-transport-robot/files/${cpp}`)).json();
const vs = detail.versions.map((v) => v.id).reverse();
await shot(`${P}/files/${cpp}?compare=${vs[0]}&to=${vs[2]}`, "diff");
await shot(`${P}/changes/1`, "change");
await shot(`${P}/notebook`, "notebook");
await shot(`${P}/tasks`, "tasks");
await shot(P, "palette", {
  before: async () => {
    await page.keyboard.press("Control+k");
    await page.keyboard.type("bracket", { delay: 40 });
    await page.waitForTimeout(900);
  },
});
await browser.close();
