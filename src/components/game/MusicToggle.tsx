import { SettingsGear } from "./SettingsGear";

/**
 * Kept under its old name so every screen that already shows it gets the settings gear
 * (music, sound effects, UI color, journal color) without further changes.
 */
export function MusicToggle() {
  return <SettingsGear />;
}
