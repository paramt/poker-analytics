import type { Hand, SessionStats, FlaggedHand, Action } from '../types'
import { evaluate5, combinations as handCombinations } from './handEval'

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
 * Determine if the hero saw the flop — i.e. was dealt in and did NOT fold preflop.
 * Used as the WTSD denominator.
 */
function heroSawFlop(hand: Hand): boolean {
  if (!(hand.heroId in hand.players)) return false
  if (hand.board.length < 3) return false
  return !hand.preflop.some(a => a.player === hand.heroId && a.type === 'fold')
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
    if (!(hand.heroId in hand.players)) continue
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
  let handsDealtIn = 0
  let wtsdDenom = 0
  let wtsdNum = 0
  let net = 0

  for (const hand of hands) {
    const dealtIn = hand.heroId in hand.players
    if (!dealtIn) continue
    handsDealtIn++
    if (heroVPIP(hand)) vpipCount++
    if (heroPFR(hand)) pfrCount++
    if (heroSawFlop(hand)) {
      wtsdDenom++
      if (heroAtShowdown(hand)) wtsdNum++
    }
    net += hand.result
  }

  const pct = (num: number, denom: number) =>
    denom === 0 ? 0 : Math.round((num / denom) * 100)

  return {
    net: Math.round(net),
    vpip: pct(vpipCount, handsDealtIn),
    pfr: pct(pfrCount, handsDealtIn),
    af: computeAF(hands, heroId),
    wtsd: pct(wtsdNum, wtsdDenom),
    handsPlayed: handsDealtIn,
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
 * Each player's series is prepended with a zero-anchor point one hand before
 * their first appearance, so gains/losses on the first hand they play are
 * always visible. Players present from the very first hand get a virtual
 * "hand 0" anchor at the start.
 */
export function buildNetTimelines(hands: Hand[]): {
  handIds: number[]
  players: { id: string; displayName: string; cumulative: (number | null)[] }[]
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
  const rawSeries = new Map<string, (number | null)[]>(playerIds.map(id => [id, []]))

  for (const hand of hands) {
    const results = computePlayerResults(hand)
    for (const id of playerIds) {
      if (!(id in hand.players)) {
        rawSeries.get(id)!.push(null)
        continue
      }
      const prev = running.get(id) ?? 0
      const delta = results[id] ?? 0
      const next = prev + delta
      running.set(id, next)
      rawSeries.get(id)!.push(next)
    }
  }

  // Extend each series with a zero-anchor one slot before the player's first
  // appearance. The extended array has length n+1:
  //   index 0        → virtual "hand 0" (before the first real hand)
  //   index i+1      → real hand index i
  // For a player first appearing at real-hand index k:
  //   k === 0 → anchor at index 0 (virtual hand 0), real values at 1..n
  //   k  >  0 → null at 0..k-1, anchor at index k (= real hand k-1), real values at k+1..n
  const n = hands.length
  const extendedSeries = new Map<string, (number | null)[]>()

  for (const id of playerIds) {
    const raw = rawSeries.get(id)!
    const firstIdx = raw.findIndex(v => v !== null)
    const extended: (number | null)[] = new Array(n + 1).fill(null)

    if (firstIdx !== -1) {
      extended[firstIdx] = 0 // zero-anchor (at virtual slot 0, or at real hand firstIdx-1)
      for (let i = firstIdx; i < n; i++) extended[i + 1] = raw[i]
    }

    extendedSeries.set(id, extended)
  }

  // Prepend virtual hand ID 0; real hand IDs follow at indices 1..n
  const handIds = [0, ...hands.map(h => h.id)]

  return {
    handIds,
    players: playerIds.map(id => ({
      id,
      displayName: playerMeta.get(id)!,
      cumulative: extendedSeries.get(id)!,
    })),
  }
}

/**
 * For a single postflop street, detect check-raise opportunities and actions.
 * Opportunity: player checked, then an opponent bet, then player acted.
 * Made: player raised in that spot.
 */
function checkRaiseOnStreet(actions: Action[]): { opps: Set<string>; made: Set<string> } {
  const hasChecked = new Set<string>()
  const opps = new Set<string>()
  const made = new Set<string>()
  let firstBetSeen = false

  for (const action of actions) {
    if (!firstBetSeen) {
      if (action.type === 'check') hasChecked.add(action.player)
      else if (action.type === 'bet') firstBetSeen = true
    } else if (hasChecked.has(action.player)) {
      opps.add(action.player)
      if (action.type === 'raise') made.add(action.player)
    }
  }
  return { opps, made }
}

/**
 * Analyze preflop and flop sequences for 3-bet / fold-to-3bet / c-bet / fold-to-c-bet / check-raise.
 * Returns per-hand sets of which players had each opportunity and which acted on it.
 */
function analyzeHandStreetStats(hand: Hand): {
  threeBetOpps: Set<string>
  threeBets: Set<string>
  foldTo3BetOpps: Set<string>
  foldTo3Bets: Set<string>
  cbetOpp: string | null
  cbetMade: boolean
  foldToCbetOpps: Set<string>
  foldToCbets: Set<string>
  checkRaiseOpps: Set<string>
  checkRaises: Set<string>
} {
  const threeBetOpps = new Set<string>()
  const threeBets = new Set<string>()
  const foldTo3BetOpps = new Set<string>()
  const foldTo3Bets = new Set<string>()

  let raiseCount = 0
  let openRaiserId: string | null = null
  let threeBetSeen = false

  for (const action of hand.preflop) {
    const { player, type } = action
    if (type === 'post_sb' || type === 'post_bb') continue

    // Player acts when there's already a raise in front of them (and they aren't the opener)
    if (raiseCount >= 1 && player !== openRaiserId) {
      threeBetOpps.add(player)
    }

    if (type === 'raise' || type === 'bet') {
      raiseCount++
      if (raiseCount === 1) {
        openRaiserId = player
      } else if (raiseCount === 2 && !threeBetSeen) {
        threeBetSeen = true
        threeBets.add(player)
        if (openRaiserId) foldTo3BetOpps.add(openRaiserId)
      }
    } else if (type === 'fold' && foldTo3BetOpps.has(player)) {
      foldTo3Bets.add(player)
    }
  }

  // C-bet: preflop aggressor = last preflop raiser who saw the flop
  let preflopAggressor: string | null = null
  for (const action of hand.preflop) {
    if (action.type === 'raise' || action.type === 'bet') preflopAggressor = action.player
  }

  let cbetOpp: string | null = null
  let cbetMade = false
  const foldToCbetOpps = new Set<string>()
  const foldToCbets = new Set<string>()

  if (hand.board.length >= 3 && preflopAggressor) {
    const aggFoldedPreflop = hand.preflop.some(
      a => a.player === preflopAggressor && a.type === 'fold'
    )
    if (!aggFoldedPreflop) {
      cbetOpp = preflopAggressor
      const firstFlopByAgg = hand.flop.find(a => a.player === preflopAggressor)
      cbetMade = firstFlopByAgg?.type === 'bet'

      if (cbetMade) {
        let pastCbet = false
        for (const action of hand.flop) {
          if (action.player === preflopAggressor && action.type === 'bet') {
            pastCbet = true
            continue
          }
          if (pastCbet && action.player !== preflopAggressor) {
            foldToCbetOpps.add(action.player)
            if (action.type === 'fold') foldToCbets.add(action.player)
          }
        }
      }
    }
  }

  // Check-raise: analyze each postflop street independently
  const checkRaiseOpps = new Set<string>()
  const checkRaises = new Set<string>()
  for (const street of [hand.flop, hand.turn, hand.river]) {
    const { opps, made } = checkRaiseOnStreet(street)
    opps.forEach(p => checkRaiseOpps.add(p))
    made.forEach(p => checkRaises.add(p))
  }

  return { threeBetOpps, threeBets, foldTo3BetOpps, foldTo3Bets, cbetOpp, cbetMade, foldToCbetOpps, foldToCbets, checkRaiseOpps, checkRaises }
}

/**
 * Compute stats for every player across all hands.
 * Each player's denominator is the number of hands they appeared in.
 * Net is derived from computePlayerResults for accuracy.
 */
export function computeAllPlayerStats(hands: Hand[]): Array<{
  playerId: string
  displayName: string
  handsPlayed: number
  net: number
  vpip: number
  pfr: number
  af: number
  wtsd: number
  threeBet: number
  foldToThreeBet: number
  cbet: number
  foldToCbet: number
  checkRaise: number
  wdsd: number
  biggestWin: number
  biggestLoss: number
  bestMadeHandScore: number
  bestMadeHandDesc: string
  hoursPlayed: number
}> {
  if (hands.length === 0) return []

  // Collect all players
  const playerMeta = new Map<string, string>()
  for (const hand of hands) {
    for (const [id, info] of Object.entries(hand.players)) {
      if (!playerMeta.has(id)) playerMeta.set(id, info.displayName)
    }
  }

  return Array.from(playerMeta.entries()).map(([playerId, displayName]) => {
    const playerHands = hands.filter(h => playerId in h.players)

    let vpipCount = 0
    let pfrCount = 0
    let wtsdDenom = 0
    let wtsdNum = 0
    let net = 0
    let betsRaises = 0
    let calls = 0
    let threeBetOpps = 0
    let threeBetCount = 0
    let foldTo3BetOpps = 0
    let foldTo3BetCount = 0
    let cbetOpps = 0
    let cbetCount = 0
    let foldToCbetOpps = 0
    let foldToCbetCount = 0
    let checkRaiseOpps = 0
    let checkRaiseCount = 0
    let wsdTotal = 0
    let wsdWins = 0
    let biggestWin = 0
    let biggestLoss = 0
    let bestMadeHandScore = -1
    let bestMadeHandDesc = ''

    for (const hand of playerHands) {
      if (hand.preflop.some(a =>
        a.player === playerId && (a.type === 'call' || a.type === 'raise' || a.type === 'bet')
      )) vpipCount++

      if (hand.preflop.some(a => a.player === playerId && a.type === 'raise')) pfrCount++

      const sawFlop = hand.board.length >= 3 &&
        !hand.preflop.some(a => a.player === playerId && a.type === 'fold')
      if (sawFlop) {
        wtsdDenom++
        const allActions = [...hand.preflop, ...hand.flop, ...hand.turn, ...hand.river]
        if (allActions.some(a => a.player === playerId && a.type === 'show')) wtsdNum++
      }

      const postflop = [...hand.flop, ...hand.turn, ...hand.river]
      for (const action of postflop) {
        if (action.player !== playerId) continue
        if (action.type === 'bet' || action.type === 'raise') betsRaises++
        if (action.type === 'call') calls++
      }

      const results = computePlayerResults(hand)
      net += results[playerId] ?? 0

      const handNet = results[playerId] ?? 0
      if (handNet > biggestWin) biggestWin = handNet
      if (handNet < biggestLoss) biggestLoss = handNet

      const ss = analyzeHandStreetStats(hand)
      if (ss.threeBetOpps.has(playerId)) { threeBetOpps++; if (ss.threeBets.has(playerId)) threeBetCount++ }
      if (ss.foldTo3BetOpps.has(playerId)) { foldTo3BetOpps++; if (ss.foldTo3Bets.has(playerId)) foldTo3BetCount++ }
      if (ss.cbetOpp === playerId) { cbetOpps++; if (ss.cbetMade) cbetCount++ }
      if (ss.foldToCbetOpps.has(playerId)) { foldToCbetOpps++; if (ss.foldToCbets.has(playerId)) foldToCbetCount++ }
      if (ss.checkRaiseOpps.has(playerId)) { checkRaiseOpps++; if (ss.checkRaises.has(playerId)) checkRaiseCount++ }

      // W$SD and best made hand — only when player showed cards
      const allActions = [...hand.preflop, ...hand.flop, ...hand.turn, ...hand.river]
      const showAction = allActions.find(a => a.player === playerId && a.type === 'show' && a.cards?.length)
      const holeCards = showAction?.cards ?? (playerId === hand.heroId ? hand.holeCards : null)
      if (holeCards?.length && hand.board.length >= 3) {
        wsdTotal++
        if (handNet > 0) wsdWins++

        // Evaluate best 5-card hand from these hole cards + board
        const isOmaha = holeCards.length >= 4
        let bestScore = -1
        let bestDesc = ''
        const boardCards = hand.board
        const holeCombos = isOmaha ? handCombinations(holeCards, 2) : handCombinations(holeCards, Math.min(2, holeCards.length))
        const boardCombos = isOmaha ? handCombinations(boardCards, 3) : handCombinations(boardCards, Math.max(3, 5 - holeCards.length))
        for (const hc of holeCombos) {
          for (const bc of boardCombos) {
            if (hc.length + bc.length !== 5) continue
            const result = evaluate5([...hc, ...bc])
            if (result.score > bestScore) { bestScore = result.score; bestDesc = result.description }
          }
        }
        if (bestScore > bestMadeHandScore) { bestMadeHandScore = bestScore; bestMadeHandDesc = bestDesc }
      }
    }

    const pct = (num: number, denom: number) =>
      denom === 0 ? 0 : Math.round((num / denom) * 100)

    const af = calls === 0
      ? (betsRaises > 0 ? betsRaises : 0)
      : Math.round((betsRaises / calls) * 100) / 100

    return {
      playerId,
      displayName,
      handsPlayed: playerHands.length,
      net: Math.round(net),
      vpip: pct(vpipCount, playerHands.length),
      pfr: pct(pfrCount, playerHands.length),
      af,
      wtsd: pct(wtsdNum, wtsdDenom),
      threeBet: pct(threeBetCount, threeBetOpps),
      foldToThreeBet: pct(foldTo3BetCount, foldTo3BetOpps),
      cbet: pct(cbetCount, cbetOpps),
      foldToCbet: pct(foldToCbetCount, foldToCbetOpps),
      checkRaise: pct(checkRaiseCount, checkRaiseOpps),
      wdsd: pct(wsdWins, wsdTotal),
      biggestWin: Math.round(biggestWin),
      biggestLoss: Math.round(biggestLoss),
      bestMadeHandScore,
      bestMadeHandDesc,
      hoursPlayed: playerHands.length >= 2
        ? (new Date(playerHands[playerHands.length - 1].timestamp).getTime() - new Date(playerHands[0].timestamp).getTime()) / 3_600_000
        : 0,
    }
  })
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
 * Game type is inferred from hole card count (2 = Hold'em, 4+ = Omaha/PLO5).
 */
export function tagRareHands(hands: Hand[]): FlaggedHand[] {
  const result: FlaggedHand[] = []

  for (const hand of hands) {
    if (hand.holeCards.length === 0 || hand.board.length < 3) continue

    const isOmaha = hand.holeCards.length >= 4 // PLO4, PLO5, etc.
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

    const threshold = isOmaha ? 7 : 6 // holdem: full house+, omaha: quads+
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
  const threshold = avgPot * 4

  return hands
    .filter(h => h.pot >= threshold)
    .map(h => ({
      handId: h.id,
      tag: 'bigpot' as const,
      summary: `Big pot of ${h.pot} (session avg: ${Math.round(avgPot)})`,
    }))
}
