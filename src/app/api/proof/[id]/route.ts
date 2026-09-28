import { get, issueSignedToken, presignUrl } from "@vercel/blob";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { proofs } from "@/lib/db/schema";

// Proof files live in a private Blob store. Logged-in family members get a redirect
// to a signed URL that dies in 15 minutes; if signing fails we stream the file.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const [p] = await db.select().from(proofs).where(eq(proofs.id, Number(id)));
  if (!p) return new Response("Not found", { status: 404 });
  const validUntil = Date.now() + 15 * 60_000;
  try {
    const token = await issueSignedToken({ pathname: p.pathname, operations: ["get", "head"], validUntil });
    const { presignedUrl } = await presignUrl(token, { operation: "get", pathname: p.pathname, access: "private", validUntil });
    return new Response(null, {
      status: 302,
      headers: { Location: presignedUrl, "Cache-Control": "private, max-age=600" },
    });
  } catch (e) {
    console.error("presign failed, streaming instead", e);
  }
  const res = await get(p.pathname, { access: "private" });
  if (!res || res.statusCode !== 200) return new Response("Not found", { status: 404 });
  return new Response(res.stream, {
    headers: {
      "Content-Type": res.blob.contentType,
      "Content-Length": String(res.blob.size),
      "Cache-Control": "private, max-age=300",
    },
  });
}
