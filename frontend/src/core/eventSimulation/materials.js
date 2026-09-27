import * as THREE from 'three';

export function createFireSpriteMaterial(map, color) {
  return new THREE.SpriteMaterial({ map, color, transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending });
}

export function createTrailMaterial(map, trailAxis, hot) {
  return new THREE.ShaderMaterial({
      uniforms: { map: { value: map }, trailAxis: { value: trailAxis }, alignTrail: { value: hot ? 1 : 0 } }, transparent: true, depthWrite: false, toneMapped: false,
      // 外焰保留自身颜色与密度；亮核的加法辉光由 EventEffects 单独叠加。
      blending: THREE.NormalBlending,
      vertexShader: `attribute vec3 centre; attribute vec2 particleSize; attribute vec4 tint; attribute float spin;
        uniform vec3 trailAxis; uniform float alignTrail;
        varying vec2 vUv; varying vec4 vTint;
        #include <common>
        #include <logdepthbuf_pars_vertex>
        void main(){vUv=uv;vTint=tint;float metreScale=length(modelViewMatrix[0].xyz);vec2 axis=(mat3(modelViewMatrix)*trailAxis).xy/metreScale;
          float angle=spin+alignTrail*atan(axis.y,axis.x);vec2 p=position.xy*particleSize;
          p.x*=mix(1.,max(.1,length(axis)),alignTrail);
          p=mat2(cos(angle),sin(angle),-sin(angle),cos(angle))*p;
          vec4 mvPosition=modelViewMatrix*vec4(centre,1.);mvPosition.xy+=p*metreScale;gl_Position=projectionMatrix*mvPosition;
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader: `uniform sampler2D map; varying vec2 vUv; varying vec4 vTint;
        #include <logdepthbuf_pars_fragment>
        void main(){vec4 tex=texture2D(map,vUv);float alpha=tex.a*vTint.a;if(alpha<.003)discard;
          #include <logdepthbuf_fragment>
          gl_FragColor=vec4(tex.rgb*vTint.rgb,alpha);
          #include <colorspace_fragment>
        }`,
  });
}
