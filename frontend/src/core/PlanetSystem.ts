import * as THREE from 'three';
import { surfaceVertex, outputColor } from './rendering/materials';
import { PLANETS, MOON } from '@/data/planets';
import { planetPos, moonPosRel } from '@/utils/orbital/planets';
import { OBLIQ } from '@/utils/orbital/constants';
import {
  displayRadius,
  markerScale,
  createRingTexture,
  createSunCoronaTexture,
  glowSprite,
  withAniso,
} from './utils';
import { texUrl } from './textureTier';
import { loadKtx2 } from './textures';
import { createEarthEllipsoid, EARTH_REFERENCE_RADIUS } from './terrain/coordinates';
import { A, B } from './terrain/geo.js';

const Z_AXIS = new THREE.Vector3(0, 0, 1);
const X_AXIS = new THREE.Vector3(1, 0, 0);

export class PlanetSystem {
  readonly planetMeshes: THREE.Mesh[];
  readonly moonMesh: THREE.Mesh;
  readonly sunMesh: THREE.Mesh;
  readonly planetWorldPos: THREE.Vector3[];
  readonly moonW = new THREE.Vector3();
  private sunLight!: THREE.PointLight;
  private readonly tmpV = new THREE.Vector3();
  private readonly tmpQ = new THREE.Quaternion();
  private readonly ringTex: THREE.CanvasTexture;
  /* 标记层: 每行星一个子级光圈精灵 (远景定位符, 尺寸随视距自适应;
     月球不挂标记, 其定位由标签承担) */
  private readonly bodyGlows: THREE.Sprite[] = [];
  private coronaOuter!: THREE.Sprite;
  private coronaInner!: THREE.Sprite;

  // Earth rotation quaternions (recomputed every frame)
  // qTexQ: maps sphere local +Y (texture north) to geographic +Z (Earth north pole in body frame)
  private readonly qOblQ = new THREE.Quaternion().setFromAxisAngle(
    X_AXIS,
    -OBLIQ,
  );
  private readonly qTexQ = new THREE.Quaternion().setFromAxisAngle(
    X_AXIS,
    Math.PI / 2,
  );
  private readonly qGmst = new THREE.Quaternion();
  private readonly qFrameZ = new THREE.Quaternion();
  readonly earthQ = new THREE.Quaternion();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly uSunDir = { value: new THREE.Vector3(1, 0, 0) };
  private readonly uAtmosphereOpacity = { value: 1 };

