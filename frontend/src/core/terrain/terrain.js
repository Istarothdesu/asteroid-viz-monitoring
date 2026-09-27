import { Box3, Frustum, Group, Matrix4, Sphere, Vector3 } from "three";
import * as tt from "./vendor/three-tile.js";
import { ArcGisSource, ArcGisDemSource } from "./vendor/three-tile-plugin.js";
import { A, geoTile, tileGeo, toECEF, fromECEF, surfaceDistance } from "./geo.js";
import { heightGrid, buildCurvedTile, sampleGrid, craterDelta } from "./terrain-geometry.js";

// three-tile 的解码器池为模块共享；在最后一次请求结束后再释放，避免退出/重进相互干扰。
let activeTerrains = 0, pendingLoads = 0;
function releaseIdleWorkers() {
  if (activeTerrains || pendingLoads) return;
  for (const loader of tt.LoaderFactory.getLoaders().demLoaders) loader._workerPool?.dispose();
}

// three-tile 负责数据源、父级数据裁切、LERC Worker、纹理和请求计数。
// 曲面包围体与 LOD 单独实现，不沿用其平面 Tile / TileMap 的空间假设。
export class GlobeTerrain {
  constructor(renderer, createMaterial) {
    activeTerrains++; this.disposed = false;
    this.group = new Group(); this.createMaterial = createMaterial;
    this.renderer = renderer;
    this.loader = new tt.TileMapLoader();
    this.loader.imgSource = [new ArcGisSource({ url: "/api/terrain/img/{z}/{y}/{x}", transparent: false })];
    this.loader.demSource = new ArcGisDemSource({ url: "/api/terrain/dem/{z}/{y}/{x}" });
    this.nodes = new Map(); this.origin = new Vector3(); this.frustum = new Frustum();
    this.matrix = new Matrix4(); this.cameraECEF = new Vector3(); this.frame = 0;
    this.pending = 0; this.generation = 0;
    this.maxLevel = 16; this.maxNodes = 380; this.maxConcurrent = 8;
    this.requests = new Map(); this.lastUpdate = 0; this.focus = []; this.crater = null; this.progress = 0;
  }

  reset() {
    this.generation++;
    for (const node of this.nodes.values()) node.mesh?.dispose();
    this.group.clear(); this.nodes.clear(); this.requests.clear();
  }

  node(x, y, z) {
    const key = `${z}/${x}/${y}`;
    if (this.nodes.has(key)) return this.nodes.get(key);
    const center = tileGeo(x, y, z), anchor = toECEF(center.lon, center.lat);
    // 包含曲面中点和边缘，再加地形余量；不能只用平面四角估计包围盒。
    const box = new Box3();
    for (let j = 0; j <= 4; j++) for (let i = 0; i <= 4; i++) {
      const geo = tileGeo(x, y, z, i / 4, j / 4);
      box.expandByPoint(toECEF(geo.lon, geo.lat, 0).sub(this.origin));
    }
    const angularStep = (2 * Math.PI / 2 ** z) / 4;
    box.expandByScalar(10000 + A * (1 - Math.cos(angularStep / 2)));
    const sphere = box.getBoundingSphere(new Sphere());
    const node = { key, x, y, z, center, anchor, box, sphere, state: "empty", mesh: null, lastUsed: this.frame, retryAt: 0 };
    this.nodes.set(key, node);
    return node;
  }

  children(node) {
    return [this.node(node.x * 2, node.y * 2, node.z + 1), this.node(node.x * 2 + 1, node.y * 2, node.z + 1),
      this.node(node.x * 2, node.y * 2 + 1, node.z + 1), this.node(node.x * 2 + 1, node.y * 2 + 1, node.z + 1)];
  }

  request(node, priority) {
    if (node.state !== "empty" || performance.now() < node.retryAt) return;
    const old = this.requests.get(node.key);
    if (!old || priority < old.priority) this.requests.set(node.key, { node, priority });
  }

