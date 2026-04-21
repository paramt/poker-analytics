import { resolve } from 'node:path'
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { DEMO_FLAGS } from '../data/demoFlags'
import { createSessionFromCsvText, DEMO_SESSION_ID, loadDemoSession, loadSessionForRoute } from './sessionLoader'

const HERO_ID = '1c6V3eltlj'

function buildCSV(entries: { entry: string; order: number }[]): string {
  const header = 'entry,at,order'
  const reversed = [...entries].reverse()
  const rows = reversed.map(({ entry, order }) => {
    const escaped = entry.includes('"') || entry.includes(',')
      ? `"${entry.replace(/"/g, '""')}"`
      : `"${entry}"`
    return `${escaped},2024-01-01T00:00:00.000Z,${order}`
  })
  return [header, ...rows].join('\n')
}

describe('createSessionFromCsvText', () => {
  it('builds a session with the provided metadata and extra flags', () => {
    const csv = buildCSV([
      { entry: '-- starting hand #117 (id: ksousb4us0dg)  No Limit Texas Hold\'em (dealer: "1000 @ 8pAlpXMD6x") --', order: 1 },
      { entry: 'Player stacks: #1 "nad @ -kxVOncdJw" (300) | #4 "1000 @ 8pAlpXMD6x" (2269) | #6 "param @ 1c6V3eltlj" (1931)', order: 2 },
      { entry: 'Your hand is 10♣, 9♦', order: 3 },
      { entry: '"param @ 1c6V3eltlj" posts a small blind of 10', order: 4 },
      { entry: '"nad @ -kxVOncdJw" posts a big blind of 20', order: 5 },
      { entry: '"1000 @ 8pAlpXMD6x" raises to 60', order: 6 },
      { entry: '"param @ 1c6V3eltlj" calls 60', order: 7 },
      { entry: '"nad @ -kxVOncdJw" folds', order: 8 },
      { entry: 'Flop:  [4♦, K♣, A♠]', order: 9 },
      { entry: '"param @ 1c6V3eltlj" checks', order: 10 },
      { entry: '"1000 @ 8pAlpXMD6x" bets 80', order: 11 },
      { entry: '"param @ 1c6V3eltlj" folds', order: 12 },
      { entry: 'Uncalled bet of 80 returned to "1000 @ 8pAlpXMD6x"', order: 13 },
      { entry: '"1000 @ 8pAlpXMD6x" collected 150 from pot', order: 14 },
      { entry: '-- ending hand #117 --', order: 15 },
    ])

    const session = createSessionFromCsvText(csv, {
      id: 'session-123',
      filename: 'sample.csv',
      heroId: HERO_ID,
      uploadedAt: '2024-01-02T00:00:00.000Z',
      extraFlaggedHands: [{ handId: 117, tag: 'learning', summary: 'Extra context' }],
    })

    expect(session.id).toBe('session-123')
    expect(session.filename).toBe('sample.csv')
    expect(session.uploadedAt).toBe('2024-01-02T00:00:00.000Z')
    expect(session.heroDisplayName).toBe('param')
    expect(session.flaggedHands).toEqual([{ handId: 117, tag: 'learning', summary: 'Extra context' }])
  })
})

describe('loadDemoSession', () => {
  it('loads the demo CSV from the app base path and returns the transient demo session', async () => {
    const demoCsv = readFileSync(resolve(process.cwd(), 'public/demo.csv'), 'utf8')
    const fetchMock = vi.fn(async (url: string) => ({
      ok: true,
      text: async () => demoCsv,
      url,
    })) as unknown as typeof fetch

    const session = await loadDemoSession(fetchMock)

    expect(fetchMock).toHaveBeenCalledWith(`${import.meta.env.BASE_URL}demo.csv`)
    expect(session.id).toBe(DEMO_SESSION_ID)
    expect(session.filename).toBe('demo-session.csv')
    expect(session.hands.length).toBeGreaterThan(0)
    expect(session.flaggedHands).toEqual(expect.arrayContaining(DEMO_FLAGS))
  })

  it('treats the demo route as a special transient session source', async () => {
    const demoCsv = readFileSync(resolve(process.cwd(), 'public/demo.csv'), 'utf8')
    const fetchMock = vi.fn(async () => ({
      ok: true,
      text: async () => demoCsv,
    })) as unknown as typeof fetch

    const session = await loadSessionForRoute(DEMO_SESSION_ID, fetchMock)

    expect(session?.id).toBe(DEMO_SESSION_ID)
    expect(fetchMock).toHaveBeenCalledOnce()
  })
})
