// Shared Playwright bootstrap: reuses the chromium from /workspace/tools/desk-shots (read-only).
import { join } from "node:path";
const DS = process.env.DESK_SHOTS_DIR ?? "/workspace/tools/desk-shots";
process.env.LD_LIBRARY_PATH = `${DS}/libs/extracted/usr/lib/x86_64-linux-gnu:${process.env.LD_LIBRARY_PATH || ""}`;
process.env.PLAYWRIGHT_BROWSERS_PATH = join(DS, "browsers");
export const { chromium } = await import(join(DS, "node_modules/playwright/index.mjs"));
export const BASE = process.env.BASE_URL ?? "http://localhost:3100";

export async function login(ctx, username, password) {
  const p = await ctx.newPage();
  await p.goto(`${BASE}/login`);
  await p.fill("#username", username);
  await p.fill("#password", password);
  await Promise.all([p.waitForURL((u) => !u.pathname.startsWith("/login")), p.click("button.save")]);
  return p;
}

export function watch(p, errs) {
  p.on("console", (m) => { if (["error", "warning"].includes(m.type())) errs.push(m.text().slice(0, 300)); });
  p.on("pageerror", (e) => errs.push(String(e).slice(0, 300)));
}

export async function overflow(p) {
  return p.evaluate(() => {
    const W = document.documentElement.clientWidth;
    return [...document.querySelectorAll("body *")]
      .filter((e) => { const r = e.getBoundingClientRect(); return r.width && r.right > W + 1 && !e.closest(".nav") && !e.closest(".sr"); })
      .slice(0, 6)
      .map((e) => `${e.tagName}.${String(e.className).slice(0, 40)} → ${Math.round(e.getBoundingClientRect().right)}`);
  });
}
