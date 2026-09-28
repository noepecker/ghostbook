import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { refreshWorldRecords } from "@/lib/wr/refresh";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Vercel Cron calls this daily with `Authorization: Bearer $CRON_SECRET`.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const got = req.headers.get("authorization") ?? "";
  const want = `Bearer ${secret}`;
  if (!secret || got.length !== want.length || !timingSafeEqual(Buffer.from(got), Buffer.from(want))) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const results = await refreshWorldRecords(db, { force: true });
  const failed = results.some((r) => r.error);
  return NextResponse.json({ ok: !failed, results }, { status: failed ? 502 : 200 });
}
