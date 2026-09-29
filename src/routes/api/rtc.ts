import { createFileRoute } from "@tanstack/react-router";
import { handleRoom } from "@/lib/multiplayer/room-board.server";

const handle = ({ request }: { request: Request }) => handleRoom(request);

export const Route = createFileRoute("/api/rtc")({
  server: { handlers: { GET: handle, POST: handle } },
});
