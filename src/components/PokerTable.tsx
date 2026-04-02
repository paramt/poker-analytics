import React, { useEffect, useRef, useState } from 'react'
import type { Hand } from '../types'
import { bestHandDescription } from '../lib/handEval'
import EquityWorker from '../lib/equity.worker?worker'

type Street = 'preflop' | 'flop' | 'turn' | 'river'

interface ActionStep {
  street: Street
  actionIdx: number
  isHeader?: boolean
}

interface Props {
  hand: Hand
  steps: ActionStep[]
  stepIdx: number
  boardStreet: Street
}

function suitColor(card: string): string {
  if (card.includes('♥') || card.includes('♦')) return 'text-red-500'
  // Clubs (♣) and Spades (♠) are black suits — use dark text on the light card background
  return 'text-gray-900'
}

function CardDisplay({ card, small = false }: { card: string; small?: boolean }) {
  const parts = card.match(/^(\d+|[AKQJ])(.)$/)
  const rank = parts ? parts[1] : card
  const suit = parts ? parts[2] : ''
  const color = suitColor(card)
  return (
    <span
      className={`inline-flex flex-col items-center justify-center bg-gray-100 text-gray-900 rounded font-bold border border-gray-300 ${
        small ? 'px-1 h-8 text-xs' : 'px-1.5 h-10 text-sm'
      }`}
    >
      <span className={`leading-none whitespace-nowrap ${color} font-bold`}>{rank}{suit}</span>
    </span>
  )
}

function getFullBoard2(board: string[], board2: string[]): string[] {
  const sharedCount = Math.max(0, board.length - board2.length)
  return [...board.slice(0, sharedCount), ...board2]
}

function getVisibleBoardCards(board: string[], street: Street): string[] {
  switch (street) {
    case 'preflop': return []
    case 'flop': return board.slice(0, 3)
    case 'turn': return board.slice(0, 4)
    case 'river': return board.slice(0, 5)
  }
}

function getStreetActions(hand: Hand, s: Street) {
  switch (s) {
    case 'preflop': return hand.preflop
    case 'flop': return hand.flop
    case 'turn': return hand.turn
    case 'river': return hand.river
  }
}

// Returns the set of players who have folded up to (but not including) the current step
function getFoldedPlayers(hand: Hand, steps: ActionStep[], stepIdx: number): Set<string> {
  const folded = new Set<string>()
  for (let i = 0; i < stepIdx; i++) {
    const { street, actionIdx } = steps[i]
    const action = getStreetActions(hand, street)[actionIdx]
    if (action?.type === 'fold') folded.add(action.player)
  }
  return folded
}

// Returns [x, y] as percentage of container [0..100]
function seatPosition(index: number, total: number): [number, number] {
  // Distribute seats evenly starting from bottom-center (270 degrees)
  const angleDeg = 270 + (index * 360) / total
  const angleRad = (angleDeg * Math.PI) / 180
  // Oval: rx=40%, ry=35%, center at (50%, 50%)
  const rx = 40
  const ry = 35
  const x = 50 + rx * Math.cos(angleRad)
  const y = 50 + ry * Math.sin(angleRad)
  return [x, y]
}

const STREET_ORDER: Street[] = ['preflop', 'flop', 'turn', 'river']