  setOpaque(opaque) {
    for (const node of this.nodes.values()) if (node.mesh) {
      for (const material of node.mesh.material) material.transparent = !opaque;
    }
  }

  prefetch(points) { this.focus = points; }

  setCrater(crater) {
    this.crater = crater; this.progress = 0;
    // 复用已下载的 DEM/影像，只重建几何；退出时恢复原始地表。
    for (const node of this.nodes.values()) if (node.state === "ready") {
      const curved = buildCurvedTile(node, node.grid, node.segments, crater);
      node.mesh.geometry.dispose(); node.mesh.geometry = curved.geometry; node.mesh.syncGroups();
      Object.assign(node, curved, { appliedProgress: -1 }); this.deform(node);
      node.box.copy(node.mesh.geometry.boundingBox).translate(node.mesh.position).expandByScalar(crater?.depth ?? 5);
      node.box.getBoundingSphere(node.sphere);
    }
  }

  async load(node) {
    const generation = this.generation;
    node.state = "loading"; this.pending++; pendingLoads++;
    const mesh = new tt.TileMesh();
    try {
      await this.loader.update(node, mesh);
      if (generation !== this.generation) { mesh.dispose(); return; }
      if (!mesh.material.some((m) => m.map)) throw new Error("影像瓦片未就绪");
      if (node.z >= this.loader.demSource.minLevel && !mesh.geometry.userData.source) throw new Error("高程瓦片未就绪");
      const segments = node.z < 4 ? 64 : 32;
      const grid = heightGrid(mesh.geometry, segments);
      const curved = buildCurvedTile(node, grid, segments, this.crater);
      mesh.geometry.dispose(); mesh.geometry = curved.geometry;
      mesh.syncGroups();
      mesh.position.copy(curved.anchor).sub(this.origin);
      node.box.copy(mesh.geometry.boundingBox).translate(mesh.position).expandByScalar(this.crater?.depth ?? 5);
      node.box.getBoundingSphere(node.sphere);
      mesh.visible = false;
      mesh.material = mesh.material.map(source => {
        const material = this.createMaterial(source.map);
        // TileMesh.dispose 按 map 释放纹理，保留其所有权约定。
        material.map = source.map;
        source.dispose(); // 纹理由新材质接管。
        return material;
      });
      Object.assign(node, { mesh, grid, segments, ...curved, state: "ready", failed: false, appliedProgress: -1 });
      this.group.add(mesh); this.deform(node);
    } catch (error) {
      mesh.dispose();
      if (generation === this.generation) {
        node.state = "empty"; node.retryAt = performance.now() + 20000; node.failed = true;
        console.warn(`[地形] ${node.key}: ${error.message}`);
      }
    } finally { this.pending--; pendingLoads--; releaseIdleWorkers(); }
  }

  deform(node) {
    if (!node.deformation || node.appliedProgress === this.progress) return;
    const pos = node.mesh.geometry.attributes.position;
    for (let i = 0; i < pos.array.length; i++) pos.array[i] = node.base[i] + node.deformation[i] * this.progress;
    const color = node.mesh.geometry.attributes.color;
    for (let i = 0; i < color.count; i++) { const c = 1 - node.stain[i] * this.progress; color.setXYZ(i, c, c, c); }
    color.needsUpdate = true;
    pos.needsUpdate = true; node.mesh.geometry.computeVertexNormals();
    node.mesh.geometry.computeBoundingSphere(); node.appliedProgress = this.progress;
  }

  setCraterProgress(value) {
    this.progress = value;
    for (const node of this.nodes.values()) if (node.state === "ready") this.deform(node);
  }

  height(lon, lat, minLevel = 0) {
    for (let z = this.maxLevel; z >= minLevel; z--) {
      const p = geoTile(lon, lat, z), node = this.nodes.get(`${z}/${Math.floor(p.x)}/${Math.floor(p.y)}`);
      if (node?.grid) {
        const delta = this.crater ? craterDelta(surfaceDistance({ lon, lat }, this.crater), this.crater) * this.progress : 0;
        return { height: sampleGrid(node.grid, node.segments, p.x % 1, p.y % 1) + delta, level: z };
      }
    }
    return null;
  }

