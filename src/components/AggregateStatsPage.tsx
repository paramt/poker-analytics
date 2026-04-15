import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'wouter'
import { listSessions, saveSession } from '../lib/db'
import { parseCSV, extractAllPlayers } from '../lib/parser'
import { computeStats, computeAllPlayerStats, tagBigPots, tagRareHands } from '../lib/stats'
import type { Session } from '../types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface AggregatedRow {
  displayName: string
  sessionCount: number
  handsPlayed: number
  net: number
  vpip: number
  pfr: number
  af: number
  wtsd: number
}

interface PlayerTimeline {
  displayName: string
  cumulative: number[]
}

interface CrossSessionTimeline {
  sessionDates: string[]
  players: PlayerTimeline[]
}

interface PendingFile {
  file: File
  players: { shortId: string; displayName: string; handCount: number }[]
  heroId: string
}

// ─── Data helpers ─────────────────────────────────────────────────────────────

function deduplicateSessions(sessions: Session[]): Session[] {
  const groups = new Map<string, Session>()
  for (const session of sessions) {
    if (session.hands.length === 0) continue
    const key = session.hands[0].timestamp
    const existing = groups.get(key)
    if (!existing || session.hands.length > existing.hands.length) {
      groups.set(key, session)
    }
  }
  return Array.from(groups.values())
}

function aggregateAllPlayers(sessions: Session[]): AggregatedRow[] {
  const byName = new Map<string, {
    net: number; handsPlayed: number
    vpipSum: number; pfrSum: number; afSum: number; wtsdSum: number
    sessionIds: Set<string>
  }>()

  for (const session of sessions) {
    for (const p of (session.playerStats ?? [])) {
      if (!byName.has(p.displayName)) {
        byName.set(p.displayName, { net: 0, handsPlayed: 0, vpipSum: 0, pfrSum: 0, afSum: 0, wtsdSum: 0, sessionIds: new Set() })
      }
      const acc = byName.get(p.displayName)!
      acc.net += p.net
      acc.vpipSum += p.vpip * p.handsPlayed
      acc.pfrSum += p.pfr * p.handsPlayed
      acc.afSum += p.af * p.handsPlayed
      acc.wtsdSum += p.wtsd * p.handsPlayed
      acc.handsPlayed += p.handsPlayed
      acc.sessionIds.add(session.id)
    }
  }

  return Array.from(byName.entries())
    .map(([displayName, acc]) => ({
      displayName,
      sessionCount: acc.sessionIds.size,
      handsPlayed: acc.handsPlayed,
      net: acc.net,
      vpip: acc.handsPlayed > 0 ? Math.round(acc.vpipSum / acc.handsPlayed) : 0,
      pfr: acc.handsPlayed > 0 ? Math.round(acc.pfrSum / acc.handsPlayed) : 0,
      af: acc.handsPlayed > 0 ? Math.round((acc.afSum / acc.handsPlayed) * 10) / 10 : 0,
      wtsd: acc.handsPlayed > 0 ? Math.round(acc.wtsdSum / acc.handsPlayed) : 0,
    }))
    .sort((a, b) => b.net - a.net)
}

