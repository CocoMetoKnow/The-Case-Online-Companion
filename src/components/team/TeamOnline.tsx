import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useP2PRoom } from "@/lib/multiplayer";
import { newGame, type Action, type TeamState } from "@/lib/team/engine";
import { MAX_SEATS, MIN_SEATS, applyIntent, joinLobby, redact, roomId, seatOf, type HostTable, type Msg, type RosterEntry } from "@/lib/team/online";
import { freshSeed } from "@/lib/team/rng";
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

const isMsg = (d: unknown): d is Msg => !!d && typeof d === "object" && typeof (d as { t?: unknown }).t === "string" && (d as { t: string }).t.startsWith("tm:");

/** The room code is part of the key, so changing room always starts a fresh connection. */
export function TeamOnline(props: Props) {
  const pid = useMemo(() => myPid(), []);
  return <Session key={`${props.cfg.code}:${pid}`} {...props} pid={pid} />;
}

function Session({ cfg, resume, onLeave, pid }: Props & { pid: string }) {
  const isHost = cfg.role === "host";
  const net = useP2PRoom({ room: roomId(cfg.code), name: cfg.name, selfId: pid });
  const [roster, setRoster] = useState<RosterEntry[]>(() => (isHost ? [{ pid, name: cfg.name }] : []));
  const [seed, setSeed] = useState(cfg.seed ?? resume?.seed ?? freshSeed());
  const [hostPid, setHostPid] = useState(isHost ? pid : "");
  const [table, setTable] = useState<{ state: TeamState; seats: string[] } | null>(isHost && resume?.state && resume.seats ? { state: resume.state, seats: resume.seats } : null);
  const [full, setFull] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [menu, setMenu] = useState(false);
  const [late, setLate] = useState(false);

  // The host's real table lives in a ref so message handlers always see the newest one.
  const host = useRef<HostTable | null>(isHost && resume?.state && resume.seats ? { state: resume.state, seats: resume.seats, hostPid: pid, seen: {} } : null);
  const rosterRef = useRef(roster);
  rosterRef.current = roster;
  const seedRef = useRef(seed);
  seedRef.current = seed;
  const lastSeq = useRef(0);
  const seq = useRef(0);
  const counter = useRef(0);
  const tableRef = useRef(table);
  tableRef.current = table;

  const sendLobby = useCallback(() => net.broadcast({ t: "tm:lobby", host: pid, roster: rosterRef.current, seed: seedRef.current } satisfies Msg), [net, pid]);
  const sendState = useCallback(
    (to?: string) => {
      const h = host.current;
      if (!h) return;
      seq.current += 1;
      const msg: Msg = { t: "tm:state", host: pid, seq: seq.current, seats: h.seats, state: redact(h.state) };
      if (to) net.send(msg, to);
      else net.broadcast(msg);
    },
    [net, pid],
  );

  // Everything arriving from the other phones.
  useEffect(() => {
    return net.onMessage((_from, data) => {
      if (!isMsg(data)) return;
      if (isHost) {
        if (data.t === "tm:join") {
          const h = host.current;
          if (h) {
            if (h.seats.includes(data.pid)) sendState(data.pid);
            else net.send({ t: "tm:full", host: pid } satisfies Msg, data.pid);
          } else {
            const next = joinLobby(rosterRef.current, data.pid, data.name);
            rosterRef.current = next;
            setRoster(next);
            sendLobby();
          }
        } else if (data.t === "tm:act") {
          const h = host.current;
          if (!h) return;
          const r = applyIntent(h, data);
          host.current = r.table;
          if (r.changed) {
            setTable({ state: r.table.state, seats: r.table.seats });
            sendState();
          }
        }
        return;
      }
      // Guest side.
      if (data.t === "tm:lobby") {
        setHostPid(data.host);
        setSeed(data.seed);
        setRoster(data.roster);
        // A new lobby after a finished game means the host has started over.
        if (tableRef.current && tableRef.current.state.status !== "play") setTable(null);
        lastSeq.current = 0;
      } else if (data.t === "tm:state" || data.t === "tm:start") {
        if (data.t === "tm:state" && data.seq <= lastSeq.current) return;
        if (data.t === "tm:state") lastSeq.current = data.seq;
        setHostPid(data.host);
        setTable({ state: data.state, seats: data.seats });
        setWaiting(false);
      } else if (data.t === "tm:full") {
        setFull(true);
      }
    });
  }, [net, isHost, pid, sendLobby, sendState]);

  // Guests keep knocking until the host has let them in (or sent them the table).
  const inRef = useRef(false);
  inRef.current = !!table || roster.some((r) => r.pid === pid);
  useEffect(() => {
    if (isHost || !net.joined) return;
    const knock = () => {
      if (!inRef.current) net.broadcast({ t: "tm:join", pid, name: cfg.name } satisfies Msg);
    };
    knock();
    const id = window.setInterval(knock, 2500);
    const slow = window.setTimeout(() => setLate(true), 12000);
    return () => {
      window.clearInterval(id);
      window.clearTimeout(slow);
    };
  }, [isHost, net.joined, net, pid, cfg.name]);

  // A host that comes back after a refresh tells everyone where things stand.
  useEffect(() => {
    if (!isHost || !net.joined) return;
    if (host.current) sendState();
    else sendLobby();
  }, [isHost, net.joined]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the lobby fresh when a new phone appears in the room.
  const peerCount = net.peers.length;
  useEffect(() => {
    if (isHost && !host.current && net.joined) sendLobby();
  }, [isHost, peerCount, net.joined, sendLobby]);

  // Remember where this phone was, so a refresh puts it back.
  useEffect(() => {
    saveOnline({ role: cfg.role, code: cfg.code, pid, name: cfg.name, seed, state: isHost && table?.state.status === "play" ? table.state : undefined, seats: isHost && table?.state.status === "play" ? table.seats : undefined });
  }, [cfg.role, cfg.code, cfg.name, pid, seed, isHost, table]);

  const leave = () => {
    saveOnline(null);
    onLeave();
  };

  const act = useCallback(
    (a: Action) => {
      if (isHost) {
        const h = host.current;
        if (!h) return;
        counter.current += 1;
        const r = applyIntent(h, { t: "tm:act", pid, n: counter.current, action: a });
        host.current = r.table;
        if (r.changed) {
          setTable({ state: r.table.state, seats: r.table.seats });
          sendState();
        }
      } else {
        counter.current += 1;
        setWaiting(true);
        net.broadcast({ t: "tm:act", pid, n: counter.current, action: a } satisfies Msg);
        window.setTimeout(() => setWaiting(false), 4000);
      }
    },
    [isHost, net, pid, sendState],
  );

  const start = () => {
    const r = rosterRef.current;
    if (r.length < MIN_SEATS) return;
    const state = newGame(seedRef.current, r.map((x) => x.name));
    const seats = r.map((x) => x.pid);
    host.current = { state, seats, hostPid: pid, seen: {} };
    setTable({ state, seats });
    seq.current += 1;
    net.broadcast({ t: "tm:start", host: pid, seats, state: redact(state) } satisfies Msg);
  };

  const backToLobby = () => {
    host.current = null;
    setTable(null);
    window.setTimeout(sendLobby, 50);
  };

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
          {!net.joined ? "Connecting to the table..." : isHost ? "Everyone else opens Team Mode, taps Join, and types this code." : me ? "You're in. Waiting for the host to start the case." : late ? "Still looking for that room. Check the code, and make sure the host has the lobby open." : "Looking for the room..."}
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
              <button type="button" className="tm-btn primary wide" disabled={roster.length < MIN_SEATS || !net.joined} onClick={start}>
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
      <EndScreen s={s} onAgain={backToLobby} againLabel="Back to the lobby (same players)" onReplay={() => { backToLobby(); setSeed(s.seed); }} />
    ) : (
      <EndScreen s={s} onAgain={leave} againLabel="Leave the room" note="The host can start another case from the lobby; stay here to be taken along." />
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
  const offline = new Set(table.seats.filter((p, i) => i !== mySeat && p !== pid && !net.peers.some((q) => q.id === p)));
  return (
    <>
      <Play
        s={s}
        dispatch={act}
        canAct={canAct}
        me={meName}
        status={waiting ? "Sending to the host..." : offline.has(table.seats[s.turn]) ? `${s.players[s.turn].name} seems to be offline.` : undefined}
        onExit={() => setMenu(true)}
      />
      {isHost && !mine && offline.has(table.seats[s.turn]) ? (
        <div className="tm-hostbar">
          {s.players[s.turn].name} is offline.{" "}
          <button type="button" className="tm-link" onClick={() => host.current && act({ type: "end" })}>Skip their turn</button>
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
