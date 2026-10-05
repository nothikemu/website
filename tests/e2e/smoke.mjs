// Browser smoke test of the core workflow against a running server.
// Usage: BASE_URL=http://localhost:3000 node tests/e2e/smoke.mjs
import { chromium } from "playwright-core";
const base = process.env.BASE_URL ?? "http://localhost:3000";
const id = Date.now().toString(36);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const step = (s) => console.log("→", s);

step("sign up");
await page.goto(`${base}/signup`);
await page.fill("#name", "Ada Builder");
await page.fill("#username", `ada-${id}`);
await page.fill("#email", `ada-${id}@example.com`);
await page.fill("#password", "torque-wrench-42");
await page.click("button[type=submit]");
await page.waitForURL("**/organizations/new**");

step("create organization");
await page.fill("#name", `Lab ${id}`);
await page.click("button[type=submit]");
await page.waitForURL("**/project/new**");

step("create project");
await page.fill("#name", `Rover ${id}`);
await page.click("button[type=submit]");
await page.waitForURL(/\/project\/rover-/);
const slug = new URL(page.url()).pathname.split("/")[2];

step("upload a file through the UI");
await page.goto(`${base}/project/${slug}/files`);
await page.setInputFiles("input[type=file]", { name: "bracket.step", mimeType: "application/octet-stream", buffer: Buffer.from("ISO-10303-21;\nHEADER;\nFILE_SCHEMA(('AUTOMOTIVE_DESIGN'));\nENDSEC;\nEND-ISO-10303-21;\n") });
await page.getByText("bracket.step").first().waitFor({ timeout: 15000 });
await page.waitForSelector("text=Uploaded", { timeout: 15000 });

step("create an issue");
await page.goto(`${base}/project/${slug}/issues/new`);
await page.fill("#title", "Bracket cracks under load");
await page.locator("textarea").first().fill("Seen during TEST-001. @nobody");
await page.click("button[type=submit]");
await page.waitForURL(/\/issues\/1$/);

step("comment on the issue");
await page.locator("textarea").last().fill("Reprinting at 5 mm.");
await page.getByRole("button", { name: "Comment" }).click();
await page.getByText("Reprinting at 5 mm.").waitFor();

step("search with the command palette");
await page.keyboard.press("Control+k");
await page.keyboard.type("bracket");
await page.getByText("Bracket cracks under load").last().waitFor();

console.log(errors.length ? `page errors:\n${errors.join("\n")}` : "✓ e2e smoke passed with no page errors");
await browser.close();
process.exit(errors.length ? 1 : 0);
