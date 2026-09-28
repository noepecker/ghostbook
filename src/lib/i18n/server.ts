import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { makeT, type Lang } from "./dict";

export const LANG_COOKIE = "gb_lang";

export const getLang = cache(async (): Promise<Lang> => {
  const c = (await cookies()).get(LANG_COOKIE)?.value;
  return c === "es" ? "es" : "en";
});

export const getT = cache(async () => {
  const lang = await getLang();
  return { lang, t: makeT(lang) };
});
