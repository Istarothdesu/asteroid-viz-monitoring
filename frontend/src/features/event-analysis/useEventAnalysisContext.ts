import { useEffect, useRef, useState } from 'react'
import { fetchEventAnalysisContext } from './api'
import type { EventAnalysisContext } from './types'

export type AnalysisLoadState = 'loading' | 'ok' | 'miss' | 'err'

export function useEventAnalysisContext(key: string, referenceJd: number) {
  const [context, setContext] = useState<EventAnalysisContext | null>(null)
  const [state, setState] = useState<AnalysisLoadState>('loading')
  const requestSeq = useRef(0)

  useEffect(() => {
    if (!key) return
    const controller = new AbortController()
    const seq = ++requestSeq.current
    setState('loading')
    fetchEventAnalysisContext(key, referenceJd, controller.signal)
      .then((next) => {
        if (seq !== requestSeq.current) return
        setContext(next)
        setState(next ? 'ok' : 'miss')
      })
      .catch(() => {
        if (seq !== requestSeq.current || controller.signal.aborted) return
        setContext(null)
        setState('err')
      })
    return () => controller.abort()
  }, [key, referenceJd])

  return { context, state }
}

