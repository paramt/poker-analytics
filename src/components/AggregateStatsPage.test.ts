import { describe, it, expect } from 'vitest'
import { aggregateAllPlayers, buildCrossSessionTimeline } from './AggregateStatsPage'
import type { Session, PlayerStats, Hand } from '../types'

function makePlayerStats(overrides: Partial<PlayerStats> & { displayName: string }): PlayerStats {
  return {
    playerId: overrides.displayName,
    net: 0,
    vpip: 0, pfr: 0, af: 0, wtsd: 0, handsPlayed: 10,
    threeBet: 0, foldToThreeBet: 0, cbet: 0, foldToCbet: 0,
    checkRaise: 0, wdsd: 0,
    bestMadeHandScore: -1, bestMadeHandDesc: '',
    hoursPlayed: 1,
    ...overrides,
  }
}

function makeHand(timestamp: string): Hand {
  return {
    id: 1, rawId: 'r', dealerSeat: 1, players: {}, seatPositions: {},
    heroId: 'hero', holeCards: [], preflop: [], flop: [], turn: [], river: [],
    board: [], pot: 0, result: 0, timestamp,
  }
}

function makeSession(id: string, timestamp: string, playerStats: PlayerStats[]): Session {
  return {
    id,
    filename: `${id}.csv`,
    uploadedAt: timestamp,
    heroId: 'hero',
    heroDisplayName: 'Hero',
    hands: [makeHand(timestamp)],
    stats: { net: 0, vpip: 0, pfr: 0, af: 0, wtsd: 0, handsPlayed: 0 },
    playerStats,
    flaggedHands: [],
  }
}

