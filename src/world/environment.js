import * as THREE from "three";
import { Reflector } from "three/addons/objects/Reflector.js";
import {
  groundHeight,
  groundNormal,
  routeCurve,
  streamCurve,
  makeRibbon,
  makeNoiseCanvasTexture,
  makeCloudTexture,
  makePetalTexture,
  distanceToStream,
  distanceToRoute,
  smoothstep,
  fbm,
  POND,
  mulberry32,
} from "./util.js";

const SUN_DIR = new THREE.Vector3(0.72, 0.48, 0.16).normalize();

/* ================================================================== */
/* SKY                                                                */
/* ================================================================== */
export function createSky(scene) {
  const uniforms = {
    uTop: { value: new THREE.Color("#6f93a8") },
    uHorizon: { value: new THREE.Color("#e2d7c2") },
    uLow: { value: new THREE.Color("#aab29d") },
    uSunColor: { value: new THREE.Color("#ffe5b4") },
    uSunDir: { value: SUN_DIR.clone() },
    uTime: { value: 0 },
  };
  const geo = new THREE.SphereGeometry(430, 48, 28);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    toneMapped: false,
    uniforms,
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop, uHorizon, uLow, uSunColor, uSunDir;
      uniform float uTime;
      varying vec3 vWorld;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float noise(vec2 p){
        vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y);
      }
      void main(){
        vec3 dir = normalize(vWorld - cameraPosition);
        float h = clamp(dir.y, 0.0, 1.0);
        vec3 col = mix(uHorizon, uTop, pow(h, 0.58));
        col = mix(col, uLow, smoothstep(0.02, -0.16, dir.y));
        float sun = max(dot(dir, uSunDir), 0.0);
        col += uSunColor * pow(sun, 220.0) * 1.25;
        col += uSunColor * pow(sun, 14.0) * 0.13;
        col += uSunColor * pow(sun, 3.5) * 0.028;
        // thin, slow high cloud bands
        vec2 cp = dir.xz / max(dir.y + 0.24, 0.08);
        float cl = noise(cp * 1.35 + vec2(uTime * 0.002, 0.0));
        cl = smoothstep(0.58, 0.86, cl);
        cl *= smoothstep(0.02, 0.2, dir.y) * 0.16;
        col = mix(col, vec3(0.94, 0.92, 0.86), cl);
        // faint horizontal haze
        col = mix(col, uHorizon, smoothstep(0.12, 0.0, h) * 0.28);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const sky = new THREE.Mesh(geo, mat);
  sky.frustumCulled = false;
  sky.userData.skipAO = true;
  sky.renderOrder = -100;
  scene.add(sky);
  return { sky, uniforms };
}

export function createClouds(scene) {
  const map = makeCloudTexture();
  const group = new THREE.Group();
  const rand = mulberry32(91);
  for (let i = 0; i < 16; i++) {
    const mat = new THREE.SpriteMaterial({
      map,
      color: 0xf6f0e2,
      transparent: true,
      opacity: 0.13 + rand() * 0.13,
      depthWrite: false,
      fog: false,
    });
    const sprite = new THREE.Sprite(mat);
    const angle = rand() * Math.PI * 2;
    const radius = 150 + rand() * 190;
    sprite.position.set(Math.cos(angle) * radius, 52 + rand() * 55, Math.sin(angle) * radius - 20);
    const s = 85 + rand() * 100;
    sprite.scale.set(s, s * 0.36, 1);
    sprite.userData.speed = 0.25 + rand() * 0.5;
    group.add(sprite);
  }
  scene.add(group);
  return group;
}

