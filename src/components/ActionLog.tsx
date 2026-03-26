import { useEffect, useRef } from 'react'
import type { Hand, Action } from '../types'

type Street = 'preflop' | 'flop' | 'turn' | 'river'

interface ActionStep {
  street: Street
  actionIdx: number
}

interface Props {
  hand: Hand
  steps: ActionStep[]
  stepIdx: number
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

// Compute pot based on actions revealed up to stepIdx
function computePot(hand: Hand, steps: ActionStep[], stepIdx: number): number {
  let pot = 0
  for (let i = 0; i < stepIdx; i++) {
    const { street, actionIdx } = steps[i]
    const action = getStreetActions(hand, street)[actionIdx]
    if (!action) continue
    if (['call', 'bet', 'post_sb', 'post_bb', 'raise'].includes(action.type)) {
      pot += action.amount ?? 0
    } else if (action.type === 'uncalled') {
      pot -= action.amount ?? 0
    }
  }
  return pot
}

export default function ActionLog({ hand, steps, stepIdx }: Props) {
  const highlightRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    highlightRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [stepIdx])

  const lastStep = stepIdx > 0 ? steps[stepIdx - 1] : null
  const lastStreetIdx = lastStep ? STREET_ORDER.indexOf(lastStep.street) : -1

  const pot = computePot(hand, steps, stepIdx)

  return (
    <div className="flex flex-col gap-3 h-full">
      <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">Action Log</h3>
      {stepIdx === 0 ? (
        <div className="flex-1 flex items-center justify-center text-xs text-gray-600 italic">
          Press → to start
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto flex flex-col gap-4 pr-1">
          {STREET_ORDER.map((s, si) => {
            // Streets after the last revealed street: show nothing
            if (si > lastStreetIdx) return null

            const actions = getStreetActions(hand, s)
            // For streets before the last: show all actions
            // For the last street: show up to lastStep.actionIdx (inclusive)
            const count = si < lastStreetIdx ? actions.length : (lastStep?.actionIdx ?? -1) + 1
            const shown = actions.slice(0, count)

            if (shown.length === 0) return null

            return (
              <div key={s}>
                <div className="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-1">
                  {STREET_LABELS[s]}
                </div>
                <div className="flex flex-col gap-0.5">
                  {shown.map((action, i) => {
                    const isHero = action.player === hand.heroId
                    const isCurrent = lastStep?.street === s && lastStep.actionIdx === i
                    return (
                      <div
                        key={i}
                        ref={isCurrent ? highlightRef : null}
                        className={`text-sm px-2 py-0.5 rounded transition-colors ${
                          isCurrent
                            ? 'bg-emerald-700/60 ring-1 ring-emerald-400 text-emerald-100 font-semibold'
                            : isHero
                            ? 'text-emerald-300 bg-emerald-900/30 font-medium'
                            : 'text-gray-300'
                        }`}
                      >
                        {formatAction(action, hand)}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
      <div className="border-t border-gray-700 pt-2 mt-auto">
        <div className="flex justify-between items-center text-sm">
          <span className="text-gray-400">Pot</span>
          <span className="font-bold text-gray-100">{pot}</span>
        </div>
      </div>
    </div>
  )
}
