import { evaluate5, combinations } from './handEval'

// Card format matches the app: rank string + suit symbol (e.g. "A♠", "10♥")
const ALL_RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']
const ALL_SUITS = ['♠', '♥', '♦', '♣']
const FULL_DECK = ALL_RANKS.flatMap(r => ALL_SUITS.map(s => r + s))

// Returns the highest score achievable from any 5-card combo out of holeCards + board5
function bestScore(holeCards: string[], board5: string[]): number {
  let best = 0
  for (const combo of combinations([...holeCards, ...board5], 5)) {
    const { score } = evaluate5(combo)
    if (score > best) best = score
  }
  return best
}

/**
 * Exhaustive equity calculator for Texas Hold'em.
 *
 * Enumerates all C(remaining_deck, 5 - board.length) runouts and computes
 * win/tie/lose percentages for hero against all known villain hands.
 *
 * Returns null when there is insufficient information:
 * - Board has fewer than 3 cards (preflop / no board yet)
 * - Hero has fewer than 2 hole cards
 * - No villain cards are known
 */
export function calculateEquity(
  heroCards: string[],
  villainCards: string[][],
  board: string[],
): { win: number; tie: number; lose: number } | null {
  if (board.length < 3 || heroCards.length < 2 || villainCards.length === 0) return null

  const known = new Set([...heroCards, ...villainCards.flat(), ...board])
  const deck = FULL_DECK.filter(c => !known.has(c))
  const needed = 5 - board.length

  let wins = 0, ties = 0, total = 0

  for (const runout of combinations(deck, needed)) {
    const fullBoard = [...board, ...runout]
    const heroScore = bestScore(heroCards, fullBoard)
    const villainScores = villainCards.map(vc => bestScore(vc, fullBoard))
    const maxVillain = Math.max(...villainScores)

    if (heroScore > maxVillain) wins++
    else if (heroScore === maxVillain) ties++
    total++
  }

  return {
    win: (wins / total) * 100,
    tie: (ties / total) * 100,
    lose: ((total - wins - ties) / total) * 100,
  }
}
