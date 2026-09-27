import * as THREE from "three";
import { CLOUD } from "@/data/cloudConfig";
import type { CloudSeed } from "@/types/asteroid";
import { TAU, JD_J2000, KGAUSS, D2R } from "@/utils/orbital/constants";
import { createGlowTexture } from "./utils";

function gauss(mu: number, sigma: number): number {
  const u = Math.max(1e-10, 1 - Math.random());
  return (
    mu + sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * Math.random())
  );
}

export class AsteroidCloud {
  private N = 0;
  /** 当前种子 (与缓冲同序): 身份/轨道高亮/专题页的数据源 */
  private seeds: CloudSeed[] = [];
  private mesh!: THREE.Mesh;
  private iGeo!: THREE.InstancedBufferGeometry;
  private mat!: THREE.ShaderMaterial;
  private plane!: THREE.PlaneGeometry;
  private pos!: Float32Array;
  private col!: Float32Array;
  /** 日心坐标缓存: 开普勒解 (贵) 分帧刷新, 刚体变换 (贱) 每帧全量 */
  private helio!: Float32Array;
  private cursor = 0;
  private keplerAll = true;
  readonly baseCol!: Float32Array;
  private aA!: Float32Array;
  private eA!: Float32Array;
  private sqA!: Float32Array;
  private nA!: Float32Array;
  private M0A!: Float32Array;
  private r00!: Float32Array;
  private r01!: Float32Array;
  private r10!: Float32Array;
  private r11!: Float32Array;
  private r20!: Float32Array;
  private r21!: Float32Array;
  private readonly uPxScale: { value: number };
  private scene: THREE.Scene;

  constructor(scene: THREE.Scene, uPxScale: { value: number }) {
    this.scene = scene;
    this.uPxScale = uPxScale;
    this.plane = new THREE.PlaneGeometry(1, 1);
    this._initMaterial();
    this._build(this._genProcedural());
  }

  /** 后端真实样本到达后重建 (几何缓冲整体替换, 材质复用) */
  rebuild(seeds: CloudSeed[]): void {
    this.iGeo.dispose();
    this._build(seeds);
  }

  /** 程序化种子: 分布参数沿用原实现 (无后端时的降级渲染) */
  private _genProcedural(): CloudSeed[] {
    const seeds: CloudSeed[] = [];
    const rnd = Math.random.bind(Math);

    const gaps: [number, number][] = [
      [2.5, 0.12],
      [2.82, 0.07],
      [2.96, 0.07],
      [3.27, 0.06],
    ];
    for (let k = 0; k < CLOUD.beltCount; k++) {
      let a: number;
      do {
        a = 2.0 + 1.55 * rnd();
      } while (gaps.some((g) => Math.abs(a - g[0]) < g[1]));
      seeds.push({
        pop: "main_belt", a,
        e: Math.min(Math.abs(gauss(0.14, 0.08)), 0.45),
        i: Math.min(Math.abs(gauss(9, 7)), 35),
        om: rnd() * 360, w: rnd() * 360, m0: rnd() * 360,
        diam: Math.exp(gauss(Math.log(8), 1.3)),
      });
    }
    for (let k = 0; k < CLOUD.neoCount; k++) {
      const watch = rnd() < 0.3;
      seeds.push({
        pop: "neo",
        a: 0.65 + 1.75 * Math.pow(rnd(), 1.4),
        e: Math.min(0.12 + 0.75 * rnd(), 0.92),
        i: Math.min(Math.abs(gauss(12, 11)), 40),
        om: rnd() * 360, w: rnd() * 360, m0: rnd() * 360,
        diam: Math.exp(gauss(Math.log(0.15), 1.1)) * (watch ? 2.2 : 1),
      });
    }
    const M_JUP = 20.0;
    for (let k = 0; k < CLOUD.hildaTrojanCount; k++) {
      const trojan = k % 2 === 1;
      seeds.push({
        pop: trojan ? "trojan" : "hilda",
        a: trojan ? 5.2 + gauss(0, 0.18) : 3.95 + gauss(0, 0.12),
        e: Math.min(Math.abs(gauss(0.07, 0.05)), 0.3),
        i: Math.min(Math.abs(gauss(9, 8)), 30),
        om: rnd() * 360, w: rnd() * 360,
        m0: trojan ? M_JUP + (rnd() < 0.5 ? 60 : -60) + gauss(0, 16) : rnd() * 360,
        diam: Math.exp(gauss(Math.log(15), 1.2)),
      });
    }
    for (let k = 0; k < CLOUD.kuiperCount; k++) {
      seeds.push({
        pop: "kuiper",
        a: 39 + 11 * rnd(),
        e: Math.min(Math.abs(gauss(0.08, 0.06)), 0.35),
        i: Math.min(Math.abs(gauss(5, 7)), 28),
        om: rnd() * 360, w: rnd() * 360, m0: rnd() * 360,
        diam: Math.exp(gauss(Math.log(30), 1.4)),
      });
    }
    return seeds;
  }

