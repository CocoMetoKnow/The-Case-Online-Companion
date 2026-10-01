# UI layer changes (handoff notes)

Everything presentational lives in files marked `UI / RENDER LAYER`. The game-logic
module should only call the hooks below and never render UI.

## Hooks exposed to the logic module
- `src/lib/ui/ui.ts` -> `uiHooks.openJournal() / closeJournal() / setSkin("classic"|"detective") / onDealEnd(fn)`
- `CardHand` takes `dealKey` (changes once per fresh deal). The deal plays once per key.
- `CardReveal` is fed `{ card, who } | null` + `onDismiss` (the existing `ackCard` / spy-close path).
- Characters: engine rule `setPortrait()` (engine.ts), store action `pickCharacter()`,
  lobby message kind `"portrait"` (room-board.server.ts), `Player.portrait?: number` (types.ts),
  `portraitOf(player)` (cast.ts) is the single place that picks a face.

## Files
- NEW `components/game/JournalLayer.tsx` - the only journal (tab + notebook), z-index 9000/9100. Briefcase no longer renders its own.
- NEW `components/game/CardReveal.tsx` - one always-mounted reveal container.
- NEW `lib/ui/ui.ts` - skin + journal + deal state, persisted skin in localStorage `gmm.ui`.
- `MusicToggle.tsx` - now the settings gear (Music / Sound effects switches). Audio engine untouched.
- `Landing.tsx` - "Classic UI" switch. Classic = no `html[data-ui="detective"]` rules apply.
- `styles.css` - sections: always-on, detective skin, classic.
- `SetupScreen` / `LobbyScreen` - primary buttons are sticky above the home indicator.
- `LobbyScreen` - character picker. `NotesBook` / `MansionBoard` / Briefcase header show the chosen face.
- Not touched: `sfx.ts`, journal sounds, main music, rules.

## Not verified
No `node_modules`/network in the build sandbox, so nothing was run in a browser or through `tsc`
(every changed file does parse cleanly). Please run `npm run typecheck && npm run dev` once.
