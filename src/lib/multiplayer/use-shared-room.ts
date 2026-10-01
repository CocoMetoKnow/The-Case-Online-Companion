import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { slimState } from "@/lib/game/slim";
import { bindOnlineLeave, bindOnlineSend, releaseOnline, turnActorId, useGame, type OnlineIntent } from "@/lib/game/store";
import { playQuestionCue, sfxBlocked, sfxPower, sfxReceive, sfxSnake, sfxTurn, sfxWin } from "@/lib/game/sfx";
import { defaultCardArt } from "@/lib/game/cards";
import type { CardDef, GameState, Secrets } from "@/lib/game/types";

export type RoomStatus = "connecting" | "live" | "missing";

type LinkSnap = { status: RoomStatus; online: number };
let linkSnap: LinkSnap = { status: "connecting", online: 0 };
const linkListeners = new Set<() => void>();

function publishLink(next: LinkSnap) {
  if (linkSnap.status === next.status && linkSnap.online === next.online) return;
  linkSnap = next;
  linkListeners.forEach((fn) => fn());
}

export function useRoomLink(): LinkSnap {
  return useSyncExternalStore(
    (cb) => {
      linkListeners.add(cb);
      return () => linkListeners.delete(cb);
    },
    () => linkSnap,
    () => linkSnap,
  );
}

type View = {
  rev?: number;
  born?: number;
  putSeq?: number;
  online?: number;
  state?: GameState;
  hand?: string[];
  solution?: Secrets["solution"];
  reveals?: Secrets["reveals"];
  hits?: Record<string, boolean> | null;
  cardSig?: string;
  setSig?: string;
  handSig?: string;
  revealCount?: number;
  seen?: Array<{ cardId: string; fromId: string }>;
  error?: string;
};

let suppressPut = false;
let putSeq = 0;
let roomEpoch = 0;
let roomBorn = 0;
let wireMarks = { sig: "", set: "", hand: "", rv: 0, fx: "" };

function leanCards(cards: CardDef[], prev: CardDef[] | null): CardDef[] {
  const art = new Map((prev ?? []).map((card) => [card.id, card.imageDataUrl]));
  let changed = false;
  const next = cards.map((card) => {
    const packed = card.imageDataUrl || art.get(card.id);
    if (packed && !defaultCardArt(card.id)) {
      if (card.imageDataUrl === packed) return card;
      changed = true;
      return { ...card, imageDataUrl: packed };
    }
    if (!card.imageDataUrl) return card;
    changed = true;
    const { imageDataUrl: _drop, ...rest } = card;
    return rest;
  });
  return changed ? next : cards;
}

function mergeWire(next: GameState, prev: GameState | null, keepFx = false): GameState {
  if (!prev) return { ...next, cards: leanCards(next.cards, null), eventDeck: [], eventDiscard: [], log: (next.log ?? []).slice(-4) };
  const cards = leanCards(next.cards.length ? next.cards : prev.cards, prev.cards);
  const settings = next.settings?.playMode ? next.settings : (prev.settings ?? next.settings);
  const passages = next.passages?.length ? next.passages : prev.passages;
  const kept = keepFx
    ? {
        spy: prev.spy ?? null,
        hush: prev.hush ?? null,
        notesLock: prev.notesLock ?? {},
        influences: prev.influences ?? [],
        skipIds: prev.skipIds ?? [],
        shortDieId: prev.shortDieId ?? null,
      }
    : {
        notesLock: { ...(prev.notesLock ?? {}), ...(next.notesLock ?? {}) },
      };
  return { ...next, ...kept, cards, settings, passages, eventDeck: [], eventDiscard: [], log: (next.log ?? []).slice(-4) };
}

