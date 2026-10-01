# The Great Murder Mystery — local setup

This folder is the full app: game rules, screens, card art, and the small server that deals an online table.

## What you need

- Node.js 22 or newer
- npm (comes with Node)

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:8080

Sign-in is off. `.grok/app-env.json` sets `VITE_AUTH_ENABLED` to `false`. Do not set `DATABASE_URL` unless you turn auth on.

## How to play on one computer

On the setup screen, under Phones, pick **This phone**. That is hotseat. Pass the device when the game asks.

**One each** is online. The host shares the room code. Guests open the same site and join. People on other networks need to reach this machine (same Wi-Fi is the simple case).

## Presets

- **Opening Night** — six guests, murder, no hours.
- **Harrington House** — the household, plus hours.
- **The Take** — Opening Night plus The Chauffeur, Mr. Broke, Oakley Autumns, Morgan Drake, Madame Coral, Miss Penny, and Ki Annie. Heist mode is on.

## Checks

```bash
npm run typecheck
npm run build
```

`npm run build` writes a production bundle and runs the local database migration script. You do not need Postgres for a normal local game.
