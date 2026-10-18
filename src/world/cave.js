import * as THREE from "three";
import { groundHeight, fbm, mulberry32, smoothstep, makeDustTexture, makeRockTexture } from "./util.js";

/* ================================================================== */
/* massive cliff face pierced by the narrow mouth                     */
/* ================================================================== */
function createFacade(zFront, facing = 1, assets = null) {
  const width = 76;
  const depth = 6;
  const rx = 2.72;
  const legY = 1.0;
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, -0.5);
  const steps = 34;
  for (let i = 0; i <= steps; i++) {
    const x = -width / 2 + (i / steps) * width;
    const ridge = 7 + 11.5 * Math.exp(-Math.pow(x / 14, 2)) + 4.5 * Math.exp(-Math.pow((x - 18) / 8, 2)) + 3.2 * Math.exp(-Math.pow((x + 17) / 8, 2));
    const n = fbm(x * 0.13 + 4, 1.7, 4);
    const y = ridge + (n - 0.5) * 5;
    shape.lineTo(x, y);
  }
  shape.lineTo(width / 2, -0.5);
  shape.closePath();

  const hole = new THREE.Path();
  const arch = [
    [-2.72, -0.35], [-2.67, 0.75], [-2.54, 1.65], [-2.15, 2.45],
    [-1.5, 3.08], [-0.72, 3.46], [0.1, 3.56], [0.82, 3.4],
    [1.55, 3.02], [2.12, 2.4], [2.48, 1.62], [2.64, 0.72],
    [2.72, -0.35],
  ];
  hole.moveTo(arch[0][0], arch[0][1]);
  for (let i = 1; i < arch.length; i++) hole.lineTo(arch[i][0], arch[i][1]);
  hole.closePath();
  shape.holes.push(hole);

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: false,
    curveSegments: 18,
    steps: 1,
  });
  geo.computeVertexNormals();
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const cA = new THREE.Color("#8e8774");
  const cB = new THREE.Color("#afa48d");
  const cC = new THREE.Color("#747465");
  const cMoss = new THREE.Color("#6d8059");
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const n = fbm(x * 0.2 + z * 0.14, y * 0.17, 3);
    c.copy(cA).lerp(cB, n).lerp(cC, smoothstep(8, 30, y) * 0.4);
    if (fbm(x * 0.11, y * 0.13 + 6, 3) > 0.57 && y > 2) c.lerp(cMoss, 0.35);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const rockMaps = assets ? assets.maps("rock", [0.08, 0.08]) : null;
  const rockTex = rockMaps ? null : makeRockTexture();
  if (rockTex) rockTex.repeat.set(0.09, 0.09);
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 1, metalness: 0, flatShading: true, side: THREE.DoubleSide,
    map: rockMaps?.map || rockTex,
    normalMap: rockMaps?.normalMap || null,
    roughnessMap: rockMaps?.roughnessMap || null,
    normalScale: new THREE.Vector2(0.9, 0.9),
    bumpMap: rockMaps ? null : rockTex,
    bumpScale: 0.12,
    emissive: 0x2a251a, emissiveIntensity: 0.2,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  if (facing > 0) {
    mesh.position.z = zFront - depth;
  } else {
    mesh.position.z = zFront;
    mesh.rotation.y = Math.PI;
  }

  const outcrops = new THREE.Group();
  const outcropMaps = assets ? assets.maps("rock", [1.3, 1.3]) : null;
  const outcropMats = [
    new THREE.MeshStandardMaterial({ color: 0x9a907a, roughness: 1, flatShading: true, map: outcropMaps?.map, normalMap: outcropMaps?.normalMap, roughnessMap: outcropMaps?.roughnessMap }),
    new THREE.MeshStandardMaterial({ color: 0xada189, roughness: 1, flatShading: true, map: outcropMaps?.map, normalMap: outcropMaps?.normalMap, roughnessMap: outcropMaps?.roughnessMap }),
    new THREE.MeshStandardMaterial({ color: 0x7d765f, roughness: 1, flatShading: true, map: outcropMaps?.map, normalMap: outcropMaps?.normalMap, roughnessMap: outcropMaps?.roughnessMap }),
  ];
  const mossMats = [
    new THREE.MeshStandardMaterial({ color: 0x536b45, roughness: 1, flatShading: true }),
    new THREE.MeshStandardMaterial({ color: 0x435c3b, roughness: 1, flatShading: true }),
  ];
  const rand = mulberry32(facing > 0 ? 812 : 913);
  for (let i = 0; i < 12; i++) {
    const x = (rand() - 0.5) * 48;
    const y = 1.3 + rand() * 8.5;
    if (Math.abs(x) < 11) continue;
    const s = 0.65 + rand() * 1.5;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), outcropMats[i % 3]);
    rock.position.set(x, y, zFront + facing * (0.15 + s * 0.25));
    rock.scale.set(1.4 + rand() * 0.8, 0.8 + rand() * 0.9, 0.35 + rand() * 0.25);
    rock.rotation.set(rand() * 0.6, rand() * 3, rand() * 0.5);
    rock.castShadow = true;
    rock.receiveShadow = true;
    outcrops.add(rock);
    if (rand() > 0.55) {
      const moss = new THREE.Mesh(new THREE.IcosahedronGeometry(s * 0.55, 0), mossMats[i % 2]);
      moss.position.set(x + (rand() - 0.5) * s, y + s * 0.7, zFront + facing * (0.15 + s * 0.55));
      moss.scale.set(1.4, 0.45, 0.5);
      moss.castShadow = true;
      outcrops.add(moss);
    }
  }
  // pale stone rim around the opening, catching the sky light
  const rimPts = arch.map(([ax, ay]) => new THREE.Vector3(ax, ay, facing > 0 ? zFront + 0.12 : zFront - 0.12));
  const rimCurve = new THREE.CatmullRomCurve3(rimPts, true, "catmullrom", 0.1);
  const rimGeo = new THREE.TubeGeometry(rimCurve, 56, 0.14, 5, true);
  const rimMat = new THREE.MeshStandardMaterial({
    color: facing > 0 ? 0x9c927d : 0x6f6a5a,
    roughness: 0.96, emissive: 0x1b1811,
    emissiveIntensity: facing > 0 ? 0.35 : 0.08,
  });
  const rim = new THREE.Mesh(rimGeo, rimMat);
  rim.castShadow = true;
  rim.receiveShadow = true;
  // a ragged line of trees along the ridge, so the cliff reads as a mountain
  const topAt = (x) => {
    const ridge = 7 + 11.5 * Math.exp(-Math.pow(x / 14, 2)) + 4.5 * Math.exp(-Math.pow((x - 18) / 8, 2)) + 3.2 * Math.exp(-Math.pow((x + 17) / 8, 2));
    const n = fbm(x * 0.13 + 4, 1.7, 4);
    return ridge + (n - 0.5) * 5;
  };
  const forest = new THREE.Group();
  const trunkGeo = new THREE.CylinderGeometry(0.05, 0.09, 0.9, 4);
  trunkGeo.translate(0, 0.45, 0);
  const crownGeo = new THREE.ConeGeometry(0.75, 2.0, 5);
  crownGeo.translate(0, 1.45, 0);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3928, roughness: 1 });
  const crownMat = new THREE.MeshStandardMaterial({ color: 0x405538, roughness: 1, flatShading: true });
  const count = 28;
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
  const crowns = new THREE.InstancedMesh(crownGeo, crownMat, count);
  trunks.castShadow = true;
  crowns.castShadow = true;
  const dummy = new THREE.Object3D();
  const frand = mulberry32(facing > 0 ? 333 : 444);
  for (let i = 0; i < count; i++) {
    const x = -28 + (i / (count - 1)) * 56 + (frand() - 0.5) * 1.6;
    const y = topAt(x) - 0.2;
    const z = zFront + facing * (0.3 + frand() * 0.7);
    const s = 0.7 + frand() * 1.1;
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, frand() * 6.28, 0);
    dummy.scale.setScalar(s);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
    crowns.setMatrixAt(i, dummy.matrix);
  }
  forest.add(trunks, crowns);

  const outGroup = new THREE.Group();
  outGroup.add(mesh, outcrops, rim, forest);
  return outGroup;
}

