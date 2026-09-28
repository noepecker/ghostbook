// Full-page shots of the key pages at 390 and 1440, with overflow and console checks.
// usage: USER=andres PW=... node tools/shots.mjs [name=path ...]
import { chromium, BASE, login, watch, overflow } from "./pw.mjs";

const out = process.env.OUT ?? "docs/shots";
const pages = process.argv.slice(2).length
  ? process.argv.slice(2).map((a) => a.split("="))
  : [
      ["home", "/"],
      ["board-crown-city", "/g/mkw/time-trial/crown-city/150cc/non-shortcut"],
      ["board-dk-spaceport", "/g/mkw/time-trial/dk-spaceport/150cc/non-shortcut"],
      ["record-zombies", "/r/35"],
      ["log-tt", "/log?game=mkw"],
      ["games", "/games"],
      ["game-mkw", "/g/mkw"],
      ["editor-bo7", "/g/bo7/edit"],
      ["settings", "/settings"],
    ];
const widths = (process.env.WIDTHS ?? "390,1440").split(",").map(Number);
const lang = process.env.LANG_UI ?? "en";
const b = await chromium.launch();
for (const w of widths) {
  const ctx = await b.newContext({ viewport: { width: w, height: w < 600 ? 844 : 900 }, deviceScaleFactor: w < 600 ? 2 : 1 });
  await ctx.addCookies([{ name: "gb_lang", value: lang, url: BASE }]);
  const lp = await login(ctx, process.env.USER_NAME ?? "andres", process.env.PW);
  await lp.close();
  for (const [name, path] of pages) {
    const p = await ctx.newPage();
    const errs = [];
    watch(p, errs);
    await p.goto(BASE + path, { waitUntil: "networkidle" });
    await p.evaluate(() => document.fonts.ready);
    await p.waitForTimeout(400);
    const ov = await overflow(p);
    await p.screenshot({ path: `${out}/${name}-${w}${lang === "es" ? "-es" : ""}.png`, fullPage: true });
    console.log(`${name} ${w}: overflow ${ov.length ? JSON.stringify(ov) : "none"} · console ${errs.length ? JSON.stringify(errs) : "clean"}`);
    await p.close();
  }
  await ctx.close();
}
await b.close();
