import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation } from 'wouter'
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
  run2?: boolean  // true for second-run header steps in run-it-twice
}

function getStreetActions(hand: Hand, s: Street) {
  switch (s) {
    case 'preflop': return hand.preflop
    case 'flop': return hand.flop
    case 'turn': return hand.turn
    case 'river': return hand.river
  }
}

const TERMINAL_TYPES = new Set(['collect', 'show', 'uncalled'])

function buildSteps(hand: Hand): ActionStep[] {
  const isRunItTwice = !!(hand.board2 && hand.board2.length > 0)
  const steps: ActionStep[] = []
  const deferred: ActionStep[] = []  // collect/show/uncalled held until after run-2 boards

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
      const step: ActionStep = { street: s, actionIdx: i }
      // For run-it-twice, defer terminal actions until after both boards are shown
      if (isRunItTwice && TERMINAL_TYPES.has(actions[i].type)) {
        deferred.push(step)
      } else {
        steps.push(step)
      }
    }
  }

  // Run-it-twice: append second-run header steps, then deferred terminal actions
  if (isRunItTwice) {
    const sharedCount = Math.max(0, hand.board.length - hand.board2!.length)
    const full2 = [...hand.board.slice(0, sharedCount), ...hand.board2!]
    if (full2.length >= 3 && hand.board.length >= 3 && full2.slice(0, 3).join('') !== hand.board.slice(0, 3).join(''))
      steps.push({ street: 'flop', actionIdx: -1, isHeader: true, run2: true })
    if (full2.length >= 4 && hand.board.length >= 4 && full2[3] !== hand.board[3])
      steps.push({ street: 'turn', actionIdx: -1, isHeader: true, run2: true })
    if (full2.length >= 5 && hand.board.length >= 5 && full2[4] !== hand.board[4])
      steps.push({ street: 'river', actionIdx: -1, isHeader: true, run2: true })
    steps.push(...deferred)
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
  laydown: 'bg-emerald-600 text-emerald-100',
  bigpot: 'bg-orange-600 text-orange-100',
  rare: 'bg-purple-600 text-purple-100',
}

interface Props {
  hand: Hand
  hideBack?: boolean
  backHref?: string
  prevHandId?: string
  nextHandId?: string
}

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia('(min-width: 640px)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 640px)')
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return isDesktop
}

export default function HandReplayer({ hand, hideBack = false, backHref, prevHandId, nextHandId }: Props) {
  const [, navigate] = useLocation()
  const { flaggedHands } = useStore()
  const handFlags = flaggedHands.filter((f) => f.handId === hand.id)
    .sort((a, b) => {
      // LLM tags first, then deterministic
      const det = new Set(['bigpot', 'rare'])
      return (det.has(a.tag) ? 1 : 0) - (det.has(b.tag) ? 1 : 0)
    })
  const isDesktop = useIsDesktop()

  const steps = useMemo(() => buildSteps(hand), [hand])
  const totalSteps = steps.length

  const [stepIdx, setStepIdx] = useState(0)

  // Reset to start whenever the hand changes
  useEffect(() => { setStepIdx(0) }, [hand.id])

  const goNext = useCallback(() => setStepIdx(i => Math.min(i + 1, totalSteps)), [totalSteps])
  const goPrev = useCallback(() => setStepIdx(i => Math.max(i - 1, 0)), [])

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      // Don't intercept keys when user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'ArrowDown') { e.preventDefault(); goNext() }
      if (e.key === 'ArrowUp') { e.preventDefault(); goPrev() }
      if (e.key === 'ArrowRight' && nextHandId) navigate(nextHandId)
      if (e.key === 'ArrowLeft' && prevHandId) navigate(prevHandId)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [goNext, goPrev, navigate, nextHandId, prevHandId])

  // Clamp stepIdx to valid range — hand and steps update synchronously but
  // the useEffect reset of stepIdx fires one render later, so we guard here.
  const safeIdx = Math.min(stepIdx, steps.length)

  // boardStreet: last revealed run-1 street (ignores run-2 steps so board1 stays at 'river')
  const boardStreet: Street = (() => {
    for (let i = safeIdx - 1; i >= 0; i--) {
      if (!steps[i].run2) return steps[i].street
    }
    return 'preflop'
  })()

  // run2Street: last activated run-2 header's street (undefined = still in run 1)
  const run2Street: Street | undefined = (() => {
    for (let i = safeIdx - 1; i >= 0; i--) {
      if (steps[i].run2 && steps[i].isHeader) return steps[i].street
    }
    return undefined
  })()

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
        <div className="flex items-center gap-2 flex-wrap">
          {!hideBack && (
            <a
              href={backHref ?? '#'}
              onClick={backHref ? undefined : (e) => { e.preventDefault(); window.history.back() }}
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
            </a>
          )}
          {(prevHandId || nextHandId) && (
            <div className="flex items-center gap-1">
              <a
                href={prevHandId ?? '#'}
                aria-disabled={!prevHandId}
                className={`flex items-center px-2 py-1 rounded text-sm transition-colors ${prevHandId ? 'text-gray-400 hover:text-gray-100 hover:bg-gray-700' : 'text-gray-700 pointer-events-none'}`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </a>
              <a
                href={nextHandId ?? '#'}
                aria-disabled={!nextHandId}
                className={`flex items-center px-2 py-1 rounded text-sm transition-colors ${nextHandId ? 'text-gray-400 hover:text-gray-100 hover:bg-gray-700' : 'text-gray-700 pointer-events-none'}`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </a>
            </div>
          )}
          <div className="flex items-center gap-2">
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
        </div>
        <ShareButton hand={hand} />
      </div>

      {/* AI Feedback */}
      {handFlags.length > 0 && (
        <div className="flex flex-col gap-2 p-3 rounded-lg bg-gray-800 border border-gray-700">
          {handFlags.map((f) => (
            <div key={f.tag} className="flex items-start gap-3">
              <span
                className={`text-xs font-bold px-2 py-1 rounded uppercase tracking-wide shrink-0 ${
                  TAG_COLORS[f.tag] ?? 'bg-gray-600 text-gray-100'
                }`}
              >
                {f.tag}
              </span>
              <p className="text-sm text-gray-300">{f.summary}</p>
            </div>
          ))}
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
      <div className="flex flex-col sm:flex-row gap-4 flex-1 min-h-0">
        {/* Table + controls — only rendered (not just hidden) on desktop to avoid expensive equity calc on mobile */}
        <div className="hidden sm:flex flex-col flex-1 min-w-0 gap-2">
          {isDesktop && <PokerTable hand={hand} steps={steps} stepIdx={safeIdx} boardStreet={boardStreet} run2Street={run2Street} />}

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

        {/* Step controls for mobile — shown only when table is hidden */}
        <div className="sm:hidden flex items-center justify-center gap-4 shrink-0">
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

        {/* Action log sidebar — full width on mobile, fixed sidebar on sm+ */}
        <div className="flex-1 sm:flex-none sm:w-56 shrink-0 min-h-0 bg-gray-800 rounded-xl p-4">
          <ActionLog hand={hand} steps={steps} stepIdx={safeIdx} onStepChange={setStepIdx} />
        </div>
      </div>
    </div>
  )
}
