# CLAUDE.md

## Project

PokerNow hand history visualizer — React + TypeScript frontend app.
Upload a PokerNow CSV → pick hero player → street-by-street hand replay, session stats, proactive Claude AI analysis, and shareable hand URLs.

## Tech Stack

- **React 19 + TypeScript + Vite 8**
- **Tailwind CSS v3** (dark theme, emerald accent)
- **Zustand** for global state (`src/store.ts`)
- **idb-keyval** for IndexedDB session persistence
- **lz-string** for URL compression of hand replays
- **@anthropic-ai/sdk** (`dangerouslyAllowBrowser: true` — intentional BYOK pattern)
- **Vitest + @testing-library/react** for tests

## Commands

```bash
npm run dev          # Dev server at http://localhost:5173
npm run build        # Production build (tsc + vite)
npm test             # Run all tests (61 tests)
npm run test:watch   # Tests in watch mode
```

## Project Structure

```
src/
  types.ts           # All shared types (Hand, Session, Action, etc.)
  store.ts           # Zustand global store
  App.tsx            # Root component + routing
  lib/
    parser.ts        # PokerNow CSV parser
    seats.ts         # Seat position mapping (BTN/SB/BB/UTG/etc.)
    stats.ts         # Session + per-player stats (VPIP/PFR/AF/WTSD/3-bet/cbet/etc.)
    compress.ts      # lz-string URL encoding for hand sharing
    claude.ts        # Claude AI scan (batching, retry, prompt building)
    db.ts            # IndexedDB session persistence via idb-keyval
  components/
    UploadScreen.tsx  # CSV upload + player picker + recent sessions
    SessionView.tsx   # Hand list + stats bar + AI flagged cards
    HandReplayer.tsx  # Street-by-street replayer
    PokerTable.tsx    # Visual oval table with seat positions
    ActionLog.tsx     # Street-grouped action history
    StatsBar.tsx      # Net / VPIP / PFR / AF / WTSD display
    ShareButton.tsx   # Copy hand URL to clipboard
    ApiKeyInput.tsx   # Claude API key input (localStorage)
    SharedHandView.tsx # Shared ?hand= URL route
    AggregateStatsPage.tsx # /stats — cross-session player stats + net winnings chart
```

## Key Design Decisions

- **No backend** — pure frontend, Vercel static hosting
- **User-supplied API key** — stored in localStorage, never sent to a server
- **Hero picker on every upload** — no caching (display names can change session-to-session)
- **Seat positions** — computed per-hand from dealer seat + active seat numbers
- **AI scan** — parallel batches of 50, Promise.allSettled, exponential backoff on 429
- **bigpot tag** — computed client-side (pot ≥ 3x session avg), no Claude needed
- **Run-it-twice** — `board2?: string[]` field on Hand

## Aggregate Stats (`/stats` page)

`PlayerStats` (defined in `types.ts`) is computed at upload time via `computeAllPlayerStats(hands)` in `stats.ts` and stored on the `Session` object in IndexedDB. The `/stats` page reads these stored values — it does not reprocess hands.

**Stats computed:** VPIP, PFR, AF, WTSD, 3-bet %, fold-to-3bet %, c-bet %, fold-to-c-bet %, check-raise %, W$SD, biggest win, biggest loss, best made hand (score + description via `handEval.ts`).

**Deduplication:** sessions with the same first-hand timestamp are treated as duplicates; the one with the most hands is kept.

**Aggregation across sessions:** percentage stats are weighted by `handsPlayed`. `biggestWin`/`biggestLoss` take the max/min across sessions. `bestMadeHandScore` takes the max (highest score wins).

### Backfilling

When a new stat is added to `PlayerStats`, sessions already in IndexedDB won't have it. `AggregateStatsPage.loadStats()` handles this: it checks for a sentinel field from the latest schema version (`s.playerStats[0].checkRaise === undefined` currently), recomputes `computeAllPlayerStats` for all stale sessions, and writes them back via `saveSession`. This runs once per stale session and is transparent to the user.

**Rule: any new field added to `PlayerStats` must update the backfill sentinel.** Change the condition in `AggregateStatsPage.loadStats()` to check for the newest field being `undefined`. Current sentinel: `hoursPlayed === undefined`. Pick a field that is always present in the new schema (not optional, not a field that could legitimately be absent).

## Workflow

- Always commit and push after completing a feature request.
- Avoid duplicating logic that already exists. Before writing a new utility (card parsing, hand evaluation, combinations, etc.), check `src/lib/` for an existing implementation to import. `handEval.ts` is the single source of truth for card parsing and hand evaluation — `stats.ts` and `claude.ts` must import from it, not reimplement it.

## Deploy

Vercel. Set these secrets in GitHub:
- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`
