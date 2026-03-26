import Anthropic from '@anthropic-ai/sdk'
import type { Hand, FlaggedHand, AITag } from '../types'

const VALID_TAGS = new Set<AITag>(['learning', 'hero', 'laydown', 'bigpot'])
const BATCH_SIZE = 50
const MAX_RETRIES = 3
const RETRY_DELAY_MS = 1000

// ─── Hand summary format ──────────────────────────────────────────────────

interface HandSummary {
  id: number
  hero: string      // seat position
  cards: string     // e.g. "AsKd"
  stacks: Record<string, number>
  board?: string[]
  board2?: string[]
  preflop: [string, string][]
  flop?: [string, string][]
  turn?: [string, string][]
  river?: [string, string][]
  pot: number
  result: number
}

function sanitize(s: string): string {
  return s.replace(/[\n\r"{}]/g, ' ').trim()
}

function actionCode(type: string, amount?: number, allin?: boolean): string {
  switch (type) {
    case 'fold': return 'f'
    case 'check': return 'x'
    case 'call': return 'c'
    case 'bet': return allin ? 'ai' : `b${amount ?? 0}`
    case 'raise': return allin ? 'ai' : `r${amount ?? 0}`
    case 'post_sb': return `sb${amount ?? 0}`
    case 'post_bb': return `bb${amount ?? 0}`
    default: return '?'
  }
}

function summarizeHand(hand: Hand): HandSummary | null {
  const heroPos = hand.seatPositions[hand.heroId]
  if (!heroPos) return null

  const stacks: Record<string, number> = {}
  for (const [shortId, info] of Object.entries(hand.players)) {
    const pos = hand.seatPositions[shortId]
    if (pos) stacks[pos] = info.stack
  }

  const mapActions = (actions: Hand['preflop']): [string, string][] =>
    actions
      .filter(a => !['collect', 'show', 'uncalled'].includes(a.type))
      .map(a => {
        const pos = hand.seatPositions[a.player] ?? sanitize(a.player)
        return [pos, actionCode(a.type, a.amount, a.allin)] as [string, string]
      })

  const summary: HandSummary = {
    id: hand.id,
    hero: heroPos,
    cards: hand.holeCards.map(c => c.replace('♠', 's').replace('♥', 'h').replace('♦', 'd').replace('♣', 'c')).join(''),
    stacks,
    pot: hand.pot,
    result: hand.result,
    preflop: mapActions(hand.preflop),
  }

  if (hand.board.length > 0) {
    summary.board = [
      hand.board.slice(0, 3).join(''),
      hand.board[3],
      hand.board[4],
    ].filter(Boolean) as string[]
  }

  if (hand.board2 && hand.board2.length > 0) {
    summary.board2 = [
      hand.board2.slice(0, 3).join(''),
      hand.board2[3],
      hand.board2[4],
    ].filter(Boolean) as string[]
  }

  if (hand.flop.length > 0) summary.flop = mapActions(hand.flop)
  if (hand.turn.length > 0) summary.turn = mapActions(hand.turn)
  if (hand.river.length > 0) summary.river = mapActions(hand.river)

  return summary
}

// ─── Prompt builder ───────────────────────────────────────────────────────

export function buildPrompt(batch: Hand[]): string {
  const summaries = batch.map(summarizeHand).filter(Boolean)

  return `You are a poker coach analyzing hand histories. For each hand below, identify if it is a notable learning moment.

Return ONLY a JSON array (no markdown, no explanation) in this exact format:
[{"handId": <number>, "tag": "<tag>", "summary": "<1-2 sentence summary>"}]

Tags:
- "learning": decision point where EV was likely lost (wrong sizing, wrong fold/call/raise)
- "hero": correct call or raise against a tough range that most players get wrong
- "laydown": hero saved money by folding correctly (opponent held the goods)

Only include hands that are genuinely notable. Skip routine hands. Return [] if none qualify.

Hands:
${JSON.stringify(summaries, null, 0)}`
}

// ─── Response parser ──────────────────────────────────────────────────────

export function parseClaudeResponse(text: string): FlaggedHand[] {
  try {
    // Extract JSON array from response (handle markdown code blocks)
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (!jsonMatch) return []

    const parsed = JSON.parse(jsonMatch[0])
    if (!Array.isArray(parsed)) return []

    return parsed
      .filter(item =>
        typeof item === 'object' &&
        item !== null &&
        typeof item.handId === 'number' &&
        VALID_TAGS.has(item.tag) &&
        item.tag !== 'bigpot' // bigpot is computed client-side
      )
      .map(item => ({
        handId: item.handId,
        tag: item.tag as AITag,
        summary: typeof item.summary === 'string' ? item.summary.slice(0, 300) : '',
      }))
  } catch {
    return []
  }
}

// ─── Batching ─────────────────────────────────────────────────────────────

export function chunkHands(hands: Hand[], batchSize: number): Hand[][] {
  const chunks: Hand[][] = []
  for (let i = 0; i < hands.length; i += batchSize) {
    chunks.push(hands.slice(i, i + batchSize))
  }
  return chunks
}

// ─── API call with retry ──────────────────────────────────────────────────

async function callClaude(
  client: Anthropic,
  prompt: string,
  attempt = 0
): Promise<string> {
  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    })
    const content = response.content[0]
    if (content.type !== 'text') return '[]'
    return content.text
  } catch (err: unknown) {
    const status = (err as { status?: number }).status
    if (status === 429 && attempt < MAX_RETRIES) {
      const delay = RETRY_DELAY_MS * Math.pow(2, attempt)
      await new Promise(res => setTimeout(res, delay))
      return callClaude(client, prompt, attempt + 1)
    }
    throw err
  }
}

// ─── Main scan function ───────────────────────────────────────────────────

export interface ScanProgress {
  completed: number
  total: number
}

/**
 * Scan all hands with Claude AI.
 * Runs parallel batches of BATCH_SIZE, with exponential backoff on 429.
 * Returns partial results if some batches fail.
 *
 * @param hands       All parsed hands from session
 * @param heroId      Hero's shortId (for filtering to VPIP'd hands)
 * @param apiKey      User-supplied Claude API key
 * @param onProgress  Optional progress callback
 */
export async function scanHands(
  hands: Hand[],
  _heroId: string,
  apiKey: string,
  onProgress?: (p: ScanProgress) => void
): Promise<{ results: FlaggedHand[]; partial: boolean }> {
  if (!apiKey || hands.length === 0) {
    return { results: [], partial: false }
  }

  const client = new Anthropic({
    apiKey,
    dangerouslyAllowBrowser: true,
  })

  const chunks = chunkHands(hands, BATCH_SIZE)
  const total = chunks.length
  let completed = 0
  const allResults: FlaggedHand[] = []
  let hadFailure = false

  const results = await Promise.allSettled(
    chunks.map(async (chunk) => {
      const prompt = buildPrompt(chunk)
      const text = await callClaude(client, prompt)
      const flagged = parseClaudeResponse(text)
      completed++
      onProgress?.({ completed, total })
      return flagged
    })
  )

  for (const result of results) {
    if (result.status === 'fulfilled') {
      allResults.push(...result.value)
    } else {
      hadFailure = true
    }
  }

  return {
    results: allResults,
    partial: hadFailure,
  }
}
