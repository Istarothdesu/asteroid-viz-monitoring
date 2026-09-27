import * as THREE from 'three'

/** Three.js 子对象的 visible 不包含祖先状态，DOM 标签需检查整条对象链。 */
export function isObjectTreeVisible(object: THREE.Object3D): boolean {
  let current: THREE.Object3D | null = object
  while (current) {
    if (!current.visible) return false
    current = current.parent
  }
  return true
}

/** 释放材质及其全部纹理槽。 */
export function disposeMaterial(material: THREE.Material): void {
  for (const value of Object.values(material) as unknown[]) {
    if (value && (value as THREE.Texture).isTexture) (value as THREE.Texture).dispose()
  }
  if (material instanceof THREE.ShaderMaterial) {
    for (const { value } of Object.values(material.uniforms)) {
      if (value?.isTexture) value.dispose()
    }
  }
  material.dispose()
}

/** 按注册的逆序执行清理；适合与系统创建顺序配对。 */
export class CleanupRegistry {
  private cleanups: Array<() => void> = []

  add(cleanup: () => void): void {
    this.cleanups.push(cleanup)
  }

  dispose(): void {
    for (let index = this.cleanups.length - 1; index >= 0; index--) {
      this.cleanups[index]()
    }
    this.cleanups = []
  }
}

/** 释放场景树中的几何、材质及材质引用的纹理。 */
export function disposeObjectTree(root: THREE.Object3D): void {
  root.traverse((object) => {
    const renderable = object as THREE.Mesh
    if (renderable.geometry) renderable.geometry.dispose()
    const material = (renderable as unknown as {
      material?: THREE.Material | THREE.Material[]
    }).material
    if (Array.isArray(material)) material.forEach(disposeMaterial)
    else if (material) disposeMaterial(material)
  })
}

/** 对象树中 Mesh 几何的世界包围半径，忽略 Sprite/Points 标记层。 */
export function geometryWorldRadius(object: THREE.Object3D): number {
  const worldScale = new THREE.Vector3()
  let radius = 0
  object.traverse((child) => {
    const mesh = child as THREE.Mesh
    if (!(mesh as unknown as { isMesh?: boolean }).isMesh || !mesh.geometry) return
    if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere()
    const scale = child.getWorldScale(worldScale)
    radius = Math.max(
      radius,
      mesh.geometry.boundingSphere!.radius
        * Math.max(Math.abs(scale.x), Math.abs(scale.y), Math.abs(scale.z)),
    )
  })
  return radius
}