/* ================================================================== */
/* THE MOUNTAIN AND ITS NARROW PASSAGE                                */
/* ================================================================== */
export function createCave(scene, assets) {
  const group = new THREE.Group();
  const rand = mulberry32(515);

  /* --- tunnel shell ------------------------------------------------- */
  const length = 54;            // z = +27 .. -27
  const segZ = 72;
  const segA = 26;
  const positions = [];
  const colors = [];
  const indices = [];
  const rockDark = new THREE.Color("#37342c");
  const rockMid = new THREE.Color("#595347");
  const rockWarm = new THREE.Color("#6e6553");
  const c = new THREE.Color();

  for (let i = 0; i <= segZ; i++) {
    const t = i / segZ;
    const z = 27 - t * length;
    const rx = 3.05 + Math.sin(t * Math.PI) * 0.28 + (fbm(t * 4.3, 1.2, 3) - 0.5) * 0.32;
    const ry = 2.35 + Math.sin(t * Math.PI) * 0.22 + (fbm(t * 3.7, 8.2, 3) - 0.5) * 0.24;
    const cy = 1.98 + Math.sin(t * 2.0) * 0.1;
    for (let j = 0; j <= segA; j++) {
      const a = (j / segA) * Math.PI * 2;
      const jitter = (fbm(Math.cos(a) * 2.4 + t * 3, Math.sin(a) * 2.4, 3) - 0.5) * 0.34;
      const rxj = rx + jitter;
      const ryj = ry + jitter * 0.7;
      const x = Math.cos(a) * rxj;
      let y = cy + Math.sin(a) * ryj;
      if (y < 0.34) y = 0.34 + (y - 0.34) * 0.16;
      positions.push(x, y, z);
      const n = fbm(x * 0.7 + 10, z * 0.35, 3);
      c.copy(rockDark).lerp(rockMid, n).lerp(rockWarm, fbm(x * 0.4, z * 0.9, 2) * 0.35);
      c.multiplyScalar(0.78 + 0.25 * smoothstep(0.2, 0.8, n));
      colors.push(c.r, c.g, c.b);
      if (i < segZ && j < segA) {
        const k = i * (segA + 1) + j;
        indices.push(k, k + segA + 1, k + 1, k + segA + 1, k + segA + 2, k + 1);
      }
    }
  }
  const tunnelGeo = new THREE.BufferGeometry();
  tunnelGeo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  tunnelGeo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  tunnelGeo.setIndex(indices);
  tunnelGeo.computeVertexNormals();
  const tunnelMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
    metalness: 0,
    side: THREE.BackSide,
    flatShading: true,
  });
  const tunnel = new THREE.Mesh(tunnelGeo, tunnelMat);
  tunnel.name = "caveTunnel";
  tunnel.receiveShadow = true;
  tunnel.castShadow = true;
  group.add(tunnel);

  const facadeFront = createFacade(33, 1, assets);
  facadeFront.name = "facadeFront";
  const facadeBack = createFacade(-29, -1, assets);
  facadeBack.name = "facadeBack";
  group.add(facadeFront, facadeBack);

  // hero portal rocks, sculpted and displaced in Blender
  if (assets?.models?.cavePortal?.length) {
    const portalRocks = new THREE.Group();
    const portalMat = assets.pbr("rock", {
      repeat: [1.2, 1.2], color: 0x968d79, roughness: 1, normalScale: 1.2,
    });
    for (const geo of assets.models.cavePortal) {
      const rock = new THREE.Mesh(geo, portalMat);
      rock.castShadow = true;
      rock.receiveShadow = true;
      portalRocks.add(rock);
    }
    portalRocks.position.set(0, groundHeight(0, 33.8), 33.8);
    portalRocks.scale.setScalar(1.04);
    group.add(portalRocks);
  }

  // a veil of darkness deep in the passage: from a distance it reads as
  // an unlit cave, while it fades away as the visitor comes close
  const veilCanvas = document.createElement("canvas");
  veilCanvas.width = 128; veilCanvas.height = 128;
  const vctx = veilCanvas.getContext("2d");
  const vg = vctx.createRadialGradient(64, 64, 8, 64, 64, 64);
  vg.addColorStop(0, "rgba(0,0,0,1)");
  vg.addColorStop(0.6, "rgba(0,0,0,.94)");
  vg.addColorStop(0.9, "rgba(0,0,0,.55)");
  vg.addColorStop(1, "rgba(0,0,0,0)");
  vctx.fillStyle = vg;
  vctx.fillRect(0, 0, 128, 128);
  const veilTex = new THREE.CanvasTexture(veilCanvas);
  const veil = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 7),
    new THREE.MeshBasicMaterial({
      map: veilTex, transparent: true, opacity: 0.92,
      depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false,
    })
  );
  veil.position.set(0, 2.2, 0);
  veil.renderOrder = 6;
  group.add(veil);

  /* --- mountain cap over the passage -------------------------------- */
  const capGeo = new THREE.PlaneGeometry(58, 84, 34, 44);
  capGeo.rotateX(-Math.PI / 2);
  capGeo.translate(0, 0, 1);
  const capPos = capGeo.attributes.position;
  const capColors = new Float32Array(capPos.count * 3);
  for (let i = 0; i < capPos.count; i++) {
    const x = capPos.getX(i);
    const z = capPos.getZ(i);
    const nx = x / 29;
    const nz = (z - 1) / 40;
    const base = Math.max(0, 1 - nx * nx * 0.92 - nz * nz * 0.82);
    const ridge = Math.pow(base, 0.72);
    const n = fbm(x * 0.11 + 3, z * 0.1, 4);
    const n2 = fbm(x * 0.35, z * 0.35, 3);
    let h = 4.6 + ridge * (19 + n * 14) + n2 * (1.6 + ridge * 5.5);
    h += smoothstep(22, 40, Math.abs(z - 1)) * 13;
    capPos.setY(i, h);
    const rock = new THREE.Color("#625d50").lerp(new THREE.Color("#807967"), n);
    const green = new THREE.Color("#536346").lerp(new THREE.Color("#6d7a55"), n2);
    const greenMix = smoothstep(0.5, 0.88, fbm(x * 0.12 + 6, z * 0.12, 3)) * 0.7;
    rock.lerp(green, greenMix);
    rock.lerp(new THREE.Color("#3d3d34"), smoothstep(15, 32, h) * 0.32);
    capColors[i * 3] = rock.r;
    capColors[i * 3 + 1] = rock.g;
    capColors[i * 3 + 2] = rock.b;
  }
  capGeo.setAttribute("color", new THREE.BufferAttribute(capColors, 3));
  capGeo.computeVertexNormals();
  const capMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
    metalness: 0,
    flatShading: true,
  });
  const cap = new THREE.Mesh(capGeo, capMat);
  cap.name = "caveCap";
  cap.castShadow = true;
  cap.receiveShadow = true;
  // The height-field cap reads as a floating arch from the village side,
  // so the enclosing terrain and cliff facades carry the mountain instead.
  // group.add(cap);

  /* --- irregular portal rocks --------------------------------------- */
  const portalRocks = new THREE.Group();
  const rockMat = new THREE.MeshStandardMaterial({
    color: 0x807766, roughness: 1, metalness: 0, flatShading: true,
  });
  const rockMats = [
    rockMat,
    new THREE.MeshStandardMaterial({ color: 0x978b74, roughness: 1, flatShading: true }),
    new THREE.MeshStandardMaterial({ color: 0x6c6556, roughness: 1, flatShading: true }),
  ];
  for (const zSign of [1, -1]) {
    const zBase = zSign > 0 ? 33.2 : -29.2;
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + rand() * 0.12;
      const radius = 3.35 + rand() * 0.45;
      const x = Math.cos(a) * radius;
      const y = 2.0 + Math.sin(a) * 2.5;
      if (y > 2.9 || y < 0.32) continue;
      const s = 0.3 + rand() * 0.5;
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), rockMats[i % 3]);
      rock.position.set(x, Math.max(0.32, y), zBase + (rand() - 0.5) * 1.1);
      rock.scale.set(0.9 + rand() * 0.7, 0.8 + rand() * 0.8, 0.8 + rand() * 0.5);
      rock.rotation.set(rand() * 3, rand() * 3, rand() * 3);
      rock.castShadow = true;
      rock.receiveShadow = true;
      portalRocks.add(rock);
    }
  }
  // portal boulders are now built into the cliff face
  // group.add(portalRocks);

  // a worn earthen apron in front of the mouth
  const apronGeo = new THREE.CircleGeometry(6.8, 32);
  apronGeo.rotateX(-Math.PI / 2);
  const apronMat = new THREE.MeshStandardMaterial({ color: 0x8b7955, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const apron = new THREE.Mesh(apronGeo, apronMat);
  apron.position.set(1.8, groundHeight(1.8, 34.5) + 0.055, 34.5);
  apron.scale.set(1.15, 1, 0.84);
  apron.receiveShadow = true;
  group.add(apron);

  // flat stones leading from the bank to the dry mouth
  for (let i = 0; i < 7; i++) {
    const x = 4.4 - i * 0.62;
    const z = 36.8 - i * 0.5;
    const stone = new THREE.Mesh(new THREE.CylinderGeometry(0.55 - i * 0.03, 0.6 - i * 0.03, 0.1, 7), rockMats[i % 3]);
    stone.position.set(x, groundHeight(x, z) + 0.1, z);
    stone.rotation.y = rand() * 6.28;
    stone.receiveShadow = true;
    group.add(stone);
  }

  // shrubs and moss at the mouth, breaking up the rock silhouette
  const bushMats = [
    new THREE.MeshStandardMaterial({ color: 0x4f633f, roughness: 1, flatShading: true }),
    new THREE.MeshStandardMaterial({ color: 0x63784b, roughness: 1, flatShading: true }),
    new THREE.MeshStandardMaterial({ color: 0x435739, roughness: 1, flatShading: true }),
  ];
  for (let i = 0; i < 30; i++) {
    const side = rand() > 0.5 ? 1 : -1;
    const x = side * (3.6 + rand() * 6.0);
    const z = (rand() > 0.5 ? 31 + rand() * 8 : -30 - rand() * 8);
    const y = groundHeight(x, z);
    const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(0.35 + rand() * 0.8, 1), bushMats[i % 3]);
    bush.position.set(x, y + 0.25 + rand() * 0.2, z);
    bush.scale.set(1.0 + rand() * 0.7, 0.6 + rand() * 0.5, 1.0 + rand() * 0.7);
    bush.castShadow = true;
    group.add(bush);
  }

  /* --- interior boulders and stalactites ---------------------------- */
  for (let i = 0; i < 26; i++) {
    const z = 24 - rand() * 48;
    const side = rand() > 0.5 ? 1 : -1;
    const x = side * (2.1 + rand() * 0.9);
    const s = 0.22 + rand() * 0.6;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), rockMats[i % 3]);
    rock.position.set(x, 0.4 + rand() * 0.35, z);
    rock.scale.set(1.1, 0.7 + rand() * 0.8, 1.1);
    rock.rotation.set(rand() * 3, rand() * 3, rand() * 3);
    rock.castShadow = true;
    rock.receiveShadow = true;
    group.add(rock);
  }
  for (let i = 0; i < 20; i++) {
    const z = 24 - rand() * 48;
    const x = (rand() - 0.5) * 4.3;
    const len = 0.3 + rand() * 1.1;
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.09 + rand() * 0.2, len, 5),
      rockMat
    );
    cone.position.set(x, 4.15 - len * 0.5 + rand() * 0.25, z);
    cone.rotation.z = Math.PI;
    cone.castShadow = true;
    group.add(cone);
  }

  /* --- wet floor patches -------------------------------------------- */
  const wetMat = new THREE.MeshStandardMaterial({
    color: 0x394940, roughness: 0.25, metalness: 0.12, transparent: true, opacity: 0.55,
  });
  for (let i = 0; i < 9; i++) {
    const geo = new THREE.CircleGeometry(0.45 + rand() * 1.2, 18);
    geo.rotateX(-Math.PI / 2);
    const puddle = new THREE.Mesh(geo, wetMat);
    puddle.position.set((rand() - 0.5) * 3.2, 0.39, 22 - rand() * 44);
    puddle.scale.set(1, 1, 0.5 + rand() * 0.4);
    group.add(puddle);
  }

  /* --- light at the far mouth --------------------------------------- */
  const exitGlowMat = new THREE.SpriteMaterial({
    map: makeDustTexture(),
    color: 0xffe6b0,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  });
  const exitGlow = new THREE.Sprite(exitGlowMat);
  exitGlow.position.set(0, 2.4, -25.6);
  exitGlow.scale.set(5.2, 4.6, 1);
  group.add(exitGlow);

  const entryGlowMat = new THREE.SpriteMaterial({
    map: makeDustTexture(),
    color: 0xe7f0dd,
    transparent: true,
    opacity: 0.4,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  });
  const entryGlow = new THREE.Sprite(entryGlowMat);
  entryGlow.position.set(0, 3.0, 26.0);
  entryGlow.scale.set(7, 6, 1);
  group.add(entryGlow);

  const exitLight = new THREE.PointLight(0xffdca0, 14, 52, 2);
  exitLight.position.set(0, 2.4, -24.5);
  group.add(exitLight);
  const entryLight = new THREE.PointLight(0xdde8d4, 3.2, 14, 2);
  entryLight.position.set(0, 2.8, 24.5);
  group.add(entryLight);

  const mouthGlowMat = new THREE.SpriteMaterial({
    map: makeDustTexture(), color: 0xffdcaa, transparent: true, opacity: 0.22,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  });
  const mouthGlow = new THREE.Sprite(mouthGlowMat);
  mouthGlow.position.set(0, 2.3, 30.8);
  mouthGlow.scale.set(2.4, 2.0, 1);
  mouthGlowMat.opacity = 0.12;
  // mouthGlow kept out of the shot; the far exit provides the light
  // group.add(mouthGlow);

  // cool indirect fill so the rock walls stay legible without a torch
  const fillA = new THREE.PointLight(0x9db4a7, 5.2, 22, 2);
  fillA.position.set(-1.1, 3.2, 10);
  group.add(fillA);
  const fillB = new THREE.PointLight(0xb4c2b0, 4.4, 21, 2);
  fillB.position.set(1.1, 2.9, -5);
  group.add(fillB);

  const mouthLight = new THREE.PointLight(0xffe2b5, 4.5, 16, 2);
  mouthLight.position.set(0, 2.6, 30.5);
  group.add(mouthLight);

  const facadeFill = new THREE.PointLight(0xffd8a6, 34, 48, 2);
  facadeFill.position.set(0, 12, 46);
  group.add(facadeFill);

  scene.add(group);
  return {
    group,
    tunnel,
    cap,
    veil,
    exitGlow,
    update(time, caveFactor) {
      exitGlowMat.opacity = 0.55 + 0.22 * Math.sin(time * 1.2) + caveFactor * 0.2;
      entryGlowMat.opacity = 0.24 + caveFactor * 0.2;
      exitLight.intensity = 7 + caveFactor * 6;
    },
  };
}