  private _initMaterial(): void {
    const glowTex = createGlowTexture();
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: glowTex }, pixelScale: this.uPxScale },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: `attribute vec3 iPos; attribute vec3 iColor; attribute float iSize;
        uniform float pixelScale; varying vec2 vUv; varying vec3 vColor;
        void main() {
          vUv = uv; vColor = iColor;
          vec4 p = modelViewMatrix * vec4(iPos, 1.0);
          float px = clamp(iSize * pixelScale / max(1e-9, -p.z), 1.5, 30.0);
          p.xy += position.xy * px * max(1e-9, -p.z) / pixelScale;
          gl_Position = projectionMatrix * p;
        }`,
      fragmentShader: `uniform sampler2D map; varying vec2 vUv; varying vec3 vColor;
        void main() { vec4 tex = texture2D(map, vUv); gl_FragColor = vec4(vColor * 1.25 * tex.rgb, tex.a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.mat = mat;
  }

  private _build(seeds: CloudSeed[]): void {
    const N = seeds.length;
    this.N = N;
    this.seeds = seeds;
    this.pos = new Float32Array(N * 3);
    this.col = new Float32Array(N * 3);
    this.helio = new Float32Array(N * 3);
    this.cursor = 0;
    this.keplerAll = true;
    const siz = new Float32Array(N);
    this.aA = new Float32Array(N);
    this.eA = new Float32Array(N);
    this.sqA = new Float32Array(N);
    this.nA = new Float32Array(N);
    this.M0A = new Float32Array(N);
    this.r00 = new Float32Array(N);
    this.r01 = new Float32Array(N);
    this.r10 = new Float32Array(N);
    this.r11 = new Float32Array(N);
    this.r20 = new Float32Array(N);
    this.r21 = new Float32Array(N);

    let n = 0;
    const rnd = Math.random.bind(Math);
    for (const s of seeds) {
      const ci = Math.cos(s.i * D2R),
        si = Math.sin(s.i * D2R);
      const cO = Math.cos(s.om * D2R),
        sO = Math.sin(s.om * D2R);
      const cw = Math.cos(s.w * D2R),
        sw = Math.sin(s.w * D2R);
      this.aA[n] = s.a;
      this.eA[n] = s.e;
      this.sqA[n] = s.a * Math.sqrt(1 - s.e * s.e);
      this.nA[n] = KGAUSS / (s.a * Math.sqrt(s.a));
      this.M0A[n] = s.m0 * D2R;
      this.r00[n] = cO * cw - sO * sw * ci;
      this.r01[n] = -cO * sw - sO * cw * ci;
      this.r10[n] = sO * cw + cO * sw * ci;
      this.r11[n] = -sO * sw + cO * cw * ci;
      this.r20[n] = sw * si;
      this.r21[n] = cw * si;

      // 配色: 近地一律暖色示警 (30% 更灼红), 主带淡青, 希尔达/特罗扬青绿, 柯伊伯冰蓝
      const shade = 0.75 + 0.5 * rnd();
      let cr: number, cg: number, cb: number;
      if (s.pop === "neo") {
        const hot = rnd() < 0.3;
        cr = 1.0 * shade; cg = (hot ? 0.32 : 0.58) * shade; cb = (hot ? 0.28 : 0.38) * shade;
      } else if (s.pop === "hilda" || s.pop === "trojan") {
        cr = 0.2; cg = 0.68; cb = 0.78;
      } else if (s.pop === "kuiper") {
        cr = 0.25; cg = 0.62; cb = 0.88;
      } else {
        cr = 0.22 * shade; cg = 0.8 * shade; cb = 0.95 * shade;
      }
      this.col[3 * n] = cr;
      this.col[3 * n + 1] = cg;
      this.col[3 * n + 2] = cb;
      siz[n] = 3.2e-4 * Math.sqrt(Math.max(s.diam, 0.3));
      n++;
    }

    (this as { baseCol: Float32Array }).baseCol = new Float32Array(this.col);

    const iGeo = new THREE.InstancedBufferGeometry();
    iGeo.index = this.plane.index;
    iGeo.setAttribute("position", this.plane.attributes.position);
    iGeo.setAttribute("uv", this.plane.attributes.uv);
    iGeo.setAttribute(
      "iPos",
      new THREE.InstancedBufferAttribute(this.pos, 3).setUsage(
        THREE.DynamicDrawUsage,
      ),
    );
    iGeo.setAttribute(
      "iColor",
      new THREE.InstancedBufferAttribute(this.col, 3).setUsage(
        THREE.DynamicDrawUsage,
      ),
    );
    iGeo.setAttribute("iSize", new THREE.InstancedBufferAttribute(siz, 1));
    iGeo.instanceCount = N;
    this.iGeo = iGeo;

    if (this.mesh) {
      this.mesh.geometry = iGeo;
    } else {
      this.mesh = new THREE.Mesh(iGeo, this.mat);
      this.mesh.frustumCulled = false;
      this.scene.add(this.mesh);
    }
  }

  update(
    jd: number,
    cx: number,
    cy: number,
    cz: number,
    frameRotC: number,
    frameRotS: number,
    showBelt: boolean,
    playing: boolean,
    needsRefresh: boolean,
  ): void {
    this.mesh.visible = showBelt;
    if (!showBelt || (!playing && !needsRefresh)) return;
    const t = jd - JD_J2000;

    /* 开普勒段 (贵): 分帧刷新 —— 每帧只解 1/4 粒子。7 天/秒下单粒子 4 帧
       的位置滞后 ≈ 0.005 AU, 日心远景下亚像素不可察; needsRefresh (切系/
       数据到达) 或重建后先全量刷一遍。低偏心率 (e<0.2) 收敛快, 迭代减半 */
    if (needsRefresh || this.keplerAll) {
      this._kepler(0, this.N, t);
      this.cursor = 0;
      this.keplerAll = false;
    } else {
      const end = Math.min(this.N, this.cursor + (this.N >> 2));
      this._kepler(this.cursor, end, t);
      this.cursor = end >= this.N ? 0 : end;
    }

    /* 刚体段 (贱): 减 CENTER 平移 + 系旋转套用到全部粒子, 无三角函数 ——
       geo/l1/comp 系下中心天体每帧位移时, 云整体不再有分帧拖影 */
    const pos = this.pos,
      helio = this.helio;
    const doRot = !(frameRotS === 0 && frameRotC === 1);
    for (let k = 0; k < this.N; k++) {
      const px = helio[3 * k] - cx,
        py = helio[3 * k + 1] - cy;
      if (doRot) {
        pos[3 * k] = px * frameRotC + py * frameRotS;
        pos[3 * k + 1] = -px * frameRotS + py * frameRotC;
      } else {
        pos[3 * k] = px;
        pos[3 * k + 1] = py;
      }
      pos[3 * k + 2] = helio[3 * k + 2] - cz;
    }
    this.iGeo.attributes.iPos.needsUpdate = true;
  }

  /** [from, to) 区间开普勒解 → 日心坐标缓存 (M 仅与 t 相关, 与中心/系旋转无关) */
  private _kepler(from: number, to: number, t: number): void {
    const { aA, eA, sqA, nA, M0A, r00, r01, r10, r11, r20, r21, helio } = this;
    for (let k = from; k < to; k++) {
      const e = eA[k];
      let Mr = (M0A[k] + nA[k] * t) % TAU;
      if (Mr > Math.PI) Mr -= TAU;
      else if (Mr < -Math.PI) Mr += TAU;
      let E = Mr + e * Math.sin(Mr);
      for (let it = 0, nIt = e < 0.2 ? 2 : 4; it < nIt; it++)
        E -= (E - e * Math.sin(E) - Mr) / (1 - e * Math.cos(E));
      const xp = aA[k] * (Math.cos(E) - e),
        yp = sqA[k] * Math.sin(E);
      helio[3 * k] = r00[k] * xp + r01[k] * yp;
      helio[3 * k + 1] = r10[k] * xp + r11[k] * yp;
      helio[3 * k + 2] = r20[k] * xp + r21[k] * yp;
    }
  }

  getPositions(): Float32Array { return this.pos; }
  getCount(): number { return this.N; }
  getColors(): Float32Array { return this.col; }
  getSeed(i: number): CloudSeed | undefined { return this.seeds[i]; }
  markColorsDirty(): void { this.iGeo.attributes.iColor.needsUpdate = true; }

  /** Ctrl+点击拾取: 全部粒子投影到屏幕空间取最近邻 (一次性遍历 ~1.7 万, 点击时成本可接受) */
  pick(xPx: number, yPx: number, w: number, h: number,
       camera: THREE.PerspectiveCamera, maxPx = 14): number {
    if (!this.mesh.visible || this.N === 0) return -1;
    const v = new THREE.Vector3();
    let best = -1, bestD = maxPx;
    for (let k = 0; k < this.N; k++) {
      v.set(this.pos[3 * k], this.pos[3 * k + 1], this.pos[3 * k + 2])
        .project(camera);
      if (v.z > 1) continue;
      const sx = (v.x * 0.5 + 0.5) * w;
      const sy = (-v.y * 0.5 + 0.5) * h;
      const d = Math.hypot(sx - xPx, sy - yPx);
      if (d < bestD) { bestD = d; best = k; }
    }
    return best;
  }
}
