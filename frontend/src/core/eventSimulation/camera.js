import { Quaternion, Vector3 } from 'three';
import { A, fromECEF, toECEF, upAt, smooth, clamp } from '../terrain/geo.js';
import { sampleEvent } from './event.js';

// 相机独立于事件时间。模式切换沿地球表面插值，避免直线穿过地球。
function blendPosition(a, b, k, origin) {
  const ga = fromECEF(a.clone().add(origin)), gb = fromECEF(b.clone().add(origin));
  const ua = upAt(ga.lon, ga.lat), ub = upAt(gb.lon, gb.lat);
  const q = new Quaternion().setFromUnitVectors(ua, ub);
  ua.applyQuaternion(new Quaternion().slerp(q, k));
  const height = Math.exp(Math.log(Math.max(1, ga.height + 1000)) * (1 - k) + Math.log(Math.max(1, gb.height + 1000)) * k) - 1000;
  return toECEF(Math.atan2(ua.y, ua.x) * 180 / Math.PI, Math.asin(clamp(ua.z, -1, 1)) * 180 / Math.PI, height).sub(origin);
}

export class EventCamera {
  constructor(world, event) { this.world = world; this.event = event; this.mode = 'auto'; this.transition = null; }
  setMode(mode) {
    const { world } = this;
    this.mode = mode;
    this.transition = { start: performance.now(), position: world.camera.position.clone(), target: world.controls.target.clone(), up: world.camera.up.clone(), fov: world.camera.fov };
  }
  pose(mode, t) {
    const { event: e, world: w } = this, s = sampleEvent(e, t), p = s.ecef.clone().sub(w.origin);
    const surface = e.frame.origin.clone().sub(w.origin), f = e.frame;
    const right = new Vector3().crossVectors(e.horizontal, f.up).normalize();
    if (mode === 'space') return { position: surface.clone().addScaledVector(f.up, A * 2.8).addScaledVector(f.south, A * .65), target: surface.clone().addScaledVector(f.up, -A * .6), up: f.up };
    if (mode === 'ground') {
      const ground = w.terrain.height(e.observer.lon, e.observer.lat, 13)?.height ?? e.groundHeight;
      const position = w.positionAt(e.observer.lon, e.observer.lat, ground + 2);
      const up = upAt(e.observer.lon, e.observer.lat);
      const target = t < e.impactTime ? p.clone() : surface.clone().addScaledVector(f.up, 300 + Math.min(1800, (t - e.impactTime) * 90));
      // 火流星放在画面上半部，保留地平线，便于辨认地表观察的位置感。
      const vertical = target.clone().sub(position).dot(up);
      target.addScaledVector(up, -Math.max(0, vertical) * .45);
      return { position, target, up };
    }
    if (mode === 'overview' || t >= e.impactTime) {
      const distance = e.config.observerDistance;
      return { position: surface.clone().addScaledVector(right, distance * .8).addScaledVector(e.incoming, -distance * .45).addScaledVector(f.up, distance * .55),
        target: surface.clone().addScaledVector(f.up, Math.min(700, Math.max(0, t - e.impactTime) * 30)), up: f.up };
    }
    const h = Math.max(0, s.height - e.groundHeight);
    const offset = Math.max(2200, h * (.5 - .25 * smooth((120000 - s.height) / 70000)));
    return { position: p.clone().addScaledVector(right, offset).addScaledVector(e.incoming, -offset * .5).addScaledVector(f.up, offset * .4),
      target: p.clone().addScaledVector(f.up, -offset * .14), up: upAt(s.lon, s.lat) };
  }
  trackedPose(t) {
    const e = this.event;
    let pose = this.pose('follow', Math.min(t, e.impactTime - .001));
    if (t > e.impactTime - 2) {
      const aftermath = this.pose('overview', t), k = smooth((t - e.impactTime + 2) / 8);
      pose = { position: blendPosition(pose.position, aftermath.position, k, this.world.origin), target: pose.target.clone().lerp(aftermath.target, k), up: pose.up };
    }
    return pose;
  }
  update(t, now) {
    if (this.mode === 'free') { this.world.controls.update(); return; }
    let pose;
    if (this.mode === 'auto') {
      const far = this.pose('space', t);
      const close = this.trackedPose(t);
      const k = smooth((t - this.event.entryTime * .12) / (this.event.entryTime * .88));
      pose = { position: blendPosition(far.position, close.position, k, this.world.origin), target: far.target.clone().lerp(close.target, k), up: far.up.clone().lerp(close.up, k).normalize() };
      // 拉近时以目标的屏幕位置构图，避免太空镜头与跟随镜头插值把目标推到 HUD 后面。
      const focus = sampleEvent(this.event, t).ecef.sub(this.world.origin);
      const direction = focus.clone().sub(pose.position), distance = direction.length();
      direction.normalize();
      const right = new Vector3().crossVectors(direction, pose.up).normalize();
      direction.applyAxisAngle(right, -Math.atan(.2 * Math.tan(48 * Math.PI / 360)));
      const track = smooth((t - this.event.entryTime * .28) / (this.event.entryTime * .45))
        * (1 - smooth((t - this.event.impactTime + 2) / 8));
      pose.target.lerp(pose.position.clone().addScaledVector(direction, distance), track);
    } else pose = this.mode === 'follow' ? this.trackedPose(t) : this.pose(this.mode, t);
    let fov = this.mode === 'ground' ? 72 : 48;
    if (this.transition) {
      const a = this.transition, k = smooth((now - a.start) / 2200);
      pose = { position: blendPosition(a.position, pose.position, k, this.world.origin), target: a.target.clone().lerp(pose.target, k), up: a.up.clone().lerp(pose.up, k).normalize() };
      fov = a.fov + (fov - a.fov) * k;
      if (k === 1) this.transition = null;
    }
    this.world.setCamera(pose.position, pose.target, pose.up, fov);
  }
}
