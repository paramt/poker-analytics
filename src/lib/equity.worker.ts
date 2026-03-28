import { calculateEquity } from './equity'

self.onmessage = (e: MessageEvent) => {
  const { reqId, heroCards, villainCards, boardCards } = e.data
  const result = calculateEquity(heroCards, villainCards, boardCards)
  self.postMessage({ reqId, result })
}
