import { useEffect, useMemo, useRef, useState } from "react";
import type { Puzzle } from "@/lib/team/puzzles";
import { pressGrid } from "@/lib/team/puzzles";

/** Every widget reports the player's current answer as a string; the engine checks it. */
export interface WidgetProps {
  puzzle: Puzzle;
  onChange: (value: string) => void;
}

const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function Cipher({ puzzle, onChange }: WidgetProps) {
  const [v, setV] = useState("");
  const d = puzzle.data as { cipher: string };
  return (
    <div className="tm-w">
      <div className="tm-cipher">{d.cipher}</div>
      <div className="tm-alpha" aria-label="Alphabet strip">
        {A.split("").map((c, i) => (
          <span key={c}>
            {c}
            <i>{i + 1}</i>
          </span>
        ))}
      </div>
      <input
        className="tm-input"
        aria-label="Your answer"
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        value={v}
        maxLength={14}
        placeholder="Type the decoded word"
        onChange={(e) => {
          const t = e.target.value.toUpperCase().replace(/[^A-Z]/g, "");
          setV(t);
          onChange(t);
        }}
      />
    </div>
  );
}

function Combo({ puzzle, onChange }: WidgetProps) {
  const len = (puzzle.data as { length: number }).length;
  const [d, setD] = useState<number[]>(() => Array(len).fill(0));
  const set = (i: number, delta: number) => {
    const n = d.slice();
    n[i] = (n[i] + delta + 10) % 10;
    setD(n);
    onChange(n.join(""));
  };
  useEffect(() => onChange(d.join("")), []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="tm-w tm-combo">
      {d.map((x, i) => (
        <div key={i} className="tm-wheel">
          <button type="button" aria-label={`Digit ${i + 1} up`} onClick={() => set(i, 1)}>▲</button>
          <b>{x}</b>
          <button type="button" aria-label={`Digit ${i + 1} down`} onClick={() => set(i, -1)}>▼</button>
        </div>
      ))}
    </div>
  );
}

function Order({ puzzle, onChange }: WidgetProps) {
  const items = puzzle.data.items as string[];
  const [picked, setPicked] = useState<string[]>([]);
  const upd = (n: string[]) => {
    setPicked(n);
    onChange(n.length === items.length ? n.join(",") : "");
  };
  return (
    <div className="tm-w">
      <div className="tm-slots">
        {items.map((_, i) => (
          <button key={i} type="button" className="tm-slot" onClick={() => picked[i] && upd(picked.filter((_, j) => j !== i))}>
            <small>{i + 1}</small>
            {picked[i] ?? "·"}
          </button>
        ))}
      </div>
      <p className="tm-hintline">Left to right. Tap a filled slot to take it back.</p>
      <div className="tm-opts">
        {items.map((it) => (
          <button key={it} type="button" className="tm-opt" disabled={picked.includes(it)} onClick={() => upd([...picked, it])}>
            {it}
          </button>
        ))}
      </div>
    </div>
  );
}

