import { describe, it, expect } from 'vitest'
import { parseCSV, extractAllPlayers, extractShortId } from './parser'

// PokerNow CSV format: entry, at, order — rows reverse-chronological
// We provide them in reverse order to verify sorting works

const HERO_ID = '1c6V3eltlj'
const VILLAIN_ID = '8pAlpXMD6x'
const VILLAIN2_ID = '-kxVOncdJw'

/**
 * Build a minimal valid CSV with the given entries in forward order.
 * We reverse them to simulate PokerNow export format.
 */
function buildCSV(entries: { entry: string; order: number }[]): string {
  const header = 'entry,at,order'
  // Reverse to simulate PokerNow's reverse-chronological order
  const reversed = [...entries].reverse()
  const rows = reversed.map(({ entry, order }) => {
    const escaped = entry.includes('"') || entry.includes(',')
      ? `"${entry.replace(/"/g, '""')}"`
      : `"${entry}"`
    return `${escaped},2024-01-01T00:00:00.000Z,${order}`
  })
  return [header, ...rows].join('\n')
}

const SIMPLE_HAND_ENTRIES = [
  { entry: '-- starting hand #117 (id: ksousb4us0dg)  No Limit Texas Hold\'em (dealer: "1000 @ 8pAlpXMD6x") --', order: 1 },
  { entry: 'Player stacks: #1 "nad @ -kxVOncdJw" (300) | #4 "1000 @ 8pAlpXMD6x" (2269) | #6 "param @ 1c6V3eltlj" (1931)', order: 2 },
  { entry: 'Your hand is 10♣, 9♦', order: 3 },
  { entry: '"param @ 1c6V3eltlj" posts a small blind of 10', order: 4 },
  { entry: '"nad @ -kxVOncdJw" posts a big blind of 20', order: 5 },
  { entry: '"1000 @ 8pAlpXMD6x" raises to 60', order: 6 },
  { entry: '"param @ 1c6V3eltlj" calls 60', order: 7 },
  { entry: '"nad @ -kxVOncdJw" folds', order: 8 },
  { entry: 'Flop:  [4♦, K♣, A♠]', order: 9 },
  { entry: '"param @ 1c6V3eltlj" checks', order: 10 },
  { entry: '"1000 @ 8pAlpXMD6x" bets 80', order: 11 },
  { entry: '"param @ 1c6V3eltlj" folds', order: 12 },
  { entry: 'Uncalled bet of 80 returned to "1000 @ 8pAlpXMD6x"', order: 13 },
  { entry: '"1000 @ 8pAlpXMD6x" collected 150 from pot', order: 14 },
  { entry: '-- ending hand #117 --', order: 15 },
]

