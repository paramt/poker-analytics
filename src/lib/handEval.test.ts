import { describe, it, expect } from 'vitest'
import { evaluate5, bestHandDescription } from './handEval'

// ─── evaluate5 direct tests ──────────────────────────────────────────────────

describe('evaluate5', () => {
  describe('hand classification', () => {
    it('royal flush', () => {
      expect(evaluate5(['A♠', 'K♠', 'Q♠', 'J♠', '10♠']).description).toBe('Royal Flush')
    })

    it('straight flush', () => {
      expect(evaluate5(['9♠', '8♠', '7♠', '6♠', '5♠']).description).toBe(
        'Straight Flush, Nine-high'
      )
    })

    it('four of a kind', () => {
      expect(evaluate5(['A♠', 'A♥', 'A♦', 'A♣', 'K♠']).description).toBe(
        'Four of a Kind, Aces'
      )
    })

    it('full house', () => {
      expect(evaluate5(['K♠', 'K♥', 'K♦', 'Q♠', 'Q♥']).description).toBe(
        'Full House, Kings full of Queens'
      )
    })

    it('flush', () => {
      expect(evaluate5(['A♠', 'J♠', '9♠', '7♠', '3♠']).description).toBe('Flush, Ace-high')
    })

    it('straight - Jack-high', () => {
      expect(evaluate5(['J♠', '10♥', '9♦', '8♣', '7♠']).description).toBe('Straight, Jack-high')
    })

    it('straight - wheel (A-2-3-4-5)', () => {
      expect(evaluate5(['A♠', '2♥', '3♦', '4♣', '5♠']).description).toBe('Straight, Five-high')
    })

    it('straight - broadway (A-high)', () => {
      expect(evaluate5(['A♠', 'K♥', 'Q♦', 'J♣', '10♠']).description).toBe('Straight, Ace-high')
    })

    it('three of a kind', () => {
      expect(evaluate5(['K♠', 'K♥', 'K♦', 'Q♠', 'J♥']).description).toBe(
        'Three of a Kind, Kings'
      )
    })

    it('two pair', () => {
      expect(evaluate5(['A♠', 'A♥', 'K♦', 'K♣', 'Q♠']).description).toBe(
        'Two Pair, Aces and Kings'
      )
    })

    it('one pair', () => {
      expect(evaluate5(['A♠', 'A♥', 'K♦', 'Q♣', 'J♠']).description).toBe('Pair of Aces')
    })

    it('high card', () => {
      expect(evaluate5(['A♠', 'K♥', 'Q♦', 'J♣', '9♠']).description).toBe('Ace-high')
    })
  })

  describe('score ordering', () => {
    it('straight flush > four of a kind', () => {
      const sf = evaluate5(['9♠', '8♠', '7♠', '6♠', '5♠'])
      const foak = evaluate5(['A♠', 'A♥', 'A♦', 'A♣', 'K♠'])
      expect(sf.score).toBeGreaterThan(foak.score)
    })

    it('four of a kind > full house', () => {
      const foak = evaluate5(['A♠', 'A♥', 'A♦', 'A♣', 'K♠'])
      const fh = evaluate5(['K♠', 'K♥', 'K♦', 'Q♠', 'Q♥'])
      expect(foak.score).toBeGreaterThan(fh.score)
    })

    it('full house > flush', () => {
      const fh = evaluate5(['K♠', 'K♥', 'K♦', 'Q♠', 'Q♥'])
      const flush = evaluate5(['A♠', 'J♠', '9♠', '7♠', '3♠'])
      expect(fh.score).toBeGreaterThan(flush.score)
    })

    it('flush > straight', () => {
      const flush = evaluate5(['A♠', 'J♠', '9♠', '7♠', '3♠'])
      const straight = evaluate5(['J♠', '10♥', '9♦', '8♣', '7♠'])
      expect(flush.score).toBeGreaterThan(straight.score)
    })

    it('straight > three of a kind', () => {
      const straight = evaluate5(['J♠', '10♥', '9♦', '8♣', '7♠'])
      const toak = evaluate5(['K♠', 'K♥', 'K♦', 'Q♠', 'J♥'])
      expect(straight.score).toBeGreaterThan(toak.score)
    })

    it('three of a kind > two pair', () => {
      const toak = evaluate5(['K♠', 'K♥', 'K♦', 'Q♠', 'J♥'])
      const twoPair = evaluate5(['A♠', 'A♥', 'K♦', 'K♣', 'Q♠'])
      expect(toak.score).toBeGreaterThan(twoPair.score)
    })

    it('two pair > one pair', () => {
      const twoPair = evaluate5(['A♠', 'A♥', 'K♦', 'K♣', 'Q♠'])
      const onePair = evaluate5(['A♠', 'A♥', 'K♦', 'Q♣', 'J♠'])
      expect(twoPair.score).toBeGreaterThan(onePair.score)
    })

    it('one pair > high card', () => {
      const onePair = evaluate5(['A♠', 'A♥', 'K♦', 'Q♣', 'J♠'])
      const highCard = evaluate5(['A♠', 'K♥', 'Q♦', 'J♣', '9♠'])
      expect(onePair.score).toBeGreaterThan(highCard.score)
    })
  })
})

