/**
 * ============================================================
 *  UI / RENDER LAYER — settings gear
 * ============================================================
 *  Kept under the old file name so every screen that already renders
 *  <MusicToggle /> gets the gear menu. Audio state itself lives in
 *  lib/game/sfx.ts (engine side); this only reads and flips it.
 */
import { useEffect, useRef, useState } from "react";
import { Settings } from "lucide-react";
import { musicEnabled, setMusic, setSfx, sfxEnabled, unlockAudio } from "@/lib/game/sfx";
import { Switch } from "@/components/ui/switch";

export function MusicToggle() {
  const [open, setOpen] = useState(false);
  const [music, setMusicOn] = useState(true);
  const [sounds, setSoundsOn] = useState(true);
  const box = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    setMusicOn(musicEnabled());
    setSoundsOn(sfxEnabled());
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  return (
    <span ref={box} className="settings-gear relative inline-flex">
      <button
        type="button"
        aria-label="Settings"
        aria-expanded={open}
        className="grid size-9 place-items-center rounded-full text-brass opacity-80 hover:opacity-100"
        onClick={() => setOpen((v) => !v)}
      >
        <Settings className="size-5" />
      </button>
      {open ? (
        <div role="dialog" aria-label="Settings" className="settings-card absolute right-0 top-full mt-1 w-56 rounded-xl p-3">
          <label className="flex items-center justify-between gap-3 py-1.5 text-sm">
            Music
            <Switch
              checked={music}
              aria-label="Music"
              onCheckedChange={(on) => {
                unlockAudio();
                setMusicOn(setMusic(on));
              }}
            />
          </label>
          <label className="flex items-center justify-between gap-3 py-1.5 text-sm">
            Sound effects
            <Switch checked={sounds} aria-label="Sound effects" onCheckedChange={(on) => setSoundsOn(setSfx(on))} />
          </label>
        </div>
      ) : null}
    </span>
  );
}
