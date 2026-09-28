# What changed

Drop these files into your existing repo at the same paths (they overwrite the
originals). `public/cards/` and `public/characters/` are new image files.

## 1. Card art — Mr. Take & Dr. Bunny

- `public/cards/the-butler.jpg` and `public/cards/dr-finch.jpg` — your two
  photos, cropped to match the other cards' 2:3 aspect ratio and corner frame.
- `public/characters/butler.jpg` and `public/characters/finch.jpg` — same
  photos, used for the lobby guest-picker.
- `src/lib/game/cards.ts` — the card that used to be "The Butler" is now named
  **Mr. Take**; "Dr. Finch" is now **Dr. Bunny**. Their internal ids
  (`the-butler`, `dr-finch`) are unchanged, so this is safe for any game in
  progress. A `retiredCards` entry was added so old saves that still say "The
  Butler" or "Dr. Finch" relabel automatically. Image cache-busting version
  bumped so browsers pick up the new art instead of an old cached image.
- `src/lib/game/cast.ts` — lobby cast photo list points at the new images.
- `src/lib/game/store.ts` — a leftover hardcoded "Dr. Finch" default player
  name is now "Dr. Bunny".

**I don't have your `public/` folder** (your upload only included the game
logic files, not the asset tree), so I can't verify the exact crop against
your other card images pixel-for-pixel — I matched them by eye against your
two screenshots. If anything's off by a few pixels, it's a one-line tweak.

## 2. Speak mode now plays like the real board game

Previously "Speak mode" removed turns entirely (anyone could roll, show a
card, or accuse at any time), which doesn't match the physical game. Now:

- Turns proceed in the normal fixed order, exactly like standard play.
- On your turn, instead of picking suggestion cards in-app, you say your
  suspect/weapon/room out loud at the table and tap **"I'm in a room."**
- The game then walks the table in seating order from your left, asking each
  player in turn: **"Do you have a card that was asked for?"** with **Yes/No**
  buttons.
  - **No** → moves to the next player automatically.
  - **Yes** → that player can pick *any* card from their hand and tap
    **"Show this card"**. It's shown privately to the asker only, and the
    turn ends.
  - If everyone says no, the table gets a one-line notice and the turn ends.
- Card-shuffling power-up cards that depend on the game knowing which cards
  were asked (the "hush a card" power) are automatically excluded from the
  deck in speak mode, since the game never learns the named cards — it only
  learns yes/no answers.
- A player leaving mid-question no longer stalls the table.
- Added `src/lib/game/speak-mode.test.ts` covering all of this (order,
  yes/no, showing a card, someone leaving mid-question) — all passing.

Rewritten: `engine.ts` (`beginSpokenQuestion`, `answerSpoken`,
`chooseSpokenCard`, `canAsk`, `blockingPlayerIds`, `endTurn`, `dropPlayer`),
`actions.ts` (new `reply` action, `show` now branches on spoken vs. normal),
`store.ts` (new `reply()` call, removed the turn-less pass-and-play logic),
`types.ts` (`question.spoken`, `question.askingId`), `QuestionPanel.tsx`
(new `SpokenResolve` view), `Briefcase.tsx`/`SetupScreen.tsx`/
`LobbyScreen.tsx` (removed the old "no turns" UI and copy, updated the
in-app explanation of speak mode).

Also removed the now-unused `sendPrivateCard`/`sendCard` "show a card to
anyone, anytime" mechanic, the "snake eyes was rolled?" host button (turns
mean the dice roll happens in-app now, so there's nothing to confirm by
hand), and the private-card overlays that only speak mode used.

`room-board.server.ts` and `use-shared-room.ts` no longer special-case speak
mode for turn/round bookkeeping, since turns now always advance normally.

## 3. Power-ups: one explanation, then move on

Every power-up card used to end with a confirmation screen that every player
had to individually tap through ("acknowledge") before play continued — on
top of the initial explanation. Now:

- The card's effect is explained once when it's drawn (unchanged).
- The result (what happened) is written as a single line in the game log
  and the turn continues immediately — no extra "OK/Continue" tap from
  everyone.
- The **one** exception that still needs everyone to tap through: when a
  card's result has to go in your journal (a named suspect/weapon/room/time
  revealed into the envelope), since you need to actually see and record it.
  Even that's now a single "seen it" style step, not a chain of pop-ups.

Rewritten: `events.ts` (added a `settle()` helper used by every power-up's
resolution — free question, whisper, bonus roll, food poisoning, second
wind, about-face, forced reveal, show-all, swap-card, hush, spy, thief,
notes-lock, guide/influence, pass-a-card, peek, rumor, red herring).

## 4. Safe mode

I searched the whole codebase and there's no "safe mode" toggle anywhere in
this build — nothing to remove. If it's called something else in your head
(or was cut in an earlier pass), let me know what it's near (setup screen?
lobby?) and I'll find and remove it.

## 5. Hosting on Render (free)

Your `render.yaml` is already set up correctly for a free-tier, no-database
deployment:

```yaml
services:
  - type: web
    name: the-case
    runtime: node
    plan: free
    buildCommand: npm install && npm run build
    startCommand: node .output/server/index.mjs
    envVars:
      - key: NODE_VERSION
        value: "22"
      - key: VITE_AUTH_ENABLED
        value: "false"
```

With auth off, no `DATABASE_URL` is needed — don't add one. Steps:

1. Push this repo to GitHub (public or private both work with Render's free
   GitHub integration).
2. On Render: **New → Web Service → connect the GitHub repo**. Render reads
   `render.yaml` automatically and fills in the build/start commands and free
   plan.
3. Deploy. First load after each idle period will be slow (Render's free
   tier spins the service down after 15 minutes of no traffic and takes
   ~30–60s to wake back up) — that's a Render free-tier limitation, not a
   bug in the app.
4. Multiplayer rooms are held in server memory (`room-board.server.ts`), so
   a spin-down/restart clears any in-progress online games. Fine for casual
   play; if you want rooms to survive restarts you'd need a small persistent
   store (Render's free Postgres or Redis), which is a bigger change than
   what was asked here — happy to do it if you want it.

## Not touched

Nothing in `server/`, `scripts/`, auth, the database layer, or any UI file
outside the ones listed above.
