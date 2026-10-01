import { useGame } from "@/lib/game/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { unlockAudio } from "@/lib/game/sfx";
import { useEffect } from "react";
import { MusicToggle } from "./MusicToggle";
import { useUI } from "@/lib/ui/ui";

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
  const skin = useUI((s) => s.skin);
  const setSkin = useUI((s) => s.setSkin);

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("code");
    if (code) setJoinCode(code);
  }, [setJoinCode]);

  return (
    <main className="leather min-h-dvh">
      <div className="mx-auto flex min-h-dvh max-w-lg flex-col px-4 py-6">
        <header className="flex items-center justify-between">
          <button
            type="button"
            role="switch"
            aria-checked={skin === "classic"}
            className="classic-toggle"
            onClick={() => setSkin(skin === "classic" ? "detective" : "classic")}
          >
            <span aria-hidden="true" className="classic-toggle-dot" />
            Classic UI
          </button>
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
          <div className="stitch mt-auto" />
        </section>
      </div>
    </main>
  );
}
