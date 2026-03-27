import { describe, it, expect } from 'vitest'
import { calculateEquity } from './equity'

describe('calculateEquity', () => {
  it('returns null when board has fewer than 3 cards', () => {
    expect(calculateEquity(['A♠', 'A♥'], [['K♣', 'K♦']], ['Q♠', 'J♥'])).toBeNull()
    expect(calculateEquity(['A♠', 'A♥'], [['K♣', 'K♦']], [])).toBeNull()
  })

  it('returns null when no villain cards are provided', () => {
    expect(calculateEquity(['A♠', 'A♥'], [], ['Q♠', 'J♥', '2♦'])).toBeNull()
  })

  it('river: hero AA vs villain 23 on KKKQJ board — hero wins 100%', () => {
    // Hero: A♠A♥ — best hand: four Kings + Ace kicker
    // Villain: 2♣3♦ — best hand: four Kings + Queen kicker
    // Board: K♠K♥K♦Q♣J♠ (already 5 cards — river, no runout needed)
    const result = calculateEquity(
      ['A♠', 'A♥'],
      [['2♣', '3♦']],
      ['K♠', 'K♥', 'K♦', 'Q♣', 'J♠'],
    )
    expect(result).not.toBeNull()
    expect(result!.win).toBeCloseTo(100, 1)
    expect(result!.tie).toBeCloseTo(0, 1)
    expect(result!.lose).toBeCloseTo(0, 1)
  })

  it('win + tie + lose sums to 100 (within 0.01)', () => {
    // AA vs KK on flop — partial board, multiple runouts
    const result = calculateEquity(
      ['A♠', 'A♥'],
      [['K♣', 'K♦']],
      ['Q♠', '7♥', '2♦'],
    )
    expect(result).not.toBeNull()
    const sum = result!.win + result!.tie + result!.lose
    expect(Math.abs(sum - 100)).toBeLessThan(0.01)
  })

  it('turn: AA vs KK on Q♠7♥2♦J♣ — hero equity > 85%', () => {
    const result = calculateEquity(
      ['A♠', 'A♥'],
      [['K♣', 'K♦']],
      ['Q♠', '7♥', '2♦', 'J♣'],
    )
    expect(result).not.toBeNull()
    expect(result!.win).toBeGreaterThan(85)
  })
})
