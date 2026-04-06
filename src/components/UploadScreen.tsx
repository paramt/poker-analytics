import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'wouter'
import { useStore } from '../store'
import type { Session } from '../types'
import { parseCSV, extractAllPlayers } from '../lib/parser'
import { computeStats, tagBigPots, tagRareHands } from '../lib/stats'
import { saveSession, listSessions } from '../lib/db'
import { scanHands } from '../lib/claude'
import ApiKeyInput from './ApiKeyInput'
import { DEMO_FLAGS } from '../data/demoFlags'

export default function UploadScreen() {
  const [, navigate] = useLocation()
  const { setSession, setFlaggedHands, setScanState, apiKey } = useStore()

  const [dragOver, setDragOver] = useState(false)
  const [csvText, setCsvText] = useState<string | null>(null)
  const [filename, setFilename] = useState<string>('')
  const [players, setPlayers] = useState<{ shortId: string; displayName: string; handCount: number }[]>([])
  const [heroId, setHeroId] = useState<string>('')
  const [parseError, setParseError] = useState<string | null>(null)
  const [recentSessions, setRecentSessions] = useState<Session[]>([])
  const [isStarting, setIsStarting] = useState(false)
  const [isLoadingDemo, setIsLoadingDemo] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    listSessions().then(setRecentSessions)
  }, [])

  function handleFile(file: File) {
    setParseError(null)
    setFilename(file.name)
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      try {
        const extracted = extractAllPlayers(text)
        if (extracted.length === 0) {
          setParseError('No players found in the CSV. Please check the file format.')
          return
        }
        setCsvText(text)
        setPlayers(extracted)
        setHeroId(extracted[0].shortId)
      } catch {
        setParseError('Failed to parse the CSV file. Please ensure it is a valid PokerNow export.')
      }
    }
    reader.readAsText(file)
  }

  const onDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [])

  const onDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(true)
  }, [])

  const onDragLeave = useCallback(() => setDragOver(false), [])

  function onFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  async function handleStart() {
    if (!csvText || !heroId) return
    setIsStarting(true)
    setParseError(null)

    try {
      const hands = parseCSV(csvText, heroId)
      if (hands.length === 0) {
        setParseError('No hands found for the selected player. Try a different hero.')
        setIsStarting(false)
        return
      }

      const stats = computeStats(hands, heroId)
      const bigpotFlags = tagBigPots(hands)
      const rareFlags = tagRareHands(hands)
      const deterministicFlags = [...bigpotFlags, ...rareFlags].sort((a, b) => a.handId - b.handId)

      const heroPlayer = hands[0]?.players[heroId]

      const session: Session = {
        id: crypto.randomUUID(),
        filename,
        uploadedAt: new Date().toISOString(),
        heroId,
        heroDisplayName: heroPlayer?.displayName ?? heroId,
        hands,
        stats,
        flaggedHands: deterministicFlags,
      }

      await saveSession(session)
      setSession(session)
      setFlaggedHands(deterministicFlags)
      navigate(`/session/${session.id}`)

      // Background AI scan (fire and forget)
      if (apiKey) {
        setScanState({ isScanning: true, progress: { completed: 0, total: Math.ceil(hands.length / 50) } })
        scanHands(hands, heroId, apiKey, (progress) => {
          setScanState({ isScanning: true, progress })
        }).then(async ({ results: aiResults, partial: aiPartial }) => {
          const allFlags = [...deterministicFlags, ...aiResults].sort((a, b) => a.handId - b.handId)
          setFlaggedHands(allFlags)
          setScanState({ isScanning: false, partial: aiPartial })
          await saveSession({ ...session, flaggedHands: allFlags })
        }).catch(() => {
          setScanState({ isScanning: false, partial: true })
        })
      }
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'An unexpected error occurred.')
      setIsStarting(false)
    }
  }

  function handleResume(sessionId: string) {
    navigate(`/session/${sessionId}`)
  }

  async function handleDemo() {
    setIsLoadingDemo(true)
    setParseError(null)

    try {
      const response = await fetch('/demo.csv')
      if (!response.ok) throw new Error('Failed to fetch demo data.')
      const csvText = await response.text()

      const demoHeroId = 'PARAM001'
      const hands = parseCSV(csvText, demoHeroId)
      if (hands.length === 0) throw new Error('Demo CSV produced no hands.')

      const stats = computeStats(hands, demoHeroId)
      const bigpotFlags = tagBigPots(hands)
      const rareFlags = tagRareHands(hands)
      // Merge client-computed deterministic flags with the pre-computed AI flags
      const allFlags = [...bigpotFlags, ...rareFlags, ...DEMO_FLAGS].sort((a, b) => a.handId - b.handId)

      const heroPlayer = hands[0]?.players[demoHeroId]

      const session: Session = {
        id: crypto.randomUUID(),
        filename: 'demo-session.csv',
        uploadedAt: new Date().toISOString(),
        heroId: demoHeroId,
        heroDisplayName: heroPlayer?.displayName ?? 'Param',
        hands,
        stats,
        flaggedHands: allFlags,
      }

      await saveSession(session)
      setSession(session)
      setFlaggedHands(allFlags)
      navigate(`/session/${session.id}`)
      // No AI scan triggered — pre-computed flags are already loaded
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Failed to load demo session.')
      setIsLoadingDemo(false)
    }
  }

  const canStart = !!csvText && !!heroId

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-2xl flex flex-col gap-6">
        {/* Title */}
        <div className="text-center">
          <div className="text-4xl mb-2">♠</div>
          <h1 className="text-3xl font-bold text-gray-100">Poker Analytics</h1>
          <p className="text-gray-400 mt-1 text-sm">Import your PokerNow hand history for review and analysis</p>
        </div>

        {/* Drop Zone */}
        <div
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onClick={() => fileInputRef.current?.click()}
          className={`relative flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed cursor-pointer transition-colors p-10 ${
            dragOver
              ? 'border-emerald-400 bg-emerald-900/20'
              : csvText
              ? 'border-emerald-600 bg-emerald-900/10'
              : 'border-gray-600 bg-gray-800 hover:border-gray-500 hover:bg-gray-700'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={onFileInput}
          />
          {csvText ? (
            <>
              <div className="text-3xl">✓</div>
              <div className="text-emerald-400 font-medium">{filename}</div>
              <div className="text-gray-400 text-sm">{players.length} players found — click to replace</div>
            </>
          ) : (
            <>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-10 w-10 text-gray-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
              <div className="text-gray-300 font-medium">Drop your PokerNow CSV here</div>
              <div className="text-gray-500 text-sm">or click to browse</div>
            </>
          )}
        </div>

        {/* Player picker */}
        {players.length > 0 && (
          <div className="bg-gray-800 rounded-xl p-4 flex flex-col gap-3">
            <label className="text-sm font-medium text-gray-300" htmlFor="hero-select">
              Select your player (Hero)
            </label>
            <select
              id="hero-select"
              value={heroId}
              onChange={(e) => setHeroId(e.target.value)}
              className="w-full rounded-md bg-gray-700 border border-gray-600 text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            >
              {players.map((p) => (
                <option key={p.shortId} value={p.shortId}>
                  {p.displayName} ({p.handCount} hands)
                </option>
              ))}
            </select>
          </div>
        )}

        {/* API Key */}
        <div className="bg-gray-800 rounded-xl p-4">
          <ApiKeyInput />
        </div>

        {/* Error */}
        {parseError && (
          <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-xl px-4 py-3 text-sm">
            {parseError}
          </div>
        )}

        {/* Start button */}
        <button
          disabled={!canStart || isStarting}
          onClick={handleStart}
          className={`w-full py-3 rounded-xl font-semibold text-base transition-colors ${
            canStart && !isStarting
              ? 'bg-emerald-700 hover:bg-emerald-600 text-white cursor-pointer'
              : 'bg-gray-700 text-gray-500 cursor-not-allowed'
          }`}
        >
          {isStarting ? 'Loading session…' : 'Start Session'}
        </button>

        {/* Try Demo */}
        <div className="flex items-center justify-center gap-3">
          <div className="h-px flex-1 bg-gray-700" />
          <span className="text-xs text-gray-500 uppercase tracking-widest">or</span>
          <div className="h-px flex-1 bg-gray-700" />
        </div>
        <button
          onClick={handleDemo}
          disabled={isLoadingDemo}
          className="w-full py-2.5 rounded-xl text-sm font-medium transition-colors border border-gray-600 text-gray-300 hover:border-gray-500 hover:text-gray-100 hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {isLoadingDemo ? 'Loading demo…' : 'Try a sample session →'}
        </button>
        <p className="text-center text-xs text-gray-600 -mt-3">
          Pre-loaded sample session — no API key needed
        </p>

        {/* Recent sessions */}
        {recentSessions.length > 0 && (
          <div className="bg-gray-800 rounded-xl p-4 flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">Recent Sessions</h2>
            <div className="flex flex-col gap-2">
              {recentSessions.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between gap-3 bg-gray-700/40 rounded-lg px-3 py-2 border border-gray-700"
                >
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm font-medium text-gray-200 truncate">{s.filename}</span>
                    <span className="text-xs text-gray-400">
                      {s.heroDisplayName} &mdash; {s.hands.length} hands &mdash;{' '}
                      {new Date(s.uploadedAt).toLocaleDateString()}
                    </span>
                  </div>
                  <button
                    onClick={() => handleResume(s.id)}
                    className="shrink-0 px-3 py-1 text-xs font-medium rounded-lg bg-emerald-800 hover:bg-emerald-700 text-emerald-100 transition-colors"
                  >
                    Resume
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