/* ================================================================== */
/* DISTANT MOUNTAIN RINGS                                             */
/* ================================================================== */
function mountainRing({ radius, baseY, height, colorLow, colorHigh, seed, segments = 150, opacity = 1 }) {
  const rand = mulberry32(seed);
  const positions = [];
  const colors = [];
  const indices = [];
  const phase = rand() * 10;
  const lo = new THREE.Color(colorLow);
  const hi = new THREE.Color(colorHigh);
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const n = fbm(Math.cos(a) * 2.3 + phase, Math.sin(a) * 2.3 + phase, 4);
    const n2 = fbm(Math.cos(a) * 7 + 4, Math.sin(a) * 7 + 4, 3);
    const peak = baseY + height * (0.34 + n * 0.9 + n2 * 0.18);
    const rr = radius + (n2 - 0.5) * 28;
    const x = Math.cos(a) * rr;
    const z = Math.sin(a) * rr;
    positions.push(x, baseY - 20, z, x, peak, z);
    const cLow = lo.clone();
    const cHigh = hi.clone().lerp(new THREE.Color("#e5ddca"), 0.1);
    colors.push(cLow.r, cLow.g, cLow.b, cHigh.r, cHigh.g, cHigh.b);
    if (i < segments) {
      const k = i * 2;
      indices.push(k, k + 2, k + 1, k + 2, k + 3, k + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  const mat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    transparent: opacity < 1,
    opacity,
    fog: false,
    depthWrite: true,
    toneMapped: false,
  });
  return new THREE.Mesh(geo, mat);
}

export function createDistantMountains(scene) {
  const group = new THREE.Group();
  const far = mountainRing({
    radius: 385, baseY: -8, height: 74, colorLow: "#9aa9a3", colorHigh: "#8d9d98",
    seed: 3, opacity: 0.65,
  });
  const mid = mountainRing({
    radius: 322, baseY: -10, height: 56, colorLow: "#84978e", colorHigh: "#748980",
    seed: 9, opacity: 0.85,
  });
  const near = mountainRing({
    radius: 262, baseY: -12, height: 42, colorLow: "#6d8378", colorHigh: "#5d7469",
    seed: 17, opacity: 0.94,
  });
  group.add(far, mid, near);
  group.renderOrder = -50;
  scene.add(group);
  return group;
}

/* ================================================================== */
/* TERRAIN                                                            */
/* ================================================================== */
export function createTerrain(scene, assets) {
  const width = 330;
  const depth = 410;
  const segX = 250;
  const segZ = 310;
  const geo = new THREE.PlaneGeometry(width, depth, segX, segZ);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0, -20);

  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const color = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = groundHeight(x, z);
    pos.setY(i, h);
  }
  geo.computeVertexNormals();
  const normal = geo.attributes.normal;

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = pos.getY(i);
    const ny = normal.getY(i);
    const slope = 1 - ny;
    const dStream = z > 20 ? distanceToStream(x, z) : 99;
    const n = fbm(x * 0.16, z * 0.16, 3);
    const macro = fbm(x * 0.035 + 4, z * 0.035 - 2, 3);

    // base: mossy green with warm and cool patches
    const grassA = new THREE.Color("#4f6d40");
    const grassB = new THREE.Color("#84975c");
    const grassC = new THREE.Color("#3f5c3c");
    color.copy(grassA).lerp(grassB, macro * 0.9 + n * 0.12);
    color.lerp(grassC, smoothstep(0.6, 0.95, n) * 0.45);

    // dry earth near paths and open ground
    if (distanceToRoute(x, z) < 3.1) {
      color.lerp(new THREE.Color("#867a5d"), 0.42);
    }

    // sandy / pebbly stream banks
    if (dStream < 8) {
      const sand = new THREE.Color("#a29676").lerp(new THREE.Color("#7f7c63"), n * 0.5);
      color.lerp(sand, smoothstep(8, 2.2, dStream) * 0.85);
    }
    if (dStream < 3.3) {
      color.lerp(new THREE.Color("#5f6a55"), smoothstep(3.3, 1.0, dStream) * 0.6);
    }

    // rock on steep mountain faces
    const rockA = new THREE.Color("#6c6659");
    const rockB = new THREE.Color("#8b8271");
    const rockC = new THREE.Color("#4f5148");
    const rock = rockA.clone().lerp(rockB, n).lerp(rockC, smoothstep(0.55, 0.9, macro) * 0.6);
    const rockMix = smoothstep(0.16, 0.55, slope) * 0.92 + smoothstep(18, 44, h) * 0.25;
    color.lerp(rock, Math.min(1, rockMix));

    // damp dark floor in the passage
    if (z < 26 && z > -25 && Math.abs(x) < 5.2) {
      color.lerp(new THREE.Color("#4a473c"), 0.55);
    }

    // pond mud
    const dp = Math.hypot(x - POND.x, z - POND.z);
    if (dp < POND.r + 2) {
      color.lerp(new THREE.Color("#6f6e55"), smoothstep(POND.r + 2, POND.r - 2, dp) * 0.55);
    }

    // field ground gets a warmer base under the plots
    if (z < -45 && z > -168 && Math.abs(x) < 80) {
      color.lerp(new THREE.Color("#786c4e"), 0.12);
    }

    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const groundMaps = assets ? assets.maps("grass", [110, 130]) : null;
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.96,
    metalness: 0,
    color: 0xffffff,
    map: groundMaps?.map || null,
    normalMap: groundMaps?.normalMap || null,
    roughnessMap: groundMaps?.roughnessMap || null,
    normalScale: new THREE.Vector2(0.65, 0.65),
  });
  const terrain = new THREE.Mesh(geo, mat);
  terrain.receiveShadow = true;
  terrain.castShadow = false;
  scene.add(terrain);

  const path = createTrail(scene, assets);
  return { terrain, path };
}

