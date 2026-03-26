import type { SessionStats } from '../types'

interface Props {
  stats: SessionStats
}

interface StatTileProps {
  label: string
  value: string
  valueClass?: string
}

function StatTile({ label, value, valueClass = 'text-gray-100' }: StatTileProps) {
  return (
    <div className="flex flex-col items-center px-4 py-2 bg-gray-800 rounded-lg min-w-[80px]">
      <span className={`text-lg font-bold tabular-nums ${valueClass}`}>{value}</span>
      <span className="text-xs text-gray-400 mt-0.5">{label}</span>
    </div>
  )
}

export default function StatsBar({ stats }: Props) {
  const netStr = stats.net >= 0 ? `+${stats.net}` : `${stats.net}`
  const netClass = stats.net >= 0 ? 'text-emerald-400' : 'text-red-400'

  return (
    <div className="flex flex-wrap gap-2 items-center">
      <StatTile label="Net" value={netStr} valueClass={netClass} />
      <StatTile label="VPIP" value={`${stats.vpip}%`} />
      <StatTile label="PFR" value={`${stats.pfr}%`} />
      <StatTile label="AF" value={`${stats.af}`} />
      <StatTile label="WTSD" value={`${stats.wtsd}%`} />
    </div>
  )
}
