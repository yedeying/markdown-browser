import { useEffect, useRef, useState } from 'preact/hooks'
import type { WatchEvent } from '../../types.js'

export function useSSE(url: string, onEvent: (event: WatchEvent) => void) {
  const [connected, setConnected] = useState(false)
  const onEventRef = useRef(onEvent)
  onEventRef.current = onEvent

  useEffect(() => {
    let es: EventSource
    let retryTimer: ReturnType<typeof setTimeout>

    function connect() {
      es = new EventSource(url)

      es.onopen = () => setConnected(true)

      es.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data) as WatchEvent
          onEventRef.current(event)
        } catch {
          // ignore parse errors
        }
      }

      es.onerror = () => {
        setConnected(false)
        es.close()
        // 3s 后重连
        retryTimer = setTimeout(connect, 3000)
      }
    }

    connect()

    return () => {
      clearTimeout(retryTimer)
      es?.close()
    }
  }, [url])

  return connected
}
