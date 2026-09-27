import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'
import { CleanupRegistry, disposeObjectTree } from './objectUtils'

describe('场景资源清理', () => {
  it('按创建的逆序执行清理且不会重复执行', () => {
    const order: number[] = []
    const registry = new CleanupRegistry()
    registry.add(() => order.push(1))
    registry.add(() => order.push(2))

    registry.dispose()
    registry.dispose()
    expect(order).toEqual([2, 1])
  })

  it('释放对象树中的几何和材质', () => {
    const root = new THREE.Group()
    const geometry = new THREE.SphereGeometry(1)
    const material = new THREE.MeshBasicMaterial()
    const geometryDispose = vi.spyOn(geometry, 'dispose')
    const materialDispose = vi.spyOn(material, 'dispose')
    root.add(new THREE.Mesh(geometry, material))

    disposeObjectTree(root)
    expect(geometryDispose).toHaveBeenCalledOnce()
    expect(materialDispose).toHaveBeenCalledOnce()
  })
})
