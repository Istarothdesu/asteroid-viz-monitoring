import * as THREE from 'three'
import { TAU, D2R, OBLIQ } from '@/utils/orbital/constants'

const Y_AXIS = new THREE.Vector3(0, 1, 0)

// Spherical cap + fan cone + rim line, with a setDir() helper
export class OccultZone extends THREE.Group {
  setAngularRadius(angle: number): void {
    if (Math.abs(angle - this.userData.angle) < 1e-6) return
    const { color, capOp, coneOp, radius } = this.userData
    const replacement = makeOccultZone(color, angle, capOp, coneOp, radius)
    for (const child of [...this.children]) {
      const renderable = child as THREE.Mesh
      renderable.geometry.dispose()
      ;(renderable.material as THREE.Material).dispose()
      this.remove(child)
    }
    this.add(...[...replacement.children])
    this.userData.angle = angle
  }

  setDir(v: THREE.Vector3): void {
    this.quaternion.setFromUnitVectors(Y_AXIS, v)
  }
}

export function makeOccultZone(
  color: number, ang: number, capOp: number, coneOp: number, R: number,
): OccultZone {
  const zone = new OccultZone()
  zone.userData = { angle: ang, color, capOp, coneOp, radius: R }

  // Spherical cap (phiLen=full circle, thetaLen=ang from north pole)
  zone.add(new THREE.Mesh(
    new THREE.SphereGeometry(R * 1.004, 32, 10, 0, TAU, 0, ang),
    new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: capOp,
      side: THREE.DoubleSide, depthWrite: false,
    }),
  ))

  // Fan cone from origin to cap-edge circle
  const N = 36
  const s = Math.sin(ang) * R, c = Math.cos(ang) * R
  const verts: number[] = []
  for (let k = 0; k < N; k++) {
    const a0 = (k / N) * TAU, a1 = ((k + 1) / N) * TAU
    verts.push(0, 0, 0, s * Math.cos(a0), c, s * Math.sin(a0), s * Math.cos(a1), c, s * Math.sin(a1))
  }
  const coneGeo = new THREE.BufferGeometry()
  coneGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3))
  zone.add(new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: coneOp,
    side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
  })))

  // Rim line
  const RP = R * 1.007
  const sr = Math.sin(ang) * RP, cr = Math.cos(ang) * RP
  const rimPts: THREE.Vector3[] = []
  for (let k = 0; k <= 64; k++) {
    const a = (k / 64) * TAU
    rimPts.push(new THREE.Vector3(sr * Math.cos(a), cr, sr * Math.sin(a)))
  }
  zone.add(new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(rimPts),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }),
  ))

  return zone
}

/**
 * 天球仪式赤道坐标网格: 赤纬平行圈每 30° + 赤经子午圈每 30°,
 * 天赤道 (Dec 0°) 加亮。网格在赤道系构建 (Z = 北天极) 后整体绕 X 轴
 * 倾斜黄赤交角, 与 EarthSystem.qOblQ 同一旋转约定 (赤道系 → 黄道系)。
 */
export function makeEquatorialGraticule(R: number): THREE.Group {
  const grp = new THREE.Group()
  grp.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -OBLIQ)

  const gridMat = new THREE.LineBasicMaterial({ color: 0x3fc1ff, transparent: true, opacity: 0.13 })
  const eqMat   = new THREE.LineBasicMaterial({ color: 0x8fe0ff, transparent: true, opacity: 0.55 })

  const circle = (fn: (t: number) => THREE.Vector3, n: number, mat: THREE.LineBasicMaterial) => {
    const pts: THREE.Vector3[] = []
    for (let k = 0; k <= n; k++) pts.push(fn((k / n) * TAU))
    grp.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat))
  }

  /* 赤纬平行圈 ±30° / ±60° */
  for (const dec of [-60, -30, 30, 60]) {
    const d = dec * D2R, c = Math.cos(d) * R, z = Math.sin(d) * R
    circle((t) => new THREE.Vector3(c * Math.cos(t), c * Math.sin(t), z), 96, gridMat)
  }
  /* 天赤道 (Dec 0°) 加亮: 与黄道成 23.4° 交角 */
  circle((t) => new THREE.Vector3(R * Math.cos(t), R * Math.sin(t), 0), 128, eqMat)
  /* 赤经子午圈每 30°: 过南北天极的大圆, 6 条覆盖全部 12 条时圈 */
  for (let k = 0; k < 6; k++) {
    const ra = (k / 6) * Math.PI
    circle((t) => new THREE.Vector3(
      R * Math.sin(t) * Math.cos(ra),
      R * Math.sin(t) * Math.sin(ra),
      R * Math.cos(t),
    ), 96, gridMat)
  }
  return grp
}

