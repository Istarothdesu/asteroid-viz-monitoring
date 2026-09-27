import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'

/** 普通态势场景的辉光与色彩；事件撞击直接走原版 WebGL 输出。 */
export class ScenePostProcessing {
  private renderer: THREE.WebGLRenderer
  private composer: EffectComposer
  private bloom: UnrealBloomPass
  private saturation: ShaderPass
  private output: OutputPass

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    this.renderer = renderer
    this.composer = new EffectComposer(renderer)
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.5, 1, 0.55)
    this.saturation = new ShaderPass({
      uniforms: { tDiffuse: { value: null }, saturation: { value: 1.1 } },
      vertexShader: `varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform sampler2D tDiffuse; uniform float saturation; varying vec2 vUv;
        void main() { vec4 color = texture2D(tDiffuse, vUv);
          float luminance = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
          gl_FragColor = vec4(mix(vec3(luminance), color.rgb, saturation), color.a);
        }`,
    })
    this.output = new OutputPass()
    this.composer.addPass(new RenderPass(scene, camera))
    this.composer.addPass(this.bloom)
    this.composer.addPass(this.saturation)
    this.composer.addPass(this.output)
    this.resize()
    window.addEventListener('resize', this.resize)
  }

  render(): void { this.composer.render() }

  private resize = (): void => {
    const { clientWidth, clientHeight } = this.renderer.domElement
    if (clientWidth && clientHeight) this.composer.setSize(clientWidth, clientHeight)
  }

  dispose(): void {
    window.removeEventListener('resize', this.resize)
    this.composer.dispose()
    this.bloom.dispose()
    this.saturation.dispose()
    this.output.dispose()
  }
}
