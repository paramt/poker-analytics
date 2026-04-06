import { useEffect, useState } from 'react'
import { Router, Switch, Route, useParams, Link } from 'wouter'
import { useStore } from './store'
import UploadScreen from './components/UploadScreen'
import SessionView from './components/SessionView'
import HandReplayer from './components/HandReplayer'
import SharedHandView from './components/SharedHandView'
import { loadSession } from './lib/db'

// ─── Route: /session/:id/hand/:handId ────────────────────────────────────────

function HandPage() {
  const { id, handId } = useParams<{ id: string; handId: string }>()
  const { session, setSession, setFlaggedHands, flaggedHands, flaggedNavMode } = useStore()
  const [loading, setLoading] = useState(false)
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    if (session?.id === id) return
    setLoading(true)
    loadSession(id).then(s => {
      if (s) {
        setSession(s)
        setFlaggedHands(s.flaggedHands ?? [])
      } else {
        setMissing(true)
      }
      setLoading(false)
    })
  }, [id, handId])

  const flaggedIds = new Set(flaggedHands.map(f => f.handId))

  const hands = session?.hands ?? []
  const handIdx = hands.findIndex(h => String(h.id) === handId)
  const hand = handIdx >= 0 ? hands[handIdx] : undefined

  const navigableHands = flaggedNavMode ? hands.filter(h => flaggedIds.has(h.id)) : hands
  const navIdx = navigableHands.findIndex(h => String(h.id) === handId)
  const prevHand = navIdx > 0 ? navigableHands[navIdx - 1] : undefined
  const nextHand = navIdx >= 0 && navIdx < navigableHands.length - 1 ? navigableHands[navIdx + 1] : undefined

  if (loading || (!session && !missing)) return <Spinner />
  if (missing || !hand) return <NotFound message="Hand not found." backTo={`/session/${id}`} />

  return (
    <div className="h-screen overflow-hidden bg-gray-900 text-gray-100 p-6 flex flex-col">
      <div className="max-w-5xl w-full mx-auto flex-1 min-h-0">
        <HandReplayer
          hand={hand}
          backHref={`/session/${id}`}
          prevHandId={prevHand ? `/session/${id}/hand/${prevHand.id}` : undefined}
          nextHandId={nextHand ? `/session/${id}/hand/${nextHand.id}` : undefined}
          flaggedMode={flaggedNavMode}
        />
      </div>
    </div>
  )
}

// ─── Route: /session/:id ─────────────────────────────────────────────────────

function SessionPage() {
  const { id } = useParams<{ id: string }>()
  const { session, setSession, setFlaggedHands } = useStore()
  const [loading, setLoading] = useState(false)
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    if (session?.id === id) return
    setLoading(true)
    loadSession(id).then(s => {
      if (s) {
        setSession(s)
        setFlaggedHands(s.flaggedHands ?? [])
      } else {
        setMissing(true)
      }
      setLoading(false)
    })
  }, [id])

  if (loading || (!session && !missing)) return <Spinner />
  if (missing) return <NotFound message="Session not found." backTo="/" />

  return <SessionView />
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center text-gray-500 text-sm">
      Loading…
    </div>
  )
}

function NotFound({ message, backTo }: { message: string; backTo: string }) {
  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center gap-4 text-gray-400">
      <p>{message}</p>
      <Link href={backTo} className="text-emerald-400 hover:underline text-sm">Go back</Link>
    </div>
  )
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function App() {
  // Shared hand URLs use ?hand= query param — keep working as before
  if (new URLSearchParams(window.location.search).get('hand')) {
    return <SharedHandView />
  }

  return (
    <Router base="/poker-analytics">
      <Switch>
        <Route path="/session/:id/hand/:handId" component={HandPage} />
        <Route path="/session/:id" component={SessionPage} />
        <Route component={UploadScreen} />
      </Switch>
    </Router>
  )
}
