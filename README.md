# 🥒 Pickleball Stack

A web app for organizing fair pickleball doubles for a court rental. Enter your
court time, courts, and players, and it schedules games so everyone plays an
equal amount — then tracks wins, losses, and the leaderboard.

## Features

- **Match setup** — enter hours booked, courts reserved, minutes per game, and
  every player's name. The app computes how many rounds fit
  (`rounds = hours × 60 / minutes per game`) and how many courts are actually in
  play.
- **Two formats:**
  - **Rotation** — random partners each round. Everyone plays with and against
    everyone, and sit-out (rest) time is shared evenly. Play is balanced so
    every player gets roughly the same number of games.
  - **Fixed partners** — players are auto-paired into fixed 2-person teams
    (with a reshuffle before you start), then each round's matchups are drawn
    **at random**. The draw favors least-rested teams so sit-out time stays
    even, and a winning pair goes back in the pool and can be picked again.
- **Live match board** — the current round's games per court, tap the winning
  team to record a result, see who's resting, and track progress round by round.
- **Rankings** — a scoreboard of wins, losses, and win %, with the leader
  crowned. Fixed-partners mode also shows team standings.

All data is persisted to a local SQLite database, so sessions survive a refresh
and are reachable by URL.

## Tech stack

- **[TanStack Start](https://tanstack.com/start)** (full-stack SSR on
  **[TanStack Router](https://tanstack.com/router)**, server functions) with
  **[Vite](https://vite.dev)**
- **React 19** + **TypeScript**
- **[Tailwind CSS v4](https://tailwindcss.com)**
- **[Prisma 7](https://www.prisma.io)** with the
  **[better-sqlite3](https://github.com/WiseLibs/better-sqlite3)** driver adapter

## Getting started

Install dependencies (this also generates the Prisma client via `postinstall`):

```bash
npm install
```

Create the local SQLite database from the Prisma schema:

```bash
npm run db:push
```

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and set up a match.

## Scripts

| Script             | Description                                        |
| ------------------ | -------------------------------------------------- |
| `npm run dev`      | Start the Vite development server                   |
| `npm run build`    | Production build (client + SSR bundles into `dist/`)|
| `npm run start`    | Serve the production build on Node (`serve.js`)     |
| `npm run lint`     | Run ESLint                                          |
| `npm run db:push`  | Sync the SQLite database with `schema.prisma`      |
| `npm run db:studio`| Open Prisma Studio to inspect the data             |

## Project structure

```
src/
  router.tsx                   # Router instance (getRouter)
  routes/
    __root.tsx                 # Document shell, <head>, fonts, styles
    index.tsx                  # Setup screen ("/")
    session/$id/index.tsx      # Live match board ("/session/$id")
    session/$id/rankings.tsx   # Scoreboard ("/session/$id/rankings")
  components/SetupForm.tsx     # Match setup form
  components/GameCard.tsx      # Tap-to-record game card
  styles/app.css               # Tailwind entry + theme
  routeTree.gen.ts             # Generated route tree (gitignored)
lib/
  prisma.ts                    # PrismaClient singleton (better-sqlite3 adapter, server-only)
  scheduling.ts                # Pure scheduling logic (rotation + random matchups)
  actions.ts                   # Server functions (createSession, recordResult, loaders)
  generated/prisma/            # Generated Prisma client (gitignored)
prisma/
  schema.prisma                # Data model
vite.config.ts                 # Vite + TanStack Start + Tailwind plugins
serve.js                       # Production Node entry (serves the built handler)
prisma.config.ts               # Prisma config (datasource URL for the CLI)
```

Data flows through **server functions** in `lib/actions.ts`: route `loader`s call
`getSessionBoard` / `getRankings` to read (server-side, so secrets and the
database never reach the client), and the UI calls `createSession` /
`recordResult` to mutate.

## Configuration

The database connection is read from `DATABASE_URL` in `.env`:

```
DATABASE_URL="file:./dev.db"
```

Prisma 7 keeps the connection URL out of `schema.prisma`; it's provided to the
CLI through `prisma.config.ts` and to the app at runtime by the better-sqlite3
adapter in `lib/prisma.ts`.