async function post(body: unknown): Promise<View | null> {
  try {
    const res = await fetch("/api/rtc", {
      method: "POST",
      headers: { "content-type": "application/json" },
      cache: "no-store",
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as View;
    if (!res.ok && res.status !== 409) return data?.error ? data : null;
    return data;
  } catch {
    return null;
  }
}

/**
 * Keeps this phone on one shared room.
 * Joining is a single request. A roll or accusation is a single small request.
 * The reply is the new table, so the other phones only pick up what changed.
 */
export function useSharedRoom(room: string, selfId: string, name: string): { status: RoomStatus; online: number; detail: string } {
  const [status, setStatus] = useState<RoomStatus>("connecting");
  const [online, setOnline] = useState(1);
  const [detail, setDetail] = useState("");
  const applied = useRef(0);
  const nameRef = useRef(name);
  nameRef.current = name;
  useEffect(() => {
    publishLink({ status, online });
  }, [status, online]);
  const takeRef = useRef<(body: View | null) => void>(() => {});
  const isHost = useGame((s) => s.state?.hostId === selfId);

  useEffect(() => {
    const epoch = ++roomEpoch;
    const live = () => epoch === roomEpoch;
    applied.current = 0;
    roomBorn = 0;
    wireMarks = { sig: "", set: "", hand: "", rv: 0, fx: "" };
    let abort: AbortController | null = null;
    let pollGen = 0;
    // While the tab is hidden (backgrounded, screen locked) we stop polling
    // entirely instead of holding a long-poll connection open. That's what
    // lets a free-tier host actually go to sleep when nobody's looking —
    // the loop below picks back up the instant the tab is visible again.
    let hidden = typeof document !== "undefined" && document.visibilityState === "hidden";
    let missingStrikes = 0;
    let retry = 0;

    const take = (body: View | null) => {
      if (!live() || !body) return;
      const store = useGame.getState();
      if (store.view !== "lobby" && store.view !== "play") return;
      if (body.error) setDetail(body.error);
      if (typeof body.putSeq === "number") putSeq = Math.max(putSeq, body.putSeq);
      if (typeof body.born === "number" && body.born !== roomBorn) {
        if (roomBorn !== 0) {
          applied.current = 0;
          wireMarks = { sig: "", set: "", hand: "", rv: 0, fx: "" };
        }
        roomBorn = body.born;
      }
      if (typeof body.online === "number") setOnline(body.online);
      if (!body.state || typeof body.rev !== "number") {
        if (typeof body.rev === "number") applied.current = Math.max(applied.current, body.rev);
        return;
      }
      if (body.rev < applied.current) return;
      applied.current = body.rev;
      const prev = store.state;
      const prevHand = store.secrets.hands[selfId] ?? [];
      const next = mergeWire(body.state, prev, false);
      if (next.startedAt && next.players.length === 0) return;
      if (next.startedAt && next.players.length > 0 && !next.players.some((player) => player.id === selfId)) {
        missingStrikes += 1;
        if (missingStrikes < 3) return;
        useGame.getState().leave("You were removed from the table.");
        return;
      }
      missingStrikes = 0;
      const snake = next.phase === "event" && prev?.phase !== "event";
      const won = next.phase === "gameover" && prev?.phase !== "gameover";
      const nextHand = Array.isArray(body.hand) ? body.hand : prevHand;
      if (next.cards.length && typeof body.cardSig === "string" && body.cardSig) wireMarks.sig = body.cardSig;
      else if (!next.cards.length) wireMarks.sig = "";
      if (next.settings?.playMode && typeof body.setSig === "string" && body.setSig) wireMarks.set = body.setSig;
      const handChanged = nextHand.length !== prevHand.length || [...nextHand].sort().join() !== [...prevHand].sort().join();
      const shownToMe = Boolean(
        next.question?.shownCardId &&
          next.question.askerId === selfId &&
          next.question.shownCardId !== prev?.question?.shownCardId,
      );
      const shownPrivate = Boolean(
        next.privateShow?.cardId &&
          next.privateShow.toId === selfId &&
          next.privateShow.at !== prev?.privateShow?.at,
      );
      const dealt = prev?.phase === "lobby" && next.phase !== "lobby";
      suppressPut = true;
      store.applyRemote(next, nextHand, body.solution, undefined, body.hits);
      releaseOnline();
      if (useGame.getState().view === "lobby" || useGame.getState().view === "play") {
        store.setView(next.phase === "lobby" ? "lobby" : "play");
      }
      suppressPut = false;
      const mine = turnActorId(next) === selfId;
      // Dice clack now plays from Briefcase, on the same frame the dice animation starts.
      if (snake && mine) {
        sfxSnake();
        sfxPower();
      }
      if ((handChanged && !shownToMe && !shownPrivate) || dealt) sfxReceive();
      // A card shown privately plays its paper-slide from the CardReveal animation instead.
      playQuestionCue(prev, next, selfId, false);
      const myRoll = next.phase === "roll" && turnActorId(next) === selfId;
      const alreadyMyRoll = prev?.phase === "roll" && prev.turnIndex === next.turnIndex && turnActorId(prev) === selfId;
      if (myRoll && !alreadyMyRoll) sfxTurn();
      if ((next.notesLock?.[selfId] ?? 0) > (prev?.notesLock?.[selfId] ?? 0)) sfxBlocked();
      if (won) sfxWin();
      if (body.error) setDetail(body.error);
      else setDetail("");
      setStatus("live");
    };
    takeRef.current = take;

    const sendPut = async () => {
      const store = useGame.getState();
      if (!store.state || store.state.hostId !== selfId) return;
      const body = await post({
        op: "put",
        room,
        peer: selfId,
        seq: ++putSeq,
        state: slimState(store.state),
      });
      if (!live()) return;
      if (body?.state) take(body);
      else setStatus("connecting");
    };

    const sendJoin = async () => {
      const body = await post({ op: "join", room, peer: selfId, name: nameRef.current });
      if (!live()) return;
      if (body?.error) setDetail(body.error);
      if (body?.state) take(body);
      else setStatus(body?.error ? "missing" : "connecting");
    };

    const pull = async (snap: boolean) => {
      if (!live() || hidden) return;
      const gen = ++pollGen;
      abort?.abort();
      const ctrl = new AbortController();
      abort = ctrl;
      const timer = window.setTimeout(() => ctrl.abort(), snap ? 8000 : 25000);
      let pause = 0;
      let again = false;
      try {
        const params = new URLSearchParams({
          room,
          peer: selfId,
          name: nameRef.current,
          rev: snap ? "0" : String(applied.current),
        });
        if (!snap && wireMarks.sig) params.set("sig", wireMarks.sig);
        if (!snap && wireMarks.set) params.set("set", wireMarks.set);
        if (snap) params.set("snap", "1");
        const res = await fetch(`/api/rtc?${params}`, { signal: ctrl.signal, cache: "no-store" });
        if (gen !== pollGen || !live()) return;
        if (res.status === 404) {
          const err = (await res.json().catch(() => null)) as View | null;
          const store = useGame.getState();
          if (err?.error) setDetail(err.error);
          setStatus("missing");
          if (store.state?.hostId === selfId) await sendPut();
          else await sendJoin();
          if (gen !== pollGen || !live()) return;
          again = true;
          pause = 800;
        } else if (res.ok) {
          const body = (await res.json()) as View;
          take(body);
          if (gen === pollGen && live()) {
            setStatus("live");
            again = true;
          }
        } else {
          pause = 800;
          setStatus("connecting");
          again = true;
        }
      } catch {
        if (gen !== pollGen || !live()) return;
        setStatus("connecting");
        pause = 800;
        again = true;
      } finally {
        window.clearTimeout(timer);
      }
      if (!again || gen !== pollGen || !live() || hidden) return;
      if (pause) await new Promise((resolve) => window.setTimeout(resolve, pause));
      if (gen === pollGen && live() && !hidden) void pull(false);
    };

    const onVisible = () => {
      if (document.visibilityState === "hidden") {
        // Stop polling immediately — abort whatever long-poll is in flight
        // rather than letting it run its full 25s before the loop notices.
        hidden = true;
        pollGen += 1;
        abort?.abort();
        return;
      }
      hidden = false;
      releaseOnline();
      setStatus("connecting");
      void pull(true);
    };

    bindOnlineLeave(() => {
      void post({ op: "leave", room, peer: selfId });
    });
    bindOnlineSend((intent: OnlineIntent) => {
      const id = `${selfId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      const sent = epoch;
      const payload = {
        op: "play",
        room,
        peer: selfId,
        id,
        kind: intent.kind,
        payload: intent.payload ?? {},
        sig: wireMarks.sig || undefined,
        set: wireMarks.set || undefined,
        hand: wireMarks.hand || undefined,
        rv: wireMarks.rv || undefined,
        fx: wireMarks.fx || undefined,
      };
      const finish = (body: View | null, left: number) => {
        if (sent !== roomEpoch) {
          releaseOnline();
          return;
        }
        if (body && (body.state || typeof body.rev === "number")) {
          take(body);
          releaseOnline();
          return;
        }
        if (left > 0) {
          window.clearTimeout(retry);
          retry = window.setTimeout(() => {
            void post(payload).then((next) => finish(next, left - 1));
          }, 350);
          return;
        }
        setStatus("connecting");
        releaseOnline();
        void pull(true);
      };
      const slow = window.setTimeout(() => releaseOnline(), 8000);
      void post(payload).then((body) => {
        window.clearTimeout(slow);
        finish(body, 1);
      });
    });

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onVisible);
    window.addEventListener("online", onVisible);

    const hostNow = useGame.getState().state?.hostId === selfId;
    void (hostNow ? sendPut() : sendJoin()).finally(() => {
      if (live()) void pull(false);
    });

    return () => {
      if (epoch === roomEpoch) roomEpoch += 1;
      pollGen += 1;
      abort?.abort();
      window.clearTimeout(retry);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onVisible);
      window.removeEventListener("online", onVisible);
      bindOnlineLeave(null);
      bindOnlineSend(null);
      releaseOnline();
    };
  }, [room, selfId]);

  useEffect(() => {
    if (!isHost) return;
    let pending = 0;
    const unsub = useGame.subscribe((current, prev) => {
      if (suppressPut) return;
      if (!current.state || current.state.hostId !== selfId) return;
      if (current.state === prev.state && current.secrets === prev.secrets) return;
      window.clearTimeout(pending);
      pending = window.setTimeout(() => {
        if (suppressPut) return;
        const latest = useGame.getState();
        if (!latest.state || latest.view === "landing" || latest.view === "setup" || latest.state.startedAt) return;
        const sent = roomEpoch;
        void post({
          op: "put",
          room,
          peer: selfId,
          seq: ++putSeq,
          state: slimState(latest.state),
        }).then((body) => {
          if (sent === roomEpoch) takeRef.current(body);
        });
      }, 30);
    });
    return () => {
      window.clearTimeout(pending);
      unsub();
    };
  }, [isHost, room, selfId]);

  return { status, online, detail };
}
