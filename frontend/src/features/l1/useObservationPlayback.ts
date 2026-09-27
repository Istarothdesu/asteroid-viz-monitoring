import { useDataStore } from '@/store/dataStore'
import { useL1Store } from './store'
import { useObservationPlanStore } from './planRuntime'
import { getL1MissionProvider } from './missionProvider'

export function useObservationPlayback(jd: number) {
  useL1Store(s => s.reference)
  useDataStore(s => s.loaded)
  useObservationPlanStore(s => s.scenario)
  useObservationPlanStore(s => s.externalPlan)
  return getL1MissionProvider().getObservationPlayback(jd)
}