function createTrail(scene, assets) {
  const geo = makeRibbon(routeCurve, 1.95, 250, 0.2);
  const tex = assets ? assets.maps("dirt", [1.4, 22]) : null;
  const mat = new THREE.MeshStandardMaterial({
    color: assets ? 0x9f8765 : 0xb1986c,
    map: tex?.map || makeNoiseCanvasTexture(),
    normalMap: tex?.normalMap || null,
    roughnessMap: tex?.roughnessMap || null,
    normalScale: new THREE.Vector2(0.8, 0.8),
    roughness: 1,
    metalness: 0,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const trail = new THREE.Mesh(geo, mat);
  trail.receiveShadow = true;
  trail.castShadow = false;
  scene.add(trail);
  return trail;
}

/* ================================================================== */
/* WATER                                                              */
/* ================================================================== */
function waterMaterial({ deep = "#315b55", shallow = "#8bae9f", opacity = 0.86 } = {}) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uDeep: { value: new THREE.Color(deep) },
      uShallow: { value: new THREE.Color(shallow) },
      uSunDir: { value: SUN_DIR.clone() },
      uSunColor: { value: new THREE.Color("#ffe6b8") },
      uFogColor: { value: new THREE.Color("#cdd7cf") },
      uFogDensity: { value: 0.0075 },
      uOpacity: { value: opacity },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vWorld;
      varying float vFogDepth;
      void main(){
        vUv = uv;
        vec3 p = position;
        float wave = sin(p.x * 1.8 + uTime * 1.35) * 0.022
                   + sin(p.z * 1.13 - uTime * 0.92) * 0.018
                   + sin((p.x + p.z) * 2.5 + uTime * 1.8) * 0.006;
        // fade displacement at the banks using uv.x
        float edge = smoothstep(0.0, 0.22, uv.x) * smoothstep(1.0, 0.78, uv.x);
        p.y += wave * (0.35 + edge * 0.65);
        vec4 wp = modelMatrix * vec4(p, 1.0);
        vWorld = wp.xyz;
        vec4 mv = viewMatrix * wp;
        vFogDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uDeep, uShallow, uSunDir, uSunColor, uFogColor;
      uniform float uFogDensity, uOpacity;
      varying vec2 vUv;
      varying vec3 vWorld;
      varying float vFogDepth;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float noise(vec2 p){
        vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y);
      }
      void main(){
        vec3 V = normalize(cameraPosition - vWorld);
        float edge = smoothstep(0.0, 0.24, vUv.x) * smoothstep(1.0, 0.76, vUv.x);
        vec2 fp = vUv * vec2(18.0, 40.0);
        float ripple = noise(fp + vec2(uTime * 0.28, uTime * 0.16));
        ripple += noise(fp * 2.3 - vec2(uTime * 0.17, uTime * 0.31)) * 0.5;
        ripple = (ripple - 0.75) * 0.5;
        vec3 N = normalize(vec3(ripple * 0.55, 1.0, ripple * 0.42));
        float fres = pow(1.0 - max(dot(N, V), 0.0), 2.1);
        float sun = max(dot(reflect(-uSunDir, N), V), 0.0);
        vec3 col = mix(uDeep, uShallow, 0.32 + ripple * 0.18 + fres * 0.42);
        col = mix(col, vec3(0.54, 0.64, 0.58), fres * 0.24);
        col += uSunColor * pow(sun, 100.0) * 0.95;
        col += uSunColor * pow(sun, 12.0) * 0.06;
        // shoreline foam / shallow veil
        float foam = (1.0 - edge) * (0.3 + 0.22 * noise(fp * 1.3 + uTime * 0.12));
        col = mix(col, vec3(0.78, 0.81, 0.72), foam * 0.42);
        float fog = 1.0 - exp(-uFogDensity * uFogDensity * vFogDepth * vFogDepth);
        col = mix(col, uFogColor, fog);
        float alpha = mix(0.54, uOpacity, edge);
        gl_FragColor = vec4(col, alpha);
      }
    `,
  });
}

function ribbonAtHeight(curve, width, segments, y) {
  const positions = [];
  const uvs = [];
  const indices = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const p = curve.getPoint(t);
    const tan = curve.getTangent(t);
    const nx = -tan.z;
    const nz = tan.x;
    const w = width * (0.78 + Math.sin(t * 21) * 0.16 + Math.sin(t * 7) * 0.1);
    positions.push(p.x + nx * w * 0.5, y, p.z + nz * w * 0.5);
    positions.push(p.x - nx * w * 0.5, y, p.z - nz * w * 0.5);
    uvs.push(0, t, 1, t);
    if (i < segments) {
      const k = i * 2;
      indices.push(k, k + 2, k + 1, k + 2, k + 3, k + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

export function createWater(scene) {
  const streamMat = waterMaterial({ deep: "#264b45", shallow: "#729887", opacity: 0.9 });
  const streamGeo = ribbonAtHeight(streamCurve, 6.3, 180, 0.18);
  const stream = new THREE.Mesh(streamGeo, streamMat);
  stream.renderOrder = 3;
  scene.add(stream);

  // spring pool at the foot of the mountain
  const springMat = waterMaterial({ deep: "#264b43", shallow: "#7ea190", opacity: 0.9 });
  const springGeo = new THREE.CircleGeometry(4.3, 48);
  springGeo.rotateX(-Math.PI / 2);
  const spring = new THREE.Mesh(springGeo, springMat);
  spring.position.set(2.2, 0.19, 37.2);
  spring.renderOrder = 3;
  scene.add(spring);

  const isMobile = window.matchMedia("(max-width: 860px)").matches;
  let pondMat = null;
  let pond;
  if (isMobile) {
    pondMat = waterMaterial({ deep: "#203f38", shallow: "#608875", opacity: 0.93 });
    const pondGeo = new THREE.CircleGeometry(POND.r - 0.4, 64);
    pondGeo.rotateX(-Math.PI / 2);
    pond = new THREE.Mesh(pondGeo, pondMat);
    pond.position.set(POND.x, 0.33, POND.z);
  } else {
    const pondShader = {
      name: "PondReflectionShader",
      uniforms: {
        color: { value: null },
        tDiffuse: { value: null },
        textureMatrix: { value: null },
        uTime: { value: 0 },
        uDeep: { value: new THREE.Color("#183b36") },
        uShallow: { value: new THREE.Color("#5b8272") },
        uSunDir: { value: SUN_DIR.clone() },
        uSunColor: { value: new THREE.Color("#ffe5b2") },
        uFogColor: { value: new THREE.Color("#cdd7cf") },
        uFogDensity: { value: 0.003 },
      },
      vertexShader: /* glsl */ `
        uniform mat4 textureMatrix;
        varying vec4 vReflectUv;
        varying vec3 vWorld;
        varying vec2 vPondUv;
        varying float vFogDepth;
        void main(){
          vReflectUv = textureMatrix * vec4(position, 1.0);
          vPondUv = uv;
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          vec4 mv = viewMatrix * wp;
          vFogDepth = -mv.z;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse;
        uniform vec3 uDeep, uShallow, uSunDir, uSunColor, uFogColor;
        uniform float uTime, uFogDensity;
        varying vec4 vReflectUv;
        varying vec3 vWorld;
        varying vec2 vPondUv;
        varying float vFogDepth;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
        float noise(vec2 p){
          vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
          return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y);
        }
        void main(){
          vec2 ripple = vec2(
            sin(vPondUv.y * 42.0 + uTime * 0.7) + 0.6 * sin(vPondUv.x * 33.0 - uTime * 0.5),
            cos(vPondUv.x * 38.0 - uTime * 0.6) + 0.5 * cos(vPondUv.y * 29.0 + uTime * 0.4)
          );
          vec4 ruv = vReflectUv;
          ruv.xy += ripple * 0.0022 * ruv.w;
          vec3 reflection = texture2DProj(tDiffuse, ruv).rgb;
          vec3 V = normalize(cameraPosition - vWorld);
          float fresnel = pow(1.0 - clamp(V.y, 0.0, 1.0), 2.4);
          vec3 N = normalize(vec3(ripple.x * 0.04, 1.0, ripple.y * 0.04));
          float sun = max(dot(reflect(-uSunDir, N), V), 0.0);
          float edge = smoothstep(0.5, 0.38, distance(vPondUv, vec2(0.5)));
          vec3 col = mix(uDeep, uShallow, 0.25 + fresnel * 0.2);
          col = mix(col, reflection * vec3(0.82, 0.9, 0.84), 0.34 + fresnel * 0.42);
          col += uSunColor * pow(sun, 90.0) * 0.7 * edge;
          col += uSunColor * pow(sun, 14.0) * 0.03;
          col = mix(col, uShallow * 0.8, (1.0 - edge) * 0.35);
          float fog = 1.0 - exp(-uFogDensity * uFogDensity * vFogDepth * vFogDepth);
          col = mix(col, uFogColor, fog);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    };
    const pondGeo = new THREE.CircleGeometry(POND.r - 0.4, 72);
    pond = new Reflector(pondGeo, {
      clipBias: 0.003,
      textureWidth: 768,
      textureHeight: 768,
      color: 0xffffff,
      multisample: 0,
      shader: pondShader,
    });
    pond.rotation.x = -Math.PI / 2;
    pond.position.set(POND.x, 0.33, POND.z);
    pond.userData.skipAO = true;
  }
  pond.renderOrder = 3;
  scene.add(pond);

  // a narrow irrigation channel from pond to the fields
  const canalCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(POND.x - 9, 0, POND.z + 2),
    new THREE.Vector3(POND.x - 23, 0, POND.z + 8),
    new THREE.Vector3(POND.x - 38, 0, POND.z + 2),
    new THREE.Vector3(POND.x - 56, 0, POND.z + 12),
  ]);
  const canalGeo = ribbonAtHeight(canalCurve, 1.6, 40, 0.36);
  const canalMat = waterMaterial({ deep: "#4a6c5d", shallow: "#9fb7a3", opacity: 0.7 });
  const canal = new THREE.Mesh(canalGeo, canalMat);
  canal.renderOrder = 3;
  scene.add(canal);

  return {
    stream, pond, canal, spring,
    materials: pondMat ? [streamMat, springMat, pondMat, canalMat] : [streamMat, springMat, canalMat],
    update(time, fogColor, fogDensity) {
      for (const m of this.materials) {
        m.uniforms.uTime.value = time;
        m.uniforms.uFogColor.value.copy(fogColor);
        m.uniforms.uFogDensity.value = fogDensity;
      }
      if (pond.material && pond.material.uniforms && pond.material.uniforms.uTime) {
        pond.material.uniforms.uTime.value = time;
        pond.material.uniforms.uFogColor.value.copy(fogColor);
        pond.material.uniforms.uFogDensity.value = fogDensity;
      }
    },
  };
}

