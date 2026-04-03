import { useState, useEffect } from 'react'
import type { Hand } from '../types'
import { decodeHand } from '../lib/compress'
import HandReplayer from './HandReplayer'

export default function SharedHandView() {
  const [hand, setHand] = useState<Hand | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const encoded = params.get('hand')
    if (!encoded) {
      setError('No hand data found in this link.')
      return
    }
    const decoded = decodeHand(encoded)
    if (!decoded) {
      setError('This link appears to be broken or expired.')
      return
    }
    setHand(decoded)
  }, [])

  if (error) {
    return (
      <div className="min-h-screen bg-gray-900 text-gray-100 flex items-center justify-center p-8">
        <div className="max-w-md text-center">
          <div className="text-5xl mb-4">♠</div>
          <h1 className="text-2xl font-bold mb-2 text-red-400">Broken Link</h1>
          <p className="text-gray-400 mb-6">{error}</p>
          <a
            href="/"
            className="inline-block px-6 py-3 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white font-medium transition-colors"
          >
            Upload your own session
          </a>
        </div>
      </div>
    )
  }

  if (!hand) {
    return (
      <div className="min-h-screen bg-gray-900 text-gray-100 flex items-center justify-center">
        <div className="text-gray-400">Loading hand...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-6 flex flex-col">
      <div className="max-w-4xl mx-auto w-full flex flex-col gap-6 flex-1">
        <HandReplayer hand={hand} hideBack={true} sharedView={true} />
        <div className="text-center text-sm text-gray-500">
          Shared via Poker Analytics &mdash;{' '}
          <a href="/" className="text-emerald-400 hover:text-emerald-300 underline">
            Analyze your own hands
          </a>
        </div>
      </div>
    </div>
  )
}
