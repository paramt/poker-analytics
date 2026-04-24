import { useStore } from '../store'
import { scanHands, BATCH_SIZE } from './claude'
import { saveSession } from './db'
import type { Session, FlaggedHand } from '../types'

const activeScans = new Set<string>()

export function startScan(
  session: Session,
  deterministicFlags: FlaggedHand[],
  heroId: string,
  apiKey: string,
) {
  if (activeScans.has(session.id)) return
  activeScans.add(session.id)

  const batchCount = Math.ceil(session.hands.length / BATCH_SIZE)
  useStore.getState().setScanState({ isScanning: true, progress: { completed: 0, total: batchCount } })

  scanHands(session.hands, heroId, apiKey, (progress) => {
    useStore.getState().setScanState({ isScanning: true, progress })
  })
    .then(async ({ results: aiResults, partial }) => {
      const allFlags = [...deterministicFlags, ...aiResults].sort((a, b) => a.handId - b.handId)
      if (useStore.getState().session?.id === session.id) {
        useStore.getState().setFlaggedHands(allFlags)
        useStore.getState().setScanState({ isScanning: false, partial })
      }
      await saveSession({ ...session, flaggedHands: allFlags })
    })
    .catch(() => {
      if (useStore.getState().session?.id === session.id) {
        useStore.getState().setScanState({ isScanning: false, partial: true })
      }
    })
    .finally(() => activeScans.delete(session.id))
}
