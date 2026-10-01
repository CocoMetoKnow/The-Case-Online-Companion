import { reachable, roomById } from "@/lib/game/board";
import { currentPlayer, turnActorId, useActorId, useGame, useMyHand } from "@/lib/game/store";
import { EVENT_DEFS, PHYSICAL_EVENTS, cardsByCategory } from "@/lib/game/cards";
import type { CategoryId } from "@/lib/game/types";
import { Button } from "@/components/ui/button";
import { CardFace } from "./CardFace";
import { roomsInPlay } from "@/lib/game/engine";
import { cn } from "@/lib/utils";
import { useEffect, useState, type ReactNode } from "react";

export function EventPanel() {
  const state = useGame((s) => s.state);
  const actor = useActorId();
  const eventChoice = useGame((s) => s.eventChoice);
  const hand = useMyHand();
  const [passage, setPassage] = useState({ roomA: "", roomB: "" });
  const [summon, setSummon] = useState({ targetId: "", roomId: "" });
  // Every power-up prompt can be put away. The power itself stays in play (someone still has to
  // finish it), so a small chip brings the prompt back; a new step of the power shows it again.
  const [closedKey, setClosedKey] = useState("");
  const live = state?.event && state.phase === "event" ? state.event : null;
  const promptKey = live ? `${state?.turnIndex}:${live.deckId}:${live.kind}:${live.step}` : "";
  const hidden = Boolean(promptKey) && closedKey === promptKey;
  useEffect(() => {
    if (!promptKey || hidden) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setClosedKey(promptKey);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [promptKey, hidden]);
  if (!state?.event || state.phase !== "event") return null;
  const ev = state.event;
  const close = () => setClosedKey(promptKey);
  const cur = currentPlayer(state);
  const acting = turnActorId(state) === actor;
  const description = state.settings.heist
    ? ev.description.replace(/final accusation/gi, "naming of the theft")
    : ev.description;

  if (hidden) {
    return (
      <button type="button" className="power-chip" onClick={() => setClosedKey("")}>
        <span className="block text-[10px] uppercase tracking-[0.16em] text-brass">{acting ? "Your power-up" : "Power-up in play"}</span>
        <span className="block font-display text-lg leading-tight">{ev.title} · tap to open</span>
      </button>
    );
  }

  if (ev.step === "board") {
    return (
      <PowerShell onClose={close} className="wood-panel max-h-[92dvh] w-full max-w-sm overflow-y-auto rounded-[20px] p-4">
        <SnakeCallout title={ev.title} description={String(ev.data.boardNote ?? description)} />
        <BoardConfirm />
      </PowerShell>
    );
  }

  if (ev.step === "reveal") {
    const seen = Array.isArray(ev.data.seen) ? ev.data.seen.map(String) : [];
    const waiting = state.players.filter((player) => !player.eliminated && !seen.includes(player.id));
    const agreed = seen.includes(actor);
    return (
      <PowerShell onClose={close} className="case-shell w-full max-w-sm rounded-[28px] px-6 py-6 text-center">
        <>
          <h2 className="font-display text-4xl leading-none text-paper">{ev.title}</h2>
          <p className="mt-3 text-sm text-paper">{description}</p>
          {waiting.length ? <p className="mt-2 text-sm text-muted">Waiting on {waiting.map((player) => player.name).join(", ")}.</p> : null}
          {agreed ? (
            <p className="mt-3 text-sm text-paper">You agreed. This stays the same power for everyone.</p>
          ) : (
            <Button className="mt-4 w-full" onClick={() => eventChoice({ confirm: true })}>
              This power is in effect
            </Button>
          )}
        </>
      </PowerShell>
    );
  }

  if (ev.step === "ack") {
    const seen = Array.isArray(ev.data.acked) ? ev.data.acked.map(String) : [];
    const waiting = state.players.filter((player) => !player.eliminated && !seen.includes(player.id));
    const agreed = seen.includes(actor);
    const hushed = ev.data.secret && ev.data.byId === actor && ev.data.cardId
      ? state.cards.find((card) => card.id === ev.data.cardId)?.name
      : "";
    const spying = ev.data.spyTarget && ev.data.byId === actor
      ? state.players.find((player) => player.id === ev.data.spyTarget)?.name
      : "";
    return (
      <PowerShell onClose={close} className="case-shell w-full max-w-sm rounded-[28px] px-6 py-6 text-center">
        <>
          <p className="text-xs uppercase tracking-[0.18em] text-brass">In effect</p>
          <h2 className="mt-2 font-display text-4xl leading-none text-paper">{ev.title}</h2>
          <p className="mt-3 text-sm text-paper">{description}</p>
          {hushed ? <p className="mt-2 text-sm text-paper">You hushed {hushed}. No one else knows which card.</p> : null}
          {spying ? <p className="mt-2 text-sm text-paper">You are spying on {spying}. No one else knows who.</p> : null}
          {waiting.length ? <p className="mt-2 text-sm text-muted">Waiting on {waiting.map((player) => player.name).join(", ")}.</p> : null}
          {agreed ? (
            <p className="mt-3 text-sm text-paper">You agreed this is in effect.</p>
          ) : (
            <Button className="mt-4 w-full" onClick={() => eventChoice({})}>
              This power is in effect
            </Button>
          )}
        </>
      </PowerShell>
    );
  }

  return (
    <PowerShell onClose={close} className="wood-panel max-h-[92dvh] w-full max-w-sm overflow-y-auto rounded-[20px] p-4">
      <>
      <SnakeCallout
        title={ev.title}
        description={
          ev.kind === "red-herring" && ev.step !== "deliver" && !acting
            ? "Two whispers are being written. You cannot see them."
            : ev.kind === "hush" && ev.step !== "ack" && !acting
              ? "A card is being hushed. You cannot see which one."
              : ev.kind === "spy" && ev.step !== "ack" && !acting
                ? "Someone is being chosen. You cannot see who."
                : description
        }
      />

      {(ev.kind === "move-anywhere" || ev.kind === "fast-track" || ev.kind === "shortcut") && acting ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {(() => {
            const enabledRoomIds = roomsInPlay(state);
            const currentRoomId = cur?.position.kind === "room" ? cur.position.roomId : null;
            let roomIds: string[];
            if (ev.kind === "move-anywhere") {
              roomIds = enabledRoomIds;
            } else if (ev.kind === "fast-track") {
              roomIds = cur ? [...reachable(cur.position, 2, enabledRoomIds, []).rooms].filter((id) => enabledRoomIds.includes(id)) : [];
            } else {
              const links = state.passages ?? [];
              const set = new Set<string>();
              for (const link of links) {
                set.add(link.a);
                set.add(link.b);
              }
              roomIds = [...set].filter((id) => enabledRoomIds.includes(id));
            }
            roomIds = roomIds.filter((id) => id !== currentRoomId);
            if (!roomIds.length) {
              return <p className="text-center text-sm text-muted">Nowhere to go from here yet.</p>;
            }
            return roomIds.map((id) => (
              <Button key={id} variant="outline" onClick={() => eventChoice({ roomId: id })}>
                {roomById(id)?.name ?? state.cards.find((c) => c.id === id)?.name ?? id}
              </Button>
            ));
          })()}
        </div>
      ) : null}

      {ev.step === "show-all" ? (
        <div className="mt-3 flex flex-col items-center gap-3">
          {(() => {
            const card = state.cards.find((c) => c.id === ev.data.cardId);
            const holder = state.players.find((p) => p.id === ev.data.holderId);
            const seen = Array.isArray(ev.data.seen) ? ev.data.seen.map(String) : [];
            const waiting = state.players.filter((player) => !player.eliminated && !seen.includes(player.id));
            const agreed = seen.includes(actor);
            return card ? (
              <>
                <CardFace card={card} />
                <p className="text-center text-sm text-paper">
                  {holder?.name ?? "A guest"} has the {card.name}. Everyone must see it.
                </p>
                {waiting.length ? (
                  <p className="text-center text-sm text-muted">Waiting on {waiting.map((player) => player.name).join(", ")}.</p>
                ) : null}
                {agreed ? (
                  <p className="text-sm text-paper">You have seen it.</p>
                ) : (
                  <Button className="w-full" onClick={() => eventChoice({})}>
                    I've seen it
                  </Button>
                )}
              </>
            ) : null;
          })()}
        </div>
      ) : null}

      {ev.step === "show-private" && ev.data.viewerId === actor ? (
        <div className="mt-3 flex flex-col items-center gap-3">
          {(() => {
            const card = state.cards.find((c) => c.id === ev.data.cardId);
            return card ? <CardFace card={card} /> : <p>The card is hidden from this seat.</p>;
          })()}
          <Button onClick={() => eventChoice({})}>I have seen it</Button>
        </div>
      ) : null}

      {ev.kind === "pass-card" && (ev.data.waitingId === actor || (!ev.data.waitingId && acting)) ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {hand.map((c) => (
            <CardFace key={c.id} card={c} compact onClick={() => eventChoice({ cardId: c.id })} />
          ))}
        </div>
      ) : null}

      {ev.kind === "red-herring" && (ev.step === "intro" || ev.step === "pick-card") && acting ? (
        <HerringCardPick onPick={(cardId) => eventChoice({ cardId })} />
      ) : null}

      {ev.kind === "red-herring" && ev.step === "pick-truth" && acting ? (
        <PlayerPick
          exclude={String(ev.data.senderId ?? actor)}
          label="Send the true whisper to"
          onPick={(id) => eventChoice({ targetId: id })}
        />
      ) : null}

      {ev.kind === "red-herring" && ev.step === "pick-lie" && acting ? (
        <PlayerPick
          exclude={String(ev.data.senderId ?? actor)}
          excludeIds={[String(ev.data.truthId ?? "")]}
          label="Send the false whisper to"
          onPick={(id) => eventChoice({ targetId: id })}
        />
      ) : null}

      {ev.kind === "red-herring" && ev.step === "deliver" ? <HerringDelivery /> : null}

      {ev.kind === "new-passage" && acting ? (
        <div className="mt-3 space-y-3">
          <RoomPick label="From" selected={passage.roomA} onPick={(id) => setPassage((p) => ({ ...p, roomA: id }))} />
          <RoomPick label="To" selected={passage.roomB} onPick={(id) => setPassage((p) => ({ ...p, roomB: id }))} />
          <Button
            className="w-full"
            disabled={!passage.roomA || !passage.roomB || passage.roomA === passage.roomB}
            onClick={() => eventChoice(passage)}
          >
            Open the panel
          </Button>
        </div>
      ) : null}

      {ev.kind === "clunk" && acting ? (
        <PlayerPick exclude={actor} label="Skip this guest" onPick={(id) => eventChoice({ targetId: id })} />
      ) : null}

      {ev.kind === "blocked-out" && acting ? (
        <PlayerPick exclude="" label="Block their notes for two turns" onPick={(id) => eventChoice({ targetId: id })} />
      ) : null}

      {(["name-suspect", "name-weapon", "name-room", "name-time"] as const).includes(ev.kind as "name-suspect") &&
      (ev.step === "intro" || ev.step === "pick-card") &&
      acting ? (
        <NamedPick
          category={
            ev.kind === "name-suspect"
              ? "suspect"
              : ev.kind === "name-weapon"
                ? "weapon"
                : ev.kind === "name-room"
                  ? "room"
                  : "time"
          }
          onPick={(cardId) => eventChoice({ cardId })}
        />
      ) : null}

      {(ev.kind === "trade-places" || ev.kind === "swap-card" || ev.kind === "thief" || ev.kind === "spy" || ev.kind === "sabotage") &&
      (ev.step === "intro" || ev.step === "pick-player") &&
      acting ? (
        <PlayerPick
          exclude={actor}
          label={
            ev.kind === "trade-places"
              ? "Swap places with"
              : ev.kind === "thief"
                ? "Steal a die from"
                : ev.kind === "spy"
                  ? "Spy on"
                  : ev.kind === "sabotage"
                    ? "Sabotage"
                    : "Trade a card with"
          }
          onPick={(id) => eventChoice({ targetId: id })}
        />
      ) : null}

      {ev.kind === "call-card" && (ev.step === "intro" || ev.step === "pick-category") && acting ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {(["suspect", "weapon", "room", ...(state.settings.timeOfDayEnabled ? (["time"] as const) : [])] as const).map(
            (cat) => (
              <Button key={cat} variant="outline" onClick={() => eventChoice({ category: cat })}>
                {cat === "suspect" ? "Character" : cat === "weapon" ? "Item" : cat === "room" ? "Room" : "Hour"}
              </Button>
            ),
          )}
        </div>
      ) : null}

      {ev.kind === "call-card" && ev.step === "pick-card" && acting ? (
        <NamedPick category={ev.data.category as CategoryId} onPick={(cardId) => eventChoice({ cardId })} />
      ) : null}

      {ev.kind === "wild-card" && (ev.step === "intro" || ev.step === "pick-power") && acting ? (
        <div className="mt-3 grid grid-cols-1 gap-2">
          {PHYSICAL_EVENTS.filter((k) => {
            if (k === "wild-card") return false;
            // Red Herring needs two other living players to whisper to; skip offering it otherwise.
            if (k === "red-herring") return state.players.filter((p) => !p.eliminated).length >= 3;
            return true;
          }).map((k) => {
            const def = EVENT_DEFS.find((d) => d.kind === k);
            if (!def) return null;
            return (
              <Button key={k} variant="outline" className="justify-start" onClick={() => eventChoice({ kind: k })}>
                {def.title}
              </Button>
            );
          })}
        </div>
      ) : null}

      {ev.kind === "hush" && (ev.step === "intro" || ev.step === "pick-card") && acting ? (
        <HushPick onPick={(cardId) => eventChoice({ cardId })} />
      ) : null}

      {ev.kind === "swap-card" && ev.step === "pick-give" && acting ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {hand.map((c) => (
            <CardFace key={c.id} card={c} compact onClick={() => eventChoice({ cardId: c.id })} />
          ))}
        </div>
      ) : null}

      {ev.kind === "swap-card" && ev.step === "pick-take" && ev.data.targetId === actor ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {hand.map((c) => (
            <CardFace key={c.id} card={c} compact onClick={() => eventChoice({ cardId: c.id })} />
          ))}
        </div>
      ) : null}

      {ev.kind === "come-here" && acting ? (
        <div className="mt-3 space-y-3">
          <PlayerPick
            exclude={actor}
            label="Call"
            selected={summon.targetId}
            onPick={(id) => setSummon((s) => ({ ...s, targetId: id }))}
          />
          <RoomPick label="Into" selected={summon.roomId} onPick={(id) => setSummon((s) => ({ ...s, roomId: id }))} />
          <Button
            className="w-full"
            disabled={!summon.targetId || !summon.roomId}
            onClick={() => eventChoice(summon)}
          >
            Call them in
          </Button>
        </div>
      ) : null}

      {ev.kind === "that-noise" && acting ? (
        <RoomPick label="Everyone goes to" onPick={(id) => eventChoice({ roomId: id })} />
      ) : null}

      {ev.kind === "influenced" && acting ? (
        <PlayerPick exclude={actor} label="Play their next turn" onPick={(id) => eventChoice({ targetId: id })} />
      ) : null}

      <button type="button" className="mt-4 w-full text-center text-sm text-subtle underline" onClick={close}>
        Close for now
      </button>
      </>
    </PowerShell>
  );
}

