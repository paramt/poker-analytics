import { DEMO_FLAGS } from '../data/demoFlags'
import type { FlaggedHand, Hand, Session } from '../types'
import { loadSession as loadPersistedSession } from './db'
import { parseCSV } from './parser'
import { computeStats, computeAllPlayerStats, tagBigPots, tagRareHands } from './stats'

export const DEMO_SESSION_ID = 'demo'

const DEMO_HERO_ID = '1c6V3eltlj'
const DEMO_FILENAME = 'demo-session.csv'
const DEMO_CSV_URL = `${import.meta.env.BASE_URL}demo.csv`

interface CreateSessionFromCsvOptions {
  id?: string
  filename: string
  heroId: string
  uploadedAt?: string
  extraFlaggedHands?: FlaggedHand[]
  emptyHandsMessage?: string
}

function sortFlaggedHands(flaggedHands: FlaggedHand[]): FlaggedHand[] {
  return [...flaggedHands].sort((a, b) => a.handId - b.handId)
}

function buildDeterministicFlags(hands: Hand[]): FlaggedHand[] {
  return sortFlaggedHands([...tagBigPots(hands), ...tagRareHands(hands)])
}

export function createSessionFromCsvText(csvText: string, options: CreateSessionFromCsvOptions): Session {
  const hands = parseCSV(csvText, options.heroId)
  if (hands.length === 0) {
    throw new Error(options.emptyHandsMessage ?? 'No hands found for the selected player.')
  }

  const stats = computeStats(hands, options.heroId)
  const playerStats = computeAllPlayerStats(hands)
  const heroPlayer = hands[0]?.players[options.heroId]
  const flaggedHands = sortFlaggedHands([
    ...buildDeterministicFlags(hands),
    ...(options.extraFlaggedHands ?? []),
  ])

  return {
    id: options.id ?? crypto.randomUUID(),
    filename: options.filename,
    uploadedAt: options.uploadedAt ?? new Date().toISOString(),
    heroId: options.heroId,
    heroDisplayName: heroPlayer?.displayName ?? options.heroId,
    hands,
    stats,
    playerStats,
    flaggedHands,
  }
}

export async function loadDemoSession(fetchImpl: typeof fetch = fetch): Promise<Session> {
  const response = await fetchImpl(DEMO_CSV_URL)
  if (!response.ok) {
    throw new Error('Failed to fetch demo data.')
  }

  const csvText = await response.text()
  return createSessionFromCsvText(csvText, {
    id: DEMO_SESSION_ID,
    filename: DEMO_FILENAME,
    heroId: DEMO_HERO_ID,
    extraFlaggedHands: DEMO_FLAGS,
    emptyHandsMessage: 'Demo CSV produced no hands.',
  })
}

export async function loadSessionForRoute(id: string, fetchImpl: typeof fetch = fetch): Promise<Session | null> {
  if (id === DEMO_SESSION_ID) {
    return loadDemoSession(fetchImpl)
  }

  return loadPersistedSession(id)
}