/* ================================================================== */
/* LIGHTING                                                           */
/* ================================================================== */
export function createLighting(scene) {
  const hemi = new THREE.HemisphereLight(0xc5d8dc, 0x50583b, 0.5);
  scene.add(hemi);

  const ambient = new THREE.AmbientLight(0xd8d1b8, 0.08);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xffd09a, 3.9);
  sun.castShadow = true;
  sun.shadow.mapSize.set(window.matchMedia("(max-width: 860px)").matches ? 1024 : 2048, window.matchMedia("(max-width: 860px)").matches ? 1024 : 2048);
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 230;
  sun.shadow.camera.left = -55;
  sun.shadow.camera.right = 55;
  sun.shadow.camera.top = 55;
  sun.shadow.camera.bottom = -55;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.025;
  scene.add(sun);
  scene.add(sun.target);

  const fill = new THREE.DirectionalLight(0xb6ccd1, 0.24);
  fill.position.set(-70, 34, 20);
  scene.add(fill);

  const offset = new THREE.Vector3(82, 94, 22);
  return {
    hemi, ambient, sun, fill,
    update(playerPos) {
      sun.position.copy(playerPos).add(offset);
      sun.target.position.set(playerPos.x, 0, playerPos.z);
      sun.target.updateMatrixWorld();
    },
  };
}

