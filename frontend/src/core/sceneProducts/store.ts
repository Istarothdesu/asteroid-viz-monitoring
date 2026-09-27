import { create } from 'zustand'
import { emptySceneProducts, type SceneProducts } from './types'

interface SceneProductState {
  contextId: string | null
  products: SceneProducts
  focusRevision: number
  activate: (contextId: string) => void
  publish: <K extends keyof SceneProducts>(
    contextId: string,
    key: K,
    product: SceneProducts[K],
  ) => void
  clearProducts: (contextId: string, keys: (keyof SceneProducts)[]) => void
  requestBPlaneFocus: (contextId: string) => void
  clear: (contextId?: string) => void
}

/** 业务层发布、渲染层消费的唯一场景产品注册表。 */
export const useSceneProductStore = create<SceneProductState>((set) => ({
  contextId: null,
  products: emptySceneProducts(),
  focusRevision: 0,
  activate: (contextId) => set((state) => state.contextId === contextId ? state : ({
    contextId,
    products: emptySceneProducts(),
  })),
  publish: (contextId, key, product) => set((state) => state.contextId !== contextId ? state : ({
    products: { ...state.products, [key]: product },
  })),
  clearProducts: (contextId, keys) => set((state) => {
    if (state.contextId !== contextId) return state
    const products = { ...state.products }
    keys.forEach((key) => { products[key] = null })
    return { products }
  }),
  requestBPlaneFocus: (contextId) => set((state) => state.contextId !== contextId ? state : ({
    focusRevision: state.focusRevision + 1,
  })),
  clear: (contextId) => set((state) => contextId && state.contextId !== contextId ? state : ({
    contextId: null,
    products: emptySceneProducts(),
  })),
}))
