// End-to-end: log a TT time with a screenshot proof, a zombies session, an invite + register.
// usage: ADMIN_PW=... node tools/qa-flow.mjs
import { chromium, BASE, login, watch } from "./pw.mjs";

const out = "docs/shots";
const b = await chromium.launch();
const errs = [];
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const p = await login(ctx, "andres", process.env.ADMIN_PW);
watch(p, errs);

// a real PNG to attach: render a finish-screen-like frame and screenshot it
const tmp = await ctx.newPage();
await tmp.setContent(`<div style="width:640px;height:360px;background:#1d2233;color:#f3f2ec;font:700 44px sans-serif;display:flex;align-items:center;justify-content:center">DK Spaceport · 1:29.391</div>`);
await tmp.locator("div").screenshot({ path: "/tmp/gb-proof.png" });
await tmp.close();

// ---- Time Trial
await p.goto(`${BASE}/log?game=mkw`);
await p.getByRole("button", { name: /^Time Trial$/ }).click();
await p.fill('input[type=search] >> nth=0', "DK Space");
await p.getByRole("button", { name: "DK Spaceport", exact: true }).click();
await p.fill("#f-time", "129391");
const splits = ["24380", "14350", "12590", "12570", "12290"];
for (let i = 0; i < splits.length; i++) await p.fill(`.splitsin input >> nth=${i}`, splits[i]);
// combo: first time on this device, so the chips are open
const searches = p.locator("input[type=search]");
await searches.nth(0).fill("Bowser");
await p.getByRole("button", { name: "Bowser", exact: true }).click();
await searches.nth(1).fill("Reel");
await p.getByRole("button", { name: "Reel Racer", exact: true }).click();
await p.setInputFiles('input[type=file]', "/tmp/gb-proof.png");
await p.waitForSelector(".files li");
console.log("delta:", await p.locator(".delta").first().innerText());
await p.screenshot({ path: `${out}/log-tt-390.png`, fullPage: true });
await Promise.all([p.waitForURL(/\/g\/mkw\/time-trial\//, { timeout: 60000 }), p.click("button.save")]);
await p.waitForLoadState("networkidle");
console.log("after TT save:", new URL(p.url()).pathname);

// ---- Zombies session
await p.goto(`${BASE}/log?game=bo7`);
await p.getByRole("button", { name: /^High round$/ }).click();
await p.locator("input[type=search]").first().fill("Rex");
await p.getByRole("button", { name: "Rex Infernus", exact: true }).click();
await p.fill("#f-round", "34");
for (const code of ["JAV", "LUC", "PAB"]) await p.getByRole("button", { name: new RegExp(`^${code}`) }).click();
const stats = { Andrés: [1184, 2, 7], Javi: [1402, 1, 4], Lucía: [1251, 3, 5], Pablo: [968, 4, 9] };
for (const [name, [k, d, r]] of Object.entries(stats)) {
  await p.getByLabel(`${name} Kills`).fill(String(k));
  await p.getByLabel(`${name} Downs`).fill(String(d));
  await p.getByLabel(`${name} Revives`).fill(String(r));
}
await p.fill("#f-duration", "24108");
await p.fill("#f-ended", "Wiped on round 34, War Mother plus spiders");
await p.fill("#f-quest", "2 of 4 Shadowsmith cleanses");
await p.fill("#notes", "The bridge traps saved round 29. Next time Pablo doesn't get the bow.");
await p.screenshot({ path: `${out}/log-zombies-390.png`, fullPage: true });
await Promise.all([p.waitForURL(/\/r\/\d+/, { timeout: 60000 }), p.click("button.save")]);
console.log("after zombies save:", new URL(p.url()).pathname);

// ---- invite + register
await p.goto(`${BASE}/settings`);
await p.getByRole("button", { name: "Create invite link" }).click();
await p.waitForSelector(".invites code");
const link = await p.locator(".invites code").first().innerText();
const ctx2 = await b.newContext({ viewport: { width: 390, height: 844 } });
const q = await ctx2.newPage();
watch(q, errs);
await q.goto(link.replace(/^https?:\/\/[^/]+/, BASE));
await q.fill("#displayName", "Marta");
await q.fill("#username", "marta");
await q.fill("#code", "mar");
await q.fill("#password", "marta-kart-2026");
await Promise.all([q.waitForURL(`${BASE}/`), q.click("button.save")]);
console.log("registered, home shows:", (await q.locator(".me .code").innerText()));
console.log("console:", errs.length ? errs : "clean");
await b.close();
