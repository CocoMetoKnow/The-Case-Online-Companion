import { useGame } from "@/lib/game/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { unlockAudio } from "@/lib/game/sfx";
import { useEffect, useState } from "react";
import { MusicToggle } from "./MusicToggle";

export function Landing() {
  const setView = useGame((s) => s.setView);
  const setup = useGame((s) => s.setup);
  const setSetup = useGame((s) => s.setSetup);
  const quickEvening = useGame((s) => s.quickEvening);
  const joinCode = useGame((s) => s.joinCode);
  const joinError = useGame((s) => s.joinError);
  const setJoinCode = useGame((s) => s.setJoinCode);
  const joinOnline = useGame((s) => s.joinOnline);
  const patchSettings = useGame((s) => s.patchSettings);
  const state = useGame((s) => s.state);

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("code");
    if (code) setJoinCode(code);
  }, [setJoinCode]);

  return (
    <main className="leather min-h-dvh">
      <div className="mx-auto flex min-h-dvh max-w-lg flex-col px-4 py-6">
        <header className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-[0.28em] text-brass">Table companion</p>
          <div className="flex items-center gap-3">
            <MusicToggle />
            {state ? (
              <Button variant="outline" size="sm" onClick={() => setView(state.phase === "lobby" ? "lobby" : "play")}>
                Open case
              </Button>
            ) : null}
          </div>
        </header>

        <section className="case-shell mt-6 flex flex-1 flex-col rounded-[28px] p-5">
          <div className="stitch" />
          <p className="mt-4 text-center text-xs uppercase tracking-[0.32em] text-brass">Harrington</p>
          <h1 className="mt-2 text-center font-display text-5xl leading-none tracking-tight">
            The Case
          </h1>
          <p className="mx-auto mt-3 max-w-sm text-center text-sm text-muted">
            {setup.settings.heist
              ? "Do you have what it takes to name the thief and what they stole?"
              : "Do you have what it takes to solve the case?"}
          </p>
          <div className="stitch mt-5" />

          <label className="mt-5 block">
            <span className="text-xs uppercase tracking-[0.16em] text-subtle">Name on the case</span>
            <Input
              className="mt-2"
              aria-label="Your name"
              placeholder="Your name"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              name="seat-label"
              value={/^detective$/i.test(setup.name.trim()) ? "" : setup.name}
              onChange={(e) => setSetup({ name: /^detective$/i.test(e.target.value.trim()) ? "" : e.target.value })}
            />
          </label>

          <Button
            size="lg"
            className="mt-4 w-full"
            onClick={() => {
              unlockAudio();
              patchSettings({ playMode: "online" });
              setView("setup");
            }}
          >
            Host tonight
          </Button>

          <div className="mt-4 flex gap-2">
            <Input
              aria-label="Join code"
              placeholder="Join code"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
            />
            <Button
              variant="outline"
              onClick={() => {
                unlockAudio();
                joinOnline();
              }}
            >
              Join
            </Button>
          </div>
          {joinError ? <p className="mt-2 text-sm text-danger">{joinError}</p> : null}

          <button
            type="button"
            className="mt-5 text-sm text-brass"
            onClick={() => {
              unlockAudio();
              quickEvening();
            }}
          >
            Practice on this phone
          </button>
          <a
            href="/the-great-mystery-source.zip"
            download="the-great-mystery-source.zip"
            className="mt-4 inline-flex h-12 w-full items-center justify-center rounded-[14px] border border-brass text-base font-medium text-brass"
          >
            Download the game
          </a>
          <CopyCode />
          <p className="mt-2 text-center text-xs text-muted">
            Download saves the whole project, pictures included. Copy puts every source file on your clipboard.
          </p>
          <div className="stitch mt-auto" />
        </section>
      </div>
    </main>
  );
}

function CopyCode() {
  const [label, setLabel] = useState("Copy the code");
  return (
    <button
      type="button"
      className="mt-2 inline-flex h-12 w-full items-center justify-center rounded-[14px] border border-brass text-base font-medium text-brass"
      onClick={() => {
        setLabel("Copying…");
        const job = fetch("/the-case-source.txt").then((res) => {
          if (!res.ok) throw new Error("missing");
          return res.blob();
        });
        const write =
          navigator.clipboard?.write && typeof ClipboardItem !== "undefined"
            ? navigator.clipboard.write([new ClipboardItem({ "text/plain": job })])
            : job.then((blob) => blob.text()).then((text) => navigator.clipboard.writeText(text));
        write
          .then(() => {
            setLabel("Copied");
            window.setTimeout(() => setLabel("Copy the code"), 2000);
          })
          .catch(() => setLabel("Could not copy"));
      }}
    >
      {label}
    </button>
  );
}