/** 黄道带 (黄纬 ±15°, 小行星密集区): 贴附黄道面的半透明带面, 默认关闭走图层开关 */
export function makeZodiacBand(R: number): THREE.Mesh {
  const band = new THREE.Mesh(
    new THREE.SphereGeometry(R * 1.002, 48, 8, 0, TAU, Math.PI / 2 - 15 * D2R, 30 * D2R),
    new THREE.MeshBasicMaterial({
      color: 0xffaa33, transparent: true, opacity: 0.05,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
    }),
  )
  band.rotation.x = Math.PI / 2   // SphereGeometry 顶极为 +Y, 转至黄道北极 +Z
  return band
}

/**
 * 赤道网格坐标标注锚点 (克制版): 赤经刻度每 2h (沿天赤道, 略外推避遮挡)
 * + 赤纬刻度 ±30°/±60° (沿春分点子午圈)。返回 { group, raMarks, decMarks }:
 * marks 为空 Object3D, 由 SceneManager.getLabelPositions 投影为屏幕标签;
 * group 已含黄赤交角倾斜, 挂天球组即可 (与 makeEquatorialGraticule 同系)。
 */
export function makeGraticuleMarks(R: number): {
  group: THREE.Group
  raMarks: THREE.Object3D[]
  decMarks: THREE.Object3D[]
} {
  const grp = new THREE.Group()
  grp.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -OBLIQ)

  /* 赤经刻度: 每 2h = 30°, 共 12 个, 沿天赤道外推 2% 避免压线 */
  const raMarks: THREE.Object3D[] = []
  const RE = R * 1.02
  for (let k = 0; k < 12; k++) {
    const t = (k / 12) * TAU
    const m = new THREE.Object3D()
    m.position.set(RE * Math.cos(t), RE * Math.sin(t), 0)
    grp.add(m)
    raMarks.push(m)
  }

  /* 赤纬刻度: 沿春分点子午圈 (RA 0h, 赤道系 +X 方向) */
  const decMarks: THREE.Object3D[] = []
  for (const dec of [60, 30, -30, -60]) {
    const d = dec * D2R, r = R * 1.02
    const m = new THREE.Object3D()
    m.position.set(r * Math.cos(d), 0, r * Math.sin(d))
    grp.add(m)
    decMarks.push(m)
  }

  return { group: grp, raMarks, decMarks }
}

// Ecliptic circle in XY plane (Z = ecliptic north in this project's coords)
export function makeEclipticCircle(R: number): THREE.Line {
  const pts: THREE.Vector3[] = []
  for (let k = 0; k <= 128; k++) {
    const t = (k / 128) * TAU
    pts.push(new THREE.Vector3(R * Math.cos(t), R * Math.sin(t), 0))
  }
  return new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({ color: 0xffaa33, transparent: true, opacity: 0.5 }),
  )
}

export interface FrustumCone {
  group: THREE.Group
  tanHX: number
  tanHY: number
}

