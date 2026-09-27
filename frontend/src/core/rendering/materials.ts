import * as THREE from 'three'

// 共享的地理表面顶点：位置仍由 CPU modelViewMatrix 转换，避免在 GPU 相减 AU 大坐标。
export const surfaceVertex = `
  varying vec2 vUv; varying vec3 vNormal; varying vec3 vView; varying vec3 vLocal;
  void main() {
    vUv = uv; vNormal = normalize(mat3(modelMatrix) * normal); vLocal = normalize(position);
    vec4 p = modelViewMatrix * vec4(position, 1.0);
    vView = normalize(p.xyz); gl_Position = projectionMatrix * p;
  }`
export const outputColor = `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
`

export function terrainMaterial(map: THREE.Texture, sun: THREE.IUniform<THREE.Vector3>, opacity: THREE.IUniform<number>, flash: {
  firePosition: THREE.IUniform<THREE.Vector3>; fireIntensity: THREE.IUniform<number>; metresPerScene: THREE.IUniform<number>
}) {
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: map }, sun, opacity, ...flash }, transparent: opacity.value < .999, vertexColors: true,
    vertexShader: 'varying vec3 vTerrainColor; varying vec3 vViewPosition; varying vec3 vViewNormal;\n' + surfaceVertex
      .replace('vUv = uv;', 'vTerrainColor = color; vViewNormal = normalize(normalMatrix * normal); vUv = uv;')
      .replace('vView = normalize(p.xyz);', 'vViewPosition = p.xyz; vView = normalize(p.xyz);'),
    fragmentShader: `uniform sampler2D map; uniform vec3 sun; uniform float opacity;
      varying vec2 vUv; varying vec3 vNormal; varying vec3 vTerrainColor;
      varying vec3 vViewPosition; varying vec3 vViewNormal;
      uniform vec3 firePosition; uniform float fireIntensity; uniform float metresPerScene;
      void main() {
        float light = .06 + .94 * smoothstep(-.2, .5, dot(normalize(vNormal), sun));
        vec3 delta = (firePosition - vViewPosition) * metresPerScene;
        float distance2 = max(1., dot(delta, delta));
        float flash = fireIntensity / distance2 * max(0., dot(normalize(vViewNormal), normalize(delta)))
          * pow(clamp(1. - pow(sqrt(distance2) / 16000., 4.), 0., 1.), 2.) / 3.14159265;
        gl_FragColor = vec4(texture2D(map, vUv).rgb * (vec3(light) + vec3(1., .356, .112) * flash) * vTerrainColor, opacity);
        ${outputColor}
      }`,
  })
}
