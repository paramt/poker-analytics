import { describe, it, expect } from 'vitest'
import { computeStats, tagBigPots, tagRareHands } from './stats'
import type { Hand, Action } from '../types'

const HERO_ID = 'hero123'

function makeHand(id: number, overrides: Partial<Hand> = {}): Hand {
  return {
    id,
    rawId: `hand${id}`,
    dealerSeat: 1,
    players: {
      [HERO_ID]: { displayName: 'Hero', seat: 1, stack: 1000 },
      villain: { displayName: 'Villain', seat: 2, stack: 1000 },
    },
    seatPositions: { [HERO_ID]: 'BTN', villain: 'BB' },
    heroId: HERO_ID,
    holeCards: ['A♠', 'K♦'],
    preflop: [],
    flop: [],
    turn: [],
    river: [],
    board: [],
    pot: 100,
    result: 0,
    timestamp: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

function preflopActions(...specs: [string, Action['type'], number?][]): Action[] {
  return specs.map(([player, type, amount]) => ({ player, type, amount }))
}

describe('computeStats', () => {
  it('returns all-zero stats for empty hands array', () => {
    const stats = computeStats([], HERO_ID)
    expect(stats.net).toBe(0)
    expect(stats.vpip).toBe(0)
    expect(stats.pfr).toBe(0)
    expect(stats.af).toBe(0)
    expect(stats.wtsd).toBe(0)
    expect(stats.handsPlayed).toBe(0)
  })

  it('no NaN for any stat on empty array', () => {
    const stats = computeStats([], HERO_ID)
    for (const v of Object.values(stats)) {
      expect(isNaN(v as number)).toBe(false)
    }
  })

  it('VPIP: hero voluntarily enters 3 of 5 → 60%', () => {
    const hands = [
      makeHand(1, { preflop: preflopActions([HERO_ID, 'call', 20]) }),        // vpip
      makeHand(2, { preflop: preflopActions([HERO_ID, 'raise', 60]) }),       // vpip
      makeHand(3, { preflop: preflopActions([HERO_ID, 'call', 20]) }),        // vpip
      makeHand(4, { preflop: preflopActions([HERO_ID, 'fold']) }),            // no vpip
      makeHand(5, { preflop: preflopActions([HERO_ID, 'post_bb', 20]) }),     // no vpip (BB check)
    ]
    const stats = computeStats(hands, HERO_ID)
    expect(stats.vpip).toBe(60)
  })

  it('VPIP: BB check (no raise) excluded from numerator', () => {
    const hands = [
      makeHand(1, { preflop: preflopActions([HERO_ID, 'post_bb', 20]) }), // BB check only
    ]
    const stats = computeStats(hands, HERO_ID)
    expect(stats.vpip).toBe(0)
  })

  it('PFR: hero raises preflop in 2 of 5 → 40%', () => {
    const hands = [
      makeHand(1, { preflop: preflopActions([HERO_ID, 'raise', 60]) }),
      makeHand(2, { preflop: preflopActions([HERO_ID, 'raise', 80]) }),
      makeHand(3, { preflop: preflopActions([HERO_ID, 'call', 20]) }),
      makeHand(4, { preflop: preflopActions([HERO_ID, 'fold']) }),
      makeHand(5, { preflop: preflopActions([HERO_ID, 'post_bb', 20]) }),
    ]
    const stats = computeStats(hands, HERO_ID)
    expect(stats.pfr).toBe(40)
  })

  it('AF: (2 bets + 1 raise) / 3 calls = 1.0', () => {
    const postflop: Action[] = [
      { player: HERO_ID, type: 'bet', amount: 50 },
      { player: HERO_ID, type: 'raise', amount: 100 },
      { player: HERO_ID, type: 'bet', amount: 30 },
      { player: HERO_ID, type: 'call', amount: 50 },
      { player: HERO_ID, type: 'call', amount: 80 },
      { player: HERO_ID, type: 'call', amount: 20 },
    ]
    const hands = [makeHand(1, { flop: postflop })]
    const stats = computeStats(hands, HERO_ID)
    expect(stats.af).toBe(1)
  })

  it('WTSD: 4 hands saw flop, hero showed down in 2 → 50%', () => {
    const hands = [
      makeHand(1, { board: ['A♠', 'K♦', '2♣'], river: [{ player: HERO_ID, type: 'show' }] }),
      makeHand(2, { board: ['A♠', 'K♦', '2♣'], river: [{ player: HERO_ID, type: 'show' }] }),
      makeHand(3, { board: ['A♠', 'K♦', '2♣'], river: [{ player: HERO_ID, type: 'fold' }] }),
      makeHand(4, { board: ['A♠', 'K♦', '2♣'], river: [{ player: HERO_ID, type: 'fold' }] }),
      makeHand(5, { board: [] }),  // no flop — excluded from denom
    ]
    const stats = computeStats(hands, HERO_ID)
    expect(stats.wtsd).toBe(50)
  })

  it('Net: sum of all hand results', () => {
    const hands = [
      makeHand(1, { result: 100 }),
      makeHand(2, { result: -50 }),
      makeHand(3, { result: 200 }),
    ]
    const stats = computeStats(hands, HERO_ID)
    expect(stats.net).toBe(250)
  })

  it('handsPlayed matches hand count', () => {
    const hands = [makeHand(1), makeHand(2), makeHand(3)]
    const stats = computeStats(hands, HERO_ID)
    expect(stats.handsPlayed).toBe(3)
  })
})

describe('tagBigPots', () => {
  it('returns empty array for empty input', () => {
    expect(tagBigPots([])).toEqual([])
  })

  it('tags hands with pot >= 3x session average', () => {
    const hands = [
      makeHand(1, { pot: 100 }),
      makeHand(2, { pot: 100 }),
      makeHand(3, { pot: 100 }),
      makeHand(4, { pot: 900 }), // 3x avg of 300
    ]
    const flagged = tagBigPots(hands)
    expect(flagged).toHaveLength(1)
    expect(flagged[0].handId).toBe(4)
    expect(flagged[0].tag).toBe('bigpot')
  })

  it('does not tag hands below 3x average', () => {
    const hands = [
      makeHand(1, { pot: 100 }),
      makeHand(2, { pot: 200 }),
    ]
    const flagged = tagBigPots(hands)
    expect(flagged).toHaveLength(0)
  })
})

describe('tagRareHands', () => {
  it('returns empty array for empty input', () => {
    expect(tagRareHands([])).toEqual([])
  })

  it('skips hands with no hole cards', () => {
    const hand = makeHand(1, { holeCards: [], board: ['A♠', 'A♥', 'A♦', 'K♠', 'K♥'] })
    expect(tagRareHands([hand])).toHaveLength(0)
  })

  it('skips hands with fewer than 3 board cards', () => {
    const hand = makeHand(1, { holeCards: ['A♠', 'A♥'], board: ['A♦', 'K♠'] })
    expect(tagRareHands([hand])).toHaveLength(0)
  })

  it('tags a full house in holdem (2 hole cards)', () => {
    // Hero: A♠ A♥, Board: A♦ K♠ K♥ 2♣ 3♦ → full house aces full of kings
    const hand = makeHand(1, {
      holeCards: ['A♠', 'A♥'],
      board: ['A♦', 'K♠', 'K♥', '2♣', '3♦'],
    })
    const flagged = tagRareHands([hand])
    expect(flagged).toHaveLength(1)
    expect(flagged[0].tag).toBe('rare')
    expect(flagged[0].handId).toBe(1)
    expect(flagged[0].summary).toContain('Full House')
  })

  it('tags four of a kind in holdem', () => {
    const hand = makeHand(2, {
      holeCards: ['A♠', 'A♥'],
      board: ['A♦', 'A♣', '2♠', '3♦', '5♣'],
    })
    const flagged = tagRareHands([hand])
    expect(flagged).toHaveLength(1)
    expect(flagged[0].summary).toContain('Four of a Kind')
  })

  it('tags straight flush in holdem', () => {
    const hand = makeHand(3, {
      holeCards: ['9♠', '8♠'],
      board: ['7♠', '6♠', '5♠', '2♥', '3♦'],
    })
    const flagged = tagRareHands([hand])
    expect(flagged).toHaveLength(1)
    expect(flagged[0].summary).toContain('Straight Flush')
  })

  it('does NOT tag a flush in holdem (below threshold)', () => {
    const hand = makeHand(4, {
      holeCards: ['A♠', 'K♠'],
      board: ['Q♠', 'J♠', '9♠', '2♥', '3♦'],
    })
    expect(tagRareHands([hand])).toHaveLength(0)
  })

  it('does NOT tag two pair in holdem', () => {
    const hand = makeHand(5, {
      holeCards: ['A♠', 'K♦'],
      board: ['A♥', 'K♠', '2♣', '3♦', '7♠'],
    })
    expect(tagRareHands([hand])).toHaveLength(0)
  })

  it('tags four of a kind in omaha (4 hole cards)', () => {
    // Omaha: must use exactly 2 hole + 3 board
    // Hole: A♠ A♥ 2♣ 3♦, Board: A♦ A♣ K♠ Q♦ J♥
    // Best: AA (hole) + AAK (board) → quads
    const hand = makeHand(6, {
      holeCards: ['A♠', 'A♥', '2♣', '3♦'],
      board: ['A♦', 'A♣', 'K♠', 'Q♦', 'J♥'],
    })
    const flagged = tagRareHands([hand])
    expect(flagged).toHaveLength(1)
    expect(flagged[0].tag).toBe('rare')
    expect(flagged[0].summary).toContain('Four of a Kind')
  })

  it('does NOT tag a full house in omaha (below threshold)', () => {
    // Hole: A♠ A♥ 2♣ 3♦, Board: K♠ K♥ K♦ 7♣ 8♠
    // Best with 2 hole + 3 board: AA + KKK = full house (rank 6) — below omaha threshold of 7
    const hand = makeHand(7, {
      holeCards: ['A♠', 'A♥', '2♣', '3♦'],
      board: ['K♠', 'K♥', 'K♦', '7♣', '8♠'],
    })
    expect(tagRareHands([hand])).toHaveLength(0)
  })

  it('tags using board2 when run-it-twice produces a rare hand', () => {
    // board (main) is a flush — not rare for holdem
    // board2 gives a full house
    const hand = makeHand(8, {
      holeCards: ['A♠', 'A♥'],
      board: ['2♠', '7♠', 'J♠', 'Q♠', '3♠'],   // hero has flush but not rare
      board2: ['A♦', 'A♣', '2♣', '3♦', '5♥'],  // quads on second board
    })
    const flagged = tagRareHands([hand])
    expect(flagged).toHaveLength(1)
    expect(flagged[0].summary).toContain('Four of a Kind')
  })
})
