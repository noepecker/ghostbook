import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { PlayerView } from "@/components/PlayerView";

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  return { title: username };
}

export default async function PlayerPage({ params }: { params: Promise<{ username: string }> }) {
  const me = await requireUser();
  const { username } = await params;
  const [player] = await db.select().from(users).where(eq(users.username, username.toLowerCase()));
  if (!player) notFound();
  return <PlayerView player={player} isMe={player.id === me.id} />;
}