  /* 撞击地表冲击波 (球面波): 以撞击点为中心的角距离波前, 随时间在球面上
     按真实声波模型传播 (波前周长变长 → 振幅按 1/sin 角距离衰减), 天然贴合
     地形、随地壳自转、被地平线遮挡 —— 不再是悬空的独立圆环 */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly uImpactDir: any = { value: new THREE.Vector3(0, 0, 0) }; // 撞击点方向 (地球局部系); 零向量 = 休眠
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly uImpactWave: any = { value: 0 }; // 波前角距离 rad
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly uImpactAmp: any = { value: 0 }; // 波前振幅 (能量衰减)
  private earthAtmMesh?: THREE.Mesh;
  private scene: THREE.Scene;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.ringTex = createRingTexture();
    this.planetWorldPos = PLANETS.map(() => new THREE.Vector3());
    this.sunMesh = this._makeSun();
    this.planetMeshes = this._makePlanets();
    this.moonMesh = this._makeMoon();
    this._makeSaturnRing();
    this._makeSunLight();
    /* 标记层光圈: 几何层永远真实比例后行星在远景亚像素,
       靠每行星一个视距自适应细线小光圈保障可辨识 (标记是定位符不是天体,
       与天体网格同位, 子级挂载随位置自动跟随) */
    /* 标记光圈按行星身份色相取亮调 (远景行星是亚像素, 光圈即行星的"颜色");
       比材质底色更饱和一档, 保证远景一眼可辨 */
    const GLOW_COLORS = [
      0xd8cec2, 0xf2cd8e, 0x6fa8ff, 0xe8795a, 0xe4bc8e, 0xeed9a4, 0x9fe6e8,
      0x7d9bf5,
    ];
    for (let i = 0; i < 8; i++) {
      const g = glowSprite(this.ringTex, GLOW_COLORS[i], 0.85);
      /* 地球标记常在地面专题近景 (地球缩小至亚像素) 下出现,
         附加混合 + Bloom 易过曝刺眼, 单独降低其透明度 */
      if (i === 2) g.material.opacity = 0.45;
      this.planetMeshes[i].add(g);
      this.bodyGlows.push(g);
    }
  }

  private _makeSun(): THREE.Mesh {
    /* 太阳贴图异步加载 (与其他行星一致): 到位前先以暖白底色渲染, 避免黑球闪烁 */
    const mat = new THREE.MeshBasicMaterial({ color: 0xffee99 });
    /* 深度偏置: 选中/事件轨道可能掠日而过, 避免重叠段 z-fighting 闪烁 */
    mat.polygonOffset = true;
    mat.polygonOffsetFactor = -2;
    mat.polygonOffsetUnits = -2;
    loadKtx2(texUrl('8k_sun.jpg'), (tex) => {
      withAniso(tex);
      tex.colorSpace = THREE.SRGBColorSpace;
      mat.map = tex;
      mat.needsUpdate = true;
    });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 24), mat);
    /* 同其余行星: 贴图极点从局部 +Y 转至 +Z (太阳无纬向条带, 统一口径保持极轴垂直黄道) */
    mesh.rotation.x = Math.PI / 2;
    this.scene.add(mesh);

    /* 日冕双层辉光: 专用高分辨率平滑衰减纹理 (共享 glow 纹理放大后
       会出环带失真); 缩放每帧按视距自适应 (见 update), 远景保持醒目
       光点、近景不吞没内行星轨道 */
    const coronaTex = createSunCoronaTexture();
    this.coronaOuter = glowSprite(coronaTex, 0xffcc55, 0.9);
    this.coronaOuter.scale.set(4.8, 4.8, 1);
    mesh.add(this.coronaOuter);

    this.coronaInner = glowSprite(coronaTex, 0xffffff, 0.85);
    this.coronaInner.scale.set(2.4, 2.4, 1);
    mesh.add(this.coronaInner);

    return mesh;
  }

  private _makePlanets(): THREE.Mesh[] {
    const meshes: THREE.Mesh[] = [];

    // Textures per planet index (null = use flat color)
    const TEX_PATHS = [
      texUrl('8k_mercury.jpg'),
      texUrl('8k_venus_surface.jpg'),
      null, // Earth — handled in _makeEarth()
      texUrl('8k_mars.jpg'),
      texUrl('8k_jupiter.jpg'),
      texUrl('8k_saturn.jpg'),
      texUrl('2k_uranus.jpg'),
      texUrl('2k_neptune.jpg'),
    ];

    for (let i = 0; i < PLANETS.length; i++) {
      if (i === 2) {
        meshes.push(this._makeEarth());
        continue;
      }
      const pl = PLANETS[i];
      const mat = new THREE.MeshPhongMaterial({ color: pl.color });
      /* 深度偏置: 自身轨道线穿过体内, 避免重叠段遮挡判定逐帧交替 (时隐时现) */
      mat.polygonOffset = true;
      mat.polygonOffsetFactor = -2;
      mat.polygonOffsetUnits = -2;
      const path = TEX_PATHS[i];
      if (path) {
        loadKtx2(path, (tex) => {
          withAniso(tex);
          tex.colorSpace = THREE.SRGBColorSpace;
          mat.map = tex;
          mat.needsUpdate = true;
        });
      }
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 32), mat);
      /* 贴图基准朝向: SphereGeometry 贴图极点在局部 +Y, 绕 X 轴 π/2 转至 +Z,
         使纬度带平行黄道面 (本项目 Z-up 约定, 与地球 qTexQ 同口径);
         不转时条带会垂直于黄道面 (木星横纹变竖纹) */
      mesh.rotation.x = Math.PI / 2;
      this.scene.add(mesh);
      meshes.push(mesh);
    }
    return meshes;
  }

  private _makeEarth(): THREE.Mesh {
    const earthMat = new THREE.ShaderMaterial({
      uniforms: { dayMap: { value: null }, nightMap: { value: null }, cloudMap: { value: null },
        ready: { value: false }, sun: this.uSunDir, impactDir: this.uImpactDir, wave: this.uImpactWave, amp: this.uImpactAmp },
      vertexShader: surfaceVertex,
      fragmentShader: `uniform sampler2D dayMap, nightMap, cloudMap; uniform bool ready;
        uniform vec3 sun, impactDir; uniform float wave, amp;
        varying vec2 vUv; varying vec3 vNormal; varying vec3 vLocal;
        void main() {
          vec3 col = vec3(.05,.15,.32);
          if (ready) {
            vec3 day = mix(texture2D(dayMap,vUv).rgb, vec3(1.), smoothstep(.15,.8,texture2D(cloudMap,vUv).r));
            col = mix(texture2D(nightMap,vUv).rgb, day, smoothstep(-.2,.5,dot(normalize(vNormal),sun)));
          }
          float angle = acos(clamp(dot(normalize(vLocal),impactDir),-1.,1.));
          float shock = clamp((.05-abs(angle-wave))/.05,0.,1.) * amp * min(4.,1./max(.12,sin(angle))) * .4;
          gl_FragColor = vec4(col + vec3(1.,.8,.55)*shock, 1.);
          ${outputColor}
        }`,
    });
    Promise.all([loadKtx2(texUrl('8k_earth_daymap.jpg')), loadKtx2(texUrl('8k_earth_nightmap.jpg')), loadKtx2(texUrl('8k_earth_clouds.jpg'))])
      .then(([day, night, clouds]) => {
        for (const map of [day, night]) { withAniso(map); map.colorSpace = THREE.SRGBColorSpace; }
        withAniso(clouds);
        earthMat.uniforms.dayMap.value = day; earthMat.uniforms.nightMap.value = night;
        earthMat.uniforms.cloudMap.value = clouds; earthMat.uniforms.ready.value = true;
      });
    const mesh = new THREE.Mesh(createEarthEllipsoid(), earthMat);
    this.scene.add(mesh);
    const atmMat = new THREE.ShaderMaterial({
      uniforms: { sun: this.uSunDir, strength: this.uAtmosphereOpacity },
      transparent: true, depthWrite: false, side: THREE.BackSide,
      vertexShader: `varying vec3 n; varying vec3 eye; varying vec3 worldNormal;
        void main(){ vec4 p=modelViewMatrix*vec4(position,1.); n=normalize(normalMatrix*normal);
          eye=normalize(p.xyz);worldNormal=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*p; }`,
      fragmentShader: `uniform vec3 sun;uniform float strength;varying vec3 n,eye,worldNormal;
        void main(){float rim=pow(clamp(1.-abs(dot(normalize(n),normalize(eye))),0.,1.),3.);
          gl_FragColor=vec4(.12,.28,.6,rim*smoothstep(-.3,.8,dot(normalize(worldNormal),sun))*.38*strength);
          ${outputColor}
        }`,
    });
    this.earthAtmMesh = new THREE.Mesh(new THREE.SphereGeometry(1,96,48).scale(
      (A+45000)/EARTH_REFERENCE_RADIUS,(B+45000)/EARTH_REFERENCE_RADIUS,(A+45000)/EARTH_REFERENCE_RADIUS),atmMat);
    this.scene.add(this.earthAtmMesh);
    return mesh;
  }

  private _makeMoon(): THREE.Mesh {
    const mat = new THREE.MeshPhongMaterial({ color: 0xaaaaaa });
    /* 深度偏置: 月球轨道线穿过体内, 同其余天体处理 */
    mat.polygonOffset = true;
    mat.polygonOffsetFactor = -2;
    mat.polygonOffsetUnits = -2;
    loadKtx2(texUrl('8k_moon.jpg'), (tex) => {
      withAniso(tex);
      tex.colorSpace = THREE.SRGBColorSpace;
      mat.map = tex;
      mat.needsUpdate = true;
    });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 16), mat);
    /* 同其余行星: 贴图极点从局部 +Y 转至 +Z, 纬度带平行黄道面 */
    mesh.rotation.x = Math.PI / 2;
    this.scene.add(mesh);
    return mesh;
  }

  private _makeSaturnRing(): void {
    // Saturn is index 5
    const mat = new THREE.MeshBasicMaterial({
      color: 0xc8a464,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
    });
    const loader = new THREE.TextureLoader();
    /* 土星环是平面圆盘, 侧视角为全场景最典型的掠射角, 各向异性收益最大 */
    withAniso(
      loader.load('/image/8k_saturn_ring_alpha.png', (alphaTex) => {
        mat.alphaMap = alphaTex;
        mat.needsUpdate = true;
      }),
    );
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.25, 2.05, 64), mat);
    /* RingGeometry 本在 XY 平面; 但环挂在土星网格 (已绕 X 轴 π/2 对齐贴图极轴) 下,
       父级旋转会把环带成垂直黄道, 故子级反向补偿 -π/2, 环恢复平行黄道面 (Z-up 约定) */
    ring.rotation.x = -Math.PI / 2;
    this.planetMeshes[5].add(ring);
  }

  private _makeSunLight(): void {
    /* 环境光带一点冷蓝 (纯黑环境光让夜半球死黑成一剪影);
       强度略提, 暗面保留可读的地形轮廓 */
    const ambient = new THREE.AmbientLight(0x16233f, 0.55);
    this.scene.add(ambient);
    this.sunLight = new THREE.PointLight(0xfff5cc, 3.5, 0, 1);
    this.scene.add(this.sunLight);
  }

  update(
    jd: number,
    center: THREE.Vector3,
    frameRotC: number,
    frameRotS: number,
    gmstRad: number,
    sizeScale = 1,
    camPos: THREE.Vector3,
    pxScale: number,
  ): void {
    const doRot = !(frameRotS === 0 && frameRotC === 1);

    const rot = (v: THREE.Vector3) => {
      if (!doRot) return;
      const x = v.x,
        y = v.y;
      v.x = x * frameRotC + y * frameRotS;
      v.y = -x * frameRotS + y * frameRotC;
    };

    for (let i = 0; i < 8; i++)
      planetPos(PLANETS[i], jd, this.planetWorldPos[i]);

    // Moon (SPICE 星历优先, 回退固定根数)
    moonPosRel(jd, this.tmpV);
    /* 月球轨距系数: 几何层真实比例下地球半径 ≤真实值, 系数恒为 1 (真实地月距);
       仅当尺寸倍数极大时才放大轨距防止月球埋入地球, 口径与地球半径同源 */
    const earthR = displayRadius(6371, sizeScale);
    const moonK = Math.max(1, (3.5 * earthR) / MOON.a);
    this.moonW.copy(this.planetWorldPos[2]).addScaledVector(this.tmpV, moonK);

    // Sun mesh (真实半径 × 尺寸倍数)
    this.sunMesh.position.copy(center).multiplyScalar(-1);
    rot(this.sunMesh.position);
    const sunR = displayRadius(695700, sizeScale);
    this.sunMesh.scale.setScalar(sunR);

    /* 日冕视距自适应: 远景保持醒目光点 (~21 px), 近景退为 4.8× 日半径,
       不再吞没内行星轨道; 内层保持外层一半维持层次 */
    const sunD = camPos.distanceTo(this.sunMesh.position);
    this.coronaOuter.scale.setScalar(Math.max(sunR * 4.8, sunD * 0.02) / sunR);
    this.coronaInner.scale.setScalar(Math.max(sunR * 2.4, sunD * 0.01) / sunR);

    // Planets (真实半径 × 尺寸倍数)
    for (let i = 0; i < 8; i++) {
      const mesh = this.planetMeshes[i];
      mesh.position.copy(this.planetWorldPos[i]).sub(center);
      rot(mesh.position);
      mesh.scale.setScalar(displayRadius(PLANETS[i].rKm, sizeScale));
    }

    /* 标记层光圈: 只在天体亚像素 (球体肉眼不可见) 时充当定位符, 球体一旦可见即隐藏;
       子级精灵被父级缩放放大/缩小, 每帧按目标世界尺寸反向补偿, 使光圈尺寸只与视距相关 */
    for (let i = 0; i < 8; i++) {
      const mesh = this.planetMeshes[i];
      const r = mesh.scale.x;
      const g = this.bodyGlows[i];
      const d = camPos.distanceTo(mesh.position);
      if (r > 0 && (r / d) * pxScale < 4) {
        g.visible = true;
        g.scale.setScalar(markerScale(r, d) / r);
      } else g.visible = false;
    }

    // Earth orientation
    this.planetMeshes[2].rotation.z = 0;
    this.qGmst.setFromAxisAngle(Z_AXIS, gmstRad);
    this.qFrameZ.setFromAxisAngle(Z_AXIS, Math.atan2(-frameRotS, frameRotC));
    this.earthQ.copy(this.qFrameZ).multiply(this.qOblQ).multiply(this.qGmst);
    this.planetMeshes[2].quaternion.copy(this.earthQ).multiply(this.qTexQ);

    // Atmosphere shell — matches Earth exactly, slightly larger
    if (this.earthAtmMesh) {
      this.earthAtmMesh.position.copy(this.planetMeshes[2].position);
      this.earthAtmMesh.quaternion.copy(this.planetMeshes[2].quaternion);
      this.earthAtmMesh.scale.setScalar(earthR);
    }

    // Sun direction uniform for Earth shader (direction from Earth to Sun in world space)
    this.uSunDir.value.copy(this.sunMesh.position).sub(this.planetMeshes[2].position).normalize();

    // Moon (真实半径; 不挂标记, 定位由标签承担)
    this.moonMesh.position.copy(this.moonW).sub(center);
    rot(this.moonMesh.position);
    const moonR = displayRadius(MOON.rKm, sizeScale);
    this.moonMesh.scale.setScalar(moonR);

    // Sun light follows sun
    this.sunLight.position.copy(this.sunMesh.position);
  }

  getEarthMesh(): THREE.Mesh {
    return this.planetMeshes[2];
  }

  setAtmosphereOpacity(opacity: number): void {
    this.uAtmosphereOpacity.value = opacity;
    if (this.earthAtmMesh) this.earthAtmMesh.visible = opacity > 0;
  }

  /* ---- 撞击地表冲击波驱动 ---- */
  /** 撞击触发: 把场景系撞击方向换算到地球局部系 (波随球体自转) */
  triggerImpact(dirScene: THREE.Vector3): void {
    this.tmpQ.copy(this.planetMeshes[2].quaternion).invert();
    this.tmpV.copy(dirScene).applyQuaternion(this.tmpQ).normalize();
    this.uImpactDir.value.copy(this.tmpV);
    this.uImpactWave.value = 0;
    this.uImpactAmp.value = 1;
  }

  /** 推进波前: ang 为波前角距离 (rad), amp 为振幅 (0-1) */
  setImpactWave(ang: number, amp: number): void {
    this.uImpactWave.value = ang;
    this.uImpactAmp.value = amp;
  }

  /** 重置 (回拨/停止仿真): 波休眠 */
  resetImpact(): void {
    this.uImpactDir.value.set(0, 0, 0);
    this.uImpactAmp.value = 0;
  }
}
