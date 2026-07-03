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
    (with a reshuffle before you start), then rotate by **win-lose stacking**
    (king of the court): winners move up a court, losers move down, and the
    bottom court's loser swaps out with a resting team.
- **Live match board** — the current round's games per court, tap the winning
  team to record a result, see who's resting, and track progress round by round.
- **Rankings** — a scoreboard of wins, losses, and win %, with the leader
  crowned. Fixed-partners mode also shows team standings.

All data is persisted to a local SQLite database, so sessions survive a refresh
and are reachable by URL.

## Tech stack

- **[Next.js 16](https://nextjs.org)** (App Router, Server Actions, Turbopack)
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
| `npm run dev`      | Start the development server (Turbopack)           |
| `npm run build`    | Production build                                    |
| `npm run start`    | Start the production server                         |
| `npm run lint`     | Run ESLint                                          |
| `npm run db:push`  | Sync the SQLite database with `schema.prisma`      |
| `npm run db:studio`| Open Prisma Studio to inspect the data             |

## Project structure

```
app/
  page.tsx                     # Setup screen
  components/SetupForm.tsx     # Match setup form (client)
  session/[id]/page.tsx        # Live match board
  session/[id]/GameCard.tsx    # Tap-to-record game card (client)
  session/[id]/rankings/       # Scoreboard
lib/
  prisma.ts                    # PrismaClient singleton (better-sqlite3 adapter)
  scheduling.ts                # Pure scheduling logic (rotation + stacking)
  actions.ts                   # Server Actions (create session, record result)
  generated/prisma/            # Generated Prisma client (gitignored)
prisma/
  schema.prisma                # Data model
prisma.config.ts               # Prisma config (datasource URL for the CLI)
```

## Configuration

The database connection is read from `DATABASE_URL` in `.env`:

```
DATABASE_URL="file:./dev.db"
```

Prisma 7 keeps the connection URL out of `schema.prisma`; it's provided to the
CLI through `prisma.config.ts` and to the app at runtime by the better-sqlite3
adapter in `lib/prisma.ts`.
