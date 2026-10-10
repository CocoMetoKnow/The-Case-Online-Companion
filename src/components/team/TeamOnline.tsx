import { useEffect, useMemo, useState } from "react";
import type { Action, TeamState } from "@/lib/team/engine";
import { MAX_SEATS, MIN_SEATS, seatOf } from "@/lib/team/online";
import { useTeamRoom } from "./useTeamRoom";
import { closeTeam, myPid, saveOnline } from "@/lib/team/mode";
import { EndScreen, Play, Sheet } from "./TeamMode";

export interface OnlineCfg {
  role: "host" | "guest";
  code: string;
  name: string;
  seed?: string;
}

interface Props {
  cfg: OnlineCfg;
  resume: { state?: TeamState; seats?: string[]; seed?: string } | null;
  onLeave: () => void;
}

/** The room code is part of the key, so changing room always starts a fresh connection. */
export function TeamOnline(props: Props) {
  const pid = useMemo(() => myPid(), []);
  return <Session key={`${props.cfg.code}:${pid}`} {...props} pid={pid} />;
}

function Session({ cfg, onLeave, pid }: Props & { pid: string }) {
  const isHost = cfg.role === "host";
  const net = useTeamRoom({ role: cfg.role, code: cfg.code, pid, name: cfg.name, seed: cfg.seed });
  const view = net.view;
  const roster = view?.roster ?? [];
  const seed = view?.seed ?? cfg.seed ?? "";
  const hostPid = view?.hostPid ?? (isHost ? pid : "");
  const table = view?.state && view.seats ? { state: view.state, seats: view.seats } : null;
  const full = net.status === "full";
  const [menu, setMenu] = useState(false);
  const joined = net.status === "live" && !!view;
  const onlinePids = new Set(view?.online ?? []);

  // Remember where this phone was, so a refresh puts it straight back at the table.
  useEffect(() => {
    saveOnline({ role: cfg.role, code: cfg.code, pid, name: cfg.name, seed: seed || undefined });
  }, [cfg.role, cfg.code, cfg.name, pid, seed]);

  const leave = () => {
    net.leave();
    saveOnline(null);
    onLeave();
  };
  const act = (a: Action) => void net.act(a);
  const start = () => void net.start();
  const backToLobby = (keep?: string) => void net.again(keep);

  // ------------------------------------------------------------------------------------------
  const shareCode = async () => {
    const text = `Join my Team Mode case in The Case. Room code: ${cfg.code}`;
    try {
      if (navigator.share) await navigator.share({ text });
      else await navigator.clipboard.writeText(cfg.code);
    } catch {
      /* cancelled */
    }
  };

  if (full) {
    return (
      <main className="tm tm-setup">
        <h1 className="tm-title">Table full</h1>
        <p className="tm-lede">That case has already started without you. Ask the host to start a new one.</p>
        <button type="button" className="tm-btn primary wide" onClick={leave}>Back</button>
      </main>
    );
  }

  if (!table) {
    const me = roster.find((r) => r.pid === pid);
    return (
      <main className="tm tm-setup">
        <header className="tm-top">
          <button type="button" className="tm-link" onClick={leave}>← Leave</button>
          <span className="tm-eyebrow">{isHost ? "You are the host" : "Joined"}</span>
        </header>
        <p className="tm-eyebrow" style={{ textAlign: "center" }}>Room code</p>
        <div className="tm-code" aria-label={`Room code ${cfg.code.split("").join(" ")}`}>{cfg.code}</div>
        {isHost ? <button type="button" className="tm-btn wide" onClick={shareCode}>Share the code</button> : null}
        <p className="tm-small" style={{ textAlign: "center" }}>
          {net.status === "missing" ? (net.detail || "Still looking for that room. Check the code, and make sure the host has the lobby open.") : net.status === "taken" ? (net.detail || "That room code is taken.") : !joined ? "Connecting to the table..." : isHost ? "Everyone else opens Team Mode, taps Join, and types this code." : me ? "You're in. Waiting for the host to start the case." : "Getting you a seat..."}
        </p>
        <section className="tm-card">
          <h2>Detectives ({roster.length} of {MAX_SEATS})</h2>
          <ul className="tm-roster">
            {roster.map((r) => (
              <li key={r.pid}>
                <span>{r.pid === pid ? `${r.name} (you)` : r.name}</span>
                <span>{r.pid === hostPid ? "👑 host" : ""}</span>
              </li>
            ))}
            {!roster.length ? <li><span>Nobody yet</span></li> : null}
          </ul>
          {isHost ? (
            <>
              <button type="button" className="tm-btn primary wide" disabled={roster.length < MIN_SEATS || !joined} onClick={start}>
                {roster.length < MIN_SEATS ? `Waiting for at least ${MIN_SEATS} detectives` : "Start the case"}
              </button>
              <p className="tm-small">Case code: {seed}. Each detective gets a role with a special edge.</p>
            </>
          ) : null}
        </section>
      </main>
    );
  }

  const s = table.state;
  const mySeat = seatOf(table.seats, pid);
  if (s.status !== "play") {
    return isHost ? (
      <EndScreen s={s} onAgain={() => backToLobby()} againLabel="Back to the lobby (same players)" onReplay={() => backToLobby(s.seed)} />
    ) : (
      <EndScreen s={s} onAgain={leave} againLabel="Leave the room" note="The host can start another case from the lobby. Stay here and you will be taken along." />
    );
  }
  if (mySeat < 0 && !isHost) {
    return (
      <main className="tm tm-setup">
        <h1 className="tm-title">Watching</h1>
        <p className="tm-lede">You joined after the case started, so you do not have a seat.</p>
        <button type="button" className="tm-btn primary wide" onClick={leave}>Back</button>
      </main>
    );
  }
  const mine = mySeat === s.turn;
  const canAct = mine;
  const meName = s.players[mySeat]?.name ?? cfg.name;
  const offline = new Set(table.seats.filter((p, i) => i !== mySeat && p !== pid && !onlinePids.has(p)));
  return (
    <>
      <Play
        s={s}
        dispatch={act}
        canAct={canAct}
        me={meName}
        status={net.sending ? "Sending..." : offline.has(table.seats[s.turn]) ? `${s.players[s.turn].name} seems to be offline.` : undefined}
        onExit={() => setMenu(true)}
      />
      {isHost && !mine && offline.has(table.seats[s.turn]) ? (
        <div className="tm-hostbar">
          {s.players[s.turn].name} is offline.{" "}
          <button type="button" className="tm-link" onClick={() => act({ type: "end" })}>Skip their turn</button>
        </div>
      ) : null}
      {menu ? (
        <Sheet label="Menu">
          <h2>Room {cfg.code}</h2>
          <p className="tm-small">Your seat is saved on this phone. If you close the page, come back and tap "Rejoin".</p>
          <ul className="tm-roster">
            {table.seats.map((p, i) => (
              <li key={p} className={offline.has(p) ? "off" : ""}>
                <span>{s.players[i]?.name}{p === pid ? " (you)" : ""}</span>
                <span>{p === hostPid ? "👑" : ""} {offline.has(p) ? "offline" : "online"}</span>
              </li>
            ))}
          </ul>
          <button type="button" className="tm-btn primary wide" onClick={() => setMenu(false)}>Keep playing</button>
          <button type="button" className="tm-btn wide" onClick={() => { setMenu(false); closeTeam(); }}>Close Team Mode (stay in the room)</button>
          <button type="button" className="tm-btn danger wide" onClick={leave}>{isHost ? "End the room for everyone" : "Leave the room"}</button>
        </Sheet>
      ) : null}
    </>
  );
}
