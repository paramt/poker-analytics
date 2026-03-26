import type { Hand } from '../types'
import { bestHandDescription } from '../lib/handEval'

type Street = 'preflop' | 'flop' | 'turn' | 'river'

interface Props {
  hand: Hand
  street: Street
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
        small ? 'w-6 h-8 text-xs' : 'w-8 h-10 text-sm'
      }`}
    >
      <span className={`leading-none ${color} font-bold`}>{rank}</span>
      <span className={`leading-none ${color}`}>{suit}</span>
    </span>
  )
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

function getFoldedPlayers(hand: Hand, street: Street): Set<string> {
  const streetOrder: Street[] = ['preflop', 'flop', 'turn', 'river']
  const cutIdx = streetOrder.indexOf(street)
  const streetsToCheck = streetOrder.slice(0, cutIdx + 1)
  const folded = new Set<string>()
  for (const s of streetsToCheck) {
    for (const action of getStreetActions(hand, s)) {
      if (action.type === 'fold') folded.add(action.player)
    }
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

// Compute a player's stack after all actions through the given street.
// Starts from initial stack and subtracts money committed, adds back uncalled bets and collects.
function computeStackAfterStreet(
  hand: Hand,
  shortId: string,
  upToStreet: Street,
): number {
  let stack = hand.players[shortId].stack
  const streetsToProcess = STREET_ORDER.slice(0, STREET_ORDER.indexOf(upToStreet) + 1)
  for (const s of streetsToProcess) {
    let streetCommitted = 0 // reset each street
    for (const action of getStreetActions(hand, s)) {
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

function getShownCards(hand: Hand, shortId: string): string[] {
  const allStreets = [hand.preflop, hand.flop, hand.turn, hand.river]
  for (const actions of allStreets) {
    for (const action of actions) {
      if (action.type === 'show' && action.player === shortId && action.cards?.length) {
        return action.cards
      }
    }
  }
  return []
}

export default function PokerTable({ hand, street }: Props) {
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

  const foldedPlayers = getFoldedPlayers(hand, street)
  const boardCards = getVisibleBoardCards(hand.board, street)

  return (
    <div className="relative w-full" style={{ paddingBottom: '60%' }}>
      {/* Table felt */}
      <div
        className="absolute inset-0 rounded-[50%] border-4 border-yellow-800"
        style={{ background: 'radial-gradient(ellipse at center, #2d5a27 60%, #1a3a18 100%)' }}
      >
        {/* Board cards in center */}
        <div className="absolute inset-0 flex items-center justify-center gap-1.5">
          {boardCards.length === 0 ? (
            <span className="text-green-700 text-sm font-medium opacity-60 select-none">
              Waiting for board
            </span>
          ) : (
            boardCards.map((card, i) => <CardDisplay key={i} card={card} />)
          )}
        </div>
      </div>

      {/* Seats */}
      {rotated.map(([shortId, info], i) => {
        const [x, y] = seatPosition(i, rotated.length)
        const isHero = shortId === hand.heroId
        const isFolded = foldedPlayers.has(shortId)
        const pos = hand.seatPositions[shortId]
        const currentStack = computeStackAfterStreet(hand, shortId, street)
        const visibleCards = isHero ? hand.holeCards : getShownCards(hand, shortId)
        const handDesc = visibleCards.length > 0 ? bestHandDescription(visibleCards, boardCards) : null

        return (
          <div
            key={shortId}
            className="absolute"
            style={{
              left: `${x}%`,
              top: `${y}%`,
              transform: 'translate(-50%, -50%)',
              zIndex: 10,
            }}
          >
            <div
              className={`flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg text-xs border transition-opacity ${
                isFolded ? 'opacity-40' : 'opacity-100'
              } ${
                isHero
                  ? 'bg-emerald-700 border-emerald-400 text-white shadow-lg shadow-emerald-900'
                  : 'bg-gray-800 border-gray-600 text-gray-100'
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
        )
      })}
    </div>
  )
}
