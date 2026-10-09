import { useGame } from "@/lib/game/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { unlockAudio } from "@/lib/game/sfx";
import { useEffect } from "react";
import { MusicToggle } from "./MusicToggle";
import { setSkin, useSkin } from "@/lib/game/theme";

/** The title-screen picture of the Case File look: the manor at night with a single lit window. */
function Manor() {
  return (
    <svg className="cf-manor" viewBox="0 0 320 120" role="img" aria-label="A dark manor with one lit window" preserveAspectRatio="xMidYMax meet">
      <ellipse className="cf-sky" cx="160" cy="96" rx="150" ry="70" />
      <circle className="cf-moon" cx="268" cy="24" r="9" />
      <path className="cf-house" d="M0 120V84l18-6V66h10v8l14-8 10 8v-22l8-14 8 14v22h14V58l14-20 14 20v26h20V50l-6-4 36-30 36 30-6 4v34h20V58l14-20 14 20v26h14V62l8-14 8 14v22l10-8 14 8v-8h10v12l18 6v36z" />
      <rect className="cf-dim" x="86" y="78" width="7" height="10" />
      <rect className="cf-dim" x="226" y="78" width="7" height="10" />
      <rect className="cf-dim" x="48" y="82" width="6" height="9" />
      <rect className="cf-window" x="156.5" y="62" width="8" height="12" rx="1" />
      <rect className="cf-dim" x="270" y="82" width="6" height="9" />
    </svg>
  );
}

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
  const skin = useSkin();
  const casefile = skin === "casefile";

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("code");
    if (code) setJoinCode(code);
  }, [setJoinCode]);

  return (
    <main className="leather min-h-dvh">
      <div className="screen-pad mx-auto flex min-h-dvh max-w-lg flex-col px-4 py-6">
        <header className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-[0.28em] text-brass">Table companion</p>
          <div className="flex items-center gap-3">
            <button type="button" className="cf-lookbtn" onClick={() => setSkin(casefile ? "classic" : "casefile")}>
              {casefile ? "Classic look" : "New look"}
            </button>
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
          {casefile ? <Manor /> : null}
          <h1 className={`mt-2 text-center font-display text-5xl leading-none tracking-tight${casefile ? " cf-title" : ""}`}>
            The Case
          </h1>
          <p className="mx-auto mt-3 max-w-sm text-center text-sm text-muted">
            {setup.settings.heist
              ? "Do you have what it takes to solve the heist and name what was stolen?"
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
