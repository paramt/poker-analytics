import type { FlaggedHand } from '../types'

/**
 * Pre-computed AI flag data for the demo session.
 * These correspond to hand numbers in public/demo.csv that have notable action.
 * Loaded by the "Try Demo" flow so no API key is needed.
 */
export const DEMO_FLAGS: FlaggedHand[] = [
  {
    handId: 12,
    tag: 'hero',
    summary:
      "Param called a river shove with middle pair on a scary double-paired board. Most players fold here, but the pot odds and villain's aggressive betting line pointed to a bluff.",
  },
  {
    handId: 25,
    tag: 'learning',
    summary:
      'Param continuation-bet into three opponents on a K-9-3 rainbow board with air. Multi-way c-bets with no equity are usually spews — check-folding preserves more chips.',
  },
  {
    handId: 41,
    tag: 'laydown',
    summary:
      "Param correctly folded top pair (aces) to a check-raise on the turn after a flush completed. Villain's range on this runout is heavily weighted toward made flushes.",
  },
  {
    handId: 58,
    tag: 'hero',
    summary:
      'Param called a large flop check-raise with ace-high on a low connected board. Reading the check-raise as a semi-bluff from a draw-heavy range was spot on.',
  },
  {
    handId: 73,
    tag: 'learning',
    summary:
      'Param over-bet the river with two pair on a monotone board, getting called by a flopped flush. Sizing down to 50% pot extracts value and avoids losing to a better hand.',
  },
  {
    handId: 87,
    tag: 'laydown',
    summary:
      "Param folded an overpair (kings) facing a 3-bet shove from Raghav who had been playing tight. With Raghav's tight 3-bet range, kings are likely crushed by aces here.",
  },
]
