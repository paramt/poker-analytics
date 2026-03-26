import { create } from 'zustand'
import type { Session, Hand, FlaggedHand } from './types'

interface AppState {
  // Session
  session: Session | null
  setSession: (session: Session | null) => void

  // Selected hand for replayer
  selectedHand: Hand | null
  setSelectedHand: (hand: Hand | null) => void

  // AI results
  flaggedHands: FlaggedHand[]
  setFlaggedHands: (hands: FlaggedHand[]) => void
  addFlaggedHands: (hands: FlaggedHand[]) => void

  // AI scanning state
  isScanning: boolean
  scanProgress: { completed: number; total: number } | null
  scanPartial: boolean
  setScanState: (state: { isScanning: boolean; progress?: { completed: number; total: number } | null; partial?: boolean }) => void

  // API key
  apiKey: string
  setApiKey: (key: string) => void

  // Active tab in session view
  activeTab: 'all' | 'flagged' | 'stats'
  setActiveTab: (tab: 'all' | 'flagged' | 'stats') => void
}

export const useStore = create<AppState>((set) => ({
  session: null,
  setSession: (session) => set({ session }),

  selectedHand: null,
  setSelectedHand: (hand) => set({ selectedHand: hand }),

  flaggedHands: [],
  setFlaggedHands: (hands) => set({ flaggedHands: hands }),
  addFlaggedHands: (hands) =>
    set((state) => ({
      flaggedHands: [...state.flaggedHands, ...hands],
    })),

  isScanning: false,
  scanProgress: null,
  scanPartial: false,
  setScanState: ({ isScanning, progress, partial }) =>
    set({
      isScanning,
      scanProgress: progress ?? null,
      scanPartial: partial ?? false,
    }),

  apiKey: localStorage.getItem('claude_api_key') ?? '',
  setApiKey: (key) => {
    localStorage.setItem('claude_api_key', key)
    set({ apiKey: key })
  },

  activeTab: 'all',
  setActiveTab: (tab) => set({ activeTab: tab }),
}))
