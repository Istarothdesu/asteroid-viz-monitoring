import { PLANETS } from '@/data/planets';
import { riskOf, type RiskLevel } from '@/services/statsService';
import type { AsteroidRecord, CloudSeed } from '@/types/asteroid';
import type { SelectionTarget } from '@/types/scene';
import { astPos, meanMotionDeg } from '@/utils/orbital/asteroids';
import { AU_KM } from '@/utils/orbital/constants';
import {
  classifyEarthRelation,
  findApproaches,
  moidToEarth,
  relSpeed,
} from '@/utils/orbital/encounter';
import { estimateEnergyMt } from '@/utils/orbital/impact';
import type { Vec3Like } from '@/utils/orbital/kepler';
import { planetPos } from '@/utils/orbital/planets';
import { fmtJD } from '@/utils/orbital/time';
import { LD_KM } from './AsteroidDetailContext';
import type {
  AsteroidRealtimeState,
  AsteroidStaticAnalysis,
  AsteroidTarget,
} from './types';

const EARTH = PLANETS[2];

const POPULATION_LABEL: Record<string, string> = {
  main_belt: '主带',
  neo: '近地',
  hilda: '希尔达群',
  trojan: '木星特洛伊群',
  kuiper: '柯伊伯带',
};

function vector3(): Vec3Like {
  return {
    x: 0,
    y: 0,
    z: 0,
    set(x, y, z) {
      this.x = x;
      this.y = y;
      this.z = z;
    },
  };
}

/** 将路由标识解析为与来源无关的专题目标。 */
export function resolveAsteroidTarget(
  routeId: string,
  asteroids: AsteroidRecord[],
  cloudSeeds: CloudSeed[] | null,
): AsteroidTarget | undefined {
  if (routeId.startsWith('c:')) {
    const index = Number(routeId.slice(2));
    const seed = Number.isInteger(index) ? cloudSeeds?.[index] : undefined;
    if (!seed) return undefined;
    const designation = seed.des ?? `CLOUD-${index + 1}`;
    return {
      el: { a: seed.a, e: seed.e, i: seed.i, O: seed.om, w: seed.w, M0: seed.m0 },
      name: seed.des ?? `云粒子 #${index + 1}`,
      en: designation,
      cls: `MPCORB 真实抽样粒子 · ${POPULATION_LABEL[seed.pop] ?? seed.pop}`,
      diam: seed.diam,
      kind: 'cloud',
      index,
    };
  }

  const index = Number(routeId);
  const record = Number.isInteger(index) ? asteroids[index] : undefined;
  if (!record) return undefined;
  return {
    el: {
      a: record.a,
      e: record.e,
      i: record.i,
      O: record.O,
      w: record.w,
      M0: record.M0,
      des: record.des,
    },
    name: record.name,
    en: record.en,
    cls: record.cls,
    diam: record.diam,
    spinH: record.spinH,
    kind: 'ast',
    index,
  };
}

export function targetSelection(target: AsteroidTarget): SelectionTarget {
  return { kind: target.kind, idx: target.index };
}

export function computeAsteroidRealtime(
  target: AsteroidTarget,
  jd: number,
): AsteroidRealtimeState {
  const asteroid = vector3();
  const earth = vector3();
  astPos(target.el, jd, asteroid);
  planetPos(EARTH, jd, earth);
  return {
    distSun: Math.hypot(asteroid.x, asteroid.y, asteroid.z),
    distEarth: Math.hypot(
      asteroid.x - earth.x,
      asteroid.y - earth.y,
      asteroid.z - earth.z,
    ),
    speed: relSpeed(target.el, EARTH, jd),
  };
}

/** MOID 与接近事件属于目标级静态分析，不随播放时钟逐帧重算。 */
export function computeAsteroidAnalysis(
  target: AsteroidTarget,
  baseJd: number,
): AsteroidStaticAnalysis {
  const moid = moidToEarth(target.el);
  const relation = classifyEarthRelation(target.el.a, target.el.e);
  return {
    moid,
    relation,
    approaches: findApproaches(target.el, EARTH, baseJd),
    periodYr: 360 / meanMotionDeg(target.el.a) / 365.25,
    energyMt: estimateEnergyMt(target.diam * 1000),
    baseJd,
    neo: relation.q < 1.3,
    pha: moid <= 0.05 && target.diam >= 0.14,
  };
}

export function asteroidRisk(
  target: AsteroidTarget,
  analysis: AsteroidStaticAnalysis,
): RiskLevel {
  if (target.kind === 'ast') return riskOf(target.en);
  if (analysis.pha) return 'medium';
  return analysis.neo ? 'low' : 'normal';
}

export function buildFocusReasons(analysis: AsteroidStaticAnalysis): string[] {
  const reasons: string[] = [];
  if (analysis.relation.label.includes('相交')) {
    reasons.push('轨道与地球轨道相交, 存在交会可能');
  }
  if (analysis.pha) {
    reasons.push('满足潜在危险天体判据 (MOID ≤ 0.05 AU 且直径 ≥ 140 m)');
  } else if (analysis.moid <= 0.2) {
    reasons.push(`MOID ${analysis.moid.toFixed(3)} AU, 交会几何条件较近`);
  }
  if (analysis.approaches.length > 0) {
    const closest = analysis.approaches[0];
    reasons.push(
      `前后 20 年最近一次接近: ${fmtJD(closest.jd).slice(0, 10)} (${((closest.distAu * AU_KM) / LD_KM).toFixed(1)} LD)`,
    );
  }
  return reasons.length > 0 ? reasons : ['当前无显著接近风险, 维持常规监测'];
}

export function estimateAsteroidMass(target: AsteroidTarget) {
  const massKg = 3000 * (Math.PI / 6) * (target.diam * 1000) ** 3;
  return { massKg, massExp: Math.floor(Math.log10(massKg)) };
}
