import { useStore } from '../store'

export default function ApiKeyInput() {
  const { apiKey, setApiKey } = useStore()

  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-gray-300" htmlFor="api-key-input">
        Claude API Key
      </label>
      <input
        id="api-key-input"
        type="password"
        value={apiKey}
        onChange={(e) => setApiKey(e.target.value)}
        placeholder="sk-ant-..."
        className="w-full rounded-md bg-gray-800 border border-gray-700 text-gray-100 px-3 py-2 text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
      />
      <p className="text-xs text-gray-500">
        Your key is stored locally and never sent to a server
      </p>
    </div>
  )
}
