import { requireUser } from "@/lib/auth";
import { PlayerView } from "@/components/PlayerView";

export const metadata = { title: "Board" };

export default async function HomePage() {
  const me = await requireUser();
  return <PlayerView player={me} isMe />;
}