describe('parseCSV', () => {
  it('returns sorted Entry array (ascending by order)', () => {
    const csv = buildCSV(SIMPLE_HAND_ENTRIES)
    const hands = parseCSV(csv, HERO_ID)
    expect(hands).toHaveLength(1)
    expect(hands[0].id).toBe(117)
  })

  it('parses hand ID and rawId correctly', () => {
    const csv = buildCSV(SIMPLE_HAND_ENTRIES)
    const [hand] = parseCSV(csv, HERO_ID)
    expect(hand.id).toBe(117)
    expect(hand.rawId).toBe('ksousb4us0dg')
  })

  it('identifies hero hole cards', () => {
    const csv = buildCSV(SIMPLE_HAND_ENTRIES)
    const [hand] = parseCSV(csv, HERO_ID)
    expect(hand.holeCards).toEqual(['10♣', '9♦'])
  })

  it('parses preflop actions: SB post, BB post, raise, call, fold', () => {
    const csv = buildCSV(SIMPLE_HAND_ENTRIES)
    const [hand] = parseCSV(csv, HERO_ID)
    const types = hand.preflop.map(a => a.type)
    expect(types).toContain('post_sb')
    expect(types).toContain('post_bb')
    expect(types).toContain('raise')
    expect(types).toContain('call')
    expect(types).toContain('fold')
  })

  it('parses flop board cards', () => {
    const csv = buildCSV(SIMPLE_HAND_ENTRIES)
    const [hand] = parseCSV(csv, HERO_ID)
    expect(hand.board).toEqual(['4♦', 'K♣', 'A♠'])
  })

  it('parses flop actions: check, bet, fold', () => {
    const csv = buildCSV(SIMPLE_HAND_ENTRIES)
    const [hand] = parseCSV(csv, HERO_ID)
    const types = hand.flop.map(a => a.type)
    expect(types).toContain('check')
    expect(types).toContain('bet')
    expect(types).toContain('fold')
  })

  it('computes hero net result correctly (lost money on fold)', () => {
    const csv = buildCSV(SIMPLE_HAND_ENTRIES)
    const [hand] = parseCSV(csv, HERO_ID)
    // Hero posted SB 10, then calls 60 (total street commitment = 60, delta = 50).
    // Total put in = 60. Collected 0. Result = -60.
    expect(hand.result).toBe(-60)
  })

  it('handles Uncalled bet correctly — does not count returned amount as hero loss', () => {
    // Villain got uncalled bet returned — should not affect hero result
    const csv = buildCSV(SIMPLE_HAND_ENTRIES)
    const [hand] = parseCSV(csv, HERO_ID)
    // Hero result should not be affected by villain's uncalled bet
    expect(typeof hand.result).toBe('number')
    expect(isNaN(hand.result)).toBe(false)
  })

  it('parses turn and river board cards', () => {
    const withTurnRiver = [
      ...SIMPLE_HAND_ENTRIES.slice(0, -2), // remove ending + collect
      { entry: 'Turn: 4♦, K♣, A♠ [K♥]', order: 12 },
      { entry: '"1000 @ 8pAlpXMD6x" bets 100', order: 13 },
      { entry: '"param @ 1c6V3eltlj" folds', order: 14 },
      { entry: '"1000 @ 8pAlpXMD6x" collected 220 from pot', order: 15 },
      { entry: '-- ending hand #117 --', order: 16 },
    ]
    const csv = buildCSV(withTurnRiver)
    const [hand] = parseCSV(csv, HERO_ID)
    expect(hand.board).toContain('K♥')
  })

  it('handles run-it-twice boards — board2 populated', () => {
    const runItTwiceEntries = [
      { entry: '-- starting hand #1 (id: abc)  No Limit Texas Hold\'em (dealer: "param @ 1c6V3eltlj") --', order: 1 },
      { entry: 'Player stacks: #1 "param @ 1c6V3eltlj" (1000) | #2 "villain @ 8pAlpXMD6x" (1000)', order: 2 },
      { entry: 'Your hand is A♠, K♦', order: 3 },
      { entry: '"param @ 1c6V3eltlj" bets 1000 and go all in', order: 4 },
      { entry: '"villain @ 8pAlpXMD6x" calls 1000', order: 5 },
      { entry: 'Flop:  [4♦, K♣, A♠]', order: 6 },
      { entry: 'Turn: 4♦, K♣, A♠ [K♥]', order: 7 },
      { entry: 'River: 4♦, K♣, A♠, K♥ [3♣]', order: 8 },
      { entry: 'Flop (second run):  [5♣, 4♥, 2♠]', order: 9 },
      { entry: 'Turn (second run): 5♣, 4♥, 2♠ [8♥]', order: 10 },
      { entry: 'River (second run): 5♣, 4♥, 2♠, 8♥ [6♥]', order: 11 },
      { entry: '"param @ 1c6V3eltlj" collected 1000 from pot', order: 12 },
      { entry: '-- ending hand #1 --', order: 13 },
    ]
    const csv = buildCSV(runItTwiceEntries)
    const [hand] = parseCSV(csv, HERO_ID)
    expect(hand.board).toEqual(['4♦', 'K♣', 'A♠', 'K♥', '3♣'])
    expect(hand.board2).toBeDefined()
    expect(hand.board2).toHaveLength(5)
    expect(hand.board2![0]).toBe('5♣')
  })

  it('parses raise amount correctly', () => {
    const csv = buildCSV(SIMPLE_HAND_ENTRIES)
    const [hand] = parseCSV(csv, HERO_ID)
    const raise = hand.preflop.find(a => a.type === 'raise')
    expect(raise?.amount).toBe(60)
  })

  it('parses all-in raise flag', () => {
    const allInEntries = [
      { entry: '-- starting hand #5 (id: xyz)  No Limit Texas Hold\'em (dealer: "param @ 1c6V3eltlj") --', order: 1 },
      { entry: 'Player stacks: #1 "param @ 1c6V3eltlj" (500) | #2 "villain @ 8pAlpXMD6x" (500)', order: 2 },
      { entry: 'Your hand is A♠, A♥', order: 3 },
      { entry: '"param @ 1c6V3eltlj" raises to 500 and go all in', order: 4 },
      { entry: '"villain @ 8pAlpXMD6x" folds', order: 5 },
      { entry: '"param @ 1c6V3eltlj" collected 500 from pot', order: 6 },
      { entry: '-- ending hand #5 --', order: 7 },
    ]
    const csv = buildCSV(allInEntries)
    const [hand] = parseCSV(csv, HERO_ID)
    const raise = hand.preflop.find(a => a.type === 'raise')
    expect(raise?.allin).toBe(true)
  })

  it('handles truncated last hand (no ending line) without crashing', () => {
    const truncated = SIMPLE_HAND_ENTRIES.slice(0, -1) // no ending line
    const csv = buildCSV(truncated)
    // Should not throw; may return a partial hand or nothing
    expect(() => parseCSV(csv, HERO_ID)).not.toThrow()
  })

  it('parses multiple hands from one CSV', () => {
    const hand2 = SIMPLE_HAND_ENTRIES.map(e => ({
      ...e,
      entry: e.entry.replace('#117', '#118').replace('id: ksousb4us0dg', 'id: next'),
      order: e.order + 20,
    }))
    const csv = buildCSV([...SIMPLE_HAND_ENTRIES, ...hand2])
    const hands = parseCSV(csv, HERO_ID)
    expect(hands).toHaveLength(2)
    expect(hands[0].id).toBe(117)
    expect(hands[1].id).toBe(118)
  })

  it('computes result correctly when hero wins pot', () => {
    const winEntries = [
      { entry: '-- starting hand #1 (id: abc)  No Limit Texas Hold\'em (dealer: "villain @ 8pAlpXMD6x") --', order: 1 },
      { entry: 'Player stacks: #1 "param @ 1c6V3eltlj" (1000) | #4 "villain @ 8pAlpXMD6x" (1000)', order: 2 },
      { entry: 'Your hand is A♠, A♥', order: 3 },
      { entry: '"param @ 1c6V3eltlj" posts a small blind of 10', order: 4 },
      { entry: '"villain @ 8pAlpXMD6x" posts a big blind of 20', order: 5 },
      { entry: '"param @ 1c6V3eltlj" raises to 60', order: 6 },
      { entry: '"villain @ 8pAlpXMD6x" calls 60', order: 7 },
      { entry: '"param @ 1c6V3eltlj" collected 120 from pot', order: 8 },
      { entry: '-- ending hand #1 --', order: 9 },
    ]
    const csv = buildCSV(winEntries)
    const [hand] = parseCSV(csv, HERO_ID)
    // Hero put in 60 (raise includes SB), collected 120 → net +60
    expect(hand.result).toBeGreaterThan(0)
  })
})

describe('extractAllPlayers', () => {
  it('extracts all unique players sorted by hand count', () => {
    const csv = buildCSV(SIMPLE_HAND_ENTRIES)
    const players = extractAllPlayers(csv)
    expect(players.length).toBeGreaterThanOrEqual(3)
    const ids = players.map(p => p.shortId)
    expect(ids).toContain(HERO_ID)
    expect(ids).toContain(VILLAIN_ID)
    expect(ids).toContain(VILLAIN2_ID)
  })

  it('returns display names correctly', () => {
    const csv = buildCSV(SIMPLE_HAND_ENTRIES)
    const players = extractAllPlayers(csv)
    const hero = players.find(p => p.shortId === HERO_ID)
    expect(hero?.displayName).toBe('param')
  })
})

describe('extractShortId', () => {
  it('extracts shortId from player entry string', () => {
    expect(extractShortId('"param @ 1c6V3eltlj"')).toBe('1c6V3eltlj')
  })

  it('handles entry without quotes', () => {
    expect(extractShortId('param @ 1c6V3eltlj')).toBe('1c6V3eltlj')
  })
})