/* ================================================================== */
/* GROUND MIST                                                         */
/* ================================================================== */
export function createGroundMist(scene) {
  const map = makeCloudTexture();
  const rand = mulberry32(77);
  const group = new THREE.Group();
  const items = [];
  for (let i = 0; i < 30; i++) {
    const mat = new THREE.SpriteMaterial({
      map,
      color: 0xe8eee4,
      transparent: true,
      opacity: 0.045 + rand() * 0.055,
      depthWrite: false,
      fog: false,
    });
    const s = new THREE.Sprite(mat);
    let x, z;
    if (i < 18) {
      // along the stream
      const t = rand() * 0.9;
      const p = streamCurve.getPoint(t);
      x = p.x + (rand() - 0.5) * 22;
      z = p.z + (rand() - 0.5) * 10;
    } else {
      x = (rand() - 0.5) * 150;
      z = -35 - rand() * 120;
    }
    s.position.set(x, 1.1 + rand() * 2.4, z);
    const scale = 22 + rand() * 36;
    s.scale.set(scale, scale * 0.32, 1);
    s.userData.baseX = x;
    s.userData.phase = rand() * 10;
    s.userData.speed = 0.08 + rand() * 0.2;
    items.push(s);
    group.add(s);
  }
  scene.add(group);
  return {
    group,
    update(time, cameraPos) {
      for (const s of items) {
        s.position.x = s.userData.baseX + Math.sin(time * s.userData.speed + s.userData.phase) * 4;
        s.material.opacity = 0.05 + 0.035 * (0.5 + 0.5 * Math.sin(time * 0.12 + s.userData.phase));
      }
    },
  };
}

