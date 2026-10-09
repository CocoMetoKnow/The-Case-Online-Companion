import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import { CATEGORY_KEYS, CATEGORY_LABEL, DEFAULT_NAMES, type CategoryKey } from "@/lib/team/content";
import {
  MAX_MENACE,
  board,
  clueById,
  clueNumber,
  currentPlayer,
  heldClues,
  hiddenIn,
  isDark,
  legal,
  lostClues,
  newGame,
  node,
  phaseOf,
  reduce,
  roleOf,
  totalRounds,
  type Action,
  type Notice,
  type TeamState,
} from "@/lib/team/engine";
import { briefing, itemOf, nameOf, variantCount, zoneDef } from "@/lib/team/generator";
import { KIND_LABEL } from "@/lib/team/puzzles";
import { freshSeed } from "@/lib/team/rng";
import { closeTeam, loadSaved, saveRun } from "@/lib/team/mode";
import { PuzzleWidget } from "./puzzle-widgets";

type Tab = "map" | "case" | "team" | "log";

function Pips({ n, of, tone }: { n: number; of: number; tone?: string }) {
  return (
    <span className={`tm-pips ${tone ?? ""}`} aria-label={`${n} of ${of}`}>
      {Array.from({ length: of }, (_, i) => (
        <i key={i} className={i < n ? "on" : ""} />
      ))}
    </span>
  );
}

// ---------------------------------------------------------------------------------------------
// Setup

