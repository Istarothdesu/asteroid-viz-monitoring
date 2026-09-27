import type * as THREE from 'three'
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js'

/* ============================================================================
 * KTX2 压缩贴图加载
 *
 * 天体/星空贴图统一走 KTX2 (Basis Universal ETC1S): 显存中保持 GPU 压缩态,
 * 8k 贴图 ~178MB (RGBA+mips) → ~22MB, 且上传带宽同比例下降; JPG 仅是磁盘
 * 压缩, 解码后仍全量占显存。转码器在 public/basis/, detectSupport 按 GPU
 * 能力选择目标格式 (桌面 BC7 / 移动 ASTC·ETC)。
 * ========================================================================== */

let ktx2: KTX2Loader | null = null

/** 渲染器创建后、任何贴图加载之前执行 */
export function initKtx2(renderer: THREE.WebGLRenderer): void {
  ktx2 = new KTX2Loader().setTranscoderPath('/basis/').detectSupport(renderer)
}

/** 加载 KTX2 贴图, Promise/回调两用 (onLoad 先于 Promise resolve 触发)。
 *  与 TextureLoader 不同, KTX2Loader 不同步返回纹理对象 —— 自定义地表材质
 *  等需要纹理对象的场景应在回调/then 中构建。color map 记得设 SRGBColorSpace */
export function loadKtx2(
  url: string,
  onLoad?: (tex: THREE.Texture) => void,
): Promise<THREE.Texture> {
  if (!ktx2)
    throw new Error('KTX2Loader 未初始化: 需先调用 initKtx2(renderer)')
  return ktx2.loadAsync(url).then((tex) => {
    onLoad?.(tex)
    return tex
  })
}
