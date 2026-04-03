import type { Hand, SessionStats, FlaggedHand, Action } from '../types'

/**
 * Determine if the hero voluntarily put money in preflop (VPIP).
 * Excludes: BB check when no one raised, folds to any action.
 * Includes: any call (including limps), any raise/3bet.
 */
function heroVPIP(hand: Hand): boolean {
  const { preflop, heroId } = hand
  for (const action of preflop) {
    if (action.player !== heroId) continue
    if (action.type === 'call' || action.type === 'raise' || action.type === 'bet') {
      return true
    }
    // SB limp (SB calls BB without a raise having been made) counts as VPIP
    // We detect this: hero posts SB AND later calls (already caught above via call type)
    // SB posting alone doesn't count — only voluntary calls/raises
  }
  return false
}

/**
 * Determine if the hero raised preflop (PFR).
 */
function heroPFR(hand: Hand): boolean {
  return hand.preflop.some(a => a.player === hand.heroId && a.type === 'raise')
}

/**
 * Determine if the hand reached the flop (for WTSD denominator).
 */
function wentToFlop(hand: Hand): boolean {
  return hand.board.length >= 3
}

/**
 * Determine if the hero saw showdown (WTSD numerator).
 * Hero saw showdown if a 'show' action exists in any street.
 */
function heroAtShowdown(hand: Hand): boolean {
  const allActions = [...hand.preflop, ...hand.flop, ...hand.turn, ...hand.river]
  return allActions.some(a => a.player === hand.heroId && a.type === 'show')
}

/**
 * Compute aggression factor postflop: (bets + raises) / calls
 * Postflop = flop + turn + river.
 * Returns 0 if no postflop calls (to avoid division by zero).
 */
function computeAF(hands: Hand[], heroId: string): number {
  let betsRaises = 0
  let calls = 0

  for (const hand of hands) {
    const postflop = [...hand.flop, ...hand.turn, ...hand.river]
    for (const action of postflop) {
      if (action.player !== heroId) continue
      if (action.type === 'bet' || action.type === 'raise') betsRaises++
      if (action.type === 'call') calls++
    }
  }

  if (calls === 0) return betsRaises > 0 ? betsRaises : 0
  return Math.round((betsRaises / calls) * 100) / 100
}

/**
 * Compute session stats from an array of hands.
 */
export function computeStats(hands: Hand[], heroId: string): SessionStats {
  if (hands.length === 0) {
    return { net: 0, vpip: 0, pfr: 0, af: 0, wtsd: 0, handsPlayed: 0 }
  }

  let vpipCount = 0
  let pfrCount = 0
  let wtsdDenom = 0
  let wtsdNum = 0
  let net = 0

  for (const hand of hands) {
    if (heroVPIP(hand)) vpipCount++
    if (heroPFR(hand)) pfrCount++
    if (wentToFlop(hand)) {
      wtsdDenom++
      if (heroAtShowdown(hand)) wtsdNum++
    }
    net += hand.result
  }

  const n = hands.length
  const pct = (num: number, denom: number) =>
    denom === 0 ? 0 : Math.round((num / denom) * 100)

  return {
    net: Math.round(net),
    vpip: pct(vpipCount, n),
    pfr: pct(pfrCount, n),
    af: computeAF(hands, heroId),
    wtsd: pct(wtsdNum, wtsdDenom),
    handsPlayed: n,
  }
}

/**
 * Compute each player's net result for a single hand.
 * Replicates the parser's delta logic: raises/calls are "to N" (total street
 * commitment), so we track the incremental delta to avoid double-counting.
 */
export function computePlayerResults(hand: Hand): Record<string, number> {
  const streets = [hand.preflop, hand.flop, hand.turn, hand.river]
  const putIn = new Map<string, number>()
  const collected = new Map<string, number>()
  const uncalled = new Map<string, number>()
  const streetCommitted = new Map<string, number>()
  const MONEY_IN_TYPES = new Set(['call', 'bet', 'raise', 'post_sb', 'post_bb'])

  for (const street of streets) {
    streetCommitted.clear()
    for (const action of street as Action[]) {
      if (action.type === 'collect' && action.amount) {
        collected.set(action.player, (collected.get(action.player) ?? 0) + action.amount)
      } else if (action.type === 'uncalled' && action.amount) {
        uncalled.set(action.player, (uncalled.get(action.player) ?? 0) + action.amount)
      } else if (action.amount && MONEY_IN_TYPES.has(action.type)) {
        const alreadyThisStreet = streetCommitted.get(action.player) ?? 0
        const delta = Math.max(0, action.amount - alreadyThisStreet)
        putIn.set(action.player, (putIn.get(action.player) ?? 0) + delta)
        streetCommitted.set(action.player, action.amount)
      }
    }
  }

  const results: Record<string, number> = {}
  for (const playerId of Object.keys(hand.players)) {
    const p = putIn.get(playerId) ?? 0
    const c = collected.get(playerId) ?? 0
    const u = uncalled.get(playerId) ?? 0
    results[playerId] = c - p + u
  }
  return results
}

/**
 * Build cumulative net timelines for all players across all hands.
 * Returns an array (one entry per hand) with each player's running total.
 * Players who don't appear in a hand carry forward their previous cumulative.
 */