function buildCrossSessionTimeline(sessions: Session[]): CrossSessionTimeline {
  const sorted = [...sessions].sort((a, b) =>
    a.hands[0].timestamp.localeCompare(b.hands[0].timestamp)
  )

  const sessionDates = sorted.map(s =>
    new Date(s.hands[0].timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  )

  const allNames = new Set<string>()
  for (const session of sorted) {
    for (const p of session.playerStats ?? []) allNames.add(p.displayName)
  }

  const running = new Map<string, number>()
  const series = new Map<string, number[]>()
  for (const name of allNames) {
    running.set(name, 0)
    series.set(name, [0])
  }

  for (const session of sorted) {
    const netByPlayer = new Map<string, number>()
    for (const p of session.playerStats ?? []) netByPlayer.set(p.displayName, p.net)
    for (const name of allNames) {
      const prev = running.get(name) ?? 0
      const next = prev + (netByPlayer.get(name) ?? 0)
      running.set(name, next)
      series.get(name)!.push(next)
    }
  }

  return {
    sessionDates,
    players: Array.from(allNames).map(name => ({
      displayName: name,
      cumulative: series.get(name)!,
    })),
  }
}

// ─── Chart ────────────────────────────────────────────────────────────────────

const PLAYER_COLORS = [
  '#10b981', '#60a5fa', '#f472b6', '#fb923c',
  '#a78bfa', '#34d399', '#fbbf24', '#f87171', '#818cf8', '#2dd4bf',
]
const PAD = { top: 24, right: 16, bottom: 40, left: 64 }
const WIDTH = 800
const HEIGHT = 240

interface TooltipState {
  x: number
  idx: number
  values: { displayName: string; cumulative: number; color: string }[]
}

function CrossSessionChart({ timeline }: { timeline: CrossSessionTimeline }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)

  const { sessionDates, players } = timeline
  const n = sessionDates.length + 1

  const innerW = WIDTH - PAD.left - PAD.right
  const innerH = HEIGHT - PAD.top - PAD.bottom

  const allValues = players.flatMap(p => p.cumulative)
  const rawMin = Math.min(0, ...allValues)
  const rawMax = Math.max(0, ...allValues)
  const padding = Math.max((rawMax - rawMin) * 0.08, 5)
  const yMin = rawMin - padding
  const yMax = rawMax + padding

  const toX = (i: number) => PAD.left + (i / Math.max(n - 1, 1)) * innerW
  const toY = (v: number) => PAD.top + (1 - (v - yMin) / (yMax - yMin)) * innerH
  const zeroY = toY(0)

  const yTicks = useMemo(() => {
    const range = yMax - yMin
    const step = Math.pow(10, Math.floor(Math.log10(range / 4)))
    const niceStep = step * (range / step > 20 ? 5 : range / step > 10 ? 2 : 1)
    const ticks: number[] = []
    const start = Math.ceil(yMin / niceStep) * niceStep
    for (let v = start; v <= yMax + 1e-9; v += niceStep) ticks.push(Math.round(v))
    return ticks
  }, [yMin, yMax])

  const xTicks = sessionDates.map((label, i) => ({ i: i + 1, label }))

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const mouseX = ((e.clientX - rect.left) / rect.width) * WIDTH
    const frac = Math.max(0, Math.min(1, (mouseX - PAD.left) / innerW))
    const idx = Math.round(frac * (n - 1))
    const values = players
      .map((p, ci) => ({ displayName: p.displayName, cumulative: p.cumulative[idx], color: PLAYER_COLORS[ci % PLAYER_COLORS.length] }))
      .sort((a, b) => b.cumulative - a.cumulative)
    setTooltip({ x: toX(idx), idx, values })
  }

  if (players.length === 0 || sessionDates.length === 0) return null

  const label = (idx: number) => idx === 0 ? 'Start' : sessionDates[idx - 1]

  return (
    <div className="bg-gray-800 rounded-xl p-4 border border-gray-700" ref={containerRef}>
      <div className="text-sm font-semibold text-gray-300 mb-3">Cumulative Net Winnings</div>
      <div className="relative">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="w-full"
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setTooltip(null)}
        >
          {yTicks.map(v => (
            <g key={v}>
              <line
                x1={PAD.left} y1={toY(v)} x2={WIDTH - PAD.right} y2={toY(v)}
                stroke={v === 0 ? '#6b7280' : '#374151'}
                strokeWidth={v === 0 ? 1.5 : 1}
                strokeDasharray={v === 0 ? undefined : '4 3'}
              />
              <text x={PAD.left - 8} y={toY(v) + 4} textAnchor="end" fontSize={11} fill="#9ca3af">
                {v > 0 ? `+${v}` : v}
              </text>
            </g>
          ))}
          {!yTicks.includes(0) && (
            <line x1={PAD.left} y1={zeroY} x2={WIDTH - PAD.right} y2={zeroY} stroke="#6b7280" strokeWidth={1.5} />
          )}
          {xTicks.map(({ i, label: lbl }) => (
            <text key={i} x={toX(i)} y={HEIGHT - PAD.bottom + 14} textAnchor="middle" fontSize={10} fill="#6b7280">
              {lbl}
            </text>
          ))}
          {players.map((player, ci) => (
            <polyline
              key={player.displayName}
              points={player.cumulative.map((v, i) => `${toX(i)},${toY(v)}`).join(' ')}
              fill="none"
              stroke={PLAYER_COLORS[ci % PLAYER_COLORS.length]}
              strokeWidth={2}
              strokeOpacity={0.85}
            />
          ))}
          {tooltip && (
            <line
              x1={tooltip.x} y1={PAD.top} x2={tooltip.x} y2={HEIGHT - PAD.bottom}
              stroke="#9ca3af" strokeWidth={1} strokeDasharray="3 3"
            />
          )}
        </svg>

        {tooltip && (
          <div
            className="absolute z-10 bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-xs shadow-xl pointer-events-none min-w-[140px]"
            style={{
              left: tooltip.x / (WIDTH / (containerRef.current?.clientWidth ?? WIDTH)) + 12,
              top: 8,
              transform: tooltip.x > WIDTH * 0.7 ? 'translateX(calc(-100% - 24px))' : undefined,
            }}
          >
            <div className="text-gray-400 mb-1.5 font-medium">{label(tooltip.idx)}</div>
            {tooltip.values.map(v => (
              <div key={v.displayName} className="flex items-center gap-1.5 mb-0.5">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: v.color }} />
                <span className="text-gray-300 truncate max-w-[100px]">{v.displayName}</span>
                <span className={`ml-auto font-mono font-bold ${v.cumulative > 0 ? 'text-emerald-400' : v.cumulative < 0 ? 'text-red-400' : 'text-gray-400'}`}>
                  {v.cumulative > 0 ? '+' : ''}{v.cumulative}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
        {players.map((player, ci) => (
          <div key={player.displayName} className="flex items-center gap-1.5 text-xs">
            <span className="w-3 shrink-0 inline-block rounded" style={{ background: PLAYER_COLORS[ci % PLAYER_COLORS.length], height: 2 }} />
            <span className="text-gray-400">{player.displayName}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AggregateStatsPage() {
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<AggregatedRow[]>([])
  const [timeline, setTimeline] = useState<CrossSessionTimeline | null>(null)
  const [totalSessions, setTotalSessions] = useState(0)
  const [totalHands, setTotalHands] = useState(0)
  const [duplicatesRemoved, setDuplicatesRemoved] = useState(0)

  const [dragOver, setDragOver] = useState(false)
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([])
  const [parsing, setParsing] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null)
  const [uploadErrors, setUploadErrors] = useState<string[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function loadStats() {
    let sessions = await listSessions()

    // Backfill playerStats for sessions uploaded before this field was added
    const toBackfill = sessions.filter(s => !s.playerStats)
    if (toBackfill.length > 0) {
      await Promise.all(toBackfill.map(s => {
        const backfilled = { ...s, playerStats: computeAllPlayerStats(s.hands) }
        return saveSession(backfilled)
      }))
      sessions = await listSessions()
    }

    const deduped = deduplicateSessions(sessions)
    setTotalSessions(deduped.length)
    setDuplicatesRemoved(sessions.length - deduped.length)
    setTotalHands(deduped.reduce((sum, s) => sum + s.hands.length, 0))
    setRows(aggregateAllPlayers(deduped))
    setTimeline(buildCrossSessionTimeline(deduped))
  }

  useEffect(() => {
    loadStats().then(() => setLoading(false))
  }, [])

  async function handleFiles(files: FileList) {
    const csvFiles = Array.from(files).filter(f => f.name.endsWith('.csv'))
    if (csvFiles.length === 0) return

    setParsing(true)
    const parsed = await Promise.all(
      csvFiles.map(async (file) => {
        try {
          const text = await file.text()
          const players = extractAllPlayers(text)
          if (players.length === 0) return null
          return { file, players, heroId: players[0].shortId } satisfies PendingFile
        } catch {
          return null
        }
      })
    )
    setPendingFiles(prev => [...prev, ...parsed.filter((p): p is PendingFile => p !== null)])
    setParsing(false)
  }

  function setHero(index: number, heroId: string) {
    setPendingFiles(prev => prev.map((p, i) => i === index ? { ...p, heroId } : p))
  }

  function removePending(index: number) {
    setPendingFiles(prev => prev.filter((_, i) => i !== index))
  }

  async function handleImport() {
    setUploading(true)
    setUploadProgress({ done: 0, total: pendingFiles.length })
    setUploadErrors([])

    const errors: string[] = []
    for (let i = 0; i < pendingFiles.length; i++) {
      const { file, heroId } = pendingFiles[i]
      try {
        const text = await file.text()
        const hands = parseCSV(text, heroId)
        if (hands.length === 0) throw new Error('no hands found for selected hero')

        const stats = computeStats(hands, heroId)
        const playerStats = computeAllPlayerStats(hands)
        const flaggedHands = [...tagBigPots(hands), ...tagRareHands(hands)].sort((a, b) => a.handId - b.handId)
        const heroPlayer = hands[0]?.players[heroId]

        const session: Session = {
          id: crypto.randomUUID(),
          filename: file.name,
          uploadedAt: new Date().toISOString(),
          heroId,
          heroDisplayName: heroPlayer?.displayName ?? heroId,
          hands,
          stats,
          playerStats,
          flaggedHands,
        }
        await saveSession(session)
      } catch (err) {
        errors.push(`${file.name}: ${err instanceof Error ? err.message : 'failed'}`)
      }
      setUploadProgress({ done: i + 1, total: pendingFiles.length })
    }

    setUploadErrors(errors)
    setPendingFiles([])
    setUploading(false)
    setUploadProgress(null)
    await loadStats()
  }

  const onDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files)
  }, [])

  const onDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(true)
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center text-gray-500 text-sm">
        Loading…
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-6">
      <div className="max-w-4xl mx-auto flex flex-col gap-6">
        <Link href="/" className="text-gray-400 hover:text-gray-200 text-sm w-fit">← Home</Link>

        <div>
          <h1 className="text-2xl font-bold text-gray-100">Player Stats</h1>
          {totalSessions > 0 && (
            <p className="text-sm text-gray-400 mt-1">
              {totalSessions} {totalSessions === 1 ? 'session' : 'sessions'} &middot; {totalHands} total hands
              {duplicatesRemoved > 0 && (
                <> &middot; {duplicatesRemoved} duplicate{duplicatesRemoved !== 1 ? 's' : ''} removed</>
              )}
            </p>
          )}
        </div>

        {/* Drop zone */}
        <div
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={() => setDragOver(false)}
          onClick={() => !uploading && !parsing && fileInputRef.current?.click()}
          className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed transition-colors py-6 px-4 text-center ${
            dragOver
              ? 'border-emerald-400 bg-emerald-900/20'
              : 'border-gray-700 bg-gray-800/50 hover:border-gray-600 hover:bg-gray-800'
          } ${uploading || parsing ? 'cursor-default opacity-70' : 'cursor-pointer'}`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            multiple
            className="hidden"
            onChange={e => { if (e.target.files) handleFiles(e.target.files); e.target.value = '' }}
          />
          {parsing ? (
            <div className="text-sm text-gray-400">Reading files…</div>
          ) : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <div className="text-sm text-gray-400">
                Drop CSV files here or <span className="text-emerald-400">browse</span>
              </div>
              <div className="text-xs text-gray-600">Multiple files supported</div>
            </>
          )}
        </div>

        {/* Pending files: hero selection */}
        {pendingFiles.length > 0 && (
          <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-300">
                {pendingFiles.length} {pendingFiles.length === 1 ? 'session' : 'sessions'} ready to import
              </span>
            </div>
            <div className="divide-y divide-gray-700">
              {pendingFiles.map((pf, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-200 truncate">{pf.file.name}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{pf.players.length} players</div>
                  </div>
                  <select
                    value={pf.heroId}
                    onChange={e => setHero(i, e.target.value)}
                    className="rounded-md bg-gray-700 border border-gray-600 text-gray-100 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 max-w-[200px]"
                  >
                    {pf.players.map(p => (
                      <option key={p.shortId} value={p.shortId}>
                        {p.displayName} ({p.handCount} hands)
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => removePending(i)}
                    className="text-gray-600 hover:text-gray-400 transition-colors text-lg leading-none shrink-0"
                    aria-label="Remove"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <div className="px-4 py-3 border-t border-gray-700">
              {uploading && uploadProgress ? (
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all"
                      style={{ width: `${(uploadProgress.done / uploadProgress.total) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-400 shrink-0">
                    {uploadProgress.done} / {uploadProgress.total}
                  </span>
                </div>
              ) : (
                <button
                  onClick={handleImport}
                  className="w-full py-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-semibold transition-colors cursor-pointer"
                >
                  Import {pendingFiles.length} {pendingFiles.length === 1 ? 'session' : 'sessions'}
                </button>
              )}
            </div>
          </div>
        )}

        {uploadErrors.length > 0 && (
          <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-xl px-4 py-3 text-sm flex flex-col gap-1">
            {uploadErrors.map((e, i) => <div key={i}>{e}</div>)}
          </div>
        )}

        {rows.length === 0 ? (
          <div className="text-center text-gray-500 py-8">No sessions yet — upload some CSVs above.</div>
        ) : (
          <>
            {timeline && <CrossSessionChart timeline={timeline} />}

            <div className="overflow-x-auto rounded-xl border border-gray-700">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-400 uppercase tracking-wide border-b border-gray-700 bg-gray-800/50">
                    <th className="text-left px-4 py-3">Player</th>
                    <th className="text-right px-4 py-3">Sessions</th>
                    <th className="text-right px-4 py-3">Hands</th>
                    <th className="text-right px-4 py-3">Net</th>
                    <th className="text-right px-4 py-3">VPIP</th>
                    <th className="text-right px-4 py-3">PFR</th>
                    <th className="text-right px-4 py-3">AF</th>
                    <th className="text-right px-4 py-3">WTSD</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {rows.map((row) => (
                    <tr key={row.displayName} className="hover:bg-gray-800/50 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-100">{row.displayName}</td>
                      <td className="px-4 py-3 text-right text-gray-300 tabular-nums">{row.sessionCount}</td>
                      <td className="px-4 py-3 text-right text-gray-300 tabular-nums">{row.handsPlayed}</td>
                      <td className={`px-4 py-3 text-right font-semibold tabular-nums ${row.net >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {row.net >= 0 ? '+' : ''}{row.net}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-300 tabular-nums">{row.vpip}%</td>
                      <td className="px-4 py-3 text-right text-gray-300 tabular-nums">{row.pfr}%</td>
                      <td className="px-4 py-3 text-right text-gray-300 tabular-nums">{row.af}</td>
                      <td className="px-4 py-3 text-right text-gray-300 tabular-nums">{row.wtsd}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