// ─── bestHandDescription tests ───────────────────────────────────────────────

describe('bestHandDescription', () => {
  describe('null cases', () => {
    it('returns null when board is empty (preflop)', () => {
      expect(bestHandDescription(['A♠', 'K♠'], [])).toBeNull()
    })

    it('returns null when board has fewer than 3 cards', () => {
      expect(bestHandDescription(['A♠', 'K♠'], ['Q♠', 'J♠'])).toBeNull()
    })

    it('returns null when hole cards are empty', () => {
      expect(bestHandDescription([], ['A♠', 'K♥', 'Q♦', 'J♣', '10♠'])).toBeNull()
    })
  })

  describe('the reported bug', () => {
    it('8-9 on T-J-7-A-3 board finds 7-8-9-T-J straight', () => {
      // hole 8♥9♦ + board 10♣J♠7♥A♦3♣ → best 5 = 7♥8♥9♦10♣J♠ = Straight, Jack-high
      expect(
        bestHandDescription(['8♥', '9♦'], ['10♣', 'J♠', '7♥', 'A♦', '3♣'])
      ).toBe('Straight, Jack-high')
    })
  })

  describe('Hold\'em combinations', () => {
    it('flopped set', () => {
      expect(
        bestHandDescription(['A♠', 'A♥'], ['A♦', 'K♣', 'Q♥'])
      ).toBe('Three of a Kind, Aces')
    })

    it('four of a kind using both hole cards and board', () => {
      expect(
        bestHandDescription(['A♠', 'A♥'], ['A♦', 'A♣', 'K♥'])
      ).toBe('Four of a Kind, Aces')
    })

    it('flopped trips (one hole card)', () => {
      expect(
        bestHandDescription(['7♠', '7♥'], ['7♦', '8♣', '9♥'])
      ).toBe('Three of a Kind, Sevens')
    })

    it('pair on flop', () => {
      expect(
        bestHandDescription(['K♠', 'Q♠'], ['K♥', '7♦', '2♣'])
      ).toBe('Pair of Kings')
    })

    it('royal flush using both hole cards', () => {
      expect(
        bestHandDescription(['A♠', 'K♠'], ['Q♠', 'J♠', '10♠', '2♦', '7♣'])
      ).toBe('Royal Flush')
    })

    it('board-only broadway straight beats hole card pairs', () => {
      // hole [2♣, 3♦], board [A♠, K♥, Q♦, J♣, 10♠]
      // best 5 from board = A,K,Q,J,10 = broadway
      expect(
        bestHandDescription(['2♣', '3♦'], ['A♠', 'K♥', 'Q♦', 'J♣', '10♠'])
      ).toBe('Straight, Ace-high')
    })
  })
})