export function buildNetTimelines(hands: Hand[]): {
  handIds: number[]
  players: { id: string; displayName: string; cumulative: number[] }[]
} {
  if (hands.length === 0) return { handIds: [], players: [] }

  // Collect all unique players across all hands
  const playerMeta = new Map<string, string>() // id → displayName
  for (const hand of hands) {
    for (const [id, info] of Object.entries(hand.players)) {
      if (!playerMeta.has(id)) playerMeta.set(id, info.displayName)
    }
  }

  const playerIds = Array.from(playerMeta.keys())
  const running = new Map<string, number>(playerIds.map(id => [id, 0]))
  const series = new Map<string, number[]>(playerIds.map(id => [id, []]))

  for (const hand of hands) {
    const results = computePlayerResults(hand)
    for (const id of playerIds) {
      const prev = running.get(id) ?? 0
      const delta = results[id] ?? 0
      const next = prev + delta
      running.set(id, next)
      series.get(id)!.push(next)
    }
  }

  return {
    handIds: hands.map(h => h.id),
    players: playerIds.map(id => ({
      id,
      displayName: playerMeta.get(id)!,
      cumulative: series.get(id)!,
    })),
  }
}

// ─── Rare hand detection ────────────────────────────────────────────────────

interface ParsedCard { rank: number; suit: string }

function parseCard(card: string): ParsedCard {
  const suit = card.slice(-1)
  const rankStr = card.slice(0, -1)
  const rank =
    rankStr === 'A' ? 14 :
    rankStr === 'K' ? 13 :
    rankStr === 'Q' ? 12 :
    rankStr === 'J' ? 11 :
    parseInt(rankStr)
  return { rank, suit }
}

function evaluate5CardHand(cards: ParsedCard[]): number {
  const ranks = cards.map(c => c.rank).sort((a, b) => b - a)
  const suits = cards.map(c => c.suit)

  const isFlush = suits.every(s => s === suits[0])

  const uniqueRanks = [...new Set(ranks)].sort((a, b) => b - a)
  let isStraight =
    uniqueRanks.length === 5 && uniqueRanks[0] - uniqueRanks[4] === 4
  // Wheel: A-2-3-4-5
  if (!isStraight && uniqueRanks.length === 5 &&
      uniqueRanks[0] === 14 && uniqueRanks[1] === 5 && uniqueRanks[4] === 2) {
    isStraight = true
  }

  const freq = new Map<number, number>()
  for (const r of ranks) freq.set(r, (freq.get(r) ?? 0) + 1)
  const counts = [...freq.values()].sort((a, b) => b - a)

  if (isFlush && isStraight) return 8
  if (counts[0] === 4) return 7
  if (counts[0] === 3 && counts[1] === 2) return 6
  if (isFlush) return 5
  if (isStraight) return 4
  if (counts[0] === 3) return 3
  if (counts[0] === 2 && counts[1] === 2) return 2
  if (counts[0] === 2) return 1
  return 0
}

function combinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]]
  if (arr.length < k) return []
  const [first, ...rest] = arr
  return [
    ...combinations(rest, k - 1).map(c => [first, ...c]),
    ...combinations(rest, k),
  ]
}

function bestHoldemRank(hole: ParsedCard[], board: ParsedCard[]): number {
  const all = [...hole, ...board]
  if (all.length < 5) return -1
  let best = -1
  for (const combo of combinations(all, 5)) {
    const r = evaluate5CardHand(combo)
    if (r > best) best = r
  }
  return best
}

function bestOmahaRank(hole: ParsedCard[], board: ParsedCard[]): number {
  if (board.length < 3) return -1
  let best = -1
  for (const holePair of combinations(hole, 2)) {
    for (const boardTriple of combinations(board, 3)) {
      const r = evaluate5CardHand([...holePair, ...boardTriple])
      if (r > best) best = r
    }
  }
  return best
}

const HAND_NAMES = [
  'High Card', 'One Pair', 'Two Pair', 'Three of a Kind',
  'Straight', 'Flush', 'Full House', 'Four of a Kind', 'Straight Flush',
]

/**
 * Tag hands where the hero made a rare hand:
 * full house or better in Hold'em, four of a kind or better in Omaha.
 * Game type is inferred from hole card count (2 = Hold'em, 4 = Omaha).
 */
export function tagRareHands(hands: Hand[]): FlaggedHand[] {
  const result: FlaggedHand[] = []

  for (const hand of hands) {
    if (hand.holeCards.length === 0 || hand.board.length < 3) continue

    const isOmaha = hand.holeCards.length === 4
    const hole = hand.holeCards.map(parseCard)

    const boards = [hand.board, ...(hand.board2 ? [hand.board2] : [])]
    let bestRank = -1
    for (const board of boards) {
      const boardCards = board.map(parseCard)
      const r = isOmaha
        ? bestOmahaRank(hole, boardCards)
        : bestHoldemRank(hole, boardCards)
      if (r > bestRank) bestRank = r
    }

    const threshold = isOmaha ? 7 : 6
    if (bestRank < threshold) continue

    result.push({
      handId: hand.id,
      tag: 'rare',
      summary: `Rare hand: ${HAND_NAMES[bestRank] ?? 'Strong Hand'}`,
    })
  }

  return result
}

/**
 * Tag hands as 'bigpot' if pot ≥ 3x the session average pot.
 * This is computed client-side without Claude.
 */
export function tagBigPots(hands: Hand[]): FlaggedHand[] {
  if (hands.length === 0) return []

  const avgPot = hands.reduce((sum, h) => sum + h.pot, 0) / hands.length
  const threshold = avgPot * 3

  return hands
    .filter(h => h.pot >= threshold)
    .map(h => ({
      handId: h.id,
      tag: 'bigpot' as const,
      summary: `Big pot of ${h.pot} (session avg: ${Math.round(avgPot)})`,
    }))
}
