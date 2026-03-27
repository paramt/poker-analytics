import { useCallback, useEffect, useMemo, useState } from 'react'
import { useStore } from '../store'
import type { Hand } from '../types'
import PokerTable from './PokerTable'
import ActionLog from './ActionLog'
import ShareButton from './ShareButton'

type Street = 'preflop' | 'flop' | 'turn' | 'river'

const STREETS: Street[] = ['preflop', 'flop', 'turn', 'river']
const STREET_LABELS: Record<Street, string> = {
  preflop: 'Pre-flop',
  flop: 'Flop',
  turn: 'Turn',
  river: 'River',
}

interface ActionStep {
  street: Street
  actionIdx: number
  isHeader?: boolean
}

function getStreetActions(hand: Hand, s: Street) {
  switch (s) {
    case 'preflop': return hand.preflop
    case 'flop': return hand.flop
    case 'turn': return hand.turn
    case 'river': return hand.river
  }
}

function buildSteps(hand: Hand): ActionStep[] {
  const steps: ActionStep[] = []
  for (const s of STREETS) {
    const actions = getStreetActions(hand, s)
    if (s !== 'preflop') {
      // Add a header step for this street if the board has reached it or it has actions
      const hasStreet =
        s === 'flop' ? hand.board.length >= 3
        : s === 'turn' ? hand.board.length >= 4
        : hand.board.length >= 5
      if (hasStreet || actions.length > 0) {
        steps.push({ street: s, actionIdx: -1, isHeader: true })
      }
    }
    for (let i = 0; i < actions.length; i++) {
      steps.push({ street: s, actionIdx: i })
    }
  }
  return steps
}

function isStreetAvailable(hand: Hand, s: Street): boolean {
  if (s === 'preflop') return true
  if (s === 'flop') return hand.board.length >= 3
  if (s === 'turn') return hand.board.length >= 4
  if (s === 'river') return hand.board.length >= 5
  return false
}

function suitColor(card: string): string {
  if (card.includes('♥') || card.includes('♦')) return 'text-red-500'
  // Clubs (♣) and Spades (♠) are black suits — use dark text on the light card background
  return 'text-gray-900'
}

const TAG_COLORS: Record<string, string> = {
  learning: 'bg-amber-600 text-amber-100',
  hero: 'bg-blue-600 text-blue-100',
  laydown: 'bg-purple-600 text-purple-100',
  bigpot: 'bg-orange-600 text-orange-100',
}

interface Props {
  hand: Hand
  hideBack?: boolean
}

export default function HandReplayer({ hand, hideBack = false }: Props) {
  const { flaggedHands } = useStore()
  const flaggedData = flaggedHands.find((f) => f.handId === hand.id)

  const steps = useMemo(() => buildSteps(hand), [hand])
  const totalSteps = steps.length

  const [stepIdx, setStepIdx] = useState(0)

  // Reset to start whenever the hand changes
  useEffect(() => { setStepIdx(0) }, [hand.id])

  const goNext = useCallback(() => setStepIdx(i => Math.min(i + 1, totalSteps)), [totalSteps])
  const goPrev = useCallback(() => setStepIdx(i => Math.max(i - 1, 0)), [])

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      // Don't intercept arrow keys when user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'ArrowRight') goNext()
      if (e.key === 'ArrowLeft') goPrev()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [goNext, goPrev])

  // Board street: derived from the last revealed step so the board appears
  // exactly when we land on the street's header step.
  const boardStreet: Street = stepIdx > 0 ? steps[stepIdx - 1].street : 'preflop'

  function handleStreetClick(s: Street) {
    if (s === 'preflop') {
      // Preflop has no header step — jump to before the first preflop action
      const firstIdx = steps.findIndex(step => step.street === 'preflop')
      setStepIdx(firstIdx >= 0 ? firstIdx : 0)
    } else {
      // Jump to just after the header step so the board is visible and header is highlighted
      const headerIdx = steps.findIndex(step => step.street === s && step.isHeader)
      if (headerIdx >= 0) setStepIdx(headerIdx + 1)
    }
  }

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          {!hideBack && (
            <button
              onClick={() => window.history.back()}
              className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-100 transition-colors"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              Back
            </button>
          )}
          <h2 className="text-lg font-bold text-gray-100">
            Hand #{hand.id}
          </h2>
          {hand.holeCards.length > 0 && (
            <div className="flex gap-1 items-center">
              {hand.holeCards.map((card, i) => {
                const parts = card.match(/^(\d+|[AKQJ])(.*)$/)
                const rank = parts ? parts[1] : card
                const suit = parts ? parts[2] : ''
                return (
                  <span
                    key={i}
                    className="inline-flex flex-col items-center bg-gray-100 text-gray-900 rounded px-1.5 py-0.5 text-sm font-bold border border-gray-300"
                  >
                    <span className={suitColor(card)}>{rank}{suit}</span>
                  </span>
                )
              })}
            </div>
          )}
        </div>
        <ShareButton hand={hand} />
      </div>

      {/* AI Feedback */}
      {flaggedData && (
        <div className="flex items-start gap-3 p-3 rounded-lg bg-gray-800 border border-gray-700">
          <span
            className={`text-xs font-bold px-2 py-1 rounded uppercase tracking-wide shrink-0 ${
              TAG_COLORS[flaggedData.tag] ?? 'bg-gray-600 text-gray-100'
            }`}
          >
            {flaggedData.tag}
          </span>
          <p className="text-sm text-gray-300">{flaggedData.summary}</p>
        </div>
      )}

      {/* Street tabs */}
      <div className="flex gap-1 bg-gray-800 rounded-lg p-1">
        {STREETS.map((s) => {
          const available = isStreetAvailable(hand, s)
          const active = boardStreet === s
          return (
            <button
              key={s}
              disabled={!available}
              onClick={() => handleStreetClick(s)}
              className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-colors ${
                active
                  ? 'bg-emerald-700 text-white'
                  : available
                  ? 'text-gray-300 hover:bg-gray-700'
                  : 'text-gray-600 cursor-not-allowed'
              }`}
            >
              {STREET_LABELS[s]}
            </button>
          )
        })}
      </div>

      {/* Main content */}
      <div className="flex gap-4 flex-1 min-h-0">
        <div className="flex flex-col flex-1 min-w-0 gap-2">
          <PokerTable hand={hand} steps={steps} stepIdx={stepIdx} boardStreet={boardStreet} />

          {/* Step controls below the table */}
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={goPrev}
              disabled={stepIdx === 0}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-800 border border-gray-700 text-gray-300 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              Prev
            </button>
            <span className="text-xs text-gray-500 w-20 text-center">
              {stepIdx === 0 ? 'Start' : stepIdx === totalSteps ? 'End' : `${stepIdx} / ${totalSteps}`}
            </span>
            <button
              onClick={goNext}
              disabled={stepIdx === totalSteps}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-800 border border-gray-700 text-gray-300 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>

        {/* Action log sidebar */}
        <div className="w-56 shrink-0 bg-gray-800 rounded-xl p-4 overflow-y-auto">
          <ActionLog hand={hand} steps={steps} stepIdx={stepIdx} onStepChange={setStepIdx} />
        </div>
      </div>
    </div>
  )
}
