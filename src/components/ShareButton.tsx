import { useState } from 'react'
import type { Hand } from '../types'
import { encodeHand } from '../lib/compress'

interface Props {
  hand: Hand
}

export default function ShareButton({ hand }: Props) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    const encoded = encodeHand(hand)
    const base = import.meta.env.BASE_URL.replace(/\/$/, '')
    const url = `${window.location.origin}${base}/?hand=${encoded}`
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-100 text-sm font-medium transition-colors"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-4 w-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
        />
      </svg>
      {copied ? 'Copied!' : 'Copy Link'}
    </button>
  )
}