  update(camera, now = performance.now()) {
    if (this.disposed) return;
    if (now - this.lastUpdate < 90) return;
    this.lastUpdate = now; this.frame++; this.requests.clear();
    camera.updateMatrixWorld();
    this.cameraECEF.copy(camera.position).add(this.origin);
    this.frustum.setFromProjectionMatrix(this.matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse), camera.coordinateSystem);
    const altitude = Math.max(1, fromECEF(this.cameraECEF).height);
    const horizonAngle = Math.acos(A / (A + altitude));
    const camNormal = this.cameraECEF.clone().normalize();
    const pixelScale = this.renderer.domElement.clientHeight / (2 * Math.tan(camera.fov * Math.PI / 360));
    for (const node of this.nodes.values()) if (node.mesh) node.mesh.visible = false;
    const visible = (node) => {
      if (!this.frustum.intersectsBox(node.box)) return false;
      const angle = Math.acos(Math.min(1, Math.max(-1, camNormal.dot(node.anchor.clone().normalize()))));
      return angle < horizonAngle + Math.min(Math.PI, node.sphere.radius / A) + 0.065;
    };
    const visit = (node) => {
      if (!visible(node)) return;
      node.lastUsed = this.frame;
      const distance = Math.max(100, node.sphere.distanceToPoint(camera.position));
      const width = 2 * Math.PI * A / 2 ** node.z * Math.max(0.08, Math.cos(node.center.lat * Math.PI / 180));
      this.request(node, distance / width + node.z * 0.01);
      if (node.state !== "ready") return;
      const refine = node.z < this.maxLevel && width * pixelScale / distance > 640;
      if (refine) {
        const children = this.children(node);
        for (const child of children) { child.lastUsed = this.frame; this.request(child, distance / width + child.z * 0.01); }
        if (children.every((n) => n.state === "ready")) { children.forEach(visit); return; }
      }
      node.mesh.visible = true;
    };
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) visit(this.node(x, y, 2));
    // 提前准备落点与观测点。父层及其四个子瓦片成组准备，使下降时能立即接管。
    for (const point of this.focus) for (let z = 2; z <= (point.level ?? 14); z++) {
      const p = geoTile(point.lon, point.lat, z);
      const x = Math.floor(p.x), y = Math.floor(p.y);
      const nodes = z === 2 ? [this.node(x, y, z)] : this.children(this.node(Math.floor(x / 2), Math.floor(y / 2), z - 1));
      for (const node of nodes) { node.lastUsed = this.frame; this.request(node, 8 + z * 0.05); }
    }
    const queued = [...this.requests.values()].sort((a, b) => a.priority - b.priority);
    for (const { node } of queued) { if (this.pending >= this.maxConcurrent) break; void this.load(node); }
    if (this.nodes.size > this.maxNodes) {
      const unused = [...this.nodes.values()].filter((n) => n.state !== "loading" && !n.mesh?.visible && n.lastUsed < this.frame - 5).sort((a, b) => a.lastUsed - b.lastUsed);
      for (const node of unused) {
        if (this.nodes.size <= this.maxNodes) break;
        if (node.mesh) { this.group.remove(node.mesh); node.mesh.dispose(); }
        this.nodes.delete(node.key);
      }
    }
  }

  get stats() {
    const ready = [...this.nodes.values()].filter((n) => n.state === "ready");
    return { cached: ready.length, visible: ready.filter((n) => n.mesh.visible).length,
      maxLevel: Math.max(0, ...ready.filter((n) => n.mesh.visible).map((n) => n.z)), loading: this.pending,
      failures: [...this.nodes.values()].filter((n) => n.failed).length };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true; this.reset(); this.group.removeFromParent();
    this.loader._errorMaterial.dispose();
    activeTerrains--; releaseIdleWorkers();
  }
}