// Compute a player's stack after all actions revealed up to stepIdx.
// Starts from initial stack and subtracts money committed, adds back uncalled bets and collects.
function computeStackUpToStep(
  hand: Hand,
  shortId: string,
  steps: ActionStep[],
  stepIdx: number,
): number {
  let stack = hand.players[shortId].stack
  if (stepIdx === 0) return stack

  const lastStep = steps[stepIdx - 1]
  const lastStreetIdx = STREET_ORDER.indexOf(lastStep.street)

  for (let si = 0; si <= lastStreetIdx; si++) {
    const s = STREET_ORDER[si]
    const actions = getStreetActions(hand, s)
    // For streets before last: process all actions; for last street: process up to lastStep.actionIdx (inclusive)
    const limit = si < lastStreetIdx ? actions.length : lastStep.actionIdx + 1
    let streetCommitted = 0
    for (let ai = 0; ai < Math.min(limit, actions.length); ai++) {
      const action = actions[ai]
      if (action.player !== shortId) continue
      const amt = action.amount ?? 0
      if (
        action.type === 'call' ||
        action.type === 'bet' ||
        action.type === 'raise' ||
        action.type === 'post_sb' ||
        action.type === 'post_bb'
      ) {
        // amt is total street commitment; only deduct the delta above what's already been committed
        const delta = Math.max(0, amt - streetCommitted)
        stack -= delta
        streetCommitted = amt
      } else if (action.type === 'uncalled') {
        stack += amt
      } else if (action.type === 'collect') {
        stack += amt
      }
    }
  }
  return stack
}

function computePotAndBets(
  hand: Hand,
  steps: ActionStep[],
  stepIdx: number,
  boardStreet: Street,
): { pot: number; currentBets: Map<string, number> } {
  const boardStreetIdx = STREET_ORDER.indexOf(boardStreet)
  let pot = 0
  const currentBets = new Map<string, number>()
  let trackedStreet: Street | null = null
  const streetCommitted = new Map<string, number>()

  for (let i = 0; i < stepIdx; i++) {
    const { street, actionIdx } = steps[i]
    const action = getStreetActions(hand, street)[actionIdx]
    if (!action) continue

    const stepStreetIdx = STREET_ORDER.indexOf(street)

    if (street !== trackedStreet) {
      trackedStreet = street
      streetCommitted.clear()
    }

    if (['call', 'bet', 'raise', 'post_sb', 'post_bb'].includes(action.type)) {
      const committed = streetCommitted.get(action.player) ?? 0
      const delta = Math.max(0, (action.amount ?? 0) - committed)
      streetCommitted.set(action.player, action.amount ?? 0)

      if (stepStreetIdx < boardStreetIdx) {
        // Past street: chips already swept into pot
        pot += delta
      } else {
        // Current street: show in front of player
        currentBets.set(action.player, action.amount ?? 0)
      }
    } else if (action.type === 'uncalled') {
      const amt = action.amount ?? 0
      if (stepStreetIdx < boardStreetIdx) {
        pot -= amt
      } else {
        // Reduce this player's current bet
        const cur = currentBets.get(action.player) ?? 0
        const newBet = Math.max(0, cur - amt)
        if (newBet === 0) currentBets.delete(action.player)
        else currentBets.set(action.player, newBet)
      }
    } else if (action.type === 'collect') {
      // Sweep all current bets into pot (showdown/end of hand)
      if (stepStreetIdx >= boardStreetIdx) {
        for (const v of currentBets.values()) pot += v
        currentBets.clear()
        streetCommitted.clear()
      }
    }
  }

  return { pot, currentBets }
}

function betChipPosition(seatX: number, seatY: number): [number, number] {
  // 45% toward center from seat
  const cx = 50
  const cy = 50
  const x = seatX + (cx - seatX) * 0.45
  const y = seatY + (cy - seatY) * 0.45
  return [x, y]
}

// Returns all cards shown by a player anywhere in the hand log.
// Villain hands are shown whenever they exist in the log — since this is a
// hand history review, all showdown cards are always visible.
function getShownCards(hand: Hand, shortId: string): string[] {
  for (const s of STREET_ORDER) {
    for (const action of getStreetActions(hand, s)) {
      if (action.type === 'show' && action.player === shortId && action.cards?.length) {
        return action.cards
      }
    }
  }
  return []
}