// Rectangular-FOV observation cone projected onto sphere R.
// Cone initially points toward -Z; setFromRotationMatrix aligns it to coneAxis.
export function makeFrustumCone(fovHX: number, fovHY: number, R: number): FrustumCone {
  const TAN_HX = Math.tan(fovHX)
  const TAN_HY = Math.tan(fovHY)
  const STEPS = 12

  const border: THREE.Vector3[] = []
  const pushRay = (tx: number, ty: number) =>
    border.push(new THREE.Vector3(tx, ty, -1).normalize().multiplyScalar(R))

  for (let k = 0; k <= STEPS; k++) pushRay(-TAN_HX + 2 * TAN_HX * (k / STEPS), TAN_HY)
  for (let k = 1; k <= STEPS; k++) pushRay(TAN_HX, TAN_HY - 2 * TAN_HY * (k / STEPS))
  for (let k = 1; k <= STEPS; k++) pushRay(TAN_HX - 2 * TAN_HX * (k / STEPS), -TAN_HY)
  for (let k = 1; k < STEPS; k++) pushRay(-TAN_HX, -TAN_HY + 2 * TAN_HY * (k / STEPS))

  const group = new THREE.Group()

  // Side walls from origin to border
  const sideVerts: number[] = []
  const BL = border.length
  for (let k = 0; k < BL; k++) {
    const a = border[k], b = border[(k + 1) % BL]
    sideVerts.push(0, 0, 0, a.x, a.y, a.z, b.x, b.y, b.z)
  }
  const sideGeo = new THREE.BufferGeometry()
  sideGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(sideVerts), 3))
  group.add(new THREE.Mesh(sideGeo, new THREE.MeshBasicMaterial({
    color: 0x66ffcc, transparent: true, opacity: 0.10,
    side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
  })))

  // 四条锥边和中心指向线保证在端视、掠射视角下仍可辨认，避免半透明锥面看似消失。
  const corners = [
    new THREE.Vector3(-TAN_HX, TAN_HY, -1),
    new THREE.Vector3(TAN_HX, TAN_HY, -1),
    new THREE.Vector3(TAN_HX, -TAN_HY, -1),
    new THREE.Vector3(-TAN_HX, -TAN_HY, -1),
  ].map(v => v.normalize().multiplyScalar(R))
  const guidePts: THREE.Vector3[] = []
  for (const corner of corners) guidePts.push(new THREE.Vector3(), corner)
  guidePts.push(new THREE.Vector3(), new THREE.Vector3(0, 0, -R))
  group.add(new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints(guidePts),
    new THREE.LineBasicMaterial({ color: 0x9dffdd, transparent: true, opacity: .72, depthWrite: false }),
  ))

  // Rim line slightly outside sphere surface
  const RP = R * 1.003
  const rimPts = border.map(v => v.clone().multiplyScalar(RP / R))
  rimPts.push(rimPts[0].clone())
  group.add(new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(rimPts),
    new THREE.LineBasicMaterial({ color: 0x9dffdd }),
  ))

  // Filled patch on sphere surface
  const GX = 10, GY = 7
  const patchVerts: number[] = []
  const patchIdx: number[] = []
  for (let j = 0; j <= GY; j++) {
    for (let i = 0; i <= GX; i++) {
      const v = new THREE.Vector3(
        -TAN_HX + 2 * TAN_HX * (i / GX),
        -TAN_HY + 2 * TAN_HY * (j / GY),
        -1,
      ).normalize().multiplyScalar(RP)
      patchVerts.push(v.x, v.y, v.z)
    }
  }
  for (let j = 0; j < GY; j++) {
    for (let i = 0; i < GX; i++) {
      const a = j * (GX + 1) + i, b = a + 1, c = a + GX + 1, d = c + 1
      patchIdx.push(a, b, c, b, d, c)
    }
  }
  const patchGeo = new THREE.BufferGeometry()
  patchGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(patchVerts), 3))
  patchGeo.setIndex(patchIdx)
  group.add(new THREE.Mesh(patchGeo, new THREE.MeshBasicMaterial({
    color: 0x66ffcc, transparent: true, opacity: 0.15,
    side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
  })))

  return { group, tanHX: TAN_HX, tanHY: TAN_HY }
}
