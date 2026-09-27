import axios from 'axios'
import type { EventAnalysisContext } from './types'

const http = axios.create({ baseURL: import.meta.env.VITE_API_BASE ?? '', timeout: 20000 })

export async function fetchEventAnalysisContext(
  key: string,
  referenceJd: number,
  signal?: AbortSignal,
): Promise<EventAnalysisContext | null> {
  try {
    const { data } = await http.get(`/api/analysis/events/${encodeURIComponent(key)}`, {
      params: { reference_jd: referenceJd },
      signal,
    })
    return data
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) return null
    throw error
  }
}