function Choice({ puzzle, onChange }: WidgetProps) {
  const options = puzzle.data.options as string[];
  const [sel, setSel] = useState("");
  return (
    <div className="tm-w">
      <div className="tm-opts tm-big">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            className={`tm-opt${sel === o ? " on" : ""}`}
            aria-pressed={sel === o}
            onClick={() => {
              setSel(o);
              onChange(o);
            }}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

function Anagram({ puzzle, onChange }: WidgetProps) {
  const letters = (puzzle.data as { letters: string }).letters.split("");
  const [used, setUsed] = useState<number[]>([]);
  const upd = (u: number[]) => {
    setUsed(u);
    onChange(u.length === letters.length ? u.map((i) => letters[i]).join("") : "");
  };
  return (
    <div className="tm-w">
      <div className="tm-slots">
        {letters.map((_, i) => (
          <button key={i} type="button" className="tm-slot sm" onClick={() => used[i] !== undefined && upd(used.filter((_, j) => j !== i))}>
            {used[i] !== undefined ? letters[used[i]] : "·"}
          </button>
        ))}
      </div>
      <div className="tm-opts">
        {letters.map((l, i) => (
          <button key={i} type="button" className="tm-opt tile" disabled={used.includes(i)} onClick={() => upd([...used, i])}>
            {l}
          </button>
        ))}
      </div>
      <button type="button" className="tm-link" onClick={() => upd([])}>Clear</button>
    </div>
  );
}

function Fuse({ puzzle, onChange }: WidgetProps) {
  const d = puzzle.data as { n: number; start: string };
  const [bits, setBits] = useState<number[]>(() => d.start.split("").map(Number));
  const [moves, setMoves] = useState(0);
  useEffect(() => onChange(bits.join("")), []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="tm-w">
      <div className="tm-fuse" style={{ gridTemplateColumns: `repeat(${d.n}, 1fr)` }}>
        {bits.map((b, i) => (
          <button
            key={i}
            type="button"
            className={`tm-fz${b ? " lit" : ""}`}
            aria-label={`Row ${Math.floor(i / d.n) + 1} column ${(i % d.n) + 1}, ${b ? "lit" : "off"}`}
            onClick={() => {
              const n = pressGrid(bits, d.n, i);
              setBits(n);
              setMoves(moves + 1);
              onChange(n.join(""));
            }}
          />
        ))}
      </div>
      <div className="tm-hintline">
        {bits.filter(Boolean).length} lit · {moves} flips · <button type="button" className="tm-link" onClick={() => { const s = d.start.split("").map(Number); setBits(s); setMoves(0); onChange(s.join("")); }}>Reset</button>
      </div>
    </div>
  );
}

function Memory({ puzzle, onChange }: WidgetProps) {
  const d = puzzle.data as { tiles: number; sequence: number[]; dim: boolean };
  const [lit, setLit] = useState(-1);
  const [playing, setPlaying] = useState(true);
  const [entered, setEntered] = useState<number[]>([]);
  const timers = useRef<number[]>([]);
  const cb = useRef(onChange);
  cb.current = onChange;
  const play = useMemo(
    () => () => {
      timers.current.forEach((t) => window.clearTimeout(t));
      timers.current = [];
      setPlaying(true);
      setEntered([]);
      cb.current("");
      d.sequence.forEach((tile, i) => {
        timers.current.push(window.setTimeout(() => setLit(tile), 600 + i * 800));
        timers.current.push(window.setTimeout(() => setLit(-1), 600 + i * 800 + (d.dim ? 380 : 560)));
      });
      timers.current.push(window.setTimeout(() => setPlaying(false), 700 + d.sequence.length * 800));
    },
    [d.sequence, d.dim],
  );
  useEffect(() => {
    play();
    return () => timers.current.forEach((t) => window.clearTimeout(t));
  }, [play]);
  const tap = (i: number) => {
    if (playing) return;
    const n = [...entered, i].slice(0, d.sequence.length);
    setEntered(n);
    setLit(i);
    window.setTimeout(() => setLit(-1), 160);
    onChange(n.length === d.sequence.length ? n.join("-") : "");
  };
  return (
    <div className="tm-w">
      <div className="tm-mem" style={{ gridTemplateColumns: `repeat(${d.tiles <= 4 ? 2 : 3}, 1fr)` }}>
        {Array.from({ length: d.tiles }, (_, i) => (
          <button key={i} type="button" className={`tm-mt c${i}${lit === i ? " lit" : ""}${d.dim ? " dim" : ""}`} aria-label={`Tile ${i + 1}`} onClick={() => tap(i)} />
        ))}
      </div>
      <div className="tm-hintline">
        {playing ? "Watch..." : `${entered.length} of ${d.sequence.length} entered`} ·{" "}
        <button type="button" className="tm-link" disabled={playing} onClick={play}>Replay</button>{" "}
        <button type="button" className="tm-link" disabled={playing || !entered.length} onClick={() => { setEntered([]); onChange(""); }}>Clear</button>
      </div>
    </div>
  );
}

/** A tiny sudoku: tap an empty square to cycle through 1 to 4. */
function Grid({ puzzle, onChange }: WidgetProps) {
  const start = String(puzzle.data.start).split("").map(Number);
  const [cells, setCells] = useState<number[]>(start);
  const upd = (n: number[]) => {
    setCells(n);
    onChange(n.every(Boolean) ? n.join("") : "");
  };
  return (
    <div className="tm-w">
      <div className="tm-sud" role="grid" aria-label="Number grid">
        {cells.map((v, i) => (
          <button
            key={i}
            type="button"
            className={`tm-sc${start[i] ? " fixed" : ""}${(Math.floor(i / 8) + Math.floor((i % 4) / 2)) % 2 ? " alt" : ""}`}
            disabled={!!start[i]}
            aria-label={`Row ${Math.floor(i / 4) + 1}, column ${(i % 4) + 1}: ${v || "empty"}`}
            onClick={() => upd(cells.map((x, j) => (j === i ? (x + 1) % 5 : x)))}
          >
            {v || ""}
          </button>
        ))}
      </div>
      <div className="tm-hintline">
        {cells.filter((c) => !c).length} empty · <button type="button" className="tm-link" onClick={() => upd(start)}>Reset</button>
      </div>
    </div>
  );
}

/** Tap the numbers in order. A wrong tap goes back to the start. */
function Dash({ puzzle, onChange }: WidgetProps) {
  const d = puzzle.data as { count: number; down: boolean; order: number[] };
  const first = d.down ? d.count : 1;
  const [next, setNext] = useState(first);
  const [oops, setOops] = useState(false);
  const done = d.down ? next < 1 : next > d.count;
  useEffect(() => onChange(done ? "DONE" : ""), [done]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="tm-w">
      <div className="tm-dash">
        {d.order.map((n) => {
          const hit = d.down ? n > next : n < next;
          return (
            <button
              key={n}
              type="button"
              className={`tm-dn${hit ? " hit" : ""}${oops ? " oops" : ""}`}
              disabled={done}
              onClick={() => {
                if (n === next) {
                  setNext(next + (d.down ? -1 : 1));
                  setOops(false);
                } else {
                  setNext(first);
                  setOops(true);
                }
              }}
            >
              {n}
            </button>
          );
        })}
      </div>
      <div className="tm-hintline">{done ? "All tapped!" : oops ? "Oops, back to the start!" : `Next: ${next}`}</div>
    </div>
  );
}

export function PuzzleWidget(props: WidgetProps) {
  switch (props.puzzle.kind) {
    case "cipher": return <Cipher {...props} />;
    case "combo": return <Combo {...props} />;
    case "order": return <Order {...props} />;
    case "sequence":
    case "oddone": return <Choice {...props} />;
    case "anagram": return <Anagram {...props} />;
    case "fuse": return <Fuse {...props} />;
    case "memory": return <Memory {...props} />;
    case "codebreaker": return <Combo {...props} />;
    case "whichbox": return <Choice {...props} />;
    case "grid": return <Grid {...props} />;
    case "dash": return <Dash {...props} />;
  }
}