describe('aggregateAllPlayers — Best Win / Worst Loss (best/worst single-session net)', () => {
  it('takes the max and min per-session net across sessions', () => {
    const sessions = [
      makeSession('s1', '2026-01-01T00:00:00Z', [
        makePlayerStats({ displayName: 'Jay', net: 100 }),
      ]),
      makeSession('s2', '2026-01-02T00:00:00Z', [
        makePlayerStats({ displayName: 'Jay', net: -30 }),
      ]),
      makeSession('s3', '2026-01-03T00:00:00Z', [
        makePlayerStats({ displayName: 'Jay', net: 3600 }),
      ]),
    ]
    const rows = aggregateAllPlayers(sessions, {})
    const jay = rows.find(r => r.displayName === 'Jay')!
    expect(jay.biggestWin).toBe(3600)  // best single session
    expect(jay.biggestLoss).toBe(-30)  // worst single session
    expect(jay.net).toBe(3670)         // 100 - 30 + 3600, total across all sessions
    expect(jay.sessionCount).toBe(3)
  })

  it('never reports a positive biggestLoss or a negative biggestWin for a break-even player', () => {
    const sessions = [
      makeSession('s1', '2026-01-01T00:00:00Z', [
        makePlayerStats({ displayName: 'AlwaysWins', net: 50 }),
      ]),
    ]
    const rows = aggregateAllPlayers(sessions, {})
    const p = rows.find(r => r.displayName === 'AlwaysWins')!
    expect(p.biggestLoss).toBe(0) // never had a losing session
    expect(p.biggestWin).toBe(50)
  })

  it('reports biggestWin as 0 for a player whose every session was a loss', () => {
    const sessions = [
      makeSession('s1', '2026-01-01T00:00:00Z', [
        makePlayerStats({ displayName: 'AlwaysLoses', net: -20 }),
      ]),
      makeSession('s2', '2026-01-02T00:00:00Z', [
        makePlayerStats({ displayName: 'AlwaysLoses', net: -80 }),
      ]),
    ]
    const rows = aggregateAllPlayers(sessions, {})
    const p = rows.find(r => r.displayName === 'AlwaysLoses')!
    expect(p.biggestWin).toBe(0)
    expect(p.biggestLoss).toBe(-80)
  })

  it('keeps distinct players separate when no alias map is provided', () => {
    const sessions = [
      makeSession('s1', '2026-01-01T00:00:00Z', [
        makePlayerStats({ displayName: 'nad', net: 40 }),
      ]),
      makeSession('s2', '2026-01-02T00:00:00Z', [
        makePlayerStats({ displayName: 'Jay', net: -100 }),
      ]),
    ]
    const rows = aggregateAllPlayers(sessions, {})
    expect(rows.map(r => r.displayName).sort()).toEqual(['Jay', 'nad'])
  })

  it('coalesces biggestWin/biggestLoss/net/handsPlayed across aliased names', () => {
    const sessions = [
      makeSession('s1', '2026-01-01T00:00:00Z', [
        makePlayerStats({ displayName: 'nad', net: 40, handsPlayed: 10 }),
      ]),
      makeSession('s2', '2026-01-02T00:00:00Z', [
        makePlayerStats({ displayName: 'Jay', net: -150, handsPlayed: 15 }),
      ]),
    ]
    const rows = aggregateAllPlayers(sessions, { nad: 'Jay' })
    expect(rows).toHaveLength(1)
    const jay = rows[0]
    expect(jay.displayName).toBe('Jay')
    expect(jay.net).toBe(-110) // 40 + -150
    expect(jay.biggestWin).toBe(40)   // best of the two sessions
    expect(jay.biggestLoss).toBe(-150) // worst of the two sessions
    expect(jay.sessionCount).toBe(2)
    expect(jay.handsPlayed).toBe(25)
  })

  it('does not double-count sessionCount when an alias collapses two names within one session', () => {
    // Edge case: two distinct playerStats rows in the SAME session map to one canonical
    // name. sessionCount stays 1 (a Set), and net/handsPlayed correctly sum both rows.
    // biggestWin/biggestLoss are compared row-by-row though, so they reflect the larger
    // of the two rows' individual nets (20), not their combined session total (30) — a
    // known limitation for the rare case of manually merging two real co-players.
    const sessions = [
      makeSession('s1', '2026-01-01T00:00:00Z', [
        makePlayerStats({ displayName: 'A', net: 10, handsPlayed: 5 }),
        makePlayerStats({ displayName: 'B', net: 20, handsPlayed: 5 }),
      ]),
    ]
    const rows = aggregateAllPlayers(sessions, { A: 'Merged', B: 'Merged' })
    expect(rows).toHaveLength(1)
    expect(rows[0].sessionCount).toBe(1)
    expect(rows[0].net).toBe(30)
    expect(rows[0].handsPlayed).toBe(10)
    expect(rows[0].biggestWin).toBe(20)
  })
})

describe('buildCrossSessionTimeline', () => {
  it('tracks cumulative net per canonical player across sessions', () => {
    const sessions = [
      makeSession('s1', '2026-01-01T00:00:00Z', [
        makePlayerStats({ displayName: 'nad', net: 40 }),
      ]),
      makeSession('s2', '2026-01-02T00:00:00Z', [
        makePlayerStats({ displayName: 'Jay', net: -10 }),
      ]),
    ]
    const timeline = buildCrossSessionTimeline(sessions, { nad: 'Jay' })
    const jay = timeline.players.find(p => p.displayName === 'Jay')!
    expect(jay.cumulative).toEqual([0, 40, 30])
    expect(timeline.players.map(p => p.displayName)).toEqual(['Jay'])
  })

  it('sums per-session net when two aliased names both appear in the same session', () => {
    const sessions = [
      makeSession('s1', '2026-01-01T00:00:00Z', [
        makePlayerStats({ displayName: 'A', net: 10 }),
        makePlayerStats({ displayName: 'B', net: 20 }),
      ]),
    ]
    const timeline = buildCrossSessionTimeline(sessions, { A: 'Merged', B: 'Merged' })
    const merged = timeline.players.find(p => p.displayName === 'Merged')!
    expect(merged.cumulative).toEqual([0, 30])
  })
})
