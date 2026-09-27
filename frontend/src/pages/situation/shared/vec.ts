import type { Vec3Like } from '@/utils/orbital/kepler';

/** 可复用位置向量 (供轨道位置计算输出) */
export function v3(): Vec3Like {
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

/** 两点欧氏距离 (AU 场景坐标) */
export function dist3(a: Vec3Like, b: Vec3Like) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2);
}
