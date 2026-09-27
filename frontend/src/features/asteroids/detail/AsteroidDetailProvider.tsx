import { useCallback, useMemo, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLiveJd } from '@/hooks/useLiveJd';
import { generateObsTasks } from '@/services/obsTaskService';
import { useDataStore } from '@/store/dataStore';
import { useSimStore } from '@/store/simStore';
import type { SelectionTarget } from '@/types/scene';
import { AsteroidDetailContext } from './AsteroidDetailContext';
import {
  asteroidRisk,
  buildFocusReasons,
  computeAsteroidAnalysis,
  computeAsteroidRealtime,
  estimateAsteroidMass,
  resolveAsteroidTarget,
  targetSelection,
} from './model';
import type { AsteroidDetailModel } from './types';
import { useAsteroidDetailScene } from './useAsteroidDetailScene';

export default function AsteroidDetailProvider({ children }: { children: ReactNode }) {
  const { idx: routeId = '' } = useParams();
  const navigate = useNavigate();
  const asteroids = useDataStore((state) => state.asteroids);
  const cloudSeeds = useDataStore((state) => state.cloudSeeds);

  const target = useMemo(
    () => resolveAsteroidTarget(routeId, asteroids, cloudSeeds),
    [asteroids, cloudSeeds, routeId],
  );
  const subject = useMemo(() => target ? targetSelection(target) : null, [target]);
  const navigateToTarget = useCallback((selected: SelectionTarget) => {
    const prefix = selected.kind === 'cloud' ? 'c:' : '';
    navigate(`/asteroid/${prefix}${selected.idx}`);
  }, [navigate]);
  const { inComp, toggleComp } = useAsteroidDetailScene({
    subject,
    onTargetChange: navigateToTarget,
  });

  const jd = useLiveJd(500);
  const realtime = useMemo(
    () => target ? computeAsteroidRealtime(target, jd) : null,
    [jd, target],
  );
  const analysis = useMemo(() => {
    if (!target) return null;
    return computeAsteroidAnalysis(target, useSimStore.getState().jd);
  }, [target]);
  const obsTasks = useMemo(() => {
    if (!target || !analysis) return [];
    return generateObsTasks(target.el, analysis.baseJd, {
      des: target.en,
      pha: analysis.pha,
    });
  }, [analysis, target]);

  const back = useCallback(() => navigate('/situation/overview'), [navigate]);
  const model = useMemo<AsteroidDetailModel | null>(() => {
    if (!target || !realtime || !analysis) return null;
    const { massKg, massExp } = estimateAsteroidMass(target);
    return {
      vm: target,
      jd,
      realtime,
      analysis,
      obsTasks,
      risk: asteroidRisk(target, analysis),
      reasons: buildFocusReasons(analysis),
      massKg,
      massExp,
      inComp,
      toggleComp,
      back,
    };
  }, [analysis, back, inComp, jd, obsTasks, realtime, target, toggleComp]);

  return (
    <AsteroidDetailContext.Provider value={model}>
      {children}
    </AsteroidDetailContext.Provider>
  );
}
