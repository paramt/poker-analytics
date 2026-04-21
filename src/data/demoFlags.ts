import type { FlaggedHand } from '../types'

/**
 * Pre-computed AI flag data for the demo session.
 * These correspond to hand numbers in public/demo.csv that have notable action.
 * Loaded by the "Try Demo" flow so no API key is needed.
 */
export const DEMO_FLAGS: FlaggedHand[] = [
  {
    handId: 4,
    tag: 'learning',
    summary:
      'Hero 3-bet the river to 225 with two pair (eights and sixes, both on the board) on a double-paired 4-6-8-8-6 runout after facing a bet and a raise — a major spew that ran into BTN\'s full house with K6.',
  },
  {
    handId: 6,
    tag: 'learning',
    summary:
      'Hero turn-barreled and river-overbet (225) in a 3-bet pot with AJ on 9-10-10-6-4, essentially playing the board with a pair of tens — a line that folds out worse and gets called by better, losing 405 to BTN\'s pocket twos.',
  },
  {
    handId: 52,
    tag: 'learning',
    summary:
      "Called three streets (flop raise, turn 150, river 350) with trip deuces in a 3-bet pot against BTN's raise-and-barrel line; BTN had flopped top set of kings. BTN's line in a raised+cold-called pot represents better hands far too often to call off with trips.",
  },
  {
    handId: 78,
    tag: 'learning',
    summary:
      'Called BB\'s river raise with the dummy-end straight (J-high on T-J-9-6-9 board); BB held Q-K for the nut K-high straight. Folding the idiot end to a raise is a classic PLO discipline spot.',
  },
  {
    handId: 86,
    tag: 'laydown',
    summary:
      'Folded KK overpair to BTN\'s turn raise on a paired, three-flush board (Tc-7s-2c-7c) after betting; BTN actually had top set turned into a full house (TTT). Correct fold that saved meaningful chips against a clear monster.',
  },
  {
    handId: 103,
    tag: 'learning',
    summary:
      'Hero raised river from 80 to 300 with bottom two pair (jacks and twos) on a paired-jacks board against a preflop 3-bettor who barreled three streets; villain had top two pair (aces and jacks) and called, costing 410.',
  },
]
