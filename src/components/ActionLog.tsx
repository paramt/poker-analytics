import { useEffect, useRef } from 'react'
import type { Hand, Action } from '../types'

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
  onStepChange: (idx: number) => void
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

const ACTION_LABEL: Record<string, string> = {
  fold: 'Fold',
  check: 'Check',
  call: 'Call',
  bet: 'Bet',
  raise: 'Raise',
  post_sb: 'Post SB',
  post_bb: 'Post BB',
  collect: 'Collect',
  show: 'Shows',
  uncalled: 'Uncalled',
}

const ACTION_COLOR: Record<string, string> = {
  fold: 'text-red-400',
  check: 'text-gray-400',
  call: 'text-blue-400',
  bet: 'text-amber-400',
  raise: 'text-orange-400',
  post_sb: 'text-gray-500',
  post_bb: 'text-gray-500',
  collect: 'text-emerald-400',
  show: 'text-purple-400',
  uncalled: 'text-gray-500',
}

function ActionRow({
  action,
  hand,
  isFuture,
  isHero,
}: {
  action: Action
  hand: Hand
  isFuture: boolean
  isHero: boolean
}) {
  const pos = hand.seatPositions[action.player] ?? hand.players[action.player]?.displayName ?? action.player
  const label = ACTION_LABEL[action.type] ?? action.type
  const hasAmount = action.amount != null &&
    ['call', 'bet', 'raise', 'post_sb', 'post_bb', 'collect', 'uncalled'].includes(action.type)

  if (isFuture) {
    return (
      <div className="flex items-baseline gap-1.5">
        <span className="text-[10px] font-bold text-gray-600 shrink-0">{pos}</span>
        <span className="text-xs text-gray-600">{label}{hasAmount ? `: ${action.amount}` : ''}</span>
      </div>
    )
  }

  return (
    <div className="flex items-baseline gap-1.5">
      <span className={`text-[10px] font-bold shrink-0 ${isHero ? 'text-emerald-400' : 'text-gray-400'}`}>
        {pos}
      </span>
      <span className={`text-xs font-semibold ${ACTION_COLOR[action.type] ?? 'text-gray-400'}`}>
        {label}{hasAmount ? ':' : ''}
      </span>
      {hasAmount && <span className="text-xs text-gray-200">{action.amount}</span>}
      {action.allin && (
        <span className="text-[9px] font-bold text-red-400 uppercase">all-in</span>
      )}
    </div>
  )
}

// Compute pot + current street bets based on actions revealed up to stepIdx.
// PokerNow amounts are total street commitment, not incremental — we track
// per-player deltas to avoid double-counting raises.
// Returns pot (completed streets) + currentBets (active street), summed for display.
function computePot(hand: Hand, steps: ActionStep[], stepIdx: number): number {
  // Derive the current board street from the last revealed step
  const boardStreet: Street =
    stepIdx > 0 ? steps[stepIdx - 1].street : (steps[stepIdx]?.street ?? 'preflop')
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
        pot += delta
      } else {
        currentBets.set(action.player, action.amount ?? 0)
      }
    } else if (action.type === 'uncalled') {
      const amt = action.amount ?? 0
      if (stepStreetIdx < boardStreetIdx) {
        pot -= amt
      } else {
        const cur = currentBets.get(action.player) ?? 0
        const newBet = Math.max(0, cur - amt)
        if (newBet === 0) currentBets.delete(action.player)
        else currentBets.set(action.player, newBet)
      }
    } else if (action.type === 'collect') {
      if (stepStreetIdx >= boardStreetIdx) {
        for (const v of currentBets.values()) pot += v
        currentBets.clear()
        streetCommitted.clear()
      }
    }
  }

  // Sum completed-street pot with active bets for the footer display
  let total = pot
  for (const v of currentBets.values()) total += v
  return total
}

export default function ActionLog({ hand, steps, stepIdx, onStepChange }: Props) {
  const highlightRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    highlightRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [stepIdx])

  const pot = computePot(hand, steps, stepIdx)

  return (
    <div className="flex flex-col gap-3 h-full">
      <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">Action Log</h3>
      <div className="flex-1 overflow-y-auto flex flex-col gap-1 pr-1">
        {/* Preflop has no header step — render a static label when there are preflop actions */}
        {hand.preflop.length > 0 && (
          <div className="text-xs font-semibold uppercase tracking-wider px-2 pb-0.5 text-emerald-400">
            Pre-flop
          </div>
        )}

        {steps.map((step, globalIdx) => {
          if (step.isHeader) {
            const isCurrent = globalIdx === stepIdx - 1
            const isFuture = globalIdx >= stepIdx
            return (
              <div
                key={`header-${step.street}`}
                ref={isCurrent ? highlightRef : null}
                onClick={() => onStepChange(globalIdx + 1)}
                className={`px-2 py-1.5 rounded transition-colors cursor-pointer mt-1 ${
                  isCurrent
                    ? 'bg-emerald-700/60 ring-1 ring-emerald-400'
                    : isFuture
                    ? 'hover:bg-gray-700/20'
                    : 'hover:bg-gray-700/50'
                }`}
              >
                <span className={`text-xs font-semibold uppercase tracking-wider ${
                  isFuture ? 'text-gray-600' : 'text-emerald-400'
                }`}>
                  {STREET_LABELS[step.street]}
                </span>
              </div>
            )
          }

          const action = getStreetActions(hand, step.street)[step.actionIdx]
          if (!action) return null
          const isCurrent = globalIdx === stepIdx - 1
          const isFuture = globalIdx >= stepIdx
          const isHero = action.player === hand.heroId
          return (
            <div
              key={`${step.street}-${step.actionIdx}`}
              ref={isCurrent ? highlightRef : null}
              onClick={() => onStepChange(globalIdx + 1)}
              className={`px-2 py-1 rounded transition-colors cursor-pointer ${
                isCurrent
                  ? 'bg-emerald-700/60 ring-1 ring-emerald-400'
                  : isFuture
                  ? 'hover:bg-gray-700/20'
                  : isHero
                  ? 'bg-emerald-900/20 hover:bg-emerald-900/40'
                  : 'hover:bg-gray-700/50'
              }`}
            >
              <ActionRow action={action} hand={hand} isFuture={isFuture} isHero={isHero} />
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
