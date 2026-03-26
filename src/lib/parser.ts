import type { Hand, Action, Player } from '../types'
import { assignSeatPositions } from './seats'

// ─── Regexes ────────────────────────────────────────────────────────────────

const RE_HAND_START = /^-- starting hand #(\d+) \(id: ([^)]+)\).*\(dealer: "([^@]+) @ ([^"]+)"\)/
const RE_HAND_END = /^-- ending hand #\d+/
const RE_PLAYER_STACKS = /^Player stacks: (.+)$/
const RE_YOUR_HAND = /^Your hand is (.+)$/
const RE_FLOP = /^Flop(?: \(second run\))?:\s+\[([^\]]+)\]/
const RE_TURN = /^Turn(?: \(second run\))?:.*\[([^\]]+)\]/
const RE_RIVER = /^River(?: \(second run\))?:.*\[([^\]]+)\]/
const RE_SECOND_RUN = /^(?:Flop|Turn|River) \(second run\)/

const RE_ACTION_FOLD = /^"([^@"]+) @ ([^"]+)" folds$/
const RE_ACTION_CHECK = /^"([^@"]+) @ ([^"]+)" checks$/
const RE_ACTION_CALL = /^"([^@"]+) @ ([^"]+)" calls (\d+)/
const RE_ACTION_BET = /^"([^@"]+) @ ([^"]+)" bets (\d+)/
const RE_ACTION_RAISE = /^"([^@"]+) @ ([^"]+)" raises to (\d+)(?: and go all in)?/
const RE_ACTION_ALLIN_RAISE = /^"([^@"]+) @ ([^"]+)" raises to (\d+) and go all in/
const RE_ACTION_SB = /^"([^@"]+) @ ([^"]+)" posts a small blind of (\d+)/
const RE_ACTION_BB = /^"([^@"]+) @ ([^"]+)" posts a big blind of (\d+)/
const RE_ACTION_COLLECT = /^"([^@"]+) @ ([^"]+)" collected (\d+) from pot/
const RE_ACTION_SHOW = /^"([^@"]+) @ ([^"]+)" shows a (.+)\.$/
const RE_UNCALLED = /^Uncalled bet of (\d+) returned to "([^@"]+) @ ([^"]+)"/
const RE_ALLIN_BET = /^"([^@"]+) @ ([^"]+)" bets (\d+) and go all in/

// Lines to skip (not actions)
const SKIP_PATTERNS = [
  /^Your hand is/,
  /^Flop:/,
  /^Turn:/,
  /^River:/,
  /^Flop \(second run\)/,
  /^Turn \(second run\)/,
  /^River \(second run\)/,
  /^Player stacks:/,
  /^-- starting hand/,
  /^-- ending hand/,
  /^Remaining players/,
  /^All players in hand/,
  /^\w+ is the new dealer/,
  /has been disconnected/,
  /has been connected/,
  /joined the game/,
  /quits the game/,
  /stand up with/,
  /sit back with/,
  /passed the room/,
  /The admin/,
  /Player stacks/,
  /^"\w.*" wins/,         // "player" wins the hand
]

function shouldSkip(line: string): boolean {
  return SKIP_PATTERNS.some(p => p.test(line))
}

// ─── Player stack parsing ─────────────────────────────────────────────────

interface PlayerInfo {
  displayName: string
  shortId: string
  seat: number
  stack: number
}

function parsePlayerStacks(line: string): PlayerInfo[] {
  const match = line.match(RE_PLAYER_STACKS)
  if (!match) return []

  const players: PlayerInfo[] = []
  // Each entry: #N "DisplayName @ shortId" (stack)
  const playerRegex = /#(\d+) "([^@"]+) @ ([^"]+)" \((\d+)\)/g
  let m: RegExpExecArray | null
  while ((m = playerRegex.exec(match[1])) !== null) {
    players.push({
      seat: parseInt(m[1]),
      displayName: m[2].trim(),
      shortId: m[3].trim(),
      stack: parseInt(m[4]),
    })
  }
  return players
}

// ─── Card parsing ─────────────────────────────────────────────────────────

function parseCards(str: string): string[] {
  return str.split(',').map(s => s.trim()).filter(Boolean)
}

// ─── Action parsing ───────────────────────────────────────────────────────

function parseAction(line: string): Action | null {
  let m: RegExpExecArray | null

  if ((m = RE_UNCALLED.exec(line))) {
    return { player: m[3].trim(), type: 'uncalled', amount: parseInt(m[1]) }
  }
  if ((m = RE_ACTION_ALLIN_RAISE.exec(line))) {
    return { player: m[2].trim(), type: 'raise', amount: parseInt(m[3]), allin: true }
  }
  if ((m = RE_ACTION_RAISE.exec(line))) {
    return { player: m[2].trim(), type: 'raise', amount: parseInt(m[3]) }
  }
  if ((m = RE_ALLIN_BET.exec(line))) {
    return { player: m[2].trim(), type: 'bet', amount: parseInt(m[3]), allin: true }
  }
  if ((m = RE_ACTION_BET.exec(line))) {
    return { player: m[2].trim(), type: 'bet', amount: parseInt(m[3]) }
  }
  if ((m = RE_ACTION_CALL.exec(line))) {
    return { player: m[2].trim(), type: 'call', amount: parseInt(m[3]) }
  }
  if ((m = RE_ACTION_FOLD.exec(line))) {
    return { player: m[2].trim(), type: 'fold' }
  }
  if ((m = RE_ACTION_CHECK.exec(line))) {
    return { player: m[2].trim(), type: 'check' }
  }
  if ((m = RE_ACTION_SB.exec(line))) {
    return { player: m[2].trim(), type: 'post_sb', amount: parseInt(m[3]) }
  }
  if ((m = RE_ACTION_BB.exec(line))) {
    return { player: m[2].trim(), type: 'post_bb', amount: parseInt(m[3]) }
  }
  if ((m = RE_ACTION_COLLECT.exec(line))) {
    return { player: m[2].trim(), type: 'collect', amount: parseInt(m[3]) }
  }
  if ((m = RE_ACTION_SHOW.exec(line))) {
    return { player: m[2].trim(), type: 'show' }
  }

  return null
}

// ─── Street tracking ──────────────────────────────────────────────────────

type Street = 'preflop' | 'flop' | 'turn' | 'river'

// ─── Main parser ─────────────────────────────────────────────────────────

interface RawEntry {
  entry: string
  at: string
  order: number
}

export function extractShortId(playerEntry: string): string {
  const m = playerEntry.match(/@ ([^\s"]+)/)
  return m ? m[1].trim() : playerEntry
}

/**
 * Extract all unique players from raw CSV entries (before picking a hero).
 * Returns players sorted by number of hands they appear in (most frequent first).
 */
export function extractAllPlayers(csvText: string): Player[] {
  const rows = parseCsvRows(csvText)
  const counts = new Map<string, { displayName: string; count: number }>()

  for (const row of rows) {
    const entry = row.entry.trim()
    if (!RE_PLAYER_STACKS.test(entry)) continue
    const players = parsePlayerStacks(entry)
    for (const p of players) {
      const existing = counts.get(p.shortId)
      if (existing) {
        existing.count++
      } else {
        counts.set(p.shortId, { displayName: p.displayName, count: 1 })
      }
    }
  }

  return Array.from(counts.entries())
    .map(([shortId, { displayName, count }]) => ({ shortId, displayName, handCount: count }))
    .sort((a, b) => b.handCount - a.handCount)
}

/**
 * Parse a PokerNow CSV export and return an array of Hand objects.
 * Rows are in reverse-chronological order — must sort ascending by order.
 *
 * @param csvText  Raw CSV text
 * @param heroId   The shortId of the hero player (from picker)
 */
export function parseCSV(csvText: string, heroId: string): Hand[] {
  // Parse CSV rows: entry, at, order
  const rows = parseCsvRows(csvText)

  // Sort ascending by order
  rows.sort((a, b) => a.order - b.order)

  const hands: Hand[] = []
  let currentHandLines: string[] = []
  let currentTimestamp = ''
  let inHand = false

  function flushHand() {
    if (currentHandLines.length === 0) return
    const hand = parseHand(currentHandLines, heroId, currentTimestamp)
    if (hand) hands.push(hand)
    currentHandLines = []
  }

  for (const row of rows) {
    const entry = row.entry.trim()

    if (RE_HAND_START.test(entry)) {
      flushHand()
      inHand = true
      currentTimestamp = row.at
      currentHandLines = [entry]
    } else if (RE_HAND_END.test(entry)) {
      if (inHand) {
        currentHandLines.push(entry)
        flushHand()
        inHand = false
      }
    } else if (inHand) {
      currentHandLines.push(entry)
    }
  }

  // Handle truncated last hand
  if (currentHandLines.length > 0) {
    flushHand()
  }

  return hands
}

function parseHand(lines: string[], heroId: string, timestamp: string): Hand | null {
  const startLine = lines[0]
  const startMatch = startLine.match(RE_HAND_START)
  if (!startMatch) return null

  const handNum = parseInt(startMatch[1])
  const rawId = startMatch[2]
  const dealerShortId = startMatch[4].trim()

  let playerInfos: PlayerInfo[] = []
  let holeCards: string[] = []
  let street: Street = 'preflop'
  const preflop: Action[] = []
  const flop: Action[] = []
  const turn: Action[] = []
  const river: Action[] = []
  const board: string[] = []
  const board2: string[] = []
  let totalCollected = 0
  let uncalledReturned = 0
  const heroPutIn = new Map<string, number>() // track per-player money in

  for (const line of lines) {
    // Player stacks (only first occurrence — start of hand)
    if (RE_PLAYER_STACKS.test(line) && playerInfos.length === 0) {
      playerInfos = parsePlayerStacks(line)
      continue
    }

    // Hero's hole cards
    const yourHandMatch = line.match(RE_YOUR_HAND)
    if (yourHandMatch) {
      holeCards = parseCards(yourHandMatch[1])
      continue
    }

    // Board cards
    const flopMatch = line.match(RE_FLOP)
    if (flopMatch) {
      const cards = parseCards(flopMatch[1])
      if (RE_SECOND_RUN.test(line)) {
        board2.push(...cards)
      } else {
        board.push(...cards)
        street = 'flop'
      }
      continue
    }

    const turnMatch = line.match(RE_TURN)
    if (turnMatch) {
      const card = parseCards(turnMatch[1])[0]
      if (RE_SECOND_RUN.test(line)) {
        if (card) board2.push(card)
      } else {
        if (card) board.push(card)
        street = 'turn'
      }
      continue
    }

    const riverMatch = line.match(RE_RIVER)
    if (riverMatch) {
      const card = parseCards(riverMatch[1])[0]
      if (RE_SECOND_RUN.test(line)) {
        if (card) board2.push(card)
      } else {
        if (card) board.push(card)
        street = 'river'
      }
      continue
    }

    if (shouldSkip(line)) continue

    // Actions
    const action = parseAction(line)
    if (!action) continue

    // Track money in for result computation
    if (action.type === 'collect' && action.player === heroId) {
      totalCollected += action.amount ?? 0
    }
    if (action.type === 'uncalled' && action.player === heroId) {
      uncalledReturned += action.amount ?? 0
    }
    if (action.amount && ['call', 'bet', 'raise', 'post_sb', 'post_bb'].includes(action.type)) {
      const prev = heroPutIn.get(action.player) ?? 0
      if (action.type === 'raise') {
        // raise to N means total put in is N, not incremental
        heroPutIn.set(action.player, Math.max(prev, action.amount))
      } else {
        heroPutIn.set(action.player, prev + action.amount)
      }
    }

    const streetActions = { preflop, flop, turn, river }[street]
    streetActions.push(action)
  }

  if (playerInfos.length === 0) return null

  // Build players map
  const players: Hand['players'] = {}
  let dealerSeat = 0

  for (const p of playerInfos) {
    players[p.shortId] = { displayName: p.displayName, seat: p.seat, stack: p.stack }
    if (p.shortId === dealerShortId) {
      dealerSeat = p.seat
    }
  }

  // If dealer shortId not found (shouldn't happen), use first player's seat
  if (dealerSeat === 0 && playerInfos.length > 0) {
    dealerSeat = playerInfos[0].seat
  }

  // Compute seat positions
  const activeSeats = playerInfos.map(p => p.seat)
  const seatMap = assignSeatPositions(activeSeats, dealerSeat)
  const seatPositions: Hand['seatPositions'] = {}
  for (const p of playerInfos) {
    if (seatMap[p.seat]) {
      seatPositions[p.shortId] = seatMap[p.seat]
    }
  }

  // Compute hero result
  const heroPutInAmount = heroPutIn.get(heroId) ?? 0
  const result = totalCollected - heroPutInAmount + uncalledReturned

  // Compute pot (sum of all money put in)
  let pot = 0
  for (const amt of heroPutIn.values()) {
    pot += amt
  }

  return {
    id: handNum,
    rawId,
    dealerSeat,
    players,
    seatPositions,
    heroId,
    holeCards,
    preflop,
    flop,
    turn,
    river,
    board,
    board2: board2.length > 0 ? board2 : undefined,
    pot,
    result,
    timestamp,
  }
}

// ─── CSV row parser ───────────────────────────────────────────────────────

function parseCsvRows(csvText: string): RawEntry[] {
  const rows: RawEntry[] = []
  const lines = csvText.split('\n')

  // Skip header line
  let startIdx = 0
  if (lines[0]?.toLowerCase().includes('entry') || lines[0]?.includes('at') || lines[0]?.includes('order')) {
    startIdx = 1
  }

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    // PokerNow CSV format: entry (possibly quoted with commas inside), at, order
    // The entry column may contain commas, so we need careful parsing
    const parsed = parseCSVLine(line)
    if (parsed.length < 3) continue

    // Last two columns are always at and order
    const order = parseInt(parsed[parsed.length - 1])
    const at = parsed[parsed.length - 2]
    // Entry is everything else joined (in case it was split by commas)
    const entry = parsed.slice(0, parsed.length - 2).join(',')

    if (isNaN(order)) continue
    rows.push({ entry: unquote(entry), at: unquote(at), order })
  }

  return rows
}

function unquote(s: string): string {
  s = s.trim()
  if (s.startsWith('"') && s.endsWith('"')) {
    return s.slice(1, -1).replace(/""/g, '"')
  }
  return s
}

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
        current += ch
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  result.push(current)
  return result
}
