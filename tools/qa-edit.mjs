// End-to-end for editing: log a slow Crown City time with a proof, edit it into a PB and drop
// the proof, then check the board, the record page, the Blob store and who may edit.
// Also shoots the edit form and the Settings storage meter at 390 and 1440.
// usage: ADMIN_PW=ghostbook-demo node tools/qa-edit.mjs   (local PGlite with db:demo; the
// proof is uploaded to the store in BLOB_READ_WRITE_TOKEN and deleted again by the edit)
import { readFileSync } from "node:fs";
import { chromium, BASE, login, watch, overflow } from "./pw.mjs";

const out = process.env.OUT ?? "docs/shots";
const pw = process.env.ADMIN_PW ?? "ghostbook-demo";
const token = readFileSync(".env.local", "utf8").match(/^BLOB_READ_WRITE_TOKEN="?([^"\n]+)"?/m)?.[1];
const { list } = await import("@vercel/blob");
const blobsUnder = async (prefix) => (token ? (await list({ prefix, token })).blobs.map((b) => b.pathname) : []);

const b = await chromium.launch();
const errs = [];
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const p = await login(ctx, "andres", pw);
watch(p, errs);

const board = "/g/mkw/time-trial/crown-city/150cc/non-shortcut";
await p.goto(`${BASE}${board}`);
const pbBefore = await p.locator("table.hist").first().locator("td.t").first().innerText();
console.log("board PB before:", pbBefore);

// ---- log a slow time with a proof
const tmp = await ctx.newPage();
await tmp.setContent(`<div style="width:640px;height:360px;background:#1d2233;color:#f3f2ec;font:700 44px sans-serif;display:flex;align-items:center;justify-content:center">Crown City · 2:30.000</div>`);
await tmp.locator("div").screenshot({ path: "/tmp/gb-edit-proof.png" });
await tmp.close();
await p.goto(`${BASE}/log?game=mkw`);
await p.getByRole("button", { name: /^Time Trial$/ }).click();
await p.fill("input[type=search] >> nth=0", "Crown");
await p.getByRole("button", { name: "Crown City", exact: true }).click();
await p.fill("#f-time", "230000");
await p.setInputFiles("input[type=file]", "/tmp/gb-edit-proof.png");
await p.waitForSelector(".files li");
await Promise.all([p.waitForURL(/\/g\/mkw\/time-trial\//, { timeout: 60000 }), p.click("button.save")]);
await p.waitForLoadState("networkidle");
await p.locator("details.cat summary").click();
const recHref = await p.locator('details.cat a[href^="/r/"]').first().getAttribute("href");
const recId = recHref.split("/").pop();
console.log("logged record", recId);
const before = await blobsUnder(`proofs/${recId}/`);
console.log("blob files for it:", before.length);

// ---- settings meter, while our proof is in the store
for (const w of [390, 1440]) {
  await p.setViewportSize({ width: w, height: w === 390 ? 844 : 900 });
  await p.goto(`${BASE}/settings`);
  console.log(`settings ${w}:`, (await p.locator(".settings > div").nth(2).innerText()).replace(/\n+/g, " | "), "· overflow:", await overflow(p));
  await p.screenshot({ path: `${out}/settings-meter-${w}.png`, fullPage: true });
}
await p.setViewportSize({ width: 390, height: 844 });

// ---- edit: faster time, drop the proof
await p.goto(`${BASE}/r/${recId}`);
await p.getByRole("link", { name: "Edit", exact: true }).click();
await p.waitForURL(/\/edit$/);
console.log("prefilled time:", await p.inputValue("#f-time"), "· overflow 390:", await overflow(p));
await p.screenshot({ path: `${out}/edit-tt-390.png`, fullPage: true });
await p.fill("#f-time", "203500");
await p.fill("#notes", "Typed 2:30 by mistake, it was 2:03.500.");
await p.locator(".files.kept button").first().click();
console.log("proof row:", await p.locator(".files.kept li").first().innerText());
await p.screenshot({ path: `${out}/edit-tt-changed-390.png`, fullPage: true });
await Promise.all([p.waitForURL(new RegExp(`/r/${recId}$`), { timeout: 60000 }), p.click("button.save")]);
await p.waitForLoadState("networkidle");
console.log("record page:", (await p.locator(".round b").innerText()), "·", await p.locator("p.hint", { hasText: "Edited by" }).innerText());
console.log("proofs on record:", await p.locator(".aside h3").first().innerText());
const after = await blobsUnder(`proofs/${recId}/`);
console.log("blob files after edit:", after.length);

await p.goto(`${BASE}${board}`);
const pbAfter = await p.locator("table.hist").first().locator("td.t").first().innerText();
console.log("board PB after:", pbAfter);
await p.screenshot({ path: `${out}/edit-board-after-390.png`, fullPage: true });

console.log("settings after edit:", (await (await p.goto(`${BASE}/settings`), p.locator(".settings > div").nth(2).innerText())).replace(/\n+/g, " | "));
// edit form at 1440
await p.setViewportSize({ width: 1440, height: 900 });
await p.goto(`${BASE}/r/${recId}/edit`);
console.log("overflow 1440:", await overflow(p));
await p.screenshot({ path: `${out}/edit-tt-1440.png`, fullPage: true });

// ---- who may edit: javi on andres's solo record gets a 404
const ctx2 = await b.newContext({ viewport: { width: 390, height: 844 } });
const q = await login(ctx2, "javi", pw);
const res = await q.goto(`${BASE}/r/${recId}/edit`);
console.log("javi on andres's record edit:", res.status(), "· edit link shown:", await (await q.goto(`${BASE}/r/${recId}`), q.getByRole("link", { name: "Edit", exact: true }).count()));

console.log("console:", errs.length ? errs : "clean");
await b.close();
