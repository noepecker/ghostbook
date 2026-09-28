// Type-to-filter checks: the track picker in the log form (initials, keyboard, add) and the
// /games filter, with 390 and 1440 shots.  usage: PW=... [OUT=docs/shots] node tools/qa-lists.mjs
import { chromium, BASE, login, watch, overflow } from "./pw.mjs";

const out = process.env.OUT ?? "docs/shots";
const b = await chromium.launch();
const errs = [];
for (const w of [390, 1440]) {
  const ctx = await b.newContext({ viewport: { width: w, height: w < 600 ? 844 : 900 }, deviceScaleFactor: w < 600 ? 2 : 1 });
  const p = await login(ctx, process.env.USER_NAME ?? "andres", process.env.PW);
  watch(p, errs);

  // ---- log form: game picker by short code, track picker by initials + keyboard
  await p.goto(`${BASE}/log`);
  const game = p.getByRole("combobox", { name: /Game/ });
  await game.fill("bo7");
  console.log(`${w} game "bo7" →`, (await p.getByRole("option").allInnerTexts()).map((o) => o.replace(/\n/g, " · ")));
  await p.keyboard.press("Enter");
  await p.waitForURL(/game=bo7/);
  await p.goto(`${BASE}/log?game=mkw`);
  await p.getByRole("button", { name: /^Time Trial$/ }).click();
  const track = p.getByRole("combobox", { name: /Track/ });
  await track.fill("dks");
  const opts = await p.getByRole("option").allInnerTexts();
  console.log(`${w} "dks" →`, opts.map((o) => o.replace(/\n/g, " · ")));
  await p.screenshot({ path: `${out}/picker-log-${w}.png`, fullPage: w > 600 });
  await p.keyboard.press("ArrowDown");
  await p.keyboard.press("ArrowUp");
  await p.keyboard.press("Enter");
  console.log(`${w} picked:`, await p.locator(".picker").nth(1).locator(".chips button[aria-pressed=true]").innerText());
  await track.fill("rr");
  console.log(`${w} "rr" →`, (await p.getByRole("option").allInnerTexts()).map((o) => o.split("\n")[0]));
  await track.fill("Zzyzx Speedway");
  console.log(`${w} no match →`, await p.getByRole("option").allInnerTexts());
  await p.keyboard.press("Escape");
  console.log(`${w} overflow log:`, await overflow(p));
  await p.goto(`${BASE}/log?game=bo7`);
  await p.getByRole("combobox", { name: /Map/ }).fill("aotd");
  console.log(`${w} bo7 map "aotd" →`, (await p.getByRole("option").allInnerTexts()).map((o) => o.split("\n")[0]));

  // ---- /games filter
  await p.goto(`${BASE}/games`);
  await p.getByRole("searchbox").fill("bo7");
  const visible = await p.locator(".tower.list .tr[data-filter]:visible").allInnerTexts();
  console.log(`${w} /games "bo7" →`, visible.map((v) => v.split("\n").slice(0, 2).join(" ")));
  await p.getByRole("searchbox").fill("bocw");
  console.log(`${w} /games "bocw" →`, (await p.locator(".tower.list .tr[data-filter]:visible").allInnerTexts()).map((v) => v.split("\n")[1]));
  await p.getByRole("searchbox").fill("black");
  await p.screenshot({ path: `${out}/picker-games-${w}.png`, fullPage: true });
  console.log(`${w} overflow games:`, await overflow(p));

  // ---- game page board filter
  await p.goto(`${BASE}/g/mk8dx`);
  await p.getByRole("searchbox").fill("rainbow");
  console.log(`${w} /g/mk8dx "rainbow" →`, (await p.locator(".boards .tr[data-filter]:visible").allInnerTexts()).map((v) => v.split("\n")[0]));
  await ctx.close();
}
console.log("console:", errs.length ? errs : "clean");
await b.close();
