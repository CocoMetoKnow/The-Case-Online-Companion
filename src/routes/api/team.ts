import { createFileRoute } from "@tanstack/react-router";
import { handleTeamRoom } from "@/lib/team/room.server";

const handle = ({ request }: { request: Request }) => handleTeamRoom(request);

export const Route = createFileRoute("/api/team")({
  server: { handlers: { GET: handle, POST: handle } },
});
