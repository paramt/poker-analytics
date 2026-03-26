import type { SeatPosition } from '../types'

const POSITIONS_BY_COUNT: Record<number, SeatPosition[]> = {
  2: ['BTN', 'BB'],
  3: ['BTN', 'SB', 'BB'],
  4: ['BTN', 'SB', 'BB', 'UTG'],
  5: ['BTN', 'SB', 'BB', 'UTG', 'CO'],
  6: ['BTN', 'SB', 'BB', 'UTG', 'HJ', 'CO'],
  7: ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'HJ', 'CO'],
  8: ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'UTG+2', 'HJ', 'CO'],
  9: ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'UTG+2', 'HJ', 'CO', 'CO'],
}

/**
 * Assigns seat positions given the active seat numbers and the dealer's seat number.
 * Returns a map of seatNumber → SeatPosition.
 *
 * Rules:
 *   - BTN = dealer seat
 *   - SB = next seat clockwise (next higher seat number, wrapping around)
 *   - BB = next after SB
 *   - Special case: heads-up (2 players) — BTN posts SB, other player posts BB
 *   - Remaining seats filled with positional labels from UTG onward
 */
export function assignSeatPositions(
  activeSeats: number[],
  dealerSeat: number
): Record<number, SeatPosition> {
  if (activeSeats.length === 0) return {}

  // Sort seats ascending
  const sorted = [...activeSeats].sort((a, b) => a - b)
  const n = sorted.length

  // Find index of dealer in sorted array
  const dealerIdx = sorted.indexOf(dealerSeat)
  if (dealerIdx === -1) {
    // Dealer not in active seats — treat first seat as BTN
    return assignSeatPositions(activeSeats, sorted[0])
  }

  // Rotate: put dealer first, then clockwise order
  const clockwise = [
    ...sorted.slice(dealerIdx),
    ...sorted.slice(0, dealerIdx),
  ]

  const labels = POSITIONS_BY_COUNT[n] ?? buildFallbackLabels(n)

  const result: Record<number, SeatPosition> = {}
  for (let i = 0; i < clockwise.length; i++) {
    result[clockwise[i]] = labels[i]
  }
  return result
}

function buildFallbackLabels(n: number): SeatPosition[] {
  // For very large tables, fill with UTG variants
  const base: SeatPosition[] = ['BTN', 'SB', 'BB']
  for (let i = 3; i < n; i++) {
    base.push('UTG' as SeatPosition)
  }
  return base
}
