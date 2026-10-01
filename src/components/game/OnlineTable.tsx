import { copyText } from "@/lib/clipboard";
import { roomCode } from "@/lib/game/engine";
import { turnActorId, useGame } from "@/lib/game/store";
import { useSharedRoom, useRoomLink } from "@/lib/multiplayer/use-shared-room";
import { Briefcase } from "./Briefcase";
import { LobbyScreen } from "./LobbyScreen";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";

export function OnlineTable() {
  const state = useGame((s) => s.state);
  const localPlayerId = useGame((s) => s.localPlayerId);
  const joinCode = useGame((s) => s.joinCode);
  const setup = useGame((s) => s.setup);
  const leave = useGame((s) => s.leave);
  const room = state?.code ?? (joinCode ? roomCode(joinCode) : "");
  const name = state?.players.find((p) => p.id === localPlayerId)?.name ?? (setup.name || "Guest");
  if (!room || !localPlayerId) {
    return (
      <main className="paper-wash grid min-h-dvh place-items-center p-6">
        <p className="text-muted">Missing table code.</p>
      </main>
    );
  }
  return <OnlineSession key={`${room}:${localPlayerId}`} room={room} selfId={localPlayerId} name={name} />;
}

function OnlineSession({ room, selfId, name }: { room: string; selfId: string; name: string }) {
  const state = useGame((s) => s.state);
  const leave = useGame((s) => s.leave);
  const { status, online, detail } = useSharedRoom(room, selfId, name);
  const code = room.replace(/^gmm/i, "");

  if (!state) {
    return (
      <main className="paper-wash grid min-h-dvh place-items-center p-6">
        <div className="text-center">
          <p className="font-display text-5xl tracking-[0.18em]">{code}</p>
          <p className="mt-3 font-display text-3xl">
            {status === "missing" ? "Not at this table" : "Finding the house"}
          </p>
          <p className="mt-2 text-sm text-muted">
            {status === "missing"
              ? detail || "Ask the host to stay on the lobby, then try the code again."
              : "Connecting to the table…"}
          </p>
          <Button className="mt-6" variant="outline" onClick={leave}>
            Cancel
          </Button>
        </div>
      </main>
    );
  }

  return (
    <div>
      <p className="flex items-center justify-center gap-3 border-b border-line px-4 py-1 text-[11px] uppercase tracking-[0.16em] text-subtle">
        <span>
          {code} · {status === "live" ? `Live · ${online}` : state.hostId === selfId ? "Opening the table" : status === "missing" ? "Code not open" : "Connecting"}
          {detail ? ` · ${detail}` : ""}
        </span>
        <ShareCode code={code} />
      </p>
      {state.phase === "lobby" ? <LobbyScreen /> : <Briefcase />}
      <StuckLeave
        inGame={state.phase !== "lobby"}
        myTurn={turnActorId(state) === selfId}
        cardUp={Boolean(state.phase === "question" && state.question?.shownCardId && state.question.askerId === selfId)}
      />
    </div>
  );
}

function StuckLeave({ inGame, myTurn, cardUp }: { inGame: boolean; myTurn: boolean; cardUp: boolean }) {
  const leave = useGame((s) => s.leave);
  const pending = useGame((s) => s.onlinePending);
  const link = useRoomLink();
  const [ask, setAsk] = useState(false);
  const [hold, setHold] = useState(0);
  const quiet = myTurn && (link.status === "missing" || link.status === "connecting" || (inGame && cardUp && (link.online < 2 || pending)));

  useEffect(() => {
    if (!quiet) {
      setAsk(false);
      return;
    }
    const wait = cardUp || link.status === "missing" ? 8000 : inGame ? 12000 : 18000;
    const timer = window.setTimeout(() => setAsk(true), wait);
    return () => window.clearTimeout(timer);
  }, [quiet, cardUp, inGame, link.status, hold]);

  if (!ask) return null;
  return (
    <div className="roll-stage" style={{ zIndex: 90 }}>
      <div className="case-shell w-full max-w-sm rounded-[28px] px-6 py-6 text-center">
        <p className="text-xs uppercase tracking-[0.22em] text-brass">Stuck</p>
        <h2 className="mt-2 font-display text-4xl leading-none text-paper">Are you sure?</h2>
        <p className="mt-3 text-sm text-paper">It is your turn, and nothing is loading. You can leave this table.</p>
        <Button className="mt-5 w-full" size="lg" onClick={() => leave()}>
          Yes, leave
        </Button>
        <Button
          className="mt-2 w-full"
          variant="outline"
          onClick={() => {
            setAsk(false);
            setHold((n) => n + 1);
          }}
        >
          Stay
        </Button>
      </div>
    </div>
  );
}

function ShareCode({ code }: { code: string }) {
  async function share() {
    const url = new URL(window.location.href);
    url.search = "";
    url.hash = "";
    url.searchParams.set("code", code);
    if (navigator.share) {
      try {
        await navigator.share({ title: "The Case", text: `Join my case. Code ${code}`, url: url.toString() });
        return;
      } catch {
        return;
      }
    }
    // The lobby still shows the code if the phone blocks copying.
    await copyText(`${code}\n${url.toString()}`);
  }
  return (
    <button type="button" className="text-brass" onClick={() => void share()}>
      Share
    </button>
  );
}
