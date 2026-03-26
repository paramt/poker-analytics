import { describe, it, expect } from 'vitest'
import { encodeHand, decodeHand } from './compress'
import type { Hand } from '../types'

const FULL_HAND: Hand = {
  id: 42,
  rawId: 'abc123',
  dealerSeat: 4,
  players: {
    hero: { displayName: 'param', seat: 4, stack: 1931 },
    villain: { displayName: '1000', seat: 6, stack: 2269 },
  },
  seatPositions: { hero: 'BTN', villain: 'BB' },
  heroId: 'hero',
  holeCards: ['10♣', '9♦'],
  preflop: [
    { player: 'hero', type: 'raise', amount: 60 },
    { player: 'villain', type: 'call', amount: 60 },
  ],
  flop: [
    { player: 'villain', type: 'check' },
    { player: 'hero', type: 'bet', amount: 80 },
    { player: 'villain', type: 'fold' },
  ],
  turn: [],
  river: [],
  board: ['4♦', 'K♣', 'A♠'],
  board2: ['5♣', '4♥', '2♠'],
  pot: 120,
  result: -60,
  timestamp: '2024-01-01T00:00:00Z',
}

const MINIMAL_HAND: Hand = {
  id: 1,
  rawId: 'min',
  dealerSeat: 1,
  players: { hero: { displayName: 'H', seat: 1, stack: 100 } },
  seatPositions: { hero: 'BTN' },
  heroId: 'hero',
  holeCards: ['A♠', 'K♦'],
  preflop: [{ player: 'hero', type: 'fold' }],
  flop: [],
  turn: [],
  river: [],
  board: [],
  pot: 0,
  result: 0,
  timestamp: '2024-01-01T00:00:00Z',
}

describe('compress', () => {
  it('round-trip: encode then decode returns identical hand object', () => {
    const encoded = encodeHand(FULL_HAND)
    const decoded = decodeHand(encoded)
    expect(decoded).toEqual(FULL_HAND)
  })

  it('Unicode suit symbols survive compression (♥ ♦ ♣ ♠)', () => {
    const encoded = encodeHand(FULL_HAND)
    const decoded = decodeHand(encoded)
    expect(decoded?.holeCards).toEqual(['10♣', '9♦'])
    expect(decoded?.board).toContain('4♦')
    expect(decoded?.board).toContain('K♣')
    expect(decoded?.board).toContain('A♠')
  })

  it('board2 (run-it-twice) survives round-trip', () => {
    const encoded = encodeHand(FULL_HAND)
    const decoded = decodeHand(encoded)
    expect(decoded?.board2).toEqual(['5♣', '4♥', '2♠'])
  })

  it('minimal hand (preflop fold only) produces valid encoded string', () => {
    const encoded = encodeHand(MINIMAL_HAND)
    expect(typeof encoded).toBe('string')
    expect(encoded.length).toBeGreaterThan(0)
    const decoded = decodeHand(encoded)
    expect(decoded).not.toBeNull()
    expect(decoded?.id).toBe(1)
  })

  it('corrupted string returns null, not crash', () => {
    const result = decodeHand('this-is-not-valid-lzstring-data!!!')
    expect(result).toBeNull()
  })

  it('truncated encoded string returns null', () => {
    const encoded = encodeHand(FULL_HAND)
    const truncated = encoded.slice(0, 10)
    const result = decodeHand(truncated)
    expect(result).toBeNull()
  })

  it('empty string returns null', () => {
    expect(decodeHand('')).toBeNull()
  })

  it('encoded string contains only printable ASCII characters', () => {
    const encoded = encodeHand(FULL_HAND)
    // Should only contain characters valid in a URL query string
    expect(encoded).toMatch(/^[\w\-+/=]+$/)
  })
})
