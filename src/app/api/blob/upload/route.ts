import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { recordParticipants, records } from "@/lib/db/schema";

const MAX_UPLOAD = 100 * 1024 * 1024;

// Issues short-lived client tokens so the browser uploads straight to the private
// Blob store. The database row is written by the attachProof action afterwards,
// which re-reads size and type from Blob.
export async function POST(request: Request) {
  const body = (await request.json()) as HandleUploadBody;
  try {
    const json = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const me = await getCurrentUser();
        if (!me) throw new Error("Log in first.");
        const recordId = Number(clientPayload);
        if (!Number.isInteger(recordId) || !pathname.startsWith(`proofs/${recordId}/`)) throw new Error("Bad upload path.");
        const [rec] = await db.select().from(records).where(eq(records.id, recordId));
        if (!rec) throw new Error("No such record.");
        if (rec.createdBy !== me.id) {
          const p = await db
            .select()
            .from(recordParticipants)
            .where(and(eq(recordParticipants.recordId, recordId), eq(recordParticipants.userId, me.id)));
          if (!p.length) throw new Error("Not your record.");
        }
        return {
          allowedContentTypes: ["image/*", "video/*"],
          maximumSizeInBytes: MAX_UPLOAD,
          addRandomSuffix: true,
          validUntil: Date.now() + 30 * 60_000,
        };
      },
    });
    return NextResponse.json(json);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
