import { useDataStore } from '@/store/dataStore'
import { getL1Tasks } from '@/services/l1MissionService'
import { useL1Store } from './store'
import { useObservationPlanStore } from './planRuntime'

export function useMissionTasks(jdTdb: number) {
  useL1Store(s => s.reference)
  useDataStore(s => s.loaded)
  useObservationPlanStore(s => s.scenario)
  useObservationPlanStore(s => s.externalPlan)
  return getL1Tasks(jdTdb)
}
