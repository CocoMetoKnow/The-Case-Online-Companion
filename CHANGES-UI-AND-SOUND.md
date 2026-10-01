# The Case: UI layer and sound changes

Covers the UI-layer pass and the sound pass. It sits on top of the earlier logic/audio work (journal timing, username persistence, audio rebuild, Colonel Flintwood rename), which is not repeated here.

**Verification:** nothing here was run in a browser or through `tsc` (no node_modules/network in the sandbox). Every changed file was syntax-checked only. Run `npm run typecheck && npm run dev` first.

## 1. Journal (one journal, always on top)
- NEW `components/game/JournalLayer.tsx`: the only journal. Tab at z-index 9000, open notebook at 9100, above every screen/modal/overlay (highest existing was 96). Mounted once in `AppShell`.
- `Briefcase.tsx`: removed the header journal button, the floating button and the inline journal sheet. It now only reads `useUI(s => s.journalOpen)`.
- Journal column headers (`NotesBook.tsx`): round portrait of each player's chosen character with a coloured letter badge overlapping its lower right, matching the reference screenshot.

## 2. Card-dealing animation
- `CardHand.tsx`: new `dealKey` prop. Each card slides from a central deck, 150ms stagger, under 2s total. `translate3d`/opacity via the Web Animations API, reduced-motion respected. Tap anywhere to skip. Plays once per deal. Fires `case:deal-end`. Card sound per card (`sfxCard`).
- `Briefcase.tsx` passes `dealKey={code:startedAt:viewing}`.

## 3. Card-reveal animation
- NEW `components/game/CardReveal.tsx`: one always-mounted container, reused for every reveal. Drops in from top centre over 520ms (`translate3d`). Tap, or auto-dismiss after 6s, calls the existing acknowledge path so the clue is filed in the journal.
- Sound: the engine already plays `paper_slide.mp3` (`sfxReceive`) on a reveal; not duplicated.

## 4. Settings gear
- `MusicToggle.tsx` is now a gear menu with separate Music and Sound effects switches (same component name, so every screen got it).

## 5. Classic UI toggle
- NEW `lib/ui/ui.ts`: skin state (`detective` | `classic`), saved in localStorage `gmm.ui`, applied as `html[data-ui]`.
- `Landing.tsx`: "Classic UI" switch. Classic = none of the detective CSS applies.

## 6. Detective reskin and iPhone fit
- `styles.css` (appended; sections: always-on / detective / classic): paper-grain textures, typewriter type (Special Elite, added in `routes/__root.tsx`), ink-stamp buttons, typed input fields, paper lobby, leather desk and notebook. Card frames are drawn outside the card, so card artwork is untouched.
- `routes/__root.tsx`: `viewport-fit=cover`, iOS web-app meta tags.
- Safe-area padding on screens; "Open the lobby" (`SetupScreen`) and "Deal the cards" (`LobbyScreen`) are sticky above the home indicator. `components/ui/button.tsx` / `input.tsx` got `ui-btn` / `ui-field` hooks.

## 7. Character picking
- `types.ts`: `Player.portrait?: number`.
- `cast.ts`: names on the cast, `portraitOf(player)`, `takenPortraits()`.
- `engine.ts`: `setPortrait()` (lobby only, one player per character).
- `store.ts`: `pickCharacter()`. `room-board.server.ts`: `"portrait"` lobby message, and the server view keeps `portrait`.
- `LobbyScreen.tsx`: character picker. Faces also show in the lobby roster, the board (`MansionBoard`) and the play header.

## 8. Sound placement and volume
- `sfx.ts`: master SFX level 0.75 -> 0.4; per-sound trims (stings, win, fail, thud lower than small taps). Music level (0.35) unchanged.
- Extras now used: `dice_rolling_alt` plays when you tap Roll (`store.ts` `roll`), with the clack still on landing; `clock_tick_alt1/2` alternate as the 45s idle nudge (`Briefcase.tsx`); `muffled_static_alt` and `mysterious_sting_alt` are random alternates for a wrong solve and the solve sting.
- Solve the Case sting now fires on each category card you pick in the Solve picker (`QuestionPanel.tsx`, `PickFlow`, including "Use the circled card"), and no longer on pressing the Solve button or on the automatic "Name them to win" open (`Briefcase.tsx`). The forced "Name them to win" flow has no card clicks, so it plays no sting.
- Not moved: main music, journal sounds (page turn, pencil, notes slamming shut). The lower master level does apply to them.

## Left as-is on purpose
- `cards.ts` still lists "Inspector Flintwood" in a legacy-name list used to upgrade old saved decks.