/* ================================================================== */
/* A SMALL SUSPENSION BRIDGE ACROSS THE STREAM (optional scene prop)  */
/* ================================================================== */
export function createStreamBridge(scene) {
  const group = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x5a4a36, roughness: 0.95 });
  const rope = new THREE.MeshStandardMaterial({ color: 0x8c7a58, roughness: 1 });
  // Planks
  for (let i = 0; i < 9; i++) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.09, 0.34), wood);
    plank.position.set(0, 0.62 + Math.sin((i / 8) * Math.PI) * 0.16, -1.4 + i * 0.35);
    plank.rotation.x = Math.cos((i / 8) * Math.PI) * 0.06;
    plank.castShadow = true;
    plank.receiveShadow = true;
    group.add(plank);
  }
  // posts and ropes
  for (const z of [-1.7, 1.7]) {
    for (const x of [-1.2, 1.2]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 1.35, 6), wood);
      post.position.set(x, 1.05, z);
      post.castShadow = true;
      group.add(post);
    }
    const ropeBar = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.45, 5), rope);
    ropeBar.rotation.z = Math.PI / 2;
    ropeBar.position.set(0, 1.28, z);
    group.add(ropeBar);
  }
  for (const x of [-1.2, 1.2]) {
    const ropeLine = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 3.4, 5), rope);
    ropeLine.rotation.x = Math.PI / 2;
    ropeLine.position.set(x, 1.28, 0);
    group.add(ropeLine);
  }
  group.position.set(6.2, 0, 54);
  group.rotation.y = 0.06;
  scene.add(group);
  return group;
}
