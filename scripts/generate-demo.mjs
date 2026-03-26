/**
 * generate-demo.mjs
 *
 * Generates public/demo.csv — 100 hands of No Limit Texas Hold'em
 * with 6 players. Uses a seeded LCG for deterministic output (seed=42).
 *
 * Run with: node scripts/generate-demo.mjs
 */

import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

// ─── Seeded RNG (LCG) ────────────────────────────────────────────────────────

let seed = 42

function rand() {
  // Numerical Recipes LCG
  seed = (seed * 1664525 + 1013904223) & 0xffffffff
  return (seed >>> 0) / 0xffffffff
}

function randInt(min, max) {
  return Math.floor(rand() * (max - min + 1)) + min
}

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ─── Players ──────────────────────────────────────────────────────────────────

const PLAYERS = [
  { name: 'Param',  id: 'PARAM001', seat: 1 },
  { name: 'Nadish', id: 'NADSH001', seat: 2 },
  { name: 'Raghav', id: 'RGHAV001', seat: 3 },
  { name: 'Gagan',  id: 'GAGAN001', seat: 4 },
  { name: 'Justin', id: 'JSTN0001', seat: 5 },
  { name: 'Anujan', id: 'ANJN0001', seat: 6 },
]

const HERO_ID = 'PARAM001'
const SB = 10
const BB = 20
const STARTING_STACK = 1500
const REBUY_THRESHOLD = 300
const NUM_HANDS = 100

// ─── Deck ─────────────────────────────────────────────────────────────────────

const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A']
const SUITS = ['♠', '♥', '♦', '♣']

const RANK_VALUE = {}
RANKS.forEach((r, i) => { RANK_VALUE[r] = i + 2 })

function makeDeck() {
  const deck = []
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push(rank + suit)
    }
  }
  return deck
}

function cardRank(card) {
  return RANK_VALUE[card[0]] ?? 0
}

function cardSuit(card) {
  return card.slice(1)
}

// ─── Hand strength ────────────────────────────────────────────────────────────

/** Preflop hand category: higher = stronger. Range 0–9. */
function preflopStrength(c1, c2) {
  const r1 = cardRank(c1)
  const r2 = cardRank(c2)
  const hi = Math.max(r1, r2)
  const lo = Math.min(r1, r2)
  const suited = cardSuit(c1) === cardSuit(c2)
  const paired = r1 === r2

  // Premium pairs
  if (paired && hi >= 13) return 9  // AA/KK/QQ
  if (paired && hi >= 11) return 8  // JJ/TT
  if (paired && hi >= 8)  return 7  // 99/88/77

  // Big broadway
  if (hi === 14 && lo >= 13) return 9  // AK
  if (hi === 14 && lo >= 11) return 7  // AQ/AJ
  if (hi === 14 && lo >= 10) return 6  // AT

  // Other pairs
  if (paired) return 5

  // Suited connectors / broadways
  if (suited && hi - lo === 1 && hi >= 11) return 6  // KQs, QJs etc
  if (suited && hi >= 13 && lo >= 12) return 6       // KQs
  if (hi >= 12 && lo >= 11) return 5                  // KQ, QJ offsuit

  // Decent suited
  if (suited && hi >= 11 && lo >= 9) return 4
  if (suited && hi >= 10 && hi - lo <= 2) return 3

  return Math.max(0, Math.floor((hi + lo - 4) / 4))
}

/**
 * Simplified postflop made-hand score for a 2-card hand + community cards.
 * Returns 0.0–1.0 where 1.0 = nuts.
 */
