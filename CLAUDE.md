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
    stats.ts         # Session stats computation (VPIP/PFR/AF/WTSD)
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
```

## Key Design Decisions

- **No backend** — pure frontend, Vercel static hosting
- **User-supplied API key** — stored in localStorage, never sent to a server
- **Hero picker on every upload** — no caching (display names can change session-to-session)
- **Seat positions** — computed per-hand from dealer seat + active seat numbers
- **AI scan** — parallel batches of 50, Promise.allSettled, exponential backoff on 429
- **bigpot tag** — computed client-side (pot ≥ 3x session avg), no Claude needed
- **Run-it-twice** — `board2?: string[]` field on Hand

## Workflow

- Always commit and push after completing a feature request.
- Avoid duplicating logic that already exists. Before writing a new utility (card parsing, hand evaluation, combinations, etc.), check `src/lib/` for an existing implementation to import. `handEval.ts` is the single source of truth for card parsing and hand evaluation — `stats.ts` and `claude.ts` must import from it, not reimplement it.

## Deploy

Vercel. Set these secrets in GitHub:
- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`