function Setup({ onStart, saved, onResume }: { onStart: (seed: string, names: string[]) => void; saved: TeamState | null; onResume: () => void }) {
  const [count, setCount] = useState(3);
  const [names, setNames] = useState<string[]>(DEFAULT_NAMES.slice());
  const [seed, setSeed] = useState("");
  const v = useMemo(() => variantCount(), []);
  return (
    <main className="tm tm-setup">
      <header className="tm-top">
        <button type="button" className="tm-link" onClick={closeTeam}>← Back</button>
        <span className="tm-eyebrow">Cooperative</span>
      </header>
      <h1 className="tm-title">Team Mode</h1>
      <p className="tm-lede">One house, one killer, one night. Explore the mansion together, solve what you find, and name the culprit before dawn. Every case is built fresh: {v.twistedStorylines} storylines, over a quadrillion hidden solutions.</p>

      {saved ? (
        <button type="button" className="tm-btn primary wide" onClick={onResume}>
          Resume your case (round {saved.round}, {phaseOf(saved).clock})
        </button>
      ) : null}

      <section className="tm-card">
        <h2>Detectives</h2>
        <div className="tm-count" role="group" aria-label="Number of detectives">
          {[2, 3, 4, 5, 6].map((n) => (
            <button key={n} type="button" className={`tm-chip${count === n ? " on" : ""}`} aria-pressed={count === n} onClick={() => setCount(n)}>{n}</button>
          ))}
        </div>
        {Array.from({ length: count }, (_, i) => (
          <input key={i} className="tm-input" aria-label={`Detective ${i + 1} name`} value={names[i]} maxLength={14} onChange={(e) => setNames(names.map((n, j) => (j === i ? e.target.value : n)))} />
        ))}
        <p className="tm-small">Pass the phone around the table. Each detective gets a role with a special edge.</p>
        <label className="tm-small" htmlFor="tm-seed">Case code (optional, to replay a case)</label>
        <input id="tm-seed" className="tm-input" value={seed} placeholder="Leave empty for a new case" autoCapitalize="characters" onChange={(e) => setSeed(e.target.value.toUpperCase())} />
        <button type="button" className="tm-btn primary wide" onClick={() => onStart(seed.trim() || freshSeed(), names.slice(0, count))}>Open the case</button>
      </section>

      <section className="tm-card">
        <h2>How it works</h2>
        <ul className="tm-rules">
          <li><b>Two actions a turn.</b> Move between rooms, or investigate: draft one of two or three face-up cards (evidence, the night's events, or intel).</li>
          <li><b>Every puzzle is built for where and when you are.</b> The hour is the cipher key, the dark makes puzzles harder, and every solved puzzle drops a numbered clue into your deduction board.</li>
          <li><b>Fail and you pay.</b> You are trapped, a clue is lost into a danger zone, and the menace climbs. A teammate can rescue you. Risk a danger zone to win lost evidence back.</li>
          <li><b>Critical tasks end the game.</b> Opening a sealed wing, the Stalker at night, a full menace track, dawn, or a wrong accusation. You are always warned first.</li>
        </ul>
      </section>
    </main>
  );
}

// ---------------------------------------------------------------------------------------------
// Overlays

function Sheet({ tone, children, label }: { tone?: string; children: ReactNode; label: string }) {
  return (
    <div className="tm-scrim" role="dialog" aria-modal="true" aria-label={label}>
      <div className={`tm-sheet ${tone ?? ""}`}>{children}</div>
    </div>
  );
}

function NoticeSheet({ n, s, onAck }: { n: Notice; s: TeamState; onAck: () => void }) {
  const clue = n.clueId ? clueById(s, n.clueId) : undefined;
  return (
    <Sheet tone={n.tone} label={n.title}>
      <p className="tm-eyebrow">{n.tone === "turn" ? "Pass the phone" : n.tone === "critical" ? "Critical" : n.tone === "bad" ? "Setback" : n.tone === "good" ? "Good news" : "Notice"}</p>
      <h2>{n.title}</h2>
      {n.lines.map((l, i) => (
        <p key={i} className={l.startsWith("EVIDENCE LOST") ? "tm-lost" : ""}>{l}</p>
      ))}
      {clue ? <div className="tm-clue">#{clueNumber(s, clue.id)} · {clue.short}</div> : null}
      <button type="button" className="tm-btn primary wide" onClick={onAck}>{n.tone === "turn" ? "I'm ready" : "Continue"}</button>
    </Sheet>
  );
}

function Draft({ s, dispatch }: { s: TeamState; dispatch: (a: Action) => void }) {
  if (s.pending?.type !== "draft") return null;
  const p = currentPlayer(s);
  return (
    <Sheet label="Draft a card">
      <p className="tm-eyebrow">{p.name} investigates</p>
      <h2>Pick one card</h2>
      <p className="tm-small">The others go to the bottom of their decks.</p>
      <div className="tm-offers">
        {s.pending.offers.map((o, i) => (
          <button key={o.cardId} type="button" className={`tm-offer ${o.risk}`} onClick={() => dispatch({ type: "draft", index: i })}>
            <span className="ico">{o.icon}</span>
            <span className="deck">{o.deck === "evidence" ? "Evidence deck" : o.deck === "environment" ? "Night deck" : "Intel deck"}</span>
            <b>{o.title}</b>
            <span>{o.blurb}</span>
            <em>{o.risk === "boon" ? "A boon" : o.risk === "safe" ? "Low risk" : "Risky"}</em>
          </button>
        ))}
      </div>
    </Sheet>
  );
}

function PuzzleSheet({ s, dispatch }: { s: TeamState; dispatch: (a: Action) => void }) {
  const pd = s.pending?.type === "puzzle" ? s.pending : null;
  const [value, setValue] = useState("");
  const [sure, setSure] = useState(false);
  const onChange = useCallback((v: string) => setValue(v), []);
  useEffect(() => {
    setValue("");
    setSure(false);
  }, [pd?.puzzle]);
  if (!pd) return null;
  const who = s.players[pd.who];
  const p = pd.puzzle;
  const canHint = pd.shown < p.hints.length && (pd.free > 0 || s.hints > 0);
  const stakes =
    pd.source.kind === "lock" ? "CRITICAL: a wrong answer sounds the alarm. Game Over."
    : pd.source.kind === "stalker" ? "CRITICAL: a wrong answer means the Stalker catches you. Game Over."
    : pd.source.kind === "evidence" ? "A wrong answer traps you and loses a clue."
    : pd.source.kind === "recover" ? "DANGER ZONE: a wrong answer traps you here, loses another clue and spikes the menace."
    : pd.source.kind === "rescue" ? "A wrong answer gets you caught too." : "A wrong answer traps you.";
  return (
    <Sheet tone={pd.critical ? "critical" : "puzzle"} label={p.title}>
      <p className="tm-eyebrow">{who.name} · {KIND_LABEL[p.kind]} · Level {p.level}</p>
      <h2>{p.title}</h2>
      <p className={`tm-stakes${pd.critical ? " crit" : ""}`}>{stakes}</p>
      <p className="tm-story">{p.story}</p>
      <p>{p.task}</p>
      {p.lines.length && p.kind !== "cipher" && p.kind !== "sequence" ? (
        <ul className="tm-lines">{p.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
      ) : p.kind === "sequence" ? (
        <div className="tm-seq">{p.lines[0]}</div>
      ) : null}
      <PuzzleWidget key={p.title + p.answer} puzzle={p} onChange={onChange} />
      {pd.shown ? <ol className="tm-hints">{p.hints.slice(0, pd.shown).map((h, i) => <li key={i}>{h}</li>)}</ol> : null}
      <div className="tm-row">
        <button type="button" className="tm-btn" disabled={!canHint} onClick={() => dispatch({ type: "hint" })}>
          Hint ({pd.free > 0 ? `${pd.free} free` : `${s.hints} token${s.hints === 1 ? "" : "s"}`})
        </button>
        {pd.source.kind !== "stalker" ? (
          <button type="button" className="tm-btn" onClick={() => dispatch({ type: "retreat" })}>Back away (+1 menace)</button>
        ) : null}
      </div>
      {pd.critical && !sure ? (
        <button type="button" className="tm-btn danger wide" disabled={!value} onClick={() => setSure(true)}>Lock in answer</button>
      ) : pd.critical ? (
        <button type="button" className="tm-btn danger wide" onClick={() => dispatch({ type: "submit", input: value })}>Are you sure? There is no going back</button>
      ) : (
        <button type="button" className="tm-btn primary wide" disabled={!value} onClick={() => dispatch({ type: "submit", input: value })}>Submit answer</button>
      )}
    </Sheet>
  );
}

function AccuseSheet({ s, dispatch, onClose }: { s: TeamState; dispatch: (a: Action) => void; onClose: () => void }) {
  const d = board(s);
  const [g, setG] = useState<Partial<Record<CategoryKey, string>>>(() => {
    const init: Partial<Record<CategoryKey, string>> = {};
    for (const k of CATEGORY_KEYS) if (d.cands[k].length === 1) init[k] = d.cands[k][0];
    return init;
  });
  const [sure, setSure] = useState(false);
  const full = CATEGORY_KEYS.every((k) => g[k]);
  return (
    <Sheet tone="critical" label="Make the accusation">
      <p className="tm-eyebrow">The final accusation</p>
      <h2>Name the culprit</h2>
      <p className="tm-stakes crit">CRITICAL: one wrong answer in any of the five and it is Game Over.</p>
      {CATEGORY_KEYS.map((k) => (
        <label key={k} className="tm-field">
          <span>{CATEGORY_LABEL[k]}</span>
          <select value={g[k] ?? ""} onChange={(e) => (setG({ ...g, [k]: e.target.value || undefined }), setSure(false))}>
            <option value="">Choose...</option>
            {s.game.universe[k].map((id) => (
              <option key={id} value={id}>{itemOf(k, id).icon} {nameOf(k, id)}{d.cands[k].includes(id) ? "" : " (ruled out)"}</option>
            ))}
          </select>
        </label>
      ))}
      <div className="tm-row">
        <button type="button" className="tm-btn" onClick={onClose}>Not yet</button>
        {!sure ? (
          <button type="button" className="tm-btn danger" disabled={!full} onClick={() => setSure(true)}>Accuse</button>
        ) : (
          <button type="button" className="tm-btn danger" onClick={() => dispatch({ type: "accuse", guess: g as Record<CategoryKey, string> })}>Final answer. Do it.</button>
        )}
      </div>
    </Sheet>
  );
}

function EndScreen({ s, onAgain, onReplay }: { s: TeamState; onAgain: () => void; onReplay: () => void }) {
  const e = s.ending!;
  const win = e.kind === "win";
  return (
    <main className={`tm tm-end ${win ? "win" : "lose"}`}>
      <p className="tm-eyebrow">{win ? "You win" : "Game over: you lose"}</p>
      <h1 className="tm-title">{e.title}</h1>
      {e.lines.map((l, i) => <p key={i}>{l}</p>)}
      <section className="tm-card">
        <h2>What really happened</h2>
        <p>{e.reveal}</p>
      </section>
      <section className="tm-card tm-stats">
        <div><b>{s.stats.found}</b><span>clues found</span></div>
        <div><b>{s.stats.lost}</b><span>lost</span></div>
        <div><b>{s.stats.recovered}</b><span>recovered</span></div>
        <div><b>{s.stats.rescues}</b><span>rescues</span></div>
        <div><b>{s.round}</b><span>rounds</span></div>
      </section>
      <button type="button" className="tm-btn primary wide" onClick={onAgain}>New case</button>
      <button type="button" className="tm-btn wide" onClick={onReplay}>Replay case {s.seed}</button>
      <button type="button" className="tm-link" onClick={closeTeam}>Back to The Case</button>
    </main>
  );
}

// ---------------------------------------------------------------------------------------------
// Tabs

function MapView({ s, dispatch, pickTarget }: { s: TeamState; dispatch: (a: Action) => void; pickTarget: (id: string | null) => void }) {
  const p = currentPlayer(s);
  const L = legal(s);
  return (
    <svg className="tm-map" viewBox="-2 -2 104 106" role="group" aria-label="Mansion map">
      {s.game.map.flatMap((n) => n.links.filter((l) => l > n.id).map((l) => {
        const o = node(s, l)!;
        return <line key={n.id + l} x1={n.x} y1={n.y} x2={o.x} y2={o.y} className={n.kind === "zone" || o.kind === "zone" ? "z" : ""} />;
      }))}
      {s.game.map.map((n) => {
        const locked = n.locked && !s.unlocked.includes(n.id);
        const here = p.at === n.id;
        const canMove = L.moves.some((m) => m.id === n.id);
        const canUnlock = L.unlockable.some((m) => m.id === n.id);
        const left = n.kind === "room" ? hiddenIn(s, n.id).length : 0;
        const lostHere = n.kind === "zone" ? lostClues(s).filter((c) => s.lostIn[c.id] === n.id).length : 0;
        const folks = s.players.filter((q) => q.at === n.id);
        return (
          <g
            key={n.id}
            className={`tm-node ${n.kind}${locked ? " locked" : ""}${here ? " here" : ""}${canMove || canUnlock ? " go" : ""}`}
            transform={`translate(${n.x} ${n.y})`}
            tabIndex={canMove || canUnlock ? 0 : -1}
            role="button"
            aria-label={`${n.name}${locked ? ", sealed" : ""}${canMove ? ", move here" : ""}${canUnlock ? ", unlock" : ""}`}
            onClick={() => (canMove ? dispatch({ type: "move", to: n.id }) : canUnlock ? pickTarget(n.id) : undefined)}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (canMove ? dispatch({ type: "move", to: n.id }) : canUnlock ? pickTarget(n.id) : undefined)}
          >
            <circle r={n.kind === "foyer" ? 8 : 7} />
            <text className="ic" y="2.4" textAnchor="middle">{locked ? "🔒" : n.icon}</text>
            <text className="nm" y="12.5" textAnchor="middle">{n.name}</text>
            {left > 0 && !locked ? <text className="bd" x="7" y="-5" textAnchor="middle">{left}</text> : null}
            {lostHere > 0 ? <text className="bd lost" x="7" y="-5" textAnchor="middle">{lostHere}</text> : null}
            {folks.map((q, i) => (
              <g key={q.id} transform={`translate(${-7 + i * 5.2} -9.5)`} className={`pl${q.id === p.id ? " me" : ""}${q.trapped ? " trap" : ""}`}>
                <circle r="2.7" />
                <text y="1" textAnchor="middle">{q.name.charAt(0).toUpperCase()}</text>
              </g>
            ))}
          </g>
        );
      })}
    </svg>
  );
}

function CaseTab({ s, onAccuse }: { s: TeamState; onAccuse: () => void }) {
  const b = board(s);
  const brief = briefing(s.game);
  const held = heldClues(s);
  const lost = lostClues(s);
  return (
    <div className="tm-tab">
      <section className="tm-card">
        <p className="tm-eyebrow">{brief.title}</p>
        <p>{brief.intro}</p>
        <p className="tm-small"><b>Tonight's twist:</b> {s.game.twist.title}. {brief.teaser}</p>
        <p className="tm-small">Rules of the logic: every guest has a different secret motive, and the culprit's secret is the motive for the crime. The culprit was at the scene at the time of death, so a guest seen anywhere else at that hour is cleared once the hour and scene are known.</p>
      </section>
      <section className="tm-card">
        <h2>Investigation tracks</h2>
        {CATEGORY_KEYS.map((k) => (
          <div key={k} className="tm-track">
            <div className="th"><b>{CATEGORY_LABEL[k]}</b><span>{b.cands[k].length === 1 ? "SOLVED" : `${b.cands[k].length} of ${s.game.universe[k].length} left`}</span></div>
            <div className="chips">
              {s.game.universe[k].map((id) => {
                const out = !b.cands[k].includes(id);
                const why = b.why[`${k}:${id}`];
                return (
                  <span key={id} className={`chip${out ? " out" : ""}${b.cands[k].length === 1 && !out ? " win" : ""}`}>
                    {itemOf(k, id).icon} {nameOf(k, id)}
                    {out && why ? <sup>#{clueNumber(s, why)}</sup> : null}
                  </span>
                );
              })}
            </div>
          </div>
        ))}
        <button type="button" className={`tm-btn ${b.solved ? "primary" : ""} wide`} onClick={onAccuse}>{b.solved ? "The case is solved. Make the accusation" : "Make the accusation (risky)"}</button>
      </section>
      <section className="tm-card">
        <h2>Clues ({held.length})</h2>
        {held.length ? <ol className="tm-clues">{held.map((c) => <li key={c.id}><b>#{clueNumber(s, c.id)}</b> {c.text}</li>)}</ol> : <p className="tm-small">Nothing yet. Search the rooms.</p>}
        {lost.length ? (
          <>
            <h3>Lost evidence</h3>
            <ul className="tm-clues lost">{lost.map((c) => <li key={c.id}>{c.short}: in {zoneDef(s.lostIn[c.id])?.name}</li>)}</ul>
          </>
        ) : null}
      </section>
    </div>
  );
}

function TeamTab({ s }: { s: TeamState }) {
  return (
    <div className="tm-tab">
      {s.players.map((p, i) => {
        const r = roleOf(p);
        return (
          <section key={p.id} className={`tm-card tm-pl${i === s.turn ? " turn" : ""}${p.trapped ? " trapped" : ""}`}>
            <h2>{r?.icon} {p.name} <small>{r?.title}</small></h2>
            <p className="tm-small">{r?.blurb}</p>
            <p>{node(s, p.at)?.name}{p.trapped ? ` · TRAPPED (${p.trapped} round${p.trapped === 1 ? "" : "s"} left). A teammate in the same place can rescue them.` : i === s.turn ? " · taking their turn" : ""}</p>
          </section>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// The game

function Play({ s, dispatch, onExit }: { s: TeamState; dispatch: (a: Action) => void; onExit: () => void }) {
  const [tab, setTab] = useState<Tab>("map");
  const [accuse, setAccuse] = useState(false);
  const [unlockId, setUnlockId] = useState<string | null>(null);
  const p = currentPlayer(s);
  const L = legal(s);
  const here = node(s, p.at)!;
  const phase = phaseOf(s);
  const notice = s.notices[0];
  const left = here.kind === "room" ? hiddenIn(s, here.id).length : 0;
  const zoneLost = here.kind === "zone" ? lostClues(s).filter((c) => s.lostIn[c.id] === here.id).length : 0;
  const unlock = unlockId ? node(s, unlockId) : null;

  return (
    <main className={`tm tm-play${isDark(s) ? " dark" : ""}${s.menace >= 7 ? " hot" : ""}`}>
      <header className="tm-hud">
        <div className="clock">
          <b>{phase.clock}</b>
          <span>{phase.title}</span>
          <small>Round {Math.min(s.round, totalRounds(s))} of {totalRounds(s)}</small>
        </div>
        <div className="meters">
          <div title="Menace. At the top, Game Over."><span>Menace</span><Pips n={s.menace} of={MAX_MENACE} tone="danger" /></div>
          <div className="tok"><span title="Hint tokens">💡{s.hints}</span><span title="Lanterns">🏮{s.lantern}</span><span title="Skeleton keys">🗝️{s.keys}</span></div>
        </div>
        <button type="button" className="tm-link" onClick={onExit}>Menu</button>
      </header>

      <div className="tm-who">
        <b>{p.name}</b> <span>{roleOf(p)?.icon} {roleOf(p)?.title}</span>
        <Pips n={s.ap + (s.freeMove ? 1 : 0)} of={3} />
        <small>{s.ap} action{s.ap === 1 ? "" : "s"}{s.freeMove ? " + free move" : ""}</small>
      </div>

      <nav className="tm-tabs" role="tablist">
        {(["map", "case", "team", "log"] as Tab[]).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
            {t === "map" ? "Mansion" : t === "case" ? `Case file (${s.held.length})` : t === "team" ? "Team" : "Log"}
          </button>
        ))}
      </nav>

      {tab === "map" ? (
        <div className="tm-tab">
          <MapView s={s} dispatch={dispatch} pickTarget={setUnlockId} />
          <section className="tm-card tm-here">
            <h2>{here.icon} {here.name}</h2>
            <p className="tm-small">
              {here.kind === "foyer" ? "The hub of the house. Nothing is hidden here, but the night deck and intel deck are always open to you." : here.kind === "zone" ? zoneDef(here.id)?.flavor : `${left} find${left === 1 ? "" : "s"} left to search in this room.`}
              {zoneLost ? ` ${zoneLost} lost clue${zoneLost === 1 ? " is" : "s are"} hidden here.` : ""}
            </p>
            <div className="tm-actions">
              <button type="button" className="tm-btn primary" disabled={!L.canInvestigate} onClick={() => dispatch({ type: "investigate" })}>🔎 Investigate</button>
              {here.kind === "zone" ? <button type="button" className="tm-btn danger" disabled={!L.canRecover} onClick={() => dispatch({ type: "recover" })}>Recover evidence</button> : null}
              {L.rescuable.map((o) => <button key={o.id} type="button" className="tm-btn" onClick={() => dispatch({ type: "rescue", target: o.id })}>🩹 Rescue {o.name}</button>)}
              <button type="button" className="tm-btn" disabled={!L.canLantern} onClick={() => dispatch({ type: "lantern" })}>🏮 Light lantern</button>
              <button type="button" className="tm-btn" disabled={!L.canEnd} onClick={() => dispatch({ type: "end" })}>End turn</button>
            </div>
            <p className="tm-small">Tap a glowing room on the map to move there (1 action). Tap a sealed 🔒 wing next to you to try the lock (1 action, critical).</p>
            {L.moves.length ? (
              <div className="tm-moves">{L.moves.map((m) => <button key={m.id} type="button" className="tm-chip" onClick={() => dispatch({ type: "move", to: m.id })}>{m.icon} {m.name}{m.kind === "zone" ? " ⚠" : ""}</button>)}</div>
            ) : null}
          </section>
        </div>
      ) : tab === "case" ? (
        <CaseTab s={s} onAccuse={() => setAccuse(true)} />
      ) : tab === "team" ? (
        <TeamTab s={s} />
      ) : (
        <div className="tm-tab"><ol className="tm-log">{s.log.slice().reverse().map((l, i) => <li key={i}>{l}</li>)}</ol></div>
      )}

      {unlock ? (
        <Sheet tone="critical" label="Sealed wing">
          <p className="tm-eyebrow">Critical task</p>
          <h2>Open the {unlock.name}?</h2>
          <p className="tm-stakes crit">If you get the lock wrong the alarm sounds and the game is over. Teammates in the room give free hints; the Locksmith gives two more.</p>
          <p>The sealed wings hold clues the case cannot be solved without.</p>
          <div className="tm-row">
            <button type="button" className="tm-btn" onClick={() => setUnlockId(null)}>Not yet</button>
            {s.keys > 0 ? <button type="button" className="tm-btn primary" onClick={() => { dispatch({ type: "unlock", room: unlock.id, useKey: true }); setUnlockId(null); }}>Use skeleton key</button> : null}
            <button type="button" className="tm-btn danger" onClick={() => { dispatch({ type: "unlock", room: unlock.id }); setUnlockId(null); }}>Try the lock</button>
          </div>
        </Sheet>
      ) : null}
      {accuse ? <AccuseSheet s={s} dispatch={(a) => { setAccuse(false); dispatch(a); }} onClose={() => setAccuse(false)} /> : null}
      {notice ? <NoticeSheet n={notice} s={s} onAck={() => dispatch({ type: "ack" })} /> : s.pending?.type === "draft" ? <Draft s={s} dispatch={dispatch} /> : s.pending?.type === "puzzle" ? <PuzzleSheet s={s} dispatch={dispatch} /> : null}
    </main>
  );
}

export function TeamMode() {
  const [saved] = useState(() => loadSaved());
  const [state, dispatch] = useReducer((s: TeamState | null, a: Action | { type: "set"; s: TeamState | null }) => (a.type === "set" ? a.s : s ? reduce(s, a) : s), null);
  const [menu, setMenu] = useState(false);
  const lastCfg = useRef<{ seed: string; names: string[] } | null>(null);

  useEffect(() => {
    if (state) saveRun(state);
  }, [state]);

  const start = (seed: string, names: string[]) => {
    lastCfg.current = { seed, names };
    dispatch({ type: "set", s: newGame(seed, names) });
  };

  if (!state) return <Setup saved={saved} onStart={start} onResume={() => dispatch({ type: "set", s: saved })} />;
  if (state.status !== "play") {
    return <EndScreen s={state} onAgain={() => dispatch({ type: "set", s: null })} onReplay={() => start(state.seed, state.players.map((p) => p.name))} />;
  }
  return (
    <>
      <Play s={state} dispatch={dispatch} onExit={() => setMenu(true)} />
      {menu ? (
        <Sheet label="Menu">
          <h2>Case {state.seed}</h2>
          <p className="tm-small">Your case is saved on this phone. You can leave and come back to it.</p>
          <button type="button" className="tm-btn primary wide" onClick={() => setMenu(false)}>Keep playing</button>
          <button type="button" className="tm-btn wide" onClick={() => { setMenu(false); closeTeam(); }}>Leave (case stays saved)</button>
          <button type="button" className="tm-btn danger wide" onClick={() => { setMenu(false); dispatch({ type: "set", s: null }); saveRun(null); }}>Abandon this case</button>
        </Sheet>
      ) : null}
    </>
  );
}
