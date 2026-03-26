import { useEffect, useState } from 'react'
import { useStore } from './store'
import UploadScreen from './components/UploadScreen'
import SessionView from './components/SessionView'
import HandReplayer from './components/HandReplayer'
import SharedHandView from './components/SharedHandView'

type Route = 'upload' | 'session' | 'replayer' | 'shared'

export default function App() {
  const { session, selectedHand } = useStore()
  const [route, setRoute] = useState<Route>(() => {
    const params = new URLSearchParams(window.location.search)
    return params.get('hand') ? 'shared' : 'upload'
  })

  useEffect(() => {
    if (route === 'shared') return
    if (selectedHand) {
      setRoute('replayer')
    } else if (session) {
      setRoute('session')
    } else {
      setRoute('upload')
    }
  }, [session, selectedHand, route])

  if (route === 'shared') {
    return <SharedHandView />
  }

  if (route === 'replayer' && selectedHand) {
    return (
      <div className="min-h-screen bg-gray-900 text-gray-100 p-6">
        <div className="max-w-5xl mx-auto">
          <HandReplayer hand={selectedHand} />
        </div>
      </div>
    )
  }

  if (route === 'session' && session) {
    return <SessionView />
  }

  return <UploadScreen />
}
