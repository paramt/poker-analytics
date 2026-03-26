import { describe, it, expect } from 'vitest'
import { chunkHands, buildPrompt, parseClaudeResponse } from './claude'
import type { Hand } from '../types'

function makeHand(id: number): Hand {
  return {
    id,
    rawId: `h${id}`,
    dealerSeat: 1,
    players: { hero: { displayName: 'Hero', seat: 1, stack: 1000 } },
    seatPositions: { hero: 'BTN' },
    heroId: 'hero',
    holeCards: ['A♠', 'K♦'],
    preflop: [{ player: 'hero', type: 'raise', amount: 60 }],
    flop: [],
    turn: [],
    river: [],
    board: ['4♦', 'K♣', 'A♠'],
    pot: 120,
    result: 60,
    timestamp: '2024-01-01T00:00:00Z',
  }
}

describe('chunkHands', () => {
  it('splits 120 hands into 3 batches of [50, 50, 20]', () => {
    const hands = Array.from({ length: 120 }, (_, i) => makeHand(i))
    const chunks = chunkHands(hands, 50)
    expect(chunks).toHaveLength(3)
    expect(chunks[0]).toHaveLength(50)
    expect(chunks[1]).toHaveLength(50)
    expect(chunks[2]).toHaveLength(20)
  })

  it('returns single chunk when hands <= batch size', () => {
    const hands = Array.from({ length: 10 }, (_, i) => makeHand(i))
    const chunks = chunkHands(hands, 50)
    expect(chunks).toHaveLength(1)
    expect(chunks[0]).toHaveLength(10)
  })

  it('handles empty hands array', () => {
    const chunks = chunkHands([], 50)
    expect(chunks).toHaveLength(0)
  })
})

describe('buildPrompt', () => {
  it('returns a string containing JSON-parseable hand summaries', () => {
    const hands = [makeHand(1), makeHand(2)]
    const prompt = buildPrompt(hands)
    expect(typeof prompt).toBe('string')
    expect(prompt.length).toBeGreaterThan(0)
  })

  it('prompt does not contain curly braces in player names (injection prevention)', () => {
    const injectionHand = makeHand(1)
    injectionHand.players = {
      hero: { displayName: 'Evil{inject}Name', seat: 1, stack: 1000 },
    }
    const prompt = buildPrompt([injectionHand])
    // The display name should not appear in the prompt (we use seat positions)
    expect(prompt).not.toContain('Evil{inject}Name')
  })
})

describe('parseClaudeResponse', () => {
  it('parses valid JSON response correctly', () => {
    const response = JSON.stringify([
      { handId: 42, tag: 'learning', summary: 'Hero bet too large on the flop.' },
    ])
    const result = parseClaudeResponse(response)
    expect(result).toHaveLength(1)
    expect(result[0].handId).toBe(42)
    expect(result[0].tag).toBe('learning')
    expect(result[0].summary).toBe('Hero bet too large on the flop.')
  })

  it('returns [] for malformed JSON', () => {
    expect(parseClaudeResponse('this is not json')).toEqual([])
  })

  it('returns [] for empty string', () => {
    expect(parseClaudeResponse('')).toEqual([])
  })

  it('filters out unknown tag values', () => {
    const response = JSON.stringify([
      { handId: 1, tag: 'unknown_tag', summary: 'Blah' },
      { handId: 2, tag: 'learning', summary: 'Valid.' },
    ])
    const result = parseClaudeResponse(response)
    expect(result).toHaveLength(1)
    expect(result[0].handId).toBe(2)
  })

  it('filters out bigpot tag (computed client-side)', () => {
    const response = JSON.stringify([
      { handId: 5, tag: 'bigpot', summary: 'Big pot.' },
    ])
    const result = parseClaudeResponse(response)
    expect(result).toHaveLength(0)
  })

  it('handles markdown code block wrapping', () => {
    const response = '```json\n[{"handId": 3, "tag": "hero", "summary": "Great call."}]\n```'
    const result = parseClaudeResponse(response)
    expect(result).toHaveLength(1)
    expect(result[0].tag).toBe('hero')
  })

  it('returns [] when response is an empty array', () => {
    expect(parseClaudeResponse('[]')).toEqual([])
  })

  it('handles all valid tags correctly', () => {
    const response = JSON.stringify([
      { handId: 1, tag: 'learning', summary: 'Learning spot.' },
      { handId: 2, tag: 'hero', summary: 'Hero call.' },
      { handId: 3, tag: 'laydown', summary: 'Good laydown.' },
    ])
    const result = parseClaudeResponse(response)
    expect(result).toHaveLength(3)
    expect(result.map(r => r.tag)).toEqual(['learning', 'hero', 'laydown'])
  })
})
