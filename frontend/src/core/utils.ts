import * as THREE from 'three'
import { AU_KM } from '@/utils/orbital/constants'

/* 各向异性过滤档位: 斜视角下 (星空天球内侧掠射、行星边缘/极区、土星环平面)
   mipmap 的方形采样假设失效, 各向同性采样会沿拉伸方向过糊;
   8 档在桌面/移动 GPU 均被普遍支持, 开销可忽略 */
export const ANISO = 8

/** 给刚创建的纹理启用各向异性过滤 (TextureLoader.load 同步返回纹理对象,
    可链式包裹: const tex = withAniso(loader.load(url))) */
export function withAniso(tex: THREE.Texture): THREE.Texture {
  tex.anisotropy = ANISO
  return tex
}

export function createGlowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.25, 'rgba(255,255,255,0.55)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 128, 128)
  return new THREE.CanvasTexture(c)
}

/* 标记层光圈纹理: 细线圆环 (行星标记), 高斯环带软化内外边缘;
   环带宽度 0.14 保证远景线条清晰可辨; 窗口函数保证 quad 边缘严格归零,
   避免叠加混合下露出矩形轮廓 */
export function createRingTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const ctx = c.getContext('2d')!
  const img = ctx.createImageData(128, 128)
  for (let y = 0; y < 128; y++) {
    for (let x = 0; x < 128; x++) {
      const dx = (x - 63.5) / 64, dy = (y - 63.5) / 64
      const r2 = dx * dx + dy * dy
      const band = Math.exp(-Math.pow((Math.sqrt(r2) - 0.78) / 0.14, 2))
      const win = Math.max(0, 1 - r2)
      const a = band * win
      const i = (y * 128 + x) * 4
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255
      img.data[i + 3] = Math.round(Math.min(1, a) * 255)
    }
  }
  ctx.putImageData(img, 0, 0)
  return new THREE.CanvasTexture(c)
}

/* 标记层小圆点纹理: 紧凑高斯亮点 (小行星标记), 衰减适中保证远景醒目,
   视觉上仍读作"点"而非"光斑" */
export function createDotTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const ctx = c.getContext('2d')!
  const img = ctx.createImageData(128, 128)
  for (let y = 0; y < 128; y++) {
    for (let x = 0; x < 128; x++) {
      const dx = (x - 63.5) / 64, dy = (y - 63.5) / 64
      const r2 = dx * dx + dy * dy
      const win = Math.max(0, 1 - r2)
      const a = Math.exp(-r2 * 7) * win * win
      const i = (y * 128 + x) * 4
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255
      img.data[i + 3] = Math.round(Math.min(1, a) * 255)
    }
  }
  ctx.putImageData(img, 0, 0)
  return new THREE.CanvasTexture(c)
}

/* 太阳日冕专用纹理: 256px 高分辨率 + 高斯亮核叠加宽缓外晕,
   衰减平滑连续 —— 共享的 128px glow 纹理衰减偏硬, 放大成
   大日冕时会出现环带/硬边失真 */
export function createSunCoronaTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const ctx = c.getContext('2d')!
  const img = ctx.createImageData(256, 256)
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      const dx = (x - 127.5) / 128, dy = (y - 127.5) / 128
      const r2 = dx * dx + dy * dy
      /* 高斯永不为零: 必须乘上在 quad 边缘 (r=1) 精确归零的窗口函数
         (1-r²)², 否则残留 alpha 在叠加混合下会露出矩形 quad 轮廓 */
      const win = Math.max(0, 1 - r2)
      const a = (Math.exp(-r2 * 9.0) + 0.45 * Math.exp(-r2 * 2.2)) * win * win
      const i = (y * 256 + x) * 4
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255
      img.data[i + 3] = Math.round(Math.min(1, a) * 255)
    }
  }
  ctx.putImageData(img, 0, 0)
  return new THREE.CanvasTexture(c)
}

/* 拖尾专用柔和纹理: 高斯式宽缓衰减、无明显亮核 ——
   多个光斑重叠叠加时融成连续光带, 不会露出"一粒粒"的硬边 */
export function createStreakTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const ctx = c.getContext('2d')!
  const img = ctx.createImageData(128, 128)
  for (let y = 0; y < 128; y++) {
    for (let x = 0; x < 128; x++) {
      const dx = (x - 63.5) / 64, dy = (y - 63.5) / 64
      const a = Math.exp(-(dx * dx + dy * dy) * 3.2)   // 高斯衰减
      const i = (y * 128 + x) * 4
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255
      img.data[i + 3] = Math.round(a * 255)
    }
  }
  ctx.putImageData(img, 0, 0)
  return new THREE.CanvasTexture(c)
}

/* 展示系统口径: 几何层永远真实比例 —— 天体网格半径 = 真实半径 × 全局尺寸倍数,
   天体间比例与飞掠/接近间隙 100% 准确; 不设最小半径底限 (底限即失真),
   远景可见性由标记层 (辉光光点/标签/选中光圈) 保障 */
export function displayRadius(rKm: number, sizeScale = 1): number {
  return rKm / AU_KM * sizeScale
}

/* 标记层统一尺寸规则: 标记直径 = max(天体×nearK, 视距×farK)。
   近景随天体退为外围标记, 远景保持恒定屏幕尺寸 —— 标记是定位符不是天体,
   两标记重叠属于真实角距投影, 拉近即可分离。
   默认参数为行星光圈 (远景约 9 px); 小行星小圆点用更小的系数 (见调用处) */
export function markerScale(bodyR: number, camDist: number, nearK = 3, farK = 0.008): number {
  return Math.max(bodyR * nearK, camDist * farK)
}

export function glowSprite(glowTex: THREE.Texture, color: number, opacity: number): THREE.Sprite {
  return new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTex, color, transparent: true, depthWrite: false,
      sizeAttenuation: true, blending: THREE.AdditiveBlending, opacity,
    })
  )
}
