import { get, set, keys, del } from 'idb-keyval'
import type { Session } from '../types'

const SESSION_KEY_PREFIX = 'session:'

function sessionKey(id: string): string {
  return `${SESSION_KEY_PREFIX}${id}`
}

export async function saveSession(session: Session): Promise<void> {
  try {
    await set(sessionKey(session.id), session)
  } catch (err) {
    // Handle storage quota exceeded
    const isQuotaError =
      err instanceof DOMException &&
      (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED')
    if (isQuotaError) {
      throw new Error('Storage full — please clear browser data to save new sessions.')
    }
    throw err
  }
}

export async function loadSession(id: string): Promise<Session | null> {
  try {
    const session = await get<Session>(sessionKey(id))
    return session ?? null
  } catch {
    return null
  }
}

export async function listSessions(): Promise<Session[]> {
  try {
    const allKeys = await keys<string>()
    const sessionKeys = allKeys.filter(k => typeof k === 'string' && k.startsWith(SESSION_KEY_PREFIX))
    const sessions = await Promise.all(
      sessionKeys.map(k => get<Session>(k))
    )
    return sessions
      .filter((s): s is Session => s !== undefined)
      .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())
  } catch {
    return []
  }
}

export async function deleteSession(id: string): Promise<void> {
  await del(sessionKey(id))
}
