export type SeatPosition = 'BTN' | 'SB' | 'BB' | 'UTG' | 'UTG+1' | 'UTG+2' | 'HJ' | 'CO'

export type ActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'post_sb' | 'post_bb' | 'collect' | 'show' | 'uncalled'

export interface Action {
  player: string // shortId
  type: ActionType
  amount?: number
  allin?: boolean
  cards?: string[] // for 'show' actions
}

export interface Hand {
  id: number          // hand number from CSV
  rawId: string       // opaque ID from CSV, e.g. "ksousb4us0dg"
  dealerSeat: number  // seat number (#N) of the button player
  players: Record<string, { displayName: string; seat: number; stack: number }> // shortId → player info
  seatPositions: Record<string, SeatPosition> // shortId → position
  heroId: string      // shortId of the hero
  holeCards: string[] // e.g. ['10♣', '9♦']
  preflop: Action[]
  flop: Action[]
  turn: Action[]
  river: Action[]
  board: string[]     // up to 5 cards as strings e.g. ['4♦', 'K♣', 'A♠', 'K♥', '3♣']
  board2?: string[]   // second board for run-it-twice
  pot: number         // final pot size
  result: number      // hero net (positive = won, negative = lost)
  timestamp: string   // ISO timestamp
}

export interface SessionStats {
  net: number
  vpip: number        // 0–100 percentage
  pfr: number         // 0–100 percentage
  af: number          // aggression factor (bets+raises)/calls, postflop
  wtsd: number        // 0–100 percentage
  handsPlayed: number
}

export type AITag = 'learning' | 'hero' | 'laydown' | 'bigpot' | 'rare' | 'notable'

export interface FlaggedHand {
  handId: number
  tag: AITag
  summary: string
}

export interface PlayerStats extends SessionStats {
  playerId: string
  displayName: string
}

export interface Session {
  id: string          // uuid
  filename: string
  uploadedAt: string  // ISO timestamp
  heroId: string
  heroDisplayName: string
  hands: Hand[]
  stats: SessionStats
  playerStats: PlayerStats[]
  flaggedHands: FlaggedHand[]
}

export interface Player {
  shortId: string
  displayName: string
  handCount: number
}
