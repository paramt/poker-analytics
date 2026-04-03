import { useState, useEffect, useCallback, useMemo } from 'react'
import type { Hand } from '../types'
import { decodeHand } from '../lib/compress'
import PokerTable from './PokerTable'
import ActionLog from './ActionLog'
import ShareButton from './ShareButton'

type Street = 'preflop' | 'flop' | 'turn' | 'river'

interface ActionStep {
  street: Street
  actionIdx: number
  isHeader?: boolean
}

const STREETS: Street[] = ['preflop', 'flop', 'turn', 'river']
const STREET_LABELS: Record<Street, string> = {
  preflop: 'Pre-flop',
  flop: 'Flop',
  turn: 'Turn',
  river: 'River',
}

function suitColor(card: string): string {
  if (card.includes('♥') || card.includes('♦')) return 'text-red-500'
  return 'text-gray-900'
}

function isStreetAvailable(hand: Hand, s: Street): boolean {
  if (s === 'preflop') return true
  if (s === 'flop') return hand.board.length >= 3
  if (s === 'turn') return hand.board.length >= 4
  if (s === 'river') return hand.board.length >= 5
  return false
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
      const hasStreet =
        s === 'flop' ? hand.board.length >= 3
        : s === 'turn' ? hand.board.length >= 4
        : hand.board.length >= 5
      if (hasStreet || actions.length > 0) {
        steps.push({ street: s, actionIdx: -1, isHeader: true })
      }
    }
    actions.forEach((_, idx) => steps.push({ street: s, actionIdx: idx }))
  }
  return steps
}

export default function SharedHandView() {
  const [hand, setHand] = useState<Hand | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [stepIdx, setStepIdx] = useState(0)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const encoded = params.get('hand')
    if (!encoded) {
      setError('No hand data found in this link.')
      return
    }
    const decoded = decodeHand(encoded)
    if (!decoded) {
      setError('This link appears to be broken or expired.')
      return
    }
    setHand(decoded)
  }, [])

  const steps = useMemo(() => (hand ? buildSteps(hand) : []), [hand])
  const totalSteps = steps.length

  const goNext = useCallback(() => setStepIdx(i => Math.min(i + 1, totalSteps)), [totalSteps])
  const goPrev = useCallback(() => setStepIdx(i => Math.max(i - 1, 0)), [])

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'ArrowDown') { e.preventDefault(); goNext() }
      if (e.key === 'ArrowUp') { e.preventDefault(); goPrev() }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [goNext, goPrev])

  const boardStreet: Street = hand
    ? stepIdx < steps.length
      ? steps[stepIdx].street
      : stepIdx > 0
      ? steps[stepIdx - 1].street
      : 'preflop'
    : 'preflop'

  function handleStreetClick(s: Street) {
    const firstIdx = steps.findIndex(step => step.street === s)
    setStepIdx(firstIdx === -1 ? 0 : firstIdx)
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-900 text-gray-100 flex items-center justify-center p-8">
        <div className="max-w-md text-center">
          <div className="text-5xl mb-4">♠</div>
          <h1 className="text-2xl font-bold mb-2 text-red-400">Broken Link</h1>
          <p className="text-gray-400 mb-6">{error}</p>
          <a
            href="/"
            className="inline-block px-6 py-3 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white font-medium transition-colors"
          >
            Upload your own session
          </a>
        </div>
      </div>
    )
  }

  if (!hand) {
    return (
      <div className="min-h-screen bg-gray-900 text-gray-100 flex items-center justify-center">
        <div className="text-gray-400">Loading hand...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-6">
      <div className="max-w-4xl mx-auto flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-gray-100">
              Hand #{hand.id}
              <span className="ml-2 text-sm font-normal text-gray-400">— Shared Replay</span>
            </h1>
            {hand.holeCards.length > 0 && (
              <div className="flex gap-1 items-center">
                {hand.holeCards.map((card: string, i: number) => {
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
          <div className="flex items-center gap-3">
            <ShareButton hand={hand} />
            <a
              href="/"
              className="text-sm text-emerald-400 hover:text-emerald-300 underline transition-colors"
            >
              Upload your own session
            </a>
          </div>
        </div>

        {/* Street navigation */}
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
        <div className="flex flex-col sm:flex-row gap-4 min-h-0">
          {/* Table + controls — hidden on mobile, visible on sm+ */}
          <div className="hidden sm:flex flex-col flex-1 min-w-0 gap-2">
            <PokerTable hand={hand} steps={steps} stepIdx={stepIdx} boardStreet={boardStreet} />

            {/* Step controls */}
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

          {/* Step controls for mobile — shown only when table is hidden */}
          <div className="sm:hidden flex items-center justify-center gap-4">
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

          {/* Action log — full width on mobile, fixed sidebar on sm+ */}
          <div className="flex-1 sm:flex-none sm:w-56 shrink-0 bg-gray-800 rounded-xl p-4">
            <ActionLog hand={hand} steps={steps} stepIdx={stepIdx} onStepChange={setStepIdx} />
          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-sm text-gray-500">
          Shared via Poker Analytics &mdash;{' '}
          <a href="/" className="text-emerald-400 hover:text-emerald-300 underline">
            Analyze your own hands
          </a>
        </div>
      </div>
    </div>
  )
}
