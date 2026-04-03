import { useMemo, useRef, useState } from 'react'
import type { Hand } from '../types'
import { buildNetTimelines } from '../lib/stats'

// Distinct colors; index 0 is reserved for the hero (emerald)
const PLAYER_COLORS = [
  '#10b981', // emerald — hero
  '#60a5fa', // blue
  '#f472b6', // pink
  '#fb923c', // orange
  '#a78bfa', // purple
  '#34d399', // teal
  '#fbbf24', // amber
  '#f87171', // red
  '#818cf8', // indigo
  '#2dd4bf', // cyan
]

const CHART_PAD = { top: 24, right: 16, bottom: 40, left: 64 }

interface TooltipData {
  x: number
  y: number
  handId: number
  values: { displayName: string; cumulative: number; color: string }[]
}

interface Props {
  hands: Hand[]
  heroId: string
}

export default function NetTimeline({ hands, heroId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [tooltip, setTooltip] = useState<TooltipData | null>(null)

  const timeline = useMemo(() => buildNetTimelines(hands), [hands])

  // Put hero first so it gets the emerald color and renders on top
  const ordered = useMemo(() => {
    const heroIdx = timeline.players.findIndex(p => p.id === heroId)
    if (heroIdx <= 0) return timeline.players
    const copy = [...timeline.players]
    const [hero] = copy.splice(heroIdx, 1)
    copy.unshift(hero)
    return copy
  }, [timeline.players, heroId])

  const colorFor = (idx: number) => PLAYER_COLORS[idx % PLAYER_COLORS.length]

  if (hands.length < 2) return null

  const n = hands.length
  const allValues = ordered.flatMap(p => p.cumulative)
  const rawMin = Math.min(0, ...allValues)
  const rawMax = Math.max(0, ...allValues)
  const padding = Math.max((rawMax - rawMin) * 0.08, 5)
  const yMin = rawMin - padding
  const yMax = rawMax + padding

  const WIDTH = 800  // logical SVG width — scales with container
  const HEIGHT = 240
  const innerW = WIDTH - CHART_PAD.left - CHART_PAD.right
  const innerH = HEIGHT - CHART_PAD.top - CHART_PAD.bottom

  const toX = (i: number) => CHART_PAD.left + (i / Math.max(n - 1, 1)) * innerW
  const toY = (v: number) => CHART_PAD.top + (1 - (v - yMin) / (yMax - yMin)) * innerH
  const zeroY = toY(0)

  // Y-axis grid lines
  const yTicks = useMemo(() => {
    const range = yMax - yMin
    const step = Math.pow(10, Math.floor(Math.log10(range / 4)))
    const niceStep = step * (range / step > 20 ? 5 : range / step > 10 ? 2 : 1)
    const ticks: number[] = []
    const start = Math.ceil(yMin / niceStep) * niceStep
    for (let v = start; v <= yMax + 1e-9; v += niceStep) {
      ticks.push(Math.round(v))
    }
    return ticks
  }, [yMin, yMax])

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const svg = e.currentTarget
    const rect = svg.getBoundingClientRect()
    const scaleX = WIDTH / rect.width
    const mouseX = (e.clientX - rect.left) * scaleX
    const relX = mouseX - CHART_PAD.left
    const frac = Math.max(0, Math.min(1, relX / innerW))
    const idx = Math.round(frac * (n - 1))
    const x = toX(idx)
    const tooltipValues = ordered.map((p, ci) => ({
      displayName: p.displayName,
      cumulative: p.cumulative[idx] ?? 0,
      color: colorFor(ci),
    })).sort((a, b) => b.cumulative - a.cumulative)
    setTooltip({ x, y: e.clientY - rect.top, handId: timeline.handIds[idx], values: tooltipValues })
  }

  function handleMouseLeave() {
    setTooltip(null)
  }

  return (
    <div className="bg-gray-800 rounded-xl p-4 border border-gray-700" ref={containerRef}>
      <div className="text-sm font-semibold text-gray-300 mb-3">Net Profit Timeline</div>
      <div className="relative">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="w-full"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          {/* Y-axis grid lines + labels */}
          {yTicks.map(v => (
            <g key={v}>
              <line
                x1={CHART_PAD.left} y1={toY(v)}
                x2={WIDTH - CHART_PAD.right} y2={toY(v)}
                stroke={v === 0 ? '#6b7280' : '#374151'}
                strokeWidth={v === 0 ? 1.5 : 1}
                strokeDasharray={v === 0 ? undefined : '4 3'}
              />
              <text
                x={CHART_PAD.left - 8}
                y={toY(v) + 4}
                textAnchor="end"
                fontSize={11}
                fill="#9ca3af"
              >
                {v >= 0 ? (v === 0 ? '0' : `+${v}`) : `${v}`}
              </text>
            </g>
          ))}

          {/* Zero line (if not already in ticks) */}
          {!yTicks.includes(0) && (
            <line
              x1={CHART_PAD.left} y1={zeroY}
              x2={WIDTH - CHART_PAD.right} y2={zeroY}
              stroke="#6b7280" strokeWidth={1.5}
            />
          )}

          {/* Player lines — hero (index 0) rendered last so it's on top */}
          {[...ordered].reverse().map((player, revIdx) => {
            const ci = ordered.length - 1 - revIdx
            const color = colorFor(ci)
            const isHero = player.id === heroId
            const points = player.cumulative
              .map((v, i) => `${toX(i)},${toY(v)}`)
              .join(' ')
            return (
              <polyline
                key={player.id}
                points={points}
                fill="none"
                stroke={color}
                strokeWidth={isHero ? 2.5 : 1.5}
                strokeOpacity={isHero ? 1 : 0.7}
              />
            )
          })}

          {/* Tooltip vertical line */}
          {tooltip && (
            <line
              x1={tooltip.x} y1={CHART_PAD.top}
              x2={tooltip.x} y2={HEIGHT - CHART_PAD.bottom}
              stroke="#9ca3af" strokeWidth={1} strokeDasharray="3 3"
            />
          )}

          {/* X-axis label */}
          <text
            x={CHART_PAD.left + innerW / 2}
            y={HEIGHT - 6}
            textAnchor="middle"
            fontSize={11}
            fill="#6b7280"
          >
            Hand number
          </text>
        </svg>

        {/* Tooltip box */}
        {tooltip && (
          <div
            className="absolute z-10 bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-xs shadow-xl pointer-events-none min-w-[140px]"
            style={{
              left: tooltip.x / (800 / (containerRef.current?.clientWidth ?? 800)) + 12,
              top: 8,
              transform: tooltip.x > 600 ? 'translateX(calc(-100% - 24px))' : undefined,
            }}
          >
            <div className="text-gray-400 mb-1.5 font-medium">Hand #{tooltip.handId}</div>
            {tooltip.values.map(v => (
              <div key={v.displayName} className="flex items-center gap-1.5 mb-0.5">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: v.color }} />
                <span className="text-gray-300 truncate max-w-[100px]">{v.displayName}</span>
                <span
                  className={`ml-auto font-mono font-bold ${v.cumulative > 0 ? 'text-emerald-400' : v.cumulative < 0 ? 'text-red-400' : 'text-gray-400'}`}
                >
                  {v.cumulative > 0 ? '+' : ''}{v.cumulative}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
        {ordered.map((player, ci) => (
          <div key={player.id} className="flex items-center gap-1.5 text-xs">
            <span
              className="w-3 h-0.5 shrink-0 inline-block rounded"
              style={{ background: colorFor(ci), height: player.id === heroId ? 3 : 2 }}
            />
            <span className={player.id === heroId ? 'text-gray-200 font-medium' : 'text-gray-400'}>
              {player.displayName}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
