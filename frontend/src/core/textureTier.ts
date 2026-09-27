/**
 * 纹理分级: 低端设备 (CPU 核数/内存不足) 下发 2k 变体, 默认保持原始 8k/4k。
 * 8k 等距柱状纹理解码后各占 ~134MB 内存/显存, 弱设备上十余张并存代价过高;
 * 2k 变体解码仅 ~8MB/张, 常规监控屏观感差异可忽略。
 * 全部 texUrl 调用方经 loadKtx2 加载 KTX2/GPU 压缩格式 (jpg 后缀 → ktx2,
 * 同名同目录): 显存占用再降 ~8× (8k 约 178MB → 22MB)。环带 png 走
 * TextureLoader 直连路径, 不经过本函数。
 */
const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency ?? 8 : 8
const mem = (typeof navigator !== 'undefined'
  ? (navigator as Navigator & { deviceMemory?: number }).deviceMemory
  : undefined) ?? 8

export const LOW_TIER = cores <= 4 || mem <= 4

export function texUrl(name: string): string {
  const base = !LOW_TIER
    ? `/image/${name}`
    : name === 'starmap_4k.jpg'
      ? '/image/starmap_2k.jpg'
      : name.startsWith('8k_') && name.endsWith('.jpg')
        ? `/image/2k_${name.slice(3)}`
        : `/image/${name}`
  return base.replace(/\.jpg$/, '.ktx2')
}