/**
 * The frame every power-up prompt shares: a visible ✕, a tap outside the card, and Escape (see
 * EventPanel) all put the prompt away, so nobody can be stuck on a power-up screen.
 */
function PowerShell({ onClose, className, children }: { onClose: () => void; className: string; children: ReactNode }) {
  return (
    <div
      className="roll-stage"
      style={{ zIndex: 70 }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={cn("relative", className)} role="dialog" aria-label="Power-up">
        <button type="button" aria-label="Close power-up" className="power-close" onClick={onClose}>
          ✕
        </button>
        {children}
      </div>
    </div>
  );
}

function SnakeCallout({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-[16px] border-2 border-brass bg-[#2a1410] px-4 py-3">
      <p className="text-xs uppercase tracking-[0.18em] text-brass">Snake eyes · everyone look</p>
      <h3 className="mt-1 font-display text-3xl leading-none text-paper">{title}</h3>
      <p className="mt-2 text-base text-paper">{description}</p>
    </div>
  );
}

function BoardConfirm() {
  const state = useGame((s) => s.state);
  const actor = useActorId();
  const eventChoice = useGame((s) => s.eventChoice);
  if (!state?.event) return null;
  const ev = state.event;
  const seen = Array.isArray(ev.data.boardSeen) ? (ev.data.boardSeen as string[]) : [];
  const alive = state.players.filter((p) => !p.eliminated);
  const needed = Math.min(2, alive.length);
  const online = state.settings.playMode === "online";
  const name = (id: string) => state.players.find((p) => p.id === id)?.name ?? "A player";

  return (
    <div className="mt-4">
      <p className="text-sm text-paper">
        {seen.length} of {needed} players confirmed the physical board.
      </p>
      {seen.length ? (
        <ul className="mt-2 space-y-1 text-sm text-muted">
          {seen.map((id) => (
            <li key={id}>{name(id)} confirmed</li>
          ))}
        </ul>
      ) : null}
      {online ? (
        seen.includes(actor) ? (
          <p className="mt-3 text-sm text-paper">You confirmed. One more player has to tap as well.</p>
        ) : (
          <Button className="mt-3 w-full" onClick={() => eventChoice({ boardDone: true })}>
            Done on the board
          </Button>
        )
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          <p className="text-sm text-muted">Two different players each tap their own name.</p>
          {alive
            .filter((p) => !seen.includes(p.id))
            .map((p) => (
              <Button key={p.id} variant="outline" onClick={() => eventChoice({ boardDone: true, asPlayerId: p.id })}>
                {p.name}: done on the board
              </Button>
            ))}
        </div>
      )}
    </div>
  );
}

function HerringDelivery() {
  const state = useGame((s) => s.state);
  const actor = useActorId();
  const eventChoice = useGame((s) => s.eventChoice);
  if (!state?.event) return null;
  const ev = state.event;
  const senderId = String(ev.data.senderId ?? "");
  const truthId = String(ev.data.truthId ?? "");
  const lieId = String(ev.data.lieId ?? "");
  const heard = Array.isArray(ev.data.heard) ? (ev.data.heard as string[]) : [];
  const isSender = actor === senderId;
  const note =
    typeof ev.data.note === "string"
      ? ev.data.note
      : !isSender && actor === truthId
        ? String(ev.data.truthText ?? "")
        : !isSender && actor === lieId
          ? String(ev.data.lieText ?? "")
          : "";
  const pending =
    typeof ev.data.pending === "boolean"
      ? ev.data.pending
      : Boolean(note) && !heard.includes(actor);
  const both = Boolean(truthId && lieId) && heard.includes(truthId) && heard.includes(lieId);
  const name = (id: string) => state.players.find((p) => p.id === id)?.name ?? "A player";

  if (note) {
    return (
      <div className="mt-3 space-y-3">
        <p className="text-xs uppercase tracking-[0.14em] text-subtle">A whisper. You cannot tell if it is true.</p>
        <p className="parchment rounded-[16px] p-3 text-sm text-ink">{note}</p>
        {pending ? (
          <Button className="w-full" onClick={() => eventChoice({})}>
            I've read it
          </Button>
        ) : (
          <p className="text-sm text-muted">Folded away.</p>
        )}
      </div>
    );
  }

  if (isSender) {
    return (
      <div className="mt-3 space-y-3">
        <p className="text-sm">Only you know which whisper is true.</p>
        <p className="parchment rounded-[16px] p-3 text-sm text-ink">
          To {name(truthId)}: {String(ev.data.truthText ?? "")}
        </p>
        <p className="parchment rounded-[16px] p-3 text-sm text-ink">
          To {name(lieId)}: {String(ev.data.lieText ?? "")}
        </p>
        <Button className="w-full" disabled={!both} onClick={() => eventChoice({})}>
          {both ? "Continue" : "Waiting for them to read"}
        </Button>
      </div>
    );
  }

  return <p className="mt-3 text-sm text-muted">Two whispers went out. This one was not for you.</p>;
}

function HushPick({ onPick }: { onPick: (cardId: string) => void }) {
  const state = useGame((s) => s.state);
  const [cat, setCat] = useState<CategoryId | null>(null);
  if (!state) return null;
  const labels: Record<string, string> = state.settings.heist
    ? { suspect: "Who took it", weapon: "What was stolen", room: "Where", time: "When" }
    : { suspect: "Character", weapon: "Item", room: "Room", time: "Hour" };
  const cats = (["suspect", "weapon", "room", "time"] as const).filter((id) =>
    state.cards.some((card) => card.category === id),
  );
  const cards = cardsByCategory(state.cards, cat ?? "suspect");
  return (
    <div className="mt-3">
      <p className="text-xs uppercase tracking-[0.14em] text-subtle">
        {cat ? "Hush this card" : "Pick a category"}
      </p>
      {!cat ? (
        <div className="mt-2 grid grid-cols-2 gap-2">
          {cats.map((id) => (
            <Button key={id} variant="outline" onClick={() => setCat(id)}>
              {labels[id]}
            </Button>
          ))}
        </div>
      ) : (
        <>
          <Button className="mt-2" variant="ghost" size="sm" onClick={() => setCat(null)}>
            Change category
          </Button>
          <div className="mt-2 grid max-h-64 grid-cols-2 gap-2 overflow-y-auto">
            {cards.map((card) => (
              <CardFace key={card.id} card={card} choice onClick={() => onPick(card.id)} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function NamedPick({ category, onPick }: { category: CategoryId; onPick: (cardId: string) => void }) {
  const state = useGame((s) => s.state);
  if (!state) return null;
  const cards = cardsByCategory(state.cards, category);
  return (
    <div className="mt-3 grid max-h-64 grid-cols-2 gap-2 overflow-y-auto">
      {cards.map((card) => (
        <CardFace key={card.id} card={card} choice onClick={() => onPick(card.id)} />
      ))}
    </div>
  );
}

function HerringCardPick({ onPick }: { onPick: (cardId: string) => void }) {
  const state = useGame((s) => s.state);
  const [cat, setCat] = useState<string | null>(null);
  if (!state) return null;
  const labels: Record<string, string> = state.settings.heist
    ? { suspect: "Who took it", weapon: "What was stolen", room: "Where", time: "When" }
    : { suspect: "Suspect", weapon: "Weapon", room: "Room", time: "Time" };
  const cats = (["suspect", "weapon", "room", "time"] as const).filter((id) =>
    state.cards.some((card) => card.category === id),
  );
  const cards = state.cards.filter((card) => card.category === cat);
  return (
    <div className="mt-3">
      <p className="text-xs uppercase tracking-[0.14em] text-subtle">
        {cat ? `Pick the ${labels[cat]?.toLowerCase() ?? "card"}` : "Pick a category"}
      </p>
      {!cat ? (
        <div className="mt-2 grid grid-cols-2 gap-2">
          {cats.map((id) => (
            <Button key={id} variant="outline" onClick={() => setCat(id)}>
              {labels[id]}
            </Button>
          ))}
        </div>
      ) : (
        <>
          <Button className="mt-2" variant="ghost" size="sm" onClick={() => setCat(null)}>
            Change category
          </Button>
          <div className="mt-2 grid gap-2">
            {cards.map((card) => (
              <CardFace key={card.id} card={card} choice onClick={() => onPick(card.id)} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function RoomPick({
  label,
  selected,
  onPick,
}: {
  label: string;
  selected?: string;
  onPick: (id: string) => void;
}) {
  const state = useGame((s) => s.state);
  if (!state) return null;
  // Only rooms whose cards are in this game, for passages and "move someone here" powers.
  const inPlay = new Set(roomsInPlay(state));
  const rooms = state.cards.filter((c) => c.category === "room" && inPlay.has(c.id));
  return (
    <div className="mt-3">
      <p className="mb-1 text-xs uppercase tracking-[0.14em] text-subtle">{label}</p>
      <div className="flex flex-wrap gap-2">
        {rooms.map((r) => (
          <Button key={r.id} size="sm" variant={selected === r.id ? "paper" : "outline"} onClick={() => onPick(r.id)}>
            {r.name}
          </Button>
        ))}
      </div>
    </div>
  );
}

function PlayerPick({
  exclude,
  excludeIds = [],
  onPick,
  selected,
  label,
}: {
  exclude: string;
  excludeIds?: string[];
  onPick: (id: string) => void;
  selected?: string;
  label?: string;
}) {
  const state = useGame((s) => s.state);
  if (!state) return null;
  const skip = new Set([exclude, ...excludeIds].filter(Boolean));
  return (
    <div className="mt-3">
      {label ? <p className="mb-1 text-xs uppercase tracking-[0.14em] text-subtle">{label}</p> : null}
      <div className="flex flex-wrap gap-2">
        {state.players
          .filter((p) => !skip.has(p.id) && !p.eliminated)
          .map((p) => (
            <Button
              key={p.id}
              variant={selected === p.id ? "paper" : "outline"}
              size="sm"
              onClick={() => onPick(p.id)}
            >
              {p.name}
            </Button>
          ))}
      </div>
    </div>
  );
}
