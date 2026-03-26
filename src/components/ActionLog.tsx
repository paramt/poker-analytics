import type { Hand, Action } from '../types'

type Street = 'preflop' | 'flop' | 'turn' | 'river'

interface Props {
  hand: Hand
  street: Street
}

const STREET_ORDER: Street[] = ['preflop', 'flop', 'turn', 'river']
const STREET_LABELS: Record<Street, string> = {
  preflop: 'Pre-flop',
  flop: 'Flop',
  turn: 'Turn',
  river: 'River',
}

function getStreetActions(hand: Hand, s: Street): Action[] {
  switch (s) {
    case 'preflop': return hand.preflop
    case 'flop': return hand.flop
    case 'turn': return hand.turn
    case 'river': return hand.river
  }
}

function formatAction(action: Action, hand: Hand): string {
  const pos = hand.seatPositions[action.player] ?? hand.players[action.player]?.displayName ?? action.player
  switch (action.type) {
    case 'fold':
      return `${pos} folds`
    case 'check':
      return `${pos} checks`
    case 'call':
      return `${pos} calls ${action.amount ?? ''}`
    case 'bet':
      return `${pos} bets ${action.amount ?? ''}${action.allin ? ' (all-in)' : ''}`
    case 'raise':
      return `${pos} raises to ${action.amount ?? ''}${action.allin ? ' (all-in)' : ''}`
    case 'post_sb':
      return `${pos} posts SB ${action.amount ?? ''}`
    case 'post_bb':
      return `${pos} posts BB ${action.amount ?? ''}`
    case 'collect':
      return `${pos} collects ${action.amount ?? ''}`
    case 'show':
      return `${pos} shows`
    case 'uncalled':
      return `Uncalled bet of ${action.amount ?? ''} returned to ${pos}`
    default:
      return `${pos} ${action.type}`
  }
}

function computePot(hand: Hand, upToStreet: Street): number {
  const streetsToInclude = STREET_ORDER.slice(0, STREET_ORDER.indexOf(upToStreet) + 1)
  let pot = 0
  for (const s of streetsToInclude) {
    const actions: Action[] = getStreetActions(hand, s)
    for (const a of actions) {
      if (['call', 'bet', 'post_sb', 'post_bb'].includes(a.type)) {
        pot += a.amount ?? 0
      } else if (a.type === 'raise') {
        // raise to = total in pot from that player on this street, approximate by amount
        pot += a.amount ?? 0
      } else if (a.type === 'uncalled') {
        pot -= a.amount ?? 0
      }
    }
  }
  return pot
}

export default function ActionLog({ hand, street }: Props) {
  const currentStreetIdx = STREET_ORDER.indexOf(street)
  const visibleStreets = STREET_ORDER.slice(0, currentStreetIdx + 1)

  const pot = computePot(hand, street)

  return (
    <div className="flex flex-col gap-3 h-full">
      <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">Action Log</h3>
      <div className="flex-1 overflow-y-auto flex flex-col gap-4 pr-1">
        {visibleStreets.map((s) => {
          const actions: Action[] = getStreetActions(hand, s)
          if (actions.length === 0 && s !== 'preflop') return null
          return (
            <div key={s}>
              <div className="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-1">
                {STREET_LABELS[s]}
              </div>
              <div className="flex flex-col gap-0.5">
                {actions.length === 0 ? (
                  <span className="text-xs text-gray-500 italic">No actions</span>
                ) : (
                  actions.map((action, i) => {
                    const isHero = action.player === hand.heroId
                    return (
                      <div
                        key={i}
                        className={`text-sm px-2 py-0.5 rounded ${
                          isHero
                            ? 'text-emerald-300 bg-emerald-900/30 font-medium'
                            : 'text-gray-300'
                        }`}
                      >
                        {formatAction(action, hand)}
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          )
        })}
      </div>
      <div className="border-t border-gray-700 pt-2 mt-auto">
        <div className="flex justify-between items-center text-sm">
          <span className="text-gray-400">Pot</span>
          <span className="font-bold text-gray-100">{pot}</span>
        </div>
      </div>
    </div>
  )
}
