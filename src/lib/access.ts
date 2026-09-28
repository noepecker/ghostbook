import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "./db";
import { recordParticipants, records } from "./db/schema";

interface Who {
  id: number;
  isAdmin: boolean;
}

/** Pure rule, shared by pages that already have the record loaded. */
export function mayEdit(me: Who, rec: { createdBy: number | null; participants: { userId: number | null }[] }): boolean {
  return me.isAdmin || rec.createdBy === me.id || rec.participants.some((p) => p.userId === me.id);
}

/** Who may edit a record, add or remove its proof, or delete it: whoever logged it, anyone on it, and admins. */
export async function canEditRecord(recordId: number, me: Who): Promise<boolean> {
  if (!Number.isInteger(recordId)) return false;
  const [rec] = await db.select({ createdBy: records.createdBy }).from(records).where(eq(records.id, recordId));
  if (!rec) return false;
  if (me.isAdmin || rec.createdBy === me.id) return true;
  const p = await db
    .select({ id: recordParticipants.id })
    .from(recordParticipants)
    .where(and(eq(recordParticipants.recordId, recordId), eq(recordParticipants.userId, me.id)));
  return p.length > 0;
}