function postflopStrength(holeCards, board) {
  const all = [...holeCards, ...board]
  const ranks = all.map(cardRank)
  const suits = all.map(cardSuit)

  // Count rank frequencies
  const freq = {}
  for (const r of ranks) freq[r] = (freq[r] ?? 0) + 1
  const counts = Object.values(freq).sort((a, b) => b - a)

  // Check flush
  const suitFreq = {}
  for (const s of suits) suitFreq[s] = (suitFreq[s] ?? 0) + 1
  const hasFlush = Object.values(suitFreq).some(c => c >= 5)

  // Check straight (simplified)
  const uniqueRanks = [...new Set(ranks)].sort((a, b) => a - b)
  let hasStraight = false
  for (let i = 0; i <= uniqueRanks.length - 5; i++) {
    if (uniqueRanks[i + 4] - uniqueRanks[i] === 4 && new Set(uniqueRanks.slice(i, i + 5)).size === 5) {
      hasStraight = true
    }
  }
  // Wheel (A-2-3-4-5)
  if (uniqueRanks.includes(14) && uniqueRanks.includes(2) && uniqueRanks.includes(3) &&
      uniqueRanks.includes(4) && uniqueRanks.includes(5)) {
    hasStraight = true
  }

  if (hasFlush && hasStraight) return 0.98
  if (counts[0] === 4) return 0.96  // quads
  if (counts[0] === 3 && counts[1] === 2) return 0.92  // full house
  if (hasFlush) return 0.85
  if (hasStraight) return 0.82
  if (counts[0] === 3) return 0.72  // trips
  if (counts[0] === 2 && counts[1] === 2) return 0.58  // two pair
  if (counts[0] === 2) return 0.40  // one pair

  // High card — scale by top card
  const maxRank = Math.max(...ranks)
  return 0.1 + (maxRank - 2) / 120
}

// ─── CSV generation helpers ───────────────────────────────────────────────────

let orderCounter = 1

function csvRow(entry, at) {
  // Wrap entry in quotes, escaping any internal quotes
  const escaped = entry.replace(/"/g, '""')
  return `"${escaped}",${at},${orderCounter++}`
}

function randomId(n = 12) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let s = ''
  for (let i = 0; i < n; i++) s += chars[Math.floor(rand() * chars.length)]
  return s
}

function isoTimestamp(baseMs, offsetMs = 0) {
  return new Date(baseMs + offsetMs).toISOString().replace('T', ' ').replace(/\.\d+Z$/, '+0000')
}

// ─── Simulation ───────────────────────────────────────────────────────────────

/**
 * Simulate one hand and return an array of CSV rows (in ascending order).
 * The caller will reverse them before writing.
 */