/* ================================================================== */
/* PETALS                                                             */
/* ================================================================== */
export function createPetals(scene) {
  const count = 1350;
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const speeds = new Float32Array(count);
  const sizes = new Float32Array(count);
  const rand = mulberry32(31);
  for (let i = 0; i < count; i++) {
    const z = 50 + rand() * 92;
    const x = -14 + rand() * 48;
    positions[i * 3] = x;
    positions[i * 3 + 1] = 0.4 + rand() * 12;
    positions[i * 3 + 2] = z;
    phases[i] = rand() * Math.PI * 2;
    speeds[i] = 0.24 + rand() * 0.5;
    sizes[i] = 0.14 + rand() * 0.25;
  }
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
  geo.setAttribute("aSpeed", new THREE.BufferAttribute(speeds, 1));
  geo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));

  const map = makePetalTexture();
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    uniforms: {
      uTime: { value: 0 },
      uMap: { value: map },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
    },
    vertexShader: /* glsl */ `
      attribute float aPhase, aSpeed, aSize;
      uniform float uTime, uPixelRatio;
      varying float vAlpha;
      void main(){
        vec3 p = position;
        float t = uTime * aSpeed + aPhase;
        p.x += sin(t * 1.15) * 1.8 + sin(t * 0.37) * 2.6;
        p.z += cos(t * 0.72) * 0.9;
        p.y -= mod(uTime * aSpeed * 0.42 + aPhase, 12.0) * 0.5;
        p.y = mod(p.y - 0.2, 12.0) + 0.25;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = aSize * uPixelRatio * (150.0 / -mv.z);
        vAlpha = smoothstep(0.5, 3.5, -mv.z) * smoothstep(110.0, 55.0, -mv.z) * 0.9;
        vAlpha *= smoothstep(0.15, 1.0, p.y);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      varying float vAlpha;
      void main(){
        vec4 c = texture2D(uMap, gl_PointCoord);
        if(c.a < 0.04) discard;
        gl_FragColor = vec4(c.rgb, c.a * vAlpha);
      }
    `,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 5;
  scene.add(points);
  return {
    points,
    update(time) { mat.uniforms.uTime.value = time; },
  };
}

