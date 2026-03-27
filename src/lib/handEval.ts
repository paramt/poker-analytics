// ─── Card parsing ────────────────────────────────────────────────────────────

function rankValue(r: string): number {
  if (r === 'A') return 14
  if (r === 'K') return 13
  if (r === 'Q') return 12
  if (r === 'J') return 11
  return parseInt(r, 10)
}

function rankName(r: number): string {
  const names: Record<number, string> = {
    14: 'Ace', 13: 'King', 12: 'Queen', 11: 'Jack', 10: 'Ten',
    9: 'Nine', 8: 'Eight', 7: 'Seven', 6: 'Six', 5: 'Five',
    4: 'Four', 3: 'Three', 2: 'Two',
  }
  return names[r] ?? String(r)
}

function parseCard(card: string): { rank: number; suit: string } {
  const m = card.match(/^(\d+|[AKQJ])(.)$/)
  if (!m) return { rank: 0, suit: '' }
  return { rank: rankValue(m[1]), suit: m[2] }
}

// ─── Combinations ─────────────────────────────────────────────────────────────

function combinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]]
  if (arr.length < k) return []
  const [first, ...rest] = arr
  return [
    ...combinations(rest, k - 1).map(c => [first, ...c]),
    ...combinations(rest, k),
  ]
}

// ─── 5-card hand evaluator ───────────────────────────────────────────────────

interface HandResult {
  score: number
  description: string
}

export function evaluate5(cards: string[]): HandResult {
  const parsed = cards.map(parseCard)
  const ranks = parsed.map(c => c.rank).sort((a, b) => b - a)
  const suits = parsed.map(c => c.suit)

  const isFlush = suits.every(s => s === suits[0])

  // Straight detection (including wheel A-2-3-4-5)
  const unique = [...new Set(ranks)].sort((a, b) => b - a)
  let isStraight = false
  let straightHigh = 0
  if (unique.length === 5) {
    if (unique[0] - unique[4] === 4) {
      isStraight = true
      straightHigh = unique[0]
    } else if (unique[0] === 14 && unique[1] === 5 && unique[2] === 4 && unique[3] === 3 && unique[4] === 2) {
      isStraight = true
      straightHigh = 5
    }
  }

  // Frequency map sorted by count desc, then rank desc
  const freq = new Map<number, number>()
  for (const r of ranks) freq.set(r, (freq.get(r) ?? 0) + 1)
  const counts = [...freq.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])
  const [top, second, third] = counts

  // Straight flush / royal flush
  if (isFlush && isStraight) {
    if (straightHigh === 14) return { score: 9e8, description: 'Royal Flush' }
    return { score: 8e8 + straightHigh, description: `Straight Flush, ${rankName(straightHigh)}-high` }
  }

  // Four of a kind
  if (top[1] === 4) {
    return {
      score: 7e8 + top[0] * 100 + (second?.[0] ?? 0),
      description: `Four of a Kind, ${rankName(top[0])}s`,
    }
  }

  // Full house
  if (top[1] === 3 && second?.[1] === 2) {
    return {
      score: 6e8 + top[0] * 100 + second[0],
      description: `Full House, ${rankName(top[0])}s full of ${rankName(second[0])}s`,
    }
  }

  // Flush
  if (isFlush) {
    const s = ranks[0] * 1e6 + ranks[1] * 1e4 + ranks[2] * 1e2 + ranks[3] * 10 + ranks[4]
    return { score: 5e8 + s, description: `Flush, ${rankName(ranks[0])}-high` }
  }

  // Straight
  if (isStraight) {
    return { score: 4e8 + straightHigh, description: `Straight, ${rankName(straightHigh)}-high` }
  }

  // Three of a kind
  if (top[1] === 3) {
    const kickers = ranks.filter(r => r !== top[0])
    return {
      score: 3e8 + top[0] * 1e4 + kickers[0] * 100 + kickers[1],
      description: `Three of a Kind, ${rankName(top[0])}s`,
    }
  }

  // Two pair
  if (top[1] === 2 && second?.[1] === 2) {
    const high = Math.max(top[0], second[0])
    const low = Math.min(top[0], second[0])
    return {
      score: 2e8 + high * 1e4 + low * 100 + (third?.[0] ?? 0),
      description: `Two Pair, ${rankName(high)}s and ${rankName(low)}s`,
    }
  }

  // One pair
  if (top[1] === 2) {
    const kickers = ranks.filter(r => r !== top[0])
    return {
      score: 1e8 + top[0] * 1e6 + kickers[0] * 1e4 + kickers[1] * 100 + (kickers[2] ?? 0),
      description: `Pair of ${rankName(top[0])}s`,
    }
  }

  // High card
  const s = ranks[0] * 1e6 + ranks[1] * 1e4 + ranks[2] * 1e2 + ranks[3] * 10 + ranks[4]
  return { score: s, description: `${rankName(ranks[0])}-high` }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Find the best 5-card hand description for the hero.
 *
 * - Hold'em (2 hole cards): 0–2 hole cards + enough board cards to make 5
 * - Omaha (4 hole cards): exactly 2 hole cards + exactly 3 board cards
 *
 * Returns null if the board has fewer than 3 cards (preflop).
 */
export function bestHandDescription(holeCards: string[], board: string[]): string | null {
  if (board.length < 3 || holeCards.length === 0) return null

  const isOmaha = holeCards.length >= 4
  let best: HandResult | null = null

  if (isOmaha) {
    for (const hc of combinations(holeCards, 2)) {
      for (const bc of combinations(board, 3)) {
        const result = evaluate5([...hc, ...bc])
        if (!best || result.score > best.score) best = result
      }
    }
  } else {
    // Hold'em: try all ways to pick k hole cards + (5-k) board cards
    for (let h = 0; h <= Math.min(2, holeCards.length); h++) {
      const boardNeeded = 5 - h
      if (boardNeeded > board.length) continue
      for (const hc of combinations(holeCards, h)) {
        for (const bc of combinations(board, boardNeeded)) {
          const result = evaluate5([...hc, ...bc])
          if (!best || result.score > best.score) best = result
        }
      }
    }
  }

  return best?.description ?? null
}
