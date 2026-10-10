import { useCallback, useEffect, useRef, useState } from "react";
import type { Action, TeamState } from "@/lib/team/engine";
import type { RosterEntry } from "@/lib/team/online";

/** What the server sends every phone: the lobby, or the redacted table. */
export interface RoomView {
  rev: number;
  hostPid: string;
  seed: string;
  roster: RosterEntry[];
  seats: string[] | null;
  state: TeamState | null;
  online: string[];
}

export type LinkStatus = "connecting" | "live" | "missing" | "full" | "taken";

interface Opts {
  role: "host" | "guest";
  code: string;
  pid: string;
  name: string;
  seed?: string;
}

type Reply = Partial<RoomView> & { error?: string; full?: boolean; same?: boolean; online?: string[] };

async function send(payload: Record<string, unknown>): Promise<{ status: number; data: Reply | null }> {
  try {
    const res = await fetch("/api/team", {
      method: "POST",
      headers: { "content-type": "application/json" },
      cache: "no-store",
      body: JSON.stringify(payload),
    });
    const data = (await res.json().catch(() => null)) as Reply | null;
    return { status: res.status, data };
  } catch {
    return { status: 0, data: null };
  }
}

const wait = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

/**
 * Keeps this phone at one Team Mode table. The host opens the room, everyone else joins it by code,
 * then every phone long-polls the server, which holds the game and applies each detective's moves.
 */
export function useTeamRoom({ role, code, pid, name, seed }: Opts) {
  const [view, setView] = useState<RoomView | null>(null);
  const [status, setStatus] = useState<LinkStatus>("connecting");
  const [detail, setDetail] = useState("");
  const [sending, setSending] = useState(false);
  const rev = useRef(0);
  const lastN = useRef(0);
  const alive = useRef(true);
  const nameRef = useRef(name);
  nameRef.current = name;
  const seedRef = useRef(seed);
  seedRef.current = seed;
  const kick = useRef<() => void>(() => {});

  const take = useCallback((b: Reply | null | undefined) => {
    if (!b || typeof b.rev !== "number") return false;
    if (b.same) {
      if (b.online) setView((v) => (v ? { ...v, online: b.online as string[] } : v));
      return true;
    }
    if (b.rev < rev.current) return true;
    rev.current = b.rev;
    setView(b as RoomView);
    return true;
  }, []);

  useEffect(() => {
    alive.current = true;
    rev.current = 0;
    let hidden = typeof document !== "undefined" && document.visibilityState === "hidden";
    let ctrl: AbortController | null = null;
    let gen = 0;
    let running = false;
    let blocked = false;

    const enter = async (): Promise<boolean> => {
      const r = await send(role === "host" ? { op: "create", room: code, peer: pid, name: nameRef.current, seed: seedRef.current } : { op: "join", room: code, peer: pid, name: nameRef.current });
      if (!alive.current) return false;
      if (r.data && take(r.data)) {
        setStatus("live");
        setDetail("");
        return true;
      }
      if (r.status === 409) {
        blocked = true;
        setStatus(r.data?.full ? "full" : "taken");
        setDetail(r.data?.error ?? "");
        return false;
      }
      if (r.status === 404) {
        setStatus("missing");
        setDetail(r.data?.error ?? "");
      } else {
        setStatus("connecting");
        setDetail("");
      }
      return false;
    };

    const loop = async () => {
      if (running) return;
      running = true;
      const mine = ++gen;
      let entered = false;
      while (alive.current && mine === gen && !hidden) {
        if (!entered) {
          entered = await enter();
          if (!alive.current || mine !== gen) break;
          if (!entered) {
            if (blocked) break;
            await wait(1500);
            continue;
          }
        }
        ctrl = new AbortController();
        const timer = window.setTimeout(() => ctrl?.abort(), 26000);
        try {
          const q = new URLSearchParams({ room: code, peer: pid, rev: String(rev.current) });
          const res = await fetch(`/api/team?${q}`, { signal: ctrl.signal, cache: "no-store" });
          if (!alive.current || mine !== gen) break;
          if (res.status === 404) {
            // The table is gone (the server restarted, or the host closed it). Try to get back in.
            entered = false;
            rev.current = 0;
            setStatus("missing");
            await wait(1200);
            continue;
          }
          if (res.ok) {
            take((await res.json()) as Reply);
            setStatus("live");
          } else {
            setStatus("connecting");
            await wait(1000);
          }
        } catch {
          if (!alive.current || mine !== gen) break;
          setStatus("connecting");
          await wait(1000);
        } finally {
          window.clearTimeout(timer);
        }
      }
      if (mine === gen) running = false;
    };

    const restart = () => {
      gen += 1;
      ctrl?.abort();
      running = false;
      if (!hidden) void loop();
    };
    kick.current = restart;

    const onVis = () => {
      hidden = document.visibilityState === "hidden";
      if (hidden) {
        gen += 1;
        ctrl?.abort();
        running = false;
        return;
      }
      // Coming back to the page: take a fresh look at the table straight away.
      rev.current = 0;
      restart();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pageshow", onVis);
    window.addEventListener("online", onVis);
    void loop();
    return () => {
      alive.current = false;
      gen += 1;
      ctrl?.abort();
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pageshow", onVis);
      window.removeEventListener("online", onVis);
    };
  }, [role, code, pid, take]); // eslint-disable-line react-hooks/exhaustive-deps

  const post = useCallback(
    async (payload: Record<string, unknown>, tries = 2) => {
      for (let i = 0; i < tries; i++) {
        const r = await send({ room: code, peer: pid, ...payload });
        if (!alive.current) return null;
        if (r.data && take(r.data)) {
          setStatus("live");
          return r.data;
        }
        if (r.data?.error) {
          setDetail(r.data.error);
          return null;
        }
        await wait(400);
      }
      setStatus("connecting");
      return null;
    },
    [code, pid, take],
  );

  const act = useCallback(
    async (action: Action) => {
      // Always bigger than the last one, even across a refresh, so the server never mistakes it for a repeat.
      lastN.current = Math.max(lastN.current + 1, Date.now());
      setSending(true);
      try {
        await post({ op: "act", n: lastN.current, action });
      } finally {
        if (alive.current) setSending(false);
      }
    },
    [post],
  );

  const start = useCallback(() => post({ op: "start" }), [post]);
  const again = useCallback((keepSeed?: string) => post({ op: "again", seed: keepSeed }), [post]);
  const leave = useCallback(() => {
    alive.current = false;
    // Fire and forget: leaving must work even with a bad connection.
    void send({ op: "leave", room: code, peer: pid });
  }, [code, pid]);

  return { view, status, detail, sending, act, start, again, leave, retry: () => kick.current() };
}
