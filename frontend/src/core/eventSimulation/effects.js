import * as THREE from 'three';
import { sampleEvent } from './event.js';
import { clamp, smooth } from '../terrain/geo.js';
import { glowTexture, smokeTexture, fireTexture } from './textures.js';

import { meteorAppearance } from './meteor-appearance.js';
import { MeteorTrail } from './meteor-trail.js';
import { createFireSpriteMaterial } from './materials.js';

function random(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function fireTemperature(sprite, value) { if (sprite.material.uniforms?.temperature) sprite.material.uniforms.temperature.value = value; }

export class EventEffects {
  constructor(world, event) {
    this.world = world; this.event = event; this.group = new THREE.Group(); world.scene.add(this.group);
    this.glowMap = glowTexture(); this.smokeMap = smokeTexture(); this.fireMap = fireTexture();
    this.baseAmbient = world.ambient.intensity;
    const rng = random(event.config.seed), radius = event.config.diameter / 2;
    const rock = new THREE.IcosahedronGeometry(radius, 2);
    for (let i = 0; i < rock.attributes.position.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(rock.attributes.position, i);
      const n = v.clone().normalize();
      v.multiplyScalar(.93 + .07 * Math.sin(n.x * 11 + n.y * 7) * Math.cos(n.z * 13));
      rock.attributes.position.setXYZ(i, v.x, v.y, v.z);
    }
    rock.computeVertexNormals();
    this.rock = new THREE.Mesh(rock, new THREE.MeshStandardMaterial({ color: 0x6d5b48, roughness: .95, emissive: 0xff4c08, emissiveIntensity: 0 }));
    this.group.add(this.rock);
    this.head = this.sprite(this.glowMap, 0xffdc9c, true, 'halo');
    this.marker = this.sprite(this.glowMap, 0x93dfff, true);
    this.core = this.sprite(this.fireMap, 0xfff0c9, true, 'core');
    this.head.renderOrder = 5; this.core.renderOrder = 6;
    this.tail = new MeteorTrail(this.group, event, world.origin, this.fireMap, true);
    this.wake = new MeteorTrail(this.group, event, world.origin, this.smokeMap, false);
    this.fireLight = new THREE.PointLight(0xffa15e, 0, 16000, 2); this.group.add(this.fireLight);
    const points = event.samples.filter((_, i) => i % 8 === 0).map(s => s.ecef.clone().sub(world.origin));
    this.path = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineDashedMaterial({ color: 0x74c6d4, transparent: true, opacity: .55, dashSize: 18000, gapSize: 12000 }));
    this.path.computeLineDistances(); this.group.add(this.path);
    this.burst = this.sprite(this.glowMap, 0xffd7a0, true, 'burst'); this.burst.renderOrder = 5;
    this.impactFlames = Array.from({ length: 42 }, () => ({ sprite: this.sprite(this.fireMap, 0xffbd64, true, 'flame'),
      delay: rng() * .35, angle: rng() * Math.PI * 2, radial: rng(), rise: .5 + rng(), life: 1.8 + rng() * 2.2 }));
    this.impactFlames.forEach(p => p.sprite.renderOrder = 4);
    this.dust = Array.from({ length: 115 }, (_, i) => ({ sprite: this.sprite(this.smokeMap, i < 35 ? 0x827564 : 0xaaa091),
      delay: rng() * 4, angle: rng() * Math.PI * 2, radial: .1 + rng() * .9, rise: .4 + rng() * 1.5, spin: rng() * Math.PI * 2 }));
    this.ejecta = Array.from({ length: 90 }, () => ({ sprite: this.sprite(this.glowMap, 0xffa251, true), delay: rng() * .6, az: rng() * Math.PI * 2, speed: 110 + rng() * 480, elevation: .3 + rng() * 1.1 }));
    this.ring = new THREE.Mesh(new THREE.RingGeometry(.97, 1, 128), new THREE.MeshBasicMaterial({ color: 0xd2c3a8, side: THREE.DoubleSide, transparent: true, opacity: 0, depthWrite: false }));
    this.ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), event.frame.up); this.group.add(this.ring);
    this.p = new THREE.Vector3();

  }
  sprite(map, color, additive = false, fireRole = null) {
    const material = fireRole ? createFireSpriteMaterial(map, color, fireRole) : new THREE.SpriteMaterial({ map, color, transparent: true, depthWrite: false, toneMapped: !additive,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    const sprite = new THREE.Sprite(material); sprite.visible = false; this.group.add(sprite); return sprite;
  }
  local(x, y, z) {
    const f = this.event.frame;
    return this.p.copy(f.origin).sub(this.world.origin).addScaledVector(f.east, x).addScaledVector(f.up, y).addScaledVector(f.south, z);
  }
  update(t) {
    const e = this.event, s = sampleEvent(e, t), dt = t - e.impactTime, flying = dt < 0;
    const radius = e.config.diameter / 2;
    const position = s.ecef.clone().sub(this.world.origin), cameraDistance = position.distanceTo(this.world.camera.position);
    const appearance = this.appearance = meteorAppearance(e.config.diameter, s.height, cameraDistance, this.world.camera.fov, this.world.renderer.domElement.clientHeight);
    const { heat, ignition, glowDiameter, markerOpacity } = appearance;
    this.rock.visible = flying; this.rock.position.copy(position); this.rock.rotation.set(t * .21, t * .35, t * .09);
    this.rock.scale.setScalar(appearance.rockScale); this.rock.material.emissiveIntensity = heat * 3;
    this.head.visible = this.core.visible = flying && ignition > 0;
    this.head.position.copy(position); this.core.position.copy(position);
    const pulse = 1 + .04 * Math.sin(t * 31) + .025 * Math.sin(t * 57);
    this.head.scale.setScalar(glowDiameter * pulse); this.head.material.opacity = ignition * (.45 + heat * .45);
    this.head.material.color.setRGB(2.2, .9 + heat * .5, .3);
    this.core.scale.setScalar(Math.max(radius * 4, glowDiameter * .32) * pulse); this.core.material.opacity = ignition * .95;
    this.core.material.color.setRGB(3, 2.3, 1.3);
    fireTemperature(this.head, .72 + heat * .2); fireTemperature(this.core, .82 + heat * .18);
    this.marker.visible = flying && markerOpacity > .01; this.marker.position.copy(position);
    this.marker.scale.setScalar(appearance.metresPerPixel * 15); this.marker.material.opacity = markerOpacity * .85;
    this.path.visible = cameraDistance > 180000 && flying;
    this.tail.update(t, appearance); this.wake.update(t, appearance);
    this.fireLight.position.copy(flying ? position : this.local(0, 120, 0));
    this.fireLight.intensity = flying ? heat * smooth((45000 - s.height) / 40000) * 1.8e8 : 5e8 * Math.exp(-Math.max(0, dt) * 1.8);
    this.world.ambient.intensity = this.baseAmbient + (dt >= 0 ? .4 * Math.exp(-dt * 2.8) : 0);
    const crater = e.crater.radius, effectScale = Math.sqrt(crater / 550), center = this.local(0, 30, 0).clone();
    this.burst.visible = dt >= 0 && dt < 4; this.burst.position.copy(center);
    this.burst.scale.setScalar(crater * (2 + Math.max(0, dt) * 3)); this.burst.material.opacity = clamp(1 - dt / 3.2, 0, 1) * .85;
    fireTemperature(this.burst, 1 - clamp(dt / 4, 0, 1) * .35);
    for (const flame of this.impactFlames) {
      const age = dt - flame.delay, k = clamp(age / flame.life, 0, 1), r = crater * flame.radial * (.25 + k);
      flame.sprite.visible = age >= 0 && age < flame.life;
      flame.sprite.position.copy(this.local(Math.cos(flame.angle) * r, 70 + Math.max(0, age) * 210 * flame.rise, Math.sin(flame.angle) * r));
      flame.sprite.scale.set(crater * (.65 + k), crater * (.7 + k * 1.8), 1);
      flame.sprite.material.opacity = smooth(age / .15) * (1 - smooth(k));
      flame.sprite.material.color.setRGB(2.8, 1.7 * (1 - k) + .2, .65 * (1 - k));
      fireTemperature(flame.sprite, 1 - k * .85);
    }
    const shockRadius = Math.max(1, dt * 600 * effectScale);
    this.ring.visible = dt > 0 && dt < 12; this.ring.position.copy(this.local(0, 25 - shockRadius ** 2 / (2 * 6378137), 0));
    this.ring.scale.setScalar(shockRadius); this.ring.material.opacity = .35 * clamp(1 - dt / 12, 0, 1);
    for (const item of this.ejecta) {
      const age = dt - item.delay, v = item.speed * effectScale, y = v * Math.sin(item.elevation) * age - 4.905 * age * age;
      item.sprite.visible = age > 0 && age < 18 && y > 0;
      const r = v * Math.cos(item.elevation) * age;
      item.sprite.position.copy(this.local(Math.cos(item.az) * r, y, Math.sin(item.az) * r));
      item.sprite.scale.setScalar(30 * effectScale); item.sprite.material.opacity = clamp(1 - age / 18, 0, .85);
    }
    for (let i = 0; i < this.dust.length; i++) {
      const d = this.dust[i], age = dt - d.delay, skirt = i >= 65;
      d.sprite.visible = age > 0 && age < 34;
      const r = crater * d.radial * .5 + Math.max(0, age) * (skirt ? 115 : 22) * effectScale;
      const y = skirt ? 30 + Math.sqrt(Math.max(0, age)) * 35 : 30 + Math.max(0, age) * 80 * d.rise * effectScale;
      d.sprite.position.copy(this.local(Math.cos(d.angle) * r + Math.max(0, age) * 12, y, Math.sin(d.angle) * r));
      d.sprite.scale.setScalar((crater * .65 + Math.max(0, age) * (skirt ? 75 : 55)) * (skirt ? 1 : d.rise));
      d.sprite.material.rotation = d.spin + age * .025;
      d.sprite.material.opacity = smooth(age / 1.2) * clamp((34 - age) / 12, 0, 1) * (skirt ? .22 : .42);
    }
    this.world.terrain.setCraterProgress(smooth(dt / 1.4));
  }
  dispose() {
    this.world.scene.remove(this.group);
    this.group.traverse(o => {
      // Sprite 的四边形由 Three.js 全局共享，不能在切换一个事件时销毁。
      if (!o.isSprite) o.geometry?.dispose();
      o.material?.dispose();
    });
    this.glowMap.dispose(); this.smokeMap.dispose(); this.fireMap.dispose();
    this.world.ambient.intensity = this.baseAmbient;
  }
}