function simulateHand(handNum, dealerSeatIdx, stacks, baseMs) {
  const rows = []
  const ts = isoTimestamp(baseMs)
  const handId = randomId(12)

  // Seat rotation: dealer = dealerSeatIdx into PLAYERS array
  const numPlayers = PLAYERS.length

  // SB is one after dealer (mod), BB is two after
  const sbIdx = (dealerSeatIdx + 1) % numPlayers
  const bbIdx = (dealerSeatIdx + 2) % numPlayers

  // Action order preflop: UTG (3 after dealer) first
  const preflopOrder = []
  for (let i = 3; i < 3 + numPlayers; i++) {
    preflopOrder.push(PLAYERS[(dealerSeatIdx + i) % numPlayers])
  }
  // UTG → ... → BTN → SB → BB

  const dealerPlayer = PLAYERS[dealerSeatIdx]
  const sbPlayer = PLAYERS[sbIdx]
  const bbPlayer = PLAYERS[bbIdx]

  // ─── Hand start line ────────────────────────────────────────────────────────
  const startLine = `-- starting hand #${handNum} (id: ${handId})  No Limit Texas Hold'em (dealer: "${dealerPlayer.name} @ ${dealerPlayer.id}") --`
  rows.push(csvRow(startLine, ts))

  // ─── Stacks line ────────────────────────────────────────────────────────────
  const stackStr = PLAYERS.map(p => `#${p.seat} "${p.name} @ ${p.id}" (${stacks[p.id]})`).join(' | ')
  rows.push(csvRow(`Player stacks: ${stackStr}`, ts))

  // ─── Deal cards ─────────────────────────────────────────────────────────────
  const deck = shuffle(makeDeck())
  let cardIdx = 0

  const holeCards = {}
  for (const p of PLAYERS) {
    holeCards[p.id] = [deck[cardIdx++], deck[cardIdx++]]
  }

  // Community cards (5 cards)
  const community = [deck[cardIdx++], deck[cardIdx++], deck[cardIdx++], deck[cardIdx++], deck[cardIdx++]]
  const flop = community.slice(0, 3)
  const turnCard = community[3]
  const riverCard = community[4]

  // ─── Hero hole cards ─────────────────────────────────────────────────────────
  const [h1, h2] = holeCards[HERO_ID]
  rows.push(csvRow(`Your hand is ${h1}, ${h2}`, ts))

  // ─── Pot tracking ────────────────────────────────────────────────────────────
  // Track working stacks (don't mutate stacks until end)
  const workingStacks = { ...stacks }
  let pot = 0

  // Post blinds
  const sbAmt = Math.min(SB, workingStacks[sbPlayer.id])
  const bbAmt = Math.min(BB, workingStacks[bbPlayer.id])

  workingStacks[sbPlayer.id] -= sbAmt
  workingStacks[bbPlayer.id] -= bbAmt
  pot += sbAmt + bbAmt

  rows.push(csvRow(`"${sbPlayer.name} @ ${sbPlayer.id}" posts a small blind of ${sbAmt}`, ts))
  rows.push(csvRow(`"${bbPlayer.name} @ ${bbPlayer.id}" posts a big blind of ${bbAmt}`, ts))

  // ─── Preflop action ──────────────────────────────────────────────────────────
  // Track commitment per player for this street (so "raises to N" is total, not incremental)
  const streetCommit = {}
  for (const p of PLAYERS) streetCommit[p.id] = 0
  streetCommit[sbPlayer.id] = sbAmt
  streetCommit[bbPlayer.id] = bbAmt

  let currentBet = bbAmt
  const activePlayers = new Set(PLAYERS.map(p => p.id))
  let lastAggressor = bbPlayer.id

  // Helper: player decides preflop
  function preflopDecision(player, strength) {
    const toCall = currentBet - streetCommit[player.id]
    const committed = streetCommit[player.id]

    // Fold if weak or couldn't afford call
    if (workingStacks[player.id] === 0) {
      // already all in — skip
      return 'skip'
    }

    if (currentBet > 0 && toCall > 0) {
      // Decision to call/raise/fold
      const callProb = Math.min(0.9, strength / 9 + 0.1)
      const raiseProb = Math.min(0.5, (strength - 5) / 9)

      if (rand() < raiseProb && currentBet < workingStacks[player.id] * 0.5) {
        // Raise
        const raiseSize = currentBet * randInt(2, 3)
        const raiseTotal = Math.min(raiseSize, workingStacks[player.id] + committed)
        return { action: 'raise', total: raiseTotal }
      } else if (rand() < callProb) {
        return { action: 'call', total: currentBet }
      } else {
        return { action: 'fold' }
      }
    } else {
      // No bet yet (BB option or limped): check or raise
      const raiseProb = Math.min(0.6, (strength - 4) / 9)
      if (rand() < raiseProb) {
        const raiseSize = currentBet * randInt(2, 4)
        const raiseTotal = Math.min(raiseSize, workingStacks[player.id] + committed)
        return { action: 'raise', total: raiseTotal }
      }
      return { action: 'check' }
    }
  }

  // Preflop action loop (UTG through BB, with re-opens if raised)
  let actionIdx = 0
  let raiseCount = 0
  const preflopActed = new Set()

  // We process preflop in order, handling re-raises by looping back
  const preflopQueue = [...preflopOrder]

  while (preflopQueue.length > 0) {
    const player = preflopQueue.shift()

    if (!activePlayers.has(player.id)) continue
    if (preflopActed.has(player.id) && streetCommit[player.id] >= currentBet) continue

    const strength = preflopStrength(...holeCards[player.id])
    const decision = preflopDecision(player, strength)

    if (decision === 'skip') {
      preflopActed.add(player.id)
      continue
    }

    if (decision.action === 'fold') {
      activePlayers.delete(player.id)
      rows.push(csvRow(`"${player.name} @ ${player.id}" folds`, ts))
      preflopActed.add(player.id)
    } else if (decision.action === 'call') {
      const toCall = Math.min(currentBet - streetCommit[player.id], workingStacks[player.id])
      workingStacks[player.id] -= toCall
      pot += toCall
      streetCommit[player.id] += toCall
      rows.push(csvRow(`"${player.name} @ ${player.id}" calls ${streetCommit[player.id]}`, ts))
      preflopActed.add(player.id)
    } else if (decision.action === 'raise') {
      raiseCount++
      const newTotal = Math.max(decision.total, currentBet + BB)
      const addedAmount = newTotal - streetCommit[player.id]
      const actualAdded = Math.min(addedAmount, workingStacks[player.id])
      const actualTotal = streetCommit[player.id] + actualAdded
      workingStacks[player.id] -= actualAdded
      pot += actualAdded
      streetCommit[player.id] = actualTotal
      currentBet = actualTotal
      lastAggressor = player.id
      rows.push(csvRow(`"${player.name} @ ${player.id}" raises to ${actualTotal}`, ts))
      preflopActed.add(player.id)

      // Re-open action for those who haven't responded to this raise
      // (but cap at 3 total raises to prevent infinite loops)
      if (raiseCount < 3) {
        for (const p of PLAYERS) {
          if (p.id !== player.id && activePlayers.has(p.id) && streetCommit[p.id] < currentBet) {
            preflopQueue.push(p)
          }
        }
      }
    } else if (decision.action === 'check') {
      rows.push(csvRow(`"${player.name} @ ${player.id}" checks`, ts))
      preflopActed.add(player.id)
    }

    actionIdx++
    if (activePlayers.size === 1) break
  }

  // One player left — wins preflop
  if (activePlayers.size === 1) {
    const winnerId = [...activePlayers][0]
    const winner = PLAYERS.find(p => p.id === winnerId)
    rows.push(csvRow(`"${winner.name} @ ${winner.id}" collected ${pot} from pot`, ts))

    // Update stacks
    for (const p of PLAYERS) {
      stacks[p.id] = workingStacks[p.id] + (p.id === winnerId ? pot : 0)
    }

    rows.push(csvRow(`-- ending hand #${handNum} --`, ts))
    return { rows, pot }
  }

  // ─── Flop ────────────────────────────────────────────────────────────────────
  const heroInHand = activePlayers.has(HERO_ID)
  rows.push(csvRow(`Flop:  [${flop.join(', ')}]`, ts))

  // Street action helper
  function runStreet(streetBoard, streetName) {
    if (activePlayers.size <= 1) return

    // Reset street commitments
    const sCommit = {}
    for (const id of activePlayers) sCommit[id] = 0
    let streetBet = 0
    let streetActed = new Set()
    let streetRaiseCount = 0

    // Postflop order: left of dealer first (SB if still in, else next)
    const postflopOrder = []
    for (let i = 1; i <= numPlayers; i++) {
      const p = PLAYERS[(dealerSeatIdx + i) % numPlayers]
      if (activePlayers.has(p.id)) postflopOrder.push(p)
    }

    const queue = [...postflopOrder]

    while (queue.length > 0) {
      const player = queue.shift()
      if (!activePlayers.has(player.id)) continue
      if (streetActed.has(player.id) && sCommit[player.id] >= streetBet) continue

      const strength = postflopStrength(holeCards[player.id], streetBoard)
      const toCall = streetBet - sCommit[player.id]
      let action

      if (streetBet === 0) {
        // Check or bet
        const betProb = 0.25 + strength * 0.5
        if (rand() < betProb && workingStacks[player.id] > 0) {
          const betSize = Math.floor(pot * (0.4 + rand() * 0.6))
          const actualBet = Math.min(betSize, workingStacks[player.id])
          if (actualBet > 0) {
            action = { type: 'bet', amount: actualBet }
          } else {
            action = { type: 'check' }
          }
        } else {
          action = { type: 'check' }
        }
      } else {
        // Call, raise, or fold
        const equity = strength
        const potOdds = toCall / (pot + toCall)
        const callProb = equity > potOdds ? 0.7 + equity * 0.3 : 0.2 + equity * 0.4
        const raiseProb = equity > 0.7 ? 0.3 : equity > 0.5 ? 0.15 : 0.05

        if (rand() < raiseProb && streetRaiseCount < 2 && workingStacks[player.id] > toCall) {
          const raiseAmt = Math.floor((streetBet + toCall) * (1.5 + rand()))
          const raiseTotal = Math.min(raiseAmt + sCommit[player.id], workingStacks[player.id] + sCommit[player.id])
          action = { type: 'raise', total: raiseTotal }
        } else if (rand() < callProb && workingStacks[player.id] > 0) {
          action = { type: 'call', amount: toCall }
        } else {
          action = { type: 'fold' }
        }
      }

      if (action.type === 'check') {
        rows.push(csvRow(`"${player.name} @ ${player.id}" checks`, ts))
        streetActed.add(player.id)
      } else if (action.type === 'bet') {
        workingStacks[player.id] -= action.amount
        pot += action.amount
        sCommit[player.id] = action.amount
        streetBet = action.amount
        rows.push(csvRow(`"${player.name} @ ${player.id}" bets ${action.amount}`, ts))
        streetActed.add(player.id)

        // Re-open for others
        for (const p of PLAYERS) {
          if (p.id !== player.id && activePlayers.has(p.id)) queue.push(p)
        }
      } else if (action.type === 'raise') {
        streetRaiseCount++
        const addAmt = action.total - sCommit[player.id]
        const actualAdd = Math.min(addAmt, workingStacks[player.id])
        const actualTotal = sCommit[player.id] + actualAdd
        workingStacks[player.id] -= actualAdd
        pot += actualAdd
        sCommit[player.id] = actualTotal
        streetBet = actualTotal
        rows.push(csvRow(`"${player.name} @ ${player.id}" raises to ${actualTotal}`, ts))
        streetActed.add(player.id)

        for (const p of PLAYERS) {
          if (p.id !== player.id && activePlayers.has(p.id) && sCommit[p.id] < streetBet) queue.push(p)
        }
      } else if (action.type === 'call') {
        const actualCall = Math.min(action.amount, workingStacks[player.id])
        workingStacks[player.id] -= actualCall
        pot += actualCall
        sCommit[player.id] += actualCall
        rows.push(csvRow(`"${player.name} @ ${player.id}" calls ${sCommit[player.id]}`, ts))
        streetActed.add(player.id)
      } else if (action.type === 'fold') {
        activePlayers.delete(player.id)
        rows.push(csvRow(`"${player.name} @ ${player.id}" folds`, ts))
        streetActed.add(player.id)
        if (activePlayers.size === 1) break
      }
    }
  }

  runStreet(flop, 'flop')

  if (activePlayers.size > 1) {
    rows.push(csvRow(`Turn: ${flop.join(', ')} [${turnCard}]`, ts))
    runStreet([...flop, turnCard], 'turn')
  }

  if (activePlayers.size > 1) {
    rows.push(csvRow(`River: ${flop.join(', ')}, ${turnCard} [${riverCard}]`, ts))
    runStreet([...flop, turnCard, riverCard], 'river')
  }

  // ─── Showdown / winner ───────────────────────────────────────────────────────
  const remaining = [...activePlayers]

  if (remaining.length === 1) {
    // Won uncontested
    const winnerId = remaining[0]
    const winner = PLAYERS.find(p => p.id === winnerId)
    rows.push(csvRow(`"${winner.name} @ ${winner.id}" collected ${pot} from pot`, ts))

    for (const p of PLAYERS) {
      stacks[p.id] = workingStacks[p.id] + (p.id === winnerId ? pot : 0)
    }
  } else {
    // Showdown — compare hands
    const boardFull = [...flop, turnCard, riverCard]
    let bestScore = -1
    let winnerId = remaining[0]

    for (const playerId of remaining) {
      const score = postflopStrength(holeCards[playerId], boardFull)
      // Add noise to differentiate kickers
      const adjusted = score + rand() * 0.01
      if (adjusted > bestScore) {
        bestScore = adjusted
        winnerId = playerId
      }
    }

    // Show cards for all remaining (PokerNow shows at showdown)
    for (const playerId of remaining) {
      if (playerId === HERO_ID) continue  // hero's cards shown via "Your hand is"
      const player = PLAYERS.find(p => p.id === playerId)
      const [c1, c2] = holeCards[playerId]
      rows.push(csvRow(`"${player.name} @ ${player.id}" shows a ${c1}, ${c2}.`, ts))
    }

    const winner = PLAYERS.find(p => p.id === winnerId)
    rows.push(csvRow(`"${winner.name} @ ${winner.id}" collected ${pot} from pot`, ts))

    for (const p of PLAYERS) {
      stacks[p.id] = workingStacks[p.id] + (p.id === winnerId ? pot : 0)
    }
  }

  rows.push(csvRow(`-- ending hand #${handNum} --`, ts))
  return { rows, pot }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  const allCsvRows = []
  // Header
  allCsvRows.push('entry,at,order')

  // Reset order counter
  orderCounter = 1

  const stacks = {}
  for (const p of PLAYERS) stacks[p.id] = STARTING_STACK

  let dealerIdx = 0
  const BASE_TIME = new Date('2025-11-15T19:00:00Z').getTime()
  const HAND_DURATION_MS = 90_000  // ~90 seconds per hand

  let heroNet = 0
  let totalPot = 0

  // We collect all rows for all hands, then reverse them (CSV is reverse chronological)
  const handRowSets = []

  for (let h = 1; h <= NUM_HANDS; h++) {
    // Rebuys
    for (const p of PLAYERS) {
      if (stacks[p.id] < REBUY_THRESHOLD) stacks[p.id] = STARTING_STACK
    }

    const startStacks = { ...stacks }
    const baseMs = BASE_TIME + (h - 1) * HAND_DURATION_MS

    const { rows, pot } = simulateHand(h, dealerIdx, stacks, baseMs)

    handRowSets.push(rows)
    totalPot += pot

    // Track hero net
    heroNet += (stacks[HERO_ID] - startStacks[HERO_ID])

    // Advance dealer
    dealerIdx = (dealerIdx + 1) % PLAYERS.length
  }

  // CSV is reverse chronological — write last hand's rows first
  for (let i = handRowSets.length - 1; i >= 0; i--) {
    // Each hand's rows are in chronological order internally;
    // we reverse the hand blocks but keep intra-hand order as-is.
    // The parser sorts by order column ascending, so order values must be monotone.
    // Our orderCounter is already ascending — we just need to output blocks in reverse.
    for (const row of handRowSets[i]) {
      allCsvRows.push(row)
    }
  }

  const csvContent = allCsvRows.join('\n')
  const outPath = join(ROOT, 'public', 'demo.csv')
  mkdirSync(join(ROOT, 'public'), { recursive: true })
  writeFileSync(outPath, csvContent, 'utf8')

  console.log(`Generated ${NUM_HANDS} hands → ${outPath}`)
  console.log(`Average pot size: ${Math.round(totalPot / NUM_HANDS)}`)
  console.log(`Hero (Param) total result: ${heroNet > 0 ? '+' : ''}${heroNet}`)
}

main()
