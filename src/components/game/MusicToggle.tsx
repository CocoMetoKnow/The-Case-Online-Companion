import { useEffect, useState } from "react";
import { musicEnabled, setMusic, setSfx, sfxEnabled, unlockAudio } from "@/lib/game/sfx";

export function MusicToggle() {
  const [music, setMusicOn] = useState(true);
  const [sounds, setSoundsOn] = useState(true);

  useEffect(() => {
    setMusicOn(musicEnabled());
    setSoundsOn(sfxEnabled());
  }, []);

  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        aria-pressed={music}
        className="text-xs uppercase tracking-[0.16em] text-brass"
        onClick={() => {
          unlockAudio();
          setMusicOn(setMusic(!musicEnabled()));
        }}
      >
        {music ? "Music on" : "Music off"}
      </button>
      <button
        type="button"
        aria-pressed={sounds}
        className="text-xs uppercase tracking-[0.16em] text-brass"
        onClick={() => setSoundsOn(setSfx(!sfxEnabled()))}
      >
        {sounds ? "Sounds on" : "Sounds off"}
      </button>
    </span>
  );
}
