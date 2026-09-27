import * as THREE from 'three';
import { createTrailMaterial } from './materials.js';
import { sampleEvent } from './event.js';
import { smooth, clamp } from '../terrain/geo.js';
import { emissionTime, particleRandom } from './meteor-appearance.js';

// 每层一个 draw call；粒子由出生时刻直接求值，暂停、首播、重播和回退结果一致。
export class MeteorTrail {
  constructor(group, event, origin, map, hot) {
    this.event = event; this.origin = origin; this.hot = hot;
    this.count = hot ? 240 : 300; this.interval = .012;
    const quad = new THREE.PlaneGeometry(1, 1), geometry = new THREE.InstancedBufferGeometry();
    geometry.index = quad.index; geometry.attributes.position = quad.attributes.position; geometry.attributes.uv = quad.attributes.uv;
    this.centres = new THREE.InstancedBufferAttribute(new Float32Array(this.count * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.sizes = new THREE.InstancedBufferAttribute(new Float32Array(this.count * 2), 2).setUsage(THREE.DynamicDrawUsage);
    this.tints = new THREE.InstancedBufferAttribute(new Float32Array(this.count * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.spins = new THREE.InstancedBufferAttribute(new Float32Array(this.count), 1).setUsage(THREE.DynamicDrawUsage);
    this.temperatures = new THREE.InstancedBufferAttribute(new Float32Array(this.count), 1).setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('centre', this.centres); geometry.setAttribute('particleSize', this.sizes);
    geometry.setAttribute('tint', this.tints); geometry.setAttribute('spin', this.spins); geometry.instanceCount = this.count;
    geometry.setAttribute('temperature', this.temperatures);
    const material = createTrailMaterial(map, event.incoming.clone().negate(), hot);
    this.mesh = new THREE.Mesh(geometry, material); this.mesh.frustumCulled = false;
    this.mesh.renderOrder = hot ? 4 : 2; group.add(this.mesh);
    this.right = new THREE.Vector3().crossVectors(event.horizontal, event.frame.up).normalize();
    this.color = new THREE.Color(); this.warm = new THREE.Color(0xffb544); this.cold = new THREE.Color(0x585150);
  }
  update(time, appearance) {
    const { event: e, hot } = this, dt = time - e.impactTime;
    this.mesh.visible = time > e.entryTime && dt < (hot ? 3 : 4);
    if (!this.mesh.visible) return;
    for (let i = 0; i < this.count; i++) {
      const birth = emissionTime(e, time, i, this.interval), age = time - birth;
      const id = Math.round((birth - e.entryTime) / this.interval), seed = e.config.seed;
      const r1 = particleRandom(id, seed), r2 = particleRandom(id, seed + 3), r3 = particleRandom(id, seed + 7);
      const life = hot ? 1.1 + r1 * 1.6 : 2.2 + r1 * .9;
      if (birth < e.entryTime || age > life) { this.tints.setW(i, 0); continue; }
      const sample = sampleEvent(e, birth), heat = smooth((120000 - sample.height) / 55000);
      // 绝对年龄决定冷却，同一时刻的首播、回退和重播使用同一色阶。
      this.temperatures.setX(i, (.82 + heat * .18) * Math.exp(-age / .5));
      const ignition = smooth((120000 - sample.height) / 6000);
      const radius = e.config.diameter / 2, spread = radius * (1 + age * 3) * (hot ? .65 : 1.2);
      const swirl = Math.sin(birth * 21 + age * 8) * Math.sin(age * 5);
      const centre = sample.ecef.sub(this.origin).addScaledVector(this.right, ((r2 - .5) + swirl * 1.4) * spread)
        .addScaledVector(e.frame.up, (r3 - .35 + Math.sin(birth * 17) * age) * spread + age * age * (hot ? 8 : 30));
      this.centres.setXYZ(i, centre.x, centre.y, centre.z);
      const boost = Math.min(appearance.boost, hot ? 6 : 3);
      const size = Math.max(radius * (hot ? 3 + age * 6 : 5 + age * 10) * boost, appearance.metresPerPixel * (hot ? 8 : 10)) * (.7 + r2 * .6);
      // 沿速度方向拉长并重叠，消除高速采样造成的“一串发光圆点”。
      this.sizes.setXY(i, hot ? Math.max(size * 2.6, sample.speed * this.interval * 6) : size, size * (hot ? .85 : .9));
      this.spins.setX(i, hot ? (r3 - .5) * .18 : r3 * Math.PI * 2 + age * (r2 - .5));
      const cooling = smooth(age / life);
      if (hot) { const white = Math.exp(-age * 6); this.color.setRGB(2.6, .25 + white * 2, .025 + white * 1.2); }
      else this.color.copy(this.warm).lerp(this.cold, smooth(age / 1.5));
      const opacity = ignition * (hot ? .45 + heat * .3 : .7) * (1 - cooling) * (hot ? Math.exp(-age * 2.2) : smooth(age / .2));
      this.tints.setXYZW(i, this.color.r, this.color.g, this.color.b, clamp(opacity, 0, 1));
    }
    this.centres.needsUpdate = this.sizes.needsUpdate = this.tints.needsUpdate = this.spins.needsUpdate = this.temperatures.needsUpdate = true;
  }
}