export default function PokerTable({ hand, steps, stepIdx, boardStreet }: Props) {
  const [flashPlayer, setFlashPlayer] = useState<string | null>(null)
  const flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [equity, setEquity] = useState<{ win: number; tie: number; lose: number } | null>(null)
  const workerRef = useRef<Worker | null>(null)
  const reqIdRef = useRef(0)

  useEffect(() => {
    const worker = new EquityWorker()
    workerRef.current = worker
    return () => worker.terminate()
  }, [])

  useEffect(() => {
    clearTimeout(flashTimer.current)
    if (stepIdx === 0) { setFlashPlayer(null); return }
    const { street, actionIdx } = steps[stepIdx - 1]
    const action = getStreetActions(hand, street)[actionIdx]
    if (action?.player) {
      setFlashPlayer(action.player)
      flashTimer.current = setTimeout(() => setFlashPlayer(null), 700)
    }
    return () => clearTimeout(flashTimer.current)
  }, [stepIdx])

  const players = Object.entries(hand.players) // [shortId, { displayName, seat, stack }]
  // Sort by seat number for consistent ordering
  const sortedPlayers = [...players].sort((a, b) => a[1].seat - b[1].seat)

  // Find hero index among sorted players to anchor at bottom
  const heroIdx = sortedPlayers.findIndex(([id]) => id === hand.heroId)
  // Rotate array so hero is at index 0 (bottom)
  const rotated =
    heroIdx >= 0
      ? [...sortedPlayers.slice(heroIdx), ...sortedPlayers.slice(0, heroIdx)]
      : sortedPlayers

  const foldedPlayers = getFoldedPlayers(hand, steps, stepIdx)
  const boardCards = getVisibleBoardCards(hand.board, boardStreet)
  const fullBoard2 = hand.board2 && hand.board2.length > 0
    ? getFullBoard2(hand.board, hand.board2)
    : null
  const boardCards2 = fullBoard2 ? getVisibleBoardCards(fullBoard2, boardStreet) : []
  const showDualBoard = boardCards2.length > 0 && boardCards2.join('') !== boardCards.join('')
  const { pot, currentBets } = computePotAndBets(hand, steps, stepIdx, boardStreet)

  const villainCardsList = rotated
    .filter(([shortId]) => shortId !== hand.heroId)
    .map(([shortId]) => getShownCards(hand, shortId))
    .filter(cards => cards.length >= 2)

  // Post equity calculation to worker when board/cards change.
  // Keyed so we don't recalculate while stepping through actions within the same street.
  const equityKey = boardCards.join(',') + '|' + hand.holeCards.join(',') + '|' + villainCardsList.map(v => v.join(',')).join(';')
  useEffect(() => {
    const worker = workerRef.current
    if (!worker || hand.holeCards.length < 2 || villainCardsList.length === 0 || boardCards.length < 3) {
      setEquity(null)
      return
    }
    const reqId = ++reqIdRef.current
    worker.onmessage = (e: MessageEvent) => {
      if (e.data.reqId === reqId) setEquity(e.data.result)
    }
    worker.postMessage({ reqId, heroCards: hand.holeCards, villainCards: villainCardsList, boardCards })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equityKey])

  return (
    <div className="relative w-full" style={{ paddingBottom: '60%' }}>
      {/* Table felt */}
      <div
        className="absolute inset-0 rounded-[50%] border-4 border-yellow-800"
        style={{ background: 'radial-gradient(ellipse at center, #2d5a27 60%, #1a3a18 100%)' }}
      >
        {/* Board cards + pot in center */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5">
          <div className="flex flex-col items-center gap-1">
            {showDualBoard ? (
              <>
                <div className="flex items-center gap-1">
                  <span className="text-[9px] text-green-400 font-bold w-2 text-right">1</span>
                  {boardCards.map((card, i) => <CardDisplay key={i} card={card} />)}
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[9px] text-green-400 font-bold w-2 text-right">2</span>
                  {boardCards2.map((card, i) => <CardDisplay key={i} card={card} />)}
                </div>
              </>
            ) : boardCards.length === 0 ? (
              <span className="text-green-700 text-sm font-medium opacity-60 select-none">
                Waiting for board
              </span>
            ) : (
              <div className="flex items-center gap-1.5">
                {boardCards.map((card, i) => <CardDisplay key={i} card={card} />)}
              </div>
            )}
          </div>
          {pot > 0 && (
            <div className="bg-black/30 rounded-full px-3 py-0.5 text-xs font-bold text-yellow-300 tracking-wide">
              Pot: {pot}
            </div>
          )}
          {equity && (
            <div className="bg-black/30 rounded-full px-3 py-0.5 text-xs font-bold tracking-wide">
              <span className="text-emerald-400">{equity.win.toFixed(0)}%</span>
              {equity.tie > 0.5 && <span className="text-gray-400"> · {equity.tie.toFixed(0)}% tie</span>}
            </div>
          )}
        </div>
      </div>

      {/* Seats */}
      {rotated.map(([shortId, info], i) => {
        const [x, y] = seatPosition(i, rotated.length)
        const [betX, betY] = betChipPosition(x, y)
        const isHero = shortId === hand.heroId
        const isFolded = foldedPlayers.has(shortId)
        const isFlashing = flashPlayer === shortId
        const pos = hand.seatPositions[shortId]
        const currentStack = computeStackUpToStep(hand, shortId, steps, stepIdx)
        const visibleCards = isHero ? hand.holeCards : getShownCards(hand, shortId)
        const handDesc = visibleCards.length > 0 ? bestHandDescription(visibleCards, boardCards) : null
        const betAmount = currentBets.get(shortId) ?? 0

        return (
          <React.Fragment key={shortId}>
            <div
              className="absolute"
              style={{
                left: `${x}%`,
                top: `${y}%`,
                transform: 'translate(-50%, -50%)',
                zIndex: 10,
              }}
            >
              <div
                className={`flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg text-xs border transition-all duration-300 ${
                  isFolded ? 'opacity-40' : 'opacity-100'
                } ${
                  isHero
                    ? 'bg-emerald-700 border-emerald-400 text-white shadow-lg shadow-emerald-900'
                    : 'bg-gray-800 border-gray-600 text-gray-100'
                } ${
                  isFlashing ? 'ring-2 ring-yellow-300 shadow-yellow-400/40 shadow-lg' : ''
                }`}
              >
                <div className="flex items-center gap-1">
                  {pos && (
                    <span
                      className={`font-bold text-[10px] px-1 rounded ${
                        isHero ? 'bg-emerald-500 text-white' : 'bg-gray-700 text-emerald-400'
                      }`}
                    >
                      {pos}
                    </span>
                  )}
                  <span className="font-medium truncate max-w-[70px]">{info.displayName}</span>
                </div>
                <div className="text-gray-300 text-[10px]">{currentStack}</div>
                {visibleCards.length > 0 && (
                  <div className="flex flex-col items-center gap-0.5 mt-0.5">
                    <div className="flex gap-0.5">
                      {visibleCards.map((card, ci) => (
                        <CardDisplay key={ci} card={card} small />
                      ))}
                    </div>
                    {handDesc && (
                      <span className={`text-[10px] font-medium ${isHero ? 'text-emerald-200' : 'text-yellow-300'}`}>
                        {handDesc}
                      </span>
                    )}
                  </div>
                )}
                {isFolded && (
                  <span className="text-[10px] text-gray-400 italic">folded</span>
                )}
              </div>
            </div>
            {betAmount > 0 && (
              <div
                className="absolute"
                style={{
                  left: `${betX}%`,
                  top: `${betY}%`,
                  transform: 'translate(-50%, -50%)',
                  zIndex: 9,
                }}
              >
                <div className="bg-yellow-400 text-gray-900 text-[10px] font-bold rounded-full w-8 h-8 flex items-center justify-center shadow-lg border-2 border-yellow-600">
                  {betAmount}
                </div>
              </div>
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}