/* ================================================================== */
/* FLOATING PETALS ON THE STREAM                                      */
/* ================================================================== */
export function createFloatingPetals(scene) {
  const count = 170;
  const geo = new THREE.CircleGeometry(0.09, 5);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xf2b9c7, roughness: 0.9, side: THREE.DoubleSide,
    transparent: true, opacity: 0.92, emissive: 0x2a0d12, emissiveIntensity: 0.18,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  const rand = mulberry32(441);
  const items = [];
  for (let i = 0; i < count; i++) {
    items.push({
      t: rand() * 0.94,
      offset: (rand() - 0.5) * 4.6,
      speed: 0.002 + rand() * 0.004,
      spin: rand() * 6.28,
      scale: 0.6 + rand() * 0.9,
    });
  }
  const dummy = new THREE.Object3D();
  scene.add(mesh);
  return {
    mesh,
    update(time) {
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const t = (it.t + time * it.speed) % 1;
        const p = streamCurve.getPoint(t);
        const tan = streamCurve.getTangent(t);
        const nx = -tan.z, nz = tan.x;
        dummy.position.set(p.x + nx * it.offset, 0.205, p.z + nz * it.offset);
        dummy.rotation.set(0, it.spin + time * 0.25, 0);
        dummy.scale.setScalar(it.scale);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

/* ================================================================== */
/* FIREFLIES / MOTES (village + cave)                                 */
/* ================================================================== */
export function createMotes(scene) {
  const count = 260;
  const positions = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const rand = mulberry32(123);
  for (let i = 0; i < count; i++) {
    if (i < 120) {
      const t = rand() * 0.92;
      const p = routeCurve.getPoint(t);
      positions[i * 3] = p.x + (rand() - 0.5) * 5;
      positions[i * 3 + 1] = 0.7 + rand() * 2.6;
      positions[i * 3 + 2] = p.z + (rand() - 0.5) * 5;
    } else {
      positions[i * 3] = (rand() - 0.5) * 90;
      positions[i * 3 + 1] = 0.5 + rand() * 3.5;
      positions[i * 3 + 2] = -45 - rand() * 100;
    }
    phases[i] = rand() * Math.PI * 2;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
  const map = makePetalTexture();
  // reuse soft petal texture but tint warm
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uMap: { value: map }, uPR: { value: Math.min(window.devicePixelRatio, 2) } },
    vertexShader: /* glsl */ `
      attribute float aPhase;
      uniform float uTime, uPR;
      varying float vA;
      void main(){
        vec3 p = position;
        float t = uTime * 0.28 + aPhase;
        p.x += sin(t * 1.1) * 0.8;
        p.y += sin(t * 0.8 + 2.0) * 0.35;
        p.z += cos(t * 0.9) * 0.7;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = (0.05 + 0.08 * (0.5+0.5*sin(t*2.3))) * uPR * (230.0 / -mv.z);
        vA = (0.3 + 0.7 * pow(0.5 + 0.5*sin(t*2.1+1.0), 2.0)) * smoothstep(35.0, 2.0, -mv.z);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      varying float vA;
      void main(){
        vec4 c = texture2D(uMap, gl_PointCoord);
        if(c.a < 0.03) discard;
        gl_FragColor = vec4(vec3(1.0, 0.88, 0.58), c.a * vA * 0.65);
      }
    `,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);
  return {
    points,
    update(time) { mat.uniforms.uTime.value = time; },
  };
}
