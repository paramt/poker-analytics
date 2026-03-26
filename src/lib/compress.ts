import LZString from 'lz-string'
import type { Hand } from '../types'

/**
 * Encode a Hand object into a URL-safe compressed string.
 * Uses LZ-string with URI encoding to handle Unicode suit symbols safely.
 */
export function encodeHand(hand: Hand): string {
  const json = JSON.stringify(hand)
  return LZString.compressToEncodedURIComponent(json)
}

/**
 * Decode a compressed hand string back into a Hand object.
 * Returns null if the string is corrupted or invalid JSON.
 */
export function decodeHand(encoded: string): Hand | null {
  try {
    const json = LZString.decompressFromEncodedURIComponent(encoded)
    if (!json) return null
    const parsed = JSON.parse(json)
    // Basic shape validation
    if (typeof parsed !== 'object' || parsed === null) return null
    if (typeof parsed.id !== 'number') return null
    return parsed as Hand
  } catch {
    return null
  }
}
