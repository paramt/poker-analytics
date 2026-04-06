import { useLocation } from 'wouter'
import { useStore } from '../store'
import type { Hand, AITag, FlaggedHand } from '../types'
import StatsBar from './StatsBar'
import NetTimeline from './NetTimeline'

function suitColor(card: string): string {
  if (card.includes('♥') || card.includes('♦')) return 'text-red-400'
  return 'text-gray-100'
}

const TAG_COLORS: Record<AITag, string> = {
  learning: 'bg-amber-600 text-amber-100',
  hero: 'bg-blue-600 text-blue-100',
  laydown: 'bg-emerald-600 text-emerald-100',
  bigpot: 'bg-orange-600 text-orange-100',
  rare: 'bg-purple-600 text-purple-100',
  notable: 'bg-teal-600 text-teal-100',
}

const TAG_BORDER: Record<AITag, string> = {
  learning: 'border-l-amber-500',
  hero: 'border-l-blue-500',
  laydown: 'border-l-emerald-500',
  bigpot: 'border-l-orange-500',
  rare: 'border-l-purple-500',
  notable: 'border-l-teal-500',
}

function TagBadge({ tag }: { tag: AITag }) {
  return (
    <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${TAG_COLORS[tag]}`}>
      {tag}
    </span>
  )
}

function CardInline({ card }: { card: string }) {
  const parts = card.match(/^(\d+|[AKQJ])(.*)$/)
  const rank = parts ? parts[1] : card
  const suit = parts ? parts[2] : ''
  return (
    <span className={`font-mono text-xs font-bold ${suitColor(card)}`}>
      {rank}{suit}
    </span>
  )
}

interface StatTileProps {
  label: string
  value: string
  sub?: string
}

function BigStatTile({ label, value, sub }: StatTileProps) {
  return (
    <div className="flex flex-col gap-1 bg-gray-800 rounded-xl p-4">
      <div className="text-2xl font-bold text-gray-100">{value}</div>
      <div className="text-sm font-semibold text-gray-300">{label}</div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
    </div>
  )
}

export default function SessionView() {
  const [, navigate] = useLocation()
  const {
    session,
    flaggedHands,
    isScanning,
    scanProgress,
    scanPartial,
    activeTab,
    setActiveTab,
  } = useStore()

  if (!session) return null

  const { hands, stats, filename, heroDisplayName } = session

  function handleUploadNew() {
    navigate('/')
  }

  function handleReplayHand(hand: Hand) {
    const suffix = activeTab === 'flagged' ? '?flagged=1' : ''
    navigate(`/session/${session!.id}/hand/${hand.id}${suffix}`)
  }

  const flaggedIds = new Set(flaggedHands.map((f) => f.handId))

  // Merge duplicate handIds: LLM tag is primary, deterministic tags (bigpot/rare) are extras
  const groupedFlagged = Array.from(
    flaggedHands.reduce((map, fh) => {
      if (!map.has(fh.handId)) {
        map.set(fh.handId, { primary: fh, extras: [] as FlaggedHand[] })
      } else {
        const group = map.get(fh.handId)!
        if (fh.tag !== 'bigpot' && fh.tag !== 'rare') {
          group.extras.push(group.primary)
          group.primary = fh
        } else {
          group.extras.push(fh)
        }
      }
      return map
    }, new Map<number, { primary: FlaggedHand; extras: FlaggedHand[] }>())
  ).map(([, v]) => v)

  const groupedFlaggedMap = new Map(groupedFlagged.map(({ primary, extras }) => [primary.handId, { primary, extras }]))

  const displayHands = activeTab === 'flagged' ? hands.filter((h) => flaggedIds.has(h.id)) : hands

  const tabs = [
    { id: 'all' as const, label: `All Hands (${hands.length})` },
    { id: 'flagged' as const, label: `Flagged (${flaggedHands.length})` },
    { id: 'stats' as const, label: 'My Stats' },
  ]

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 flex flex-col">
      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-xl">♠</span>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-gray-100 truncate">{filename}</div>
              <div className="text-xs text-gray-400">Hero: {heroDisplayName}</div>
            </div>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <StatsBar stats={stats} />
            <button
              onClick={handleUploadNew}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-100 transition-colors"
            >
              Upload New
            </button>
          </div>
        </div>
      </div>

      {/* Scanning banner */}
      {isScanning && (
        <div className="bg-blue-900/40 border-b border-blue-700 px-6 py-2">
          <div className="max-w-6xl mx-auto flex items-center gap-2 text-sm text-blue-300">
            <svg
              className="animate-spin h-4 w-4 text-blue-400 shrink-0"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            {scanProgress
              ? `AI scanning ${scanProgress.completed}/${scanProgress.total} hands…`
              : 'AI scanning hands…'}
          </div>
        </div>
      )}

      {/* Partial warning */}
      {!isScanning && scanPartial && (
        <div className="bg-amber-900/30 border-b border-amber-700 px-6 py-2">
          <div className="max-w-6xl mx-auto text-sm text-amber-300">
            Scan incomplete — showing {flaggedHands.length} of {hands.length} hands analyzed.
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="bg-gray-800 border-b border-gray-700 px-6">
        <div className="max-w-6xl mx-auto flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-emerald-500 text-emerald-400'
                  : 'border-transparent text-gray-400 hover:text-gray-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 px-6 py-6">
        <div className="max-w-6xl mx-auto">

          {/* Stats tab */}
          {activeTab === 'stats' && (
            <div className="flex flex-col gap-6">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
                <BigStatTile
                  label="Net"
                  value={stats.net >= 0 ? `+${stats.net}` : `${stats.net}`}
                  sub="Chips won or lost"
                />
                <BigStatTile
                  label="VPIP"
                  value={`${stats.vpip}%`}
                  sub="Voluntarily put $ in pot (preflop). 20–30% is typical."
                />
                <BigStatTile
                  label="PFR"
                  value={`${stats.pfr}%`}
                  sub="Preflop raise %. Should be close to VPIP."
                />
                <BigStatTile
                  label="AF"
                  value={`${stats.af}`}
                  sub="Aggression factor postflop. >2 is aggressive."
                />
                <BigStatTile
                  label="WTSD"
                  value={`${stats.wtsd}%`}
                  sub="Went to showdown %. 25–35% is typical."
                />
              </div>
              <NetTimeline hands={hands} heroId={session.heroId} />
            </div>
          )}

          {/* Flagged cards (Flagged tab only) */}
          {activeTab === 'flagged' && flaggedHands.length > 0 && (
            <div className="flex flex-col gap-3 mb-6">
              {groupedFlagged.map(({ primary: fh, extras }) => {
                const hand = hands.find((h) => h.id === fh.handId)
                return (
                  <div
                    key={fh.handId}
                    className={`flex items-start gap-4 bg-gray-800 rounded-xl p-4 border-l-4 ${TAG_BORDER[fh.tag]} border border-gray-700`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <TagBadge tag={fh.tag} />
                        {extras.map((e) => <TagBadge key={e.tag} tag={e.tag} />)}
                        <span className="text-sm font-medium text-gray-300">Hand #{fh.handId}</span>
                        {hand && hand.holeCards.length > 0 && (
                          <span className="flex gap-0.5">
                            {hand.holeCards.map((c, i) => <CardInline key={i} card={c} />)}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-400">{fh.summary}</p>
                      {extras.map((e) => (
                        <p key={e.tag} className="text-xs text-gray-500 mt-0.5">{e.summary}</p>
                      ))}
                    </div>
                    {hand && (
                      <button
                        onClick={() => handleReplayHand(hand)}
                        className="shrink-0 px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-800 hover:bg-emerald-700 text-emerald-100 transition-colors"
                      >
                        Replay
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Hand list (All and Flagged tabs) */}
          {activeTab !== 'stats' && (
            <div className="bg-gray-800 rounded-xl overflow-hidden border border-gray-700">
              {displayHands.length === 0 ? (
                <div className="px-6 py-12 text-center text-gray-500">
                  {activeTab === 'flagged' ? 'No flagged hands yet.' : 'No hands found.'}
                </div>
              ) : (
                <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[600px]">
                  <thead>
                    <tr className="border-b border-gray-700 text-xs text-gray-400 uppercase tracking-wide">
                      <th className="text-left px-4 py-3">Hand</th>
                      <th className="text-left px-4 py-3">Position</th>
                      <th className="text-left px-4 py-3">Board</th>
                      <th className="text-right px-4 py-3">Result</th>
                      <th className="text-left px-4 py-3">Tags</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayHands.map((hand) => {
                      const flaggedGroup = groupedFlaggedMap.get(hand.id)
                      const position = hand.seatPositions[hand.heroId] ?? '—'
                      const flop = hand.board.slice(0, 3)
                      const resultStr =
                        hand.result >= 0 ? `+${hand.result}` : `${hand.result}`
                      const resultClass =
                        hand.result > 0
                          ? 'text-emerald-400'
                          : hand.result < 0
                          ? 'text-red-400'
                          : 'text-gray-400'

                      return (
                        <tr
                          key={hand.id}
                          onClick={() => handleReplayHand(hand)}
                          className={`border-b border-gray-700/50 cursor-pointer hover:bg-gray-700/50 transition-colors last:border-0 ${
                            flaggedGroup
                              ? `border-l-2 ${TAG_BORDER[flaggedGroup.primary.tag]}`
                              : 'border-l-2 border-l-transparent'
                          }`}
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-mono text-gray-300">#{hand.id}</span>
                              {hand.holeCards.length > 0 ? (
                                <span className="flex gap-0.5">
                                  {hand.holeCards.map((c, i) => <CardInline key={i} card={c} />)}
                                </span>
                              ) : (
                                <span className="text-gray-600 text-xs">no cards</span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-gray-300">{position}</td>
                          <td className="px-4 py-3">
                            {flop.length > 0 ? (
                              <span className="flex gap-0.5">
                                {flop.map((c, i) => <CardInline key={i} card={c} />)}
                              </span>
                            ) : (
                              <span className="text-gray-600">—</span>
                            )}
                          </td>
                          <td className={`px-4 py-3 text-right font-mono font-bold ${resultClass}`}>
                            {resultStr}
                          </td>
                          <td className="px-4 py-3">
                            {flaggedGroup && (
                              <div className="flex items-center gap-1 flex-wrap">
                                <TagBadge tag={flaggedGroup.primary.tag} />
                                {flaggedGroup.extras.map((e) => <TagBadge key={e.tag} tag={e.tag} />)}
                              </div>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
