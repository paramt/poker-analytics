import { describe, it, expect } from 'vitest'
import { assignSeatPositions } from './seats'

describe('assignSeatPositions', () => {
  it('heads-up: BTN and BB only, no SB', () => {
    const result = assignSeatPositions([1, 4], 1)
    expect(result[1]).toBe('BTN')
    expect(result[4]).toBe('BB')
  })

  it('heads-up: dealer at higher seat number', () => {
    const result = assignSeatPositions([1, 4], 4)
    expect(result[4]).toBe('BTN')
    expect(result[1]).toBe('BB')
  })

  it('3-player: standard rotation', () => {
    const result = assignSeatPositions([1, 4, 6], 4)
    expect(result[4]).toBe('BTN')
    expect(result[6]).toBe('SB')
    expect(result[1]).toBe('BB')
  })

  it('3-player: dealer at highest seat, SB wraps to lowest', () => {
    const result = assignSeatPositions([1, 4, 6], 6)
    expect(result[6]).toBe('BTN')
    expect(result[1]).toBe('SB')
    expect(result[4]).toBe('BB')
  })

  it('3-player: dealer at lowest seat, wraps correctly', () => {
    const result = assignSeatPositions([1, 4, 6], 1)
    expect(result[1]).toBe('BTN')
    expect(result[4]).toBe('SB')
    expect(result[6]).toBe('BB')
  })

  it('6-player: full rotation, dealer at seat #4', () => {
    const result = assignSeatPositions([1, 2, 4, 6, 7, 9], 4)
    expect(result[4]).toBe('BTN')
    expect(result[6]).toBe('SB')
    expect(result[7]).toBe('BB')
    expect(result[9]).toBe('UTG')
    expect(result[1]).toBe('HJ')
    expect(result[2]).toBe('CO')
  })

  it('6-player: dealer at seat #9, SB wraps to seat #1', () => {
    const result = assignSeatPositions([1, 2, 4, 6, 7, 9], 9)
    expect(result[9]).toBe('BTN')
    expect(result[1]).toBe('SB')
    expect(result[2]).toBe('BB')
  })

  it('returns empty object for empty seat list', () => {
    const result = assignSeatPositions([], 1)
    expect(result).toEqual({})
  })

  it('dealer not in active seats: falls back to lowest seat as BTN', () => {
    const result = assignSeatPositions([2, 5, 8], 3)
    expect(result[2]).toBe('BTN')
    expect(result[5]).toBe('SB')
    expect(result[8]).toBe('BB')
  })
})
