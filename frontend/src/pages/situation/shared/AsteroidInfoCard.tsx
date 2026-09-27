import { useEffect, useMemo, useState } from 'react';
import { useDataStore } from '@/store/dataStore';
import { useLiveJd } from '@/hooks/useLiveJd';
import { riskOf } from '@/services/statsService';
import { PLANETS } from '@/data/planets';
import { planetPos } from '@/utils/orbital/planets';
import { astPos } from '@/utils/orbital/asteroids';
import { AU_KM } from '@/utils/orbital/constants';
import { fmtKm, fmtJD } from '@/utils/orbital/time';
import { fetchAsteroidByDes } from '@/api/client';
import { v3, dist3 } from './vec';
import InfoCardView, { type TargetInfo } from './InfoCardView';

/* 云粒子族群中文名 */
const POP_ZH: Record<string, string> = {
  main_belt: '主带',
  neo: '近地',
  hilda: '希尔达群',
  trojan: '木星特洛伊群',
  kuiper: '柯伊伯带',
};

/** MPCORB 可读编号 → SBDB 查询键: '(1) Ceres' 优先用名称, '(52768)' 用编号 */
function sbdbKey(des: string): string {
  const m = des.match(/^\((\d+)\)\s*(.*)$/);
  if (m) return m[2].trim() || m[1];
  return des.trim();
}

/** 云粒子 SBDB 按需补全的会话级缓存 (同一编号不重复请求) */
const sbdbCache = new Map<string, { cls: string; fullname: string }>();

/**
 * 小行星目标信息卡: 命名小行星 (ast) 与云粒子 (cloud) 统一推演;
 * 云粒子按需从 SBDB 补全轨道分类/正式名 (会话级缓存)。
 */
export default function AsteroidInfoCard({
  kind,
  idx,
}: {
  kind: 'ast' | 'cloud';
  idx: number;
}) {
  const asteroids = useDataStore((s) => s.asteroids);
  const cloudSeeds = useDataStore((s) => s.cloudSeeds);
  const jd = useLiveJd();

  /* 云粒子选中时按需补全 SBDB 增量信息, 库内直返或现取缓存 */
  const [sbdbExtra, setSbdbExtra] = useState<{
    cls: string;
    fullname: string;
  } | null>(null);
  useEffect(() => {
    if (kind !== 'cloud') {
      setSbdbExtra(null);
      return;
    }
    const des = cloudSeeds?.[idx]?.des;
    if (!des) {
      setSbdbExtra(null);
      return;
    }
    const key = sbdbKey(des);
    const cached = sbdbCache.get(key);
    if (cached) {
      setSbdbExtra(cached);
      return;
    }
    let live = true;
    setSbdbExtra(null);
    fetchAsteroidByDes(key)
      .then((rec) => {
        if (!live) return;
        const extra = { cls: rec.cls, fullname: rec.en };
        sbdbCache.set(key, extra);
        setSbdbExtra(extra);
      })
      .catch(() => {
        /* SBDB 无此天体或超时: 静默降级, 卡片仅显示行内信息 */
      });
    return () => {
      live = false;
    };
  }, [kind, idx, cloudSeeds]);

  const info = useMemo((): TargetInfo | null => {
    const earth = v3();
    planetPos(PLANETS[2], jd, earth);

    if (kind === 'ast') {
      const a = asteroids[idx];
      if (!a) return null;
      const pos = v3();
      astPos(a, jd, pos);
      const distSun = Math.sqrt(pos.x ** 2 + pos.y ** 2 + pos.z ** 2);
      const distEarth = dist3(pos, earth);
      return {
        title: a.name,
        risk: riskOf(a.en),
        rows: [
          ['编号', a.en],
          ['分类', a.cls],
          [
            '直径',
            a.diam >= 1
              ? `${a.diam.toFixed(1)} km`
              : `${(a.diam * 1000).toFixed(0)} m`,
          ],
          ['轨道半长轴', `${a.a.toFixed(4)} AU`],
          ['轨道偏心率', a.e.toFixed(4)],
          ['轨道倾角', `${a.i.toFixed(2)}°`],
          ['升交点经度', `${a.O.toFixed(1)}°`],
          ['近日点幅角', `${a.w.toFixed(1)}°`],
          ...(a.epochJd
            ? [['根数历元', fmtJD(a.epochJd).slice(0, 10)] as [string, string]]
            : []),
          ['当前距日', `${distSun.toFixed(4)} AU`],
          ['当前距地', fmtKm(distEarth * AU_KM)],
        ],
        desc: a.cls,
      };
    }

    const seed = cloudSeeds?.[idx];
    if (!seed) return null;
    const pos = v3();
    astPos(
      { a: seed.a, e: seed.e, i: seed.i, O: seed.om, w: seed.w, M0: seed.m0 },
      jd,
      pos,
    );
    const distSun = Math.sqrt(pos.x ** 2 + pos.y ** 2 + pos.z ** 2);
    const distEarth = dist3(pos, earth);
    const rows: [string, string][] = [
      ['编号', seed.des ?? '— (未编号抽样)'],
      ['族群', POP_ZH[seed.pop] ?? seed.pop],
      [
        '估算直径',
        seed.diam >= 1
          ? `${seed.diam.toFixed(1)} km`
          : `${(seed.diam * 1000).toFixed(0)} m`,
      ],
      ['轨道半长轴', `${seed.a.toFixed(4)} AU`],
      ['轨道偏心率', seed.e.toFixed(4)],
      ['轨道倾角', `${seed.i.toFixed(2)}°`],
      ['当前距日', `${distSun.toFixed(4)} AU`],
      ['当前距地', fmtKm(distEarth * AU_KM)],
    ];
    if (sbdbExtra) {
      rows.push(['轨道分类', sbdbExtra.cls]);
      if (sbdbExtra.fullname && sbdbExtra.fullname !== seed.des) {
        rows.push(['正式名称', sbdbExtra.fullname]);
      }
    }
    return {
      title: seed.des ?? `云粒子 #${idx + 1}`,
      rows,
      desc: seed.des
        ? '小行星云真实抽样粒子 (MPC 轨道根数), 可进入专题页发起主动观测推演。'
        : '小行星云抽样粒子 (无编号), 轨道来自 MPC 真实根数, 可进入专题页推演。',
    };
  }, [kind, idx, jd, asteroids, cloudSeeds, sbdbExtra]);

  return <InfoCardView info={info} />;
}
