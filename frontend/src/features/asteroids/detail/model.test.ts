import { describe, expect, it } from 'vitest';
import type { AsteroidRecord, CloudSeed } from '@/types/asteroid';
import { buildFocusReasons, estimateAsteroidMass, resolveAsteroidTarget } from './model';
import type { AsteroidStaticAnalysis } from './types';

const asteroid = {
  name: '测试目标',
  en: 'TEST',
  cls: '近地小行星',
  diam: 0.2,
  a: 1.1,
  e: 0.1,
  i: 2,
  O: 3,
  w: 4,
  M0: 5,
} as AsteroidRecord;

const cloud = {
  pop: 'neo',
  a: 1.2,
  e: 0.2,
  i: 3,
  om: 4,
  w: 5,
  m0: 6,
  diam: 0.05,
  des: '2026 TEST',
} as CloudSeed;

describe('asteroid detail model', () => {
  it('resolves named and cloud targets into one view model', () => {
    expect(resolveAsteroidTarget('0', [asteroid], [cloud])).toMatchObject({
      kind: 'ast',
      index: 0,
      name: '测试目标',
    });
    expect(resolveAsteroidTarget('c:0', [asteroid], [cloud])).toMatchObject({
      kind: 'cloud',
      index: 0,
      name: '2026 TEST',
      cls: 'MPCORB 真实抽样粒子 · 近地',
    });
  });

  it('builds explainable PHA reasons and mass values', () => {
    const analysis: AsteroidStaticAnalysis = {
      moid: 0.01,
      relation: {
        label: '与地球轨道相交',
        kind: '阿波罗型 (Apollo)',
        q: 0.9,
        Q: 1.2,
      },
      approaches: [],
      periodYr: 1,
      energyMt: 1,
      baseJd: 2460000,
      neo: true,
      pha: true,
    };
    expect(buildFocusReasons(analysis)).toEqual([
      '轨道与地球轨道相交, 存在交会可能',
      '满足潜在危险天体判据 (MOID ≤ 0.05 AU 且直径 ≥ 140 m)',
    ]);
    expect(estimateAsteroidMass(resolveAsteroidTarget('0', [asteroid], null)!)).toEqual({
      massKg: expect.any(Number),
      massExp: 10,
    });
  });
});
