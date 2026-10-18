import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import {
  groundHeight,
  mulberry32,
  fbm,
  distanceToRoute,
  distanceToStream,
  clamp,
  POND,
  makePetalTexture,
} from "./util.js";

/* ================================================================== */
/* small texture helpers                                              */
/* ================================================================== */
function grassTexture() {
  const c = document.createElement("canvas");
  c.width = 128; c.height = 128;
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, 128, 128);
  const rand = mulberry32(48);
  for (let i = 0; i < 22; i++) {
    const x = 18 + rand() * 92;
    const lean = (rand() - 0.5) * 42;
    const top = 6 + rand() * 36;
    const g = ctx.createLinearGradient(0, 128, 0, top);
    g.addColorStop(0, `rgba(${70 + rand() * 32},${96 + rand() * 36},${48 + rand() * 22},1)`);
    g.addColorStop(0.65, `rgba(${100 + rand() * 42},${128 + rand() * 36},${62 + rand() * 24},1)`);
    g.addColorStop(1, `rgba(${138 + rand() * 40},${160 + rand() * 34},${82 + rand() * 26},1)`);
    ctx.strokeStyle = g;
    ctx.lineWidth = 1.2 + rand() * 2.1;
    ctx.beginPath();
    ctx.moveTo(x, 128);
    ctx.quadraticCurveTo(x + lean * 0.4, (128 + top) / 2, x + lean, top);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function bambooLeafTexture() {
  const c = document.createElement("canvas");
  c.width = 128; c.height = 128;
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, 128, 128);
  const rand = mulberry32(7);
  for (let i = 0; i < 24; i++) {
    const x = 18 + rand() * 92;
    const y = 8 + rand() * 105;
    const len = 26 + rand() * 40;
    const a = rand() * Math.PI * 2;
    const g = ctx.createLinearGradient(x, y, x + Math.cos(a) * len, y + Math.sin(a) * len);
    g.addColorStop(0, "rgba(58,82,46,.98)");
    g.addColorStop(1, "rgba(104,128,67,.25)");
    ctx.strokeStyle = g;
    ctx.lineWidth = 1.2 + rand() * 2.4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + Math.cos(a) * len * 0.5 + 6, y + Math.sin(a) * len * 0.5 - 7, x + Math.cos(a) * len, y + Math.sin(a) * len);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function reedTexture() {
  const c = document.createElement("canvas");
  c.width = 128; c.height = 192;
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, 128, 192);
  const rand = mulberry32(19);
  for (let i = 0; i < 28; i++) {
    const x = 22 + rand() * 84;
    const top = 12 + rand() * 62;
    const lean = (rand() - 0.5) * 34;
    const g = ctx.createLinearGradient(0, 192, 0, top);
    g.addColorStop(0, "rgba(102,111,62,1)");
    g.addColorStop(0.7, "rgba(129,137,78,1)");
    g.addColorStop(1, "rgba(160,153,94,1)");
    ctx.strokeStyle = g;
    ctx.lineWidth = 1.1 + rand() * 1.4;
    ctx.beginPath();
    ctx.moveTo(x, 192);
    ctx.quadraticCurveTo(x + lean * 0.3, 100, x + lean, top);
    ctx.stroke();
  }
  // seed heads on a few tall stems
  for (let i = 0; i < 7; i++) {
    const x = 36 + rand() * 56;
    const top = 18 + rand() * 28;
    ctx.strokeStyle = "rgba(128,118,76,.95)";
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(x, 192); ctx.lineTo(x + (rand() - 0.5) * 8, top); ctx.stroke();
    ctx.fillStyle = "rgba(142,123,74,.9)";
    ctx.beginPath(); ctx.ellipse(x + (rand() - 0.5) * 4, top + 4, 2.2, 10, 0, 0, Math.PI * 2); ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/* ================================================================== */
/* PEACH TREES                                                        */
/* ================================================================== */
function makePeachVariant(seed) {
  const rand = mulberry32(seed);
  const trunkParts = [];
  const canopyParts = [];
  const trunkHeight = 1.9 + rand() * 0.9;
  const trunk = new THREE.CylinderGeometry(0.15, 0.3, trunkHeight, 7, 1);
  trunk.translate(0, trunkHeight / 2, 0);
  trunkParts.push(trunk);

  const tips = [];
  const branchCount = 6 + Math.floor(rand() * 4);
  for (let i = 0; i < branchCount; i++) {
    const a = (i / branchCount) * Math.PI * 2 + rand() * 0.55;
    const tilt = 0.42 + rand() * 0.55;
    const len = 1.5 + rand() * 1.3;
    const baseY = trunkHeight * (0.55 + rand() * 0.32);
    const dir = new THREE.Vector3(Math.cos(a) * Math.sin(tilt), Math.cos(tilt), Math.sin(a) * Math.sin(tilt)).normalize();
    const start = new THREE.Vector3(0, baseY, 0);
    const end = start.clone().addScaledVector(dir, len);
    const branch = new THREE.CylinderGeometry(0.055, 0.13, len, 5, 1);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    branch.applyQuaternion(q);
    branch.translate((start.x + end.x) / 2, (start.y + end.y) / 2, (start.z + end.z) / 2);
    trunkParts.push(branch);
    tips.push(end);

    // secondary twigs
    if (rand() > 0.35) {
      const a2 = a + (rand() - 0.5) * 1.4;
      const tilt2 = 0.35 + rand() * 0.5;
      const len2 = 0.7 + rand() * 0.85;
      const dir2 = new THREE.Vector3(Math.cos(a2) * Math.sin(tilt2), Math.cos(tilt2), Math.sin(a2) * Math.sin(tilt2)).normalize();
      const start2 = start.clone().lerp(end, 0.55);
      const end2 = start2.clone().addScaledVector(dir2, len2);
      const twig = new THREE.CylinderGeometry(0.03, 0.065, len2, 4, 1);
      const q2 = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir2);
      twig.applyQuaternion(q2);
      twig.translate((start2.x + end2.x) / 2, (start2.y + end2.y) / 2, (start2.z + end2.z) / 2);
      trunkParts.push(twig);
      tips.push(end2);
    }
  }
  const trunkGeo = mergeGeometries(trunkParts, false);
  trunkParts.forEach((g) => g.dispose());

  const pinks = ["#f5bfcb", "#f3a8bb", "#f9d5dd", "#ef98ae", "#fce4e7", "#f6b7c5", "#fff0ee"];
  for (const tip of tips) {
    const blobCount = 3 + Math.floor(rand() * 3);
    for (let b = 0; b < blobCount; b++) {
      const r = 0.52 + rand() * 0.55;
      const blob = new THREE.IcosahedronGeometry(r, 1);
      blob.scale(0.95 + rand() * 0.35, 0.75 + rand() * 0.35, 0.95 + rand() * 0.35);
      const offset = new THREE.Vector3(
        (rand() - 0.5) * 1.5,
        (rand() - 0.35) * 1.15,
        (rand() - 0.5) * 1.5
      );
      blob.translate(tip.x + offset.x, tip.y + offset.y + 0.25, tip.z + offset.z);
      const col = new THREE.Color(pinks[Math.floor(rand() * pinks.length)]);
      const count = blob.attributes.position.count;
      const arr = new Float32Array(count * 3);
      for (let k = 0; k < count; k++) {
        const v = 0.87 + rand() * 0.2;
        arr[k * 3] = col.r * v;
        arr[k * 3 + 1] = col.g * v;
        arr[k * 3 + 2] = col.b * v;
      }
      blob.setAttribute("color", new THREE.BufferAttribute(arr, 3));
      canopyParts.push(blob);
    }
  }
  // a few crown blobs to close the silhouette
  for (let b = 0; b < 5; b++) {
    const r = 0.65 + rand() * 0.55;
    const blob = new THREE.IcosahedronGeometry(r, 1);
    blob.scale(1.05, 0.78, 1.05);
    blob.translate((rand() - 0.5) * 1.8, trunkHeight + 1.0 + rand() * 1.0, (rand() - 0.5) * 1.8);
    const col = new THREE.Color(pinks[Math.floor(rand() * pinks.length)]);
    const count = blob.attributes.position.count;
    const arr = new Float32Array(count * 3);
    for (let k = 0; k < count; k++) {
      const v = 0.88 + rand() * 0.18;
      arr[k * 3] = col.r * v;
      arr[k * 3 + 1] = col.g * v;
      arr[k * 3 + 2] = col.b * v;
    }
    blob.setAttribute("color", new THREE.BufferAttribute(arr, 3));
    canopyParts.push(blob);
  }
  const canopyGeo = mergeGeometries(canopyParts, false);
  canopyParts.forEach((g) => g.dispose());
  canopyGeo.computeVertexNormals();
  return { trunkGeo, canopyGeo };
}

function makeBlossomAtlas() {
  const S = 2048;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, S, S);
  const rand = mulberry32(9517);
  const half = S / 2;

  function petal(x, y, r, angle, colorA, colorB) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    const grad = ctx.createLinearGradient(0, -r * 0.2, 0, -r);
    grad.addColorStop(0, colorA);
    grad.addColorStop(1, colorB);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(-r * 0.7, -r * 0.35, -r * 0.55, -r * 0.92, -r * 0.16, -r);
    ctx.quadraticCurveTo(0, -r * 0.84, r * 0.16, -r);
    ctx.bezierCurveTo(r * 0.55, -r * 0.92, r * 0.7, -r * 0.35, 0, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function blossomCluster(cx, cy, scale, cellRand) {
    // a few woody twigs
    ctx.strokeStyle = "rgba(80,54,35,.85)";
    ctx.lineWidth = 5 * scale;
    ctx.beginPath();
    ctx.moveTo(cx - 110 * scale, cy + 80 * scale);
    ctx.quadraticCurveTo(cx - 20 * scale, cy + 35 * scale, cx + 70 * scale, cy - 55 * scale);
    ctx.stroke();
    ctx.lineWidth = 3 * scale;
    ctx.beginPath();
    ctx.moveTo(cx - 40 * scale, cy + 45 * scale);
    ctx.lineTo(cx - 95 * scale, cy - 20 * scale);
    ctx.moveTo(cx + 18 * scale, cy + 10 * scale);
    ctx.lineTo(cx + 100 * scale, cy + 60 * scale);
    ctx.stroke();
    // dark branch tips
    for (let i = 0; i < 9; i++) {
      const bx = cx + (cellRand() - 0.5) * 150 * scale;
      const by = cy + (cellRand() - 0.5) * 100 * scale;
      ctx.strokeStyle = "rgba(72,47,30,.8)";
      ctx.lineWidth = (2 + cellRand() * 2) * scale;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx + (cellRand() - 0.5) * 40 * scale, by + (cellRand() - 0.5) * 40 * scale);
      ctx.stroke();
    }
    const flowers = 56 + Math.floor(cellRand() * 22);
    for (let i = 0; i < flowers; i++) {
      const a = cellRand() * Math.PI * 2;
      const rr = (6 + cellRand() * 100) * scale;
      const fx = cx + Math.cos(a) * rr;
      const fy = cy + Math.sin(a) * rr * 0.72;
      const fr = (5.5 + cellRand() * 7.5) * scale;
      const pink = 0.72 + cellRand() * 0.24;
      for (let p = 0; p < 5; p++) {
        const pa = (p / 5) * Math.PI * 2 + cellRand() * 0.2;
        petal(fx, fy, fr, pa,
          `rgba(255,${Math.round(205 + 30 * pink)},${Math.round(216 + 20 * pink)},.96)`,
          `rgba(${Math.round(237 + 12 * pink)},${Math.round(139 + 28 * pink)},${Math.round(164 + 16 * pink)},.98)`);
      }
      // center
      ctx.fillStyle = "rgba(248,224,151,.95)";
      ctx.beginPath(); ctx.arc(fx, fy, fr * 0.18, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(154,97,55,.7)";
      ctx.lineWidth = Math.max(0.6, 1.1 * scale);
      for (let s = 0; s < 5; s++) {
        const sa = cellRand() * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(fx, fy);
        ctx.lineTo(fx + Math.cos(sa) * fr * 0.5, fy + Math.sin(sa) * fr * 0.5);
        ctx.stroke();
      }
    }
    // a few pale green leaves
    for (let i = 0; i < 10; i++) {
      const lx = cx + (cellRand() - 0.5) * 150 * scale;
      const ly = cy + (cellRand() - 0.5) * 110 * scale;
      ctx.save();
      ctx.translate(lx, ly);
      ctx.rotate(cellRand() * 6.28);
      ctx.fillStyle = `rgba(${82 + cellRand() * 30},${112 + cellRand() * 30},${66 + cellRand() * 20},.82)`;
      ctx.beginPath();
      ctx.ellipse(0, 0, 12 * scale, 4 * scale, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // 4 distinct clusters in a 2×2 atlas
  for (let i = 0; i < 4; i++) {
    const cx = (i % 2) * half + half / 2;
    const cy = Math.floor(i / 2) * half + half / 2;
    const cellRand = mulberry32(100 + i * 17);
    // soft halo / tiny out-of-focus petals
    const g = ctx.createRadialGradient(cx, cy, 30, cx, cy, half * 0.46);
    g.addColorStop(0, "rgba(255,222,229,.12)");
    g.addColorStop(1, "rgba(255,222,229,0)");
    ctx.fillStyle = g;
    ctx.fillRect(cx - half / 2, cy - half / 2, half, half);
    blossomCluster(cx, cy, 1.15, cellRand);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

export function createPeachGrove(scene, assets) {
  const glbTrees = assets?.models?.peachTrees;
  const useGLB = !!(glbTrees && glbTrees.length >= 3 && glbTrees.every((t) => t.bark && t.blossoms));
  const useLOD = !!(useGLB && glbTrees.every((t) => t.lowBlossoms));
  const variants = useGLB ? glbTrees : [makePeachVariant(12), makePeachVariant(47), makePeachVariant(88)];
  const trunkMat = assets ? assets.pbr("rock", { repeat: [1.5, 4], color: 0x5a4432, roughness: 1, normalScale: 1.2 }) : new THREE.MeshStandardMaterial({
    color: 0x4b3628, roughness: 1, metalness: 0, flatShading: true,
  });
  const blossomTex = useGLB ? makeBlossomAtlas() : null;
  const blossomMat = useGLB ? new THREE.MeshStandardMaterial({
    map: blossomTex, alphaTest: 0.32, side: THREE.DoubleSide,
    roughness: 0.9, metalness: 0, color: 0xfff0f2,
    emissive: 0x2a1117, emissiveIntensity: 0.1,
  }) : null;
  const canopyMat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.92, metalness: 0,
    flatShading: true, emissive: 0x2a0c12, emissiveIntensity: 0.06,
  });
  const placements = [[], [], []];
  const rand = mulberry32(2024);
  let attempts = 0;
  while (placements.reduce((n, a) => n + a.length, 0) < 110 && attempts < 3600) {
    attempts++;
    const z = 53 + rand() * 73;
    const span = 15 + (z - 53) * 0.12;
    const x = (rand() - 0.5) * span * 2 + (z > 84 ? 4 : -2);
    const dRoute = distanceToRoute(x, z);
    const dStream = distanceToStream(x, z);
    if (dRoute < 7.0 || dStream < 3.8) continue;
    if (dRoute > 30) continue;
    const v = Math.floor(rand() * 3);
    placements[v].push({
      x, z,
      y: groundHeight(x, z) - 0.06,
      rot: rand() * Math.PI * 2,
      scale: useGLB ? 0.82 + rand() * 0.36 : 0.9 + rand() * 0.62,
      tilt: (rand() - 0.5) * 0.08,
    });
  }

  const group = new THREE.Group();
  const dummy = new THREE.Object3D();
  const lodEntries = [];
  let lowMaterials = null;
  variants.forEach((variant, vi) => {
    const list = placements[vi];
    const trunkGeo = useGLB ? variant.bark : variant.trunkGeo;
    const canopyGeo = useGLB ? variant.blossoms : variant.canopyGeo;
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, list.length);
    const canopies = new THREE.InstancedMesh(canopyGeo, useGLB ? blossomMat : canopyMat, list.length);
    let lowCanopies = null;
    if (useLOD) {
      lowCanopies = new THREE.InstancedMesh(variant.lowBlossoms, blossomMat, list.length);
      lowCanopies.castShadow = false;
      lowCanopies.receiveShadow = false;
      lowCanopies.frustumCulled = false;
      lowCanopies.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    }
    trunks.castShadow = !useGLB;
    trunks.receiveShadow = true;
    canopies.castShadow = false;
    canopies.receiveShadow = false;
    trunks.frustumCulled = false;
    canopies.frustumCulled = false;
    trunks.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    canopies.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    list.forEach((p, i) => {
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(p.tilt, p.rot, p.tilt * 0.5);
      dummy.scale.setScalar(p.scale);
      dummy.updateMatrix();
      trunks.setMatrixAt(i, dummy.matrix);
      canopies.setMatrixAt(i, dummy.matrix);
      if (lowCanopies) lowCanopies.setMatrixAt(i, dummy.matrix);
      lodEntries.push({
        high: canopies, low: lowCanopies, index: i,
        matrix: new THREE.Matrix4().copy(dummy.matrix),
        x: p.x, z: p.z,
      });
    });
    group.add(trunks, canopies);
    if (lowCanopies) group.add(lowCanopies);
  });
  scene.add(group);

  const zeroMatrix = new THREE.Matrix4().makeScale(0.0001, 0.0001, 0.0001);
  const lastCam = new THREE.Vector3(Infinity, 0, 0);
  let lastUpdate = -1;
  const mobile = window.matchMedia("(max-width: 860px)").matches;
  function update(cameraPos, time) {
    if (!useLOD) return;
    if (time - lastUpdate < 0.3 && cameraPos.distanceToSquared(lastCam) < 1.0) return;
    lastUpdate = time;
    lastCam.copy(cameraPos);
    const threshold = mobile ? 0 : 22;
    for (const entry of lodEntries) {
      const dx = entry.x - cameraPos.x;
      const dz = entry.z - cameraPos.z;
      const near = dx * dx + dz * dz < threshold * threshold;
      entry.high.setMatrixAt(entry.index, near ? entry.matrix : zeroMatrix);
      if (entry.low) entry.low.setMatrixAt(entry.index, near ? zeroMatrix : entry.matrix);
    }
    for (const entry of lodEntries) {
      entry.high.instanceMatrix.needsUpdate = true;
      if (entry.low) entry.low.instanceMatrix.needsUpdate = true;
    }
  }

  // fallen petals carpeting the grove
  const petalGeo = new THREE.CircleGeometry(0.07, 5);
  petalGeo.rotateX(-Math.PI / 2);
  const petalMat = new THREE.MeshStandardMaterial({
    color: 0xf0b5c3, roughness: 1, side: THREE.DoubleSide, transparent: true, opacity: 0.68,
  });
  const carpet = new THREE.InstancedMesh(petalGeo, petalMat, 1400);
  carpet.receiveShadow = true;
  for (let i = 0; i < 1400; i++) {
    const z = 55 + rand() * 68;
    const x = (rand() - 0.5) * 38;
    if (distanceToStream(x, z) < 2.8) {
      i--; continue;
    }
    dummy.position.set(x, groundHeight(x, z) + 0.05, z);
    dummy.rotation.set(0, rand() * Math.PI * 2, 0);
    dummy.scale.setScalar(0.5 + rand() * 1.2);
    dummy.updateMatrix();
    carpet.setMatrixAt(i, dummy.matrix);
  }
  scene.add(carpet);

  return { group, count: placements.reduce((n, a) => n + a.length, 0), update };
}

/* ================================================================== */
/* MULBERRY / BROADLEAF TREES                                         */
/* ================================================================== */
function makeBroadleafVariant(seed, palette) {
  const rand = mulberry32(seed);
  const trunkParts = [];
  const trunkHeight = 2.4 + rand() * 0.9;
  const trunk = new THREE.CylinderGeometry(0.16, 0.34, trunkHeight, 7, 1);
  trunk.translate(0, trunkHeight / 2, 0);
  trunkParts.push(trunk);
  const tips = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + rand();
    const tilt = 0.4 + rand() * 0.5;
    const len = 1.2 + rand() * 1.1;
    const dir = new THREE.Vector3(Math.cos(a) * Math.sin(tilt), Math.cos(tilt), Math.sin(a) * Math.sin(tilt)).normalize();
    const start = new THREE.Vector3(0, trunkHeight * 0.7, 0);
    const end = start.clone().addScaledVector(dir, len);
    const br = new THREE.CylinderGeometry(0.05, 0.12, len, 5);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    br.applyQuaternion(q);
    br.translate((start.x + end.x) / 2, (start.y + end.y) / 2, (start.z + end.z) / 2);
    trunkParts.push(br);
    tips.push(end);
  }
  const trunkGeo = mergeGeometries(trunkParts, false);
  trunkParts.forEach((g) => g.dispose());

  const canopyParts = [];
  for (const tip of tips) {
    for (let b = 0; b < 3; b++) {
      const r = 0.65 + rand() * 0.65;
      const blob = new THREE.IcosahedronGeometry(r, 1);
      blob.translate(
        tip.x + (rand() - 0.5) * 1.4,
        tip.y + 0.3 + (rand() - 0.4) * 0.7,
        tip.z + (rand() - 0.5) * 1.4
      );
      const col = new THREE.Color(palette[Math.floor(rand() * palette.length)]);
      const count = blob.attributes.position.count;
      const arr = new Float32Array(count * 3);
      for (let k = 0; k < count; k++) {
        const v = 0.8 + rand() * 0.3;
        arr[k * 3] = col.r * v;
        arr[k * 3 + 1] = col.g * v;
        arr[k * 3 + 2] = col.b * v;
      }
      blob.setAttribute("color", new THREE.BufferAttribute(arr, 3));
      canopyParts.push(blob);
    }
  }
  const canopyGeo = mergeGeometries(canopyParts, false);
  canopyParts.forEach((g) => g.dispose());
  canopyGeo.computeVertexNormals();
  return { trunkGeo, canopyGeo };
}

export function createMulberryGrove(scene, assets) {
  const variants = [
    makeBroadleafVariant(3, ["#557443", "#688a52", "#769857", "#4b673d"]),
    makeBroadleafVariant(23, ["#5d7b45", "#6f9050", "#7b9b5a", "#4b693a"]),
  ];
  const trunkMat = assets ? assets.pbr("rock", { repeat: [1.5, 4], color: 0x574433, roughness: 1, normalScale: 1.1 }) : new THREE.MeshStandardMaterial({ color: 0x4f3d2c, roughness: 1, flatShading: true });
  const leafMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true });
  const group = new THREE.Group();
  const dummy = new THREE.Object3D();
  const rand = mulberry32(607);
  const spots = [];
  for (let i = 0; i < 26; i++) {
    const x = -66 + rand() * 45;
    const z = -142 + rand() * 65;
    if (distanceToRoute(x, z) < 3.2) continue;
    spots.push({ x, z, y: groundHeight(x, z), rot: rand() * 6.28, scale: 0.8 + rand() * 0.45 });
  }
  variants.forEach((variant, vi) => {
    const list = spots.filter((_, i) => i % 2 === vi);
    const trunks = new THREE.InstancedMesh(variant.trunkGeo, trunkMat, list.length);
    const leaves = new THREE.InstancedMesh(variant.canopyGeo, leafMat, list.length);
    trunks.castShadow = true; leaves.castShadow = true;
    list.forEach((p, i) => {
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(0, p.rot, 0);
      dummy.scale.setScalar(p.scale);
      dummy.updateMatrix();
      trunks.setMatrixAt(i, dummy.matrix);
      leaves.setMatrixAt(i, dummy.matrix);
    });
    group.add(trunks, leaves);
  });
  scene.add(group);

  // a few big old trees near the village square
  const feature = makeBroadleafVariant(99, ["#4b6a3d", "#5d7d46", "#6c8b50"]);
  for (const [x, z, s] of [[-9, -86, 1.6], [22, -100, 1.35], [-26, -120, 1.25]]) {
    const t = new THREE.Mesh(feature.trunkGeo, trunkMat);
    const l = new THREE.Mesh(feature.canopyGeo, leafMat);
    t.position.set(x, groundHeight(x, z), z); l.position.copy(t.position);
    t.scale.setScalar(s); l.scale.setScalar(s);
    t.castShadow = true; l.castShadow = true;
    group.add(t, l);
  }
  return group;
}

/* ================================================================== */
/* BAMBOO                                                             */
/* ================================================================== */
export function createBambooGrove(scene) {
  const rand = mulberry32(415);
  const spots = [];
  for (let i = 0; i < 260; i++) {
    const x = 42 + rand() * 50;
    const z = -100 + rand() * 58;
    if (distanceToRoute(x, z) < 4) continue;
    spots.push({ x, z, h: 4.5 + rand() * 5.5, r: rand() * 6.28, s: 0.65 + rand() * 0.6, lean: (rand() - 0.5) * 0.16 });
  }
  const group = new THREE.Group();
  const dummy = new THREE.Object3D();
  const stalkGeo = new THREE.CylinderGeometry(0.035, 0.06, 1, 5, 6);
  stalkGeo.translate(0, 0.5, 0);
  const stalkMat = new THREE.MeshStandardMaterial({ color: 0x6d8446, roughness: 0.8, flatShading: true });
  const stalks = new THREE.InstancedMesh(stalkGeo, stalkMat, spots.length);
  stalks.castShadow = true;
  stalks.receiveShadow = true;
  spots.forEach((p, i) => {
    dummy.position.set(p.x, groundHeight(p.x, p.z), p.z);
    dummy.rotation.set(p.lean, p.r, p.lean * 0.7);
    dummy.scale.set(1, p.h, 1);
    dummy.updateMatrix();
    stalks.setMatrixAt(i, dummy.matrix);
  });
  group.add(stalks);

  const leafTex = bambooLeafTexture();
  const leafMat = new THREE.MeshStandardMaterial({
    map: leafTex, transparent: true, alphaTest: 0.22, side: THREE.DoubleSide,
    roughness: 1, depthWrite: true, color: 0xdbe6c7,
  });
  const leafGeo = new THREE.PlaneGeometry(2.4, 2.2);
  const leafCount = spots.length * 2;
  const leaves = new THREE.InstancedMesh(leafGeo, leafMat, leafCount);
  for (let i = 0; i < spots.length; i++) {
    const p = spots[i];
    for (let k = 0; k < 2; k++) {
      const idx = i * 2 + k;
      dummy.position.set(
        p.x + (rand() - 0.5) * 0.8,
        groundHeight(p.x, p.z) + p.h * (0.58 + k * 0.2),
        p.z + (rand() - 0.5) * 0.8
      );
      dummy.rotation.set((rand() - 0.5) * 0.35, rand() * 6.28, (rand() - 0.5) * 0.35);
      dummy.scale.set(0.75 + rand() * 0.7, 0.75 + rand() * 0.7, 1);
      dummy.updateMatrix();
      leaves.setMatrixAt(idx, dummy.matrix);
    }
  }
  leaves.castShadow = false;
  group.add(leaves);
  scene.add(group);
  return group;
}

/* ================================================================== */
/* REEDS, GRASS, FLOWERS                                               */
/* ================================================================== */
export function createGrassAndReeds(scene) {
  const group = new THREE.Group();
  const rand = mulberry32(1009);
  const dummy = new THREE.Object3D();
  const grassTex = grassTexture();
  const grassGeo = mergeGeometries([
    new THREE.PlaneGeometry(0.46, 0.5).translate(0, 0.25, 0),
    new THREE.PlaneGeometry(0.46, 0.5).rotateY(Math.PI / 2).translate(0, 0.25, 0),
  ], false);
  const grassMat = new THREE.MeshStandardMaterial({
    map: grassTex, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 1,
    color: 0xe7ecc7, emissive: 0x28351a, emissiveIntensity: 0.38, depthWrite: true,
  });
  const grassSpots = [];
  for (let i = 0; i < 2600; i++) {
    let x, z;
    if (i < 1500) {
      const t = rand();
      const p = routeCurveSafe(t);
      x = p.x + (rand() - 0.5) * 18;
      z = p.z + (rand() - 0.5) * 18;
      if (distanceToRoute(x, z) < 1.8) continue;
    } else {
      x = (rand() - 0.5) * 145;
      z = -35 - rand() * 135;
      if (distanceToRoute(x, z) < 2) continue;
    }
    grassSpots.push({ x, z, s: 0.55 + rand() * 0.8, r: rand() * 6.28 });
  }
  const grass = new THREE.InstancedMesh(grassGeo, grassMat, grassSpots.length);
  grass.receiveShadow = true;
  grassSpots.forEach((p, i) => {
    dummy.position.set(p.x, groundHeight(p.x, p.z) + 0.04, p.z);
    dummy.rotation.set(0, p.r, 0);
    dummy.scale.set(p.s, p.s * (0.75 + rand() * 0.45), p.s);
    dummy.updateMatrix();
    grass.setMatrixAt(i, dummy.matrix);
  });
  group.add(grass);

  // reeds along the stream: crossed soft billboards rather than black sticks
  const reedTex = reedTexture();
  const reedGeo = mergeGeometries([
    new THREE.PlaneGeometry(0.55, 1.15).translate(0, 0.575, 0),
    new THREE.PlaneGeometry(0.55, 1.15).rotateY(Math.PI / 2).translate(0, 0.575, 0),
  ], false);
  const reedMat = new THREE.MeshStandardMaterial({
    map: reedTex, alphaTest: 0.28, side: THREE.DoubleSide, roughness: 1,
    color: 0xe8e6c4, emissive: 0x252b16, emissiveIntensity: 0.3, depthWrite: true,
  });
  const reedList = [];
  for (let i = 0; i < 460; i++) {
    const t = rand() * 0.93;
    const p = streamCurveAt(t);
    const tan = streamCurveTangent(t);
    const nx = -tan.z, nz = tan.x;
    const side = rand() > 0.5 ? 1 : -1;
    const off = 3.0 + rand() * 1.4;
    const x = p.x + nx * side * off;
    const z = p.z + nz * side * off;
    if (z < 60 && Math.abs(x) < 16) continue;
    reedList.push({ x, z, s: 0.7 + rand() * 0.9, r: rand() * 6.28, lean: (rand() - 0.5) * 0.16 });
  }
  const reeds = new THREE.InstancedMesh(reedGeo, reedMat, reedList.length);
  reedList.forEach((p, i) => {
    dummy.position.set(p.x, groundHeight(p.x, p.z) + 0.06, p.z);
    dummy.rotation.set(p.lean, p.r, p.lean);
    dummy.scale.set(1, p.s, 1);
    dummy.updateMatrix();
    reeds.setMatrixAt(i, dummy.matrix);
  });
  group.add(reeds);

  // small wildflowers
  const flowerGeo = new THREE.IcosahedronGeometry(0.032, 0);
  const flowerMat = new THREE.MeshStandardMaterial({ color: 0xf4e9c4, roughness: 1, emissive: 0x3a3115, emissiveIntensity: 0.2 });
  const flowerCount = 650;
  const flowers = new THREE.InstancedMesh(flowerGeo, flowerMat, flowerCount);
  for (let i = 0; i < flowerCount; i++) {
    const t = rand();
    const p = routeCurveSafe(t);
    const x = p.x + (rand() - 0.5) * 26;
    const z = p.z + (rand() - 0.5) * 26;
    dummy.position.set(x, groundHeight(x, z) + 0.3, z);
    dummy.scale.setScalar(0.5 + rand() * 1.0);
    dummy.updateMatrix();
    flowers.setMatrixAt(i, dummy.matrix);
  }
  group.add(flowers);

  scene.add(group);
  return group;
}

function routeCurveSafe(t) {
  // imported lazily to avoid a cycle in util? simple reuse via module import below
  return ROUTE_SAMPLE(t);
}

import { routeCurve, streamCurve } from "./util.js";
function ROUTE_SAMPLE(t) {
  const p = routeCurve.getPoint(clamp(t, 0, 1));
  return { x: p.x, z: p.z };
}
function streamCurveAt(t) {
  return streamCurve.getPoint(clamp(t, 0, 1));
}
function streamCurveTangent(t) {
  return streamCurve.getTangent(clamp(t, 0, 1));
}

/* ================================================================== */
/* PINES ON THE SLOPES                                                */
/* ================================================================== */
export function createPines(scene) {
  const rand = mulberry32(88);
  const group = new THREE.Group();
  const dummy = new THREE.Object3D();
  const trunkGeo = new THREE.CylinderGeometry(0.12, 0.25, 2.4, 5);
  trunkGeo.translate(0, 1.2, 0);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x46382a, roughness: 1 });
  const leafGeo = mergeGeometries([
    new THREE.ConeGeometry(1.5, 2.6, 7).translate(0, 2.8, 0),
    new THREE.ConeGeometry(1.15, 2.1, 7).translate(0, 4.2, 0),
    new THREE.ConeGeometry(0.8, 1.7, 7).translate(0, 5.4, 0),
  ], false);
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x3d5138, roughness: 1, flatShading: true });
  const spots = [];
  for (let i = 0; i < 90; i++) {
    let x, z;
    if (i < 45) {
      x = (rand() > 0.5 ? 1 : -1) * (52 + rand() * 55);
      z = -20 + rand() * 155;
    } else {
      x = (rand() - 0.5) * 170;
      z = -175 - rand() * 35;
    }
    const h = groundHeight(x, z);
    if (h < 3) continue;
    spots.push({ x, z, y: h, s: 0.7 + rand() * 0.85, r: rand() * 6.28 });
  }
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, spots.length);
  const leaves = new THREE.InstancedMesh(leafGeo, leafMat, spots.length);
  trunks.castShadow = true; leaves.castShadow = true;
  spots.forEach((p, i) => {
    dummy.position.set(p.x, p.y, p.z);
    dummy.rotation.set(0, p.r, 0);
    dummy.scale.setScalar(p.s);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
    leaves.setMatrixAt(i, dummy.matrix);
  });
  group.add(trunks, leaves);
  scene.add(group);
  return group;
}

/* ================================================================== */
/* LOTUS POND                                                         */
/* ================================================================== */
export function createLotus(scene) {
  const rand = mulberry32(220);
  const group = new THREE.Group();
  const leafGeo = new THREE.CircleGeometry(0.5, 12);
  leafGeo.rotateX(-Math.PI / 2);
  const leafMat = new THREE.MeshStandardMaterial({
    color: 0x557b46, roughness: 0.8, side: THREE.DoubleSide, transparent: true, opacity: 0.94,
  });
  const dummy = new THREE.Object3D();
  const count = 84;
  const leaves = new THREE.InstancedMesh(leafGeo, leafMat, count);
  for (let i = 0; i < count; i++) {
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * (POND.r - 2.6);
    dummy.position.set(POND.x + Math.cos(a) * r, 0.36, POND.z + Math.sin(a) * r);
    dummy.rotation.set(0, rand() * 6.28, 0);
    dummy.scale.setScalar(0.55 + rand() * 0.9);
    dummy.updateMatrix();
    leaves.setMatrixAt(i, dummy.matrix);
  }
  group.add(leaves);

  const flowerGeo = new THREE.ConeGeometry(0.1, 0.24, 6);
  const flowerMat = new THREE.MeshStandardMaterial({ color: 0xe9b7b9, roughness: 0.9, emissive: 0x3a1014, emissiveIntensity: 0.3 });
  for (let i = 0; i < 12; i++) {
    const a = rand() * Math.PI * 2;
    const r = rand() * (POND.r - 3.5);
    const flower = new THREE.Mesh(flowerGeo, flowerMat);
    flower.position.set(POND.x + Math.cos(a) * r, 0.58, POND.z + Math.sin(a) * r);
    flower.scale.setScalar(0.55 + rand() * 0.45);
    group.add(flower);
  }
  scene.add(group);
  return group;
}


/* ================================================================== */
/* WILLOWS BY THE POND                                                */
/* ================================================================== */
export function createWillows(scene) {
  const rand = mulberry32(881);
  const group = new THREE.Group();
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4b3a29, roughness: 1, flatShading: true });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x6f8c4f, roughness: 1, flatShading: true });
  const strandMat = new THREE.MeshStandardMaterial({ color: 0x6b874c, roughness: 1, side: THREE.DoubleSide });
  for (const [x, z, s] of [[25.5, -107.5, 1.1], [51, -126, 1.0]]) {
    const y = groundHeight(x, z);
    const tree = new THREE.Group();
    tree.position.set(x, y, z);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.48, 3.6, 8), trunkMat);
    trunk.position.y = 1.8; trunk.castShadow = true; tree.add(trunk);
    const topY = 3.5;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + rand();
      const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.17, 1.6, 5), trunkMat);
      branch.position.set(Math.cos(a) * 0.65, topY + 0.25, Math.sin(a) * 0.65);
      branch.rotation.z = Math.cos(a) * 0.6;
      branch.rotation.x = Math.sin(a) * 0.6;
      branch.castShadow = true;
      tree.add(branch);
    }
    for (let i = 0; i < 10; i++) {
      const a = rand() * Math.PI * 2;
      const r = rand() * 2.2;
      const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(0.65 + rand() * 0.6, 1), leafMat);
      blob.position.set(Math.cos(a) * r, 4.0 + rand() * 0.9, Math.sin(a) * r);
      blob.scale.set(1.2, 0.65, 1.0);
      blob.castShadow = true;
      tree.add(blob);
    }
    // drooping willow strands: merged thin tube segments
    const strandParts = [];
    for (let i = 0; i < 34; i++) {
      const a = rand() * Math.PI * 2;
      const r = 0.6 + rand() * 2.5;
      const start = new THREE.Vector3(Math.cos(a) * r, 4.2 + rand() * 0.7, Math.sin(a) * r);
      const mid = new THREE.Vector3(start.x + (rand() - 0.5) * 0.4, start.y - 1.2 - rand() * 0.6, start.z + (rand() - 0.5) * 0.4);
      const end = new THREE.Vector3(mid.x + (rand() - 0.5) * 0.2, Math.max(0.8, start.y - 2.6 - rand() * 1.6), mid.z);
      const curve = new THREE.CatmullRomCurve3([start, mid, end]);
      const tube = new THREE.TubeGeometry(curve, 5, 0.018, 3, false);
      strandParts.push(tube);
    }
    const strands = new THREE.Mesh(mergeGeometries(strandParts, false), strandMat);
    strandParts.forEach((g) => g.dispose());
    tree.add(strands);
    tree.scale.setScalar(s);
    group.add(tree);
  }
  scene.add(group);
  return group;
}

/* ================================================================== */
/* ROCKS, SHRUBS, BIRDS                                               */
/* ================================================================== */
export function createGroundDetails(scene, assets) {
  const rand = mulberry32(7722);
  const group = new THREE.Group();
  const dummy = new THREE.Object3D();

  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const groundRockMaps = assets ? assets.maps("rock", [1, 1]) : null;
  const rockMats = [
    new THREE.MeshStandardMaterial({ color: 0x9a927e, roughness: 1, flatShading: true, map: groundRockMaps?.map, normalMap: groundRockMaps?.normalMap, roughnessMap: groundRockMaps?.roughnessMap }),
    new THREE.MeshStandardMaterial({ color: 0x817d6b, roughness: 1, flatShading: true, map: groundRockMaps?.map, normalMap: groundRockMaps?.normalMap, roughnessMap: groundRockMaps?.roughnessMap }),
    new THREE.MeshStandardMaterial({ color: 0xa99c82, roughness: 1, flatShading: true, map: groundRockMaps?.map, normalMap: groundRockMaps?.normalMap, roughnessMap: groundRockMaps?.roughnessMap }),
  ];
  const rocks = [];
  for (let i = 0; i < 140; i++) {
    const nearVillage = rand() > 0.48;
    let x, z;
    if (nearVillage) {
      x = (rand() - 0.5) * 150;
      z = -38 - rand() * 125;
    } else {
      x = (rand() - 0.5) * 110;
      z = 34 + rand() * 130;
    }
    if (distanceToRoute(x, z) < 2.2) continue;
    if (z > 22 && distanceToStream(x, z) < 3.4) continue;
    const dPond = Math.hypot(x - POND.x, z - POND.z);
    if (dPond < POND.r + 1.5) continue;
    const h = groundHeight(x, z);
    if (h > 12) continue;
    rocks.push({ x, z, y: h, s: 0.25 + rand() * 1.15, r: rand() * 6.28, m: Math.floor(rand() * 3) });
  }
  for (let m = 0; m < 3; m++) {
    const list = rocks.filter((r) => r.m === m);
    const mesh = new THREE.InstancedMesh(rockGeo, rockMats[m], list.length);
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    list.forEach((p, i) => {
      dummy.position.set(p.x, p.y + p.s * 0.32, p.z);
      dummy.rotation.set(rand() * 3, p.r, rand() * 3);
      dummy.scale.set(p.s * (0.9 + rand() * 0.5), p.s * (0.6 + rand() * 0.4), p.s * (0.9 + rand() * 0.4));
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    group.add(mesh);
  }

  const shrubGeo = new THREE.IcosahedronGeometry(1, 0);
  const shrubMats = [
    new THREE.MeshStandardMaterial({ color: 0x4e663e, roughness: 1, flatShading: true }),
    new THREE.MeshStandardMaterial({ color: 0x617a49, roughness: 1, flatShading: true }),
    new THREE.MeshStandardMaterial({ color: 0x3f5a3a, roughness: 1, flatShading: true }),
  ];
  const shrubs = [];
  for (let i = 0; i < 240; i++) {
    const nearVillage = rand() > 0.5;
    let x, z;
    if (nearVillage) {
      x = (rand() - 0.5) * 145;
      z = -36 - rand() * 130;
    } else {
      x = (rand() - 0.5) * 105;
      z = 36 + rand() * 125;
    }
    if (distanceToRoute(x, z) < 2.4) continue;
    if (z > 22 && distanceToStream(x, z) < 3.2) continue;
    const dPond = Math.hypot(x - POND.x, z - POND.z);
    if (dPond < POND.r + 1) continue;
    const h = groundHeight(x, z);
    if (h > 12) continue;
    shrubs.push({ x, z, y: h, s: 0.3 + rand() * 0.85, r: rand() * 6.28, m: Math.floor(rand() * 3) });
  }
  for (let m = 0; m < 3; m++) {
    const list = shrubs.filter((s) => s.m === m);
    const mesh = new THREE.InstancedMesh(shrubGeo, shrubMats[m], list.length);
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    list.forEach((p, i) => {
      dummy.position.set(p.x, p.y + p.s * 0.5, p.z);
      dummy.rotation.set(0, p.r, 0);
      dummy.scale.set(p.s * (1.0 + rand() * 0.5), p.s * (0.55 + rand() * 0.35), p.s * (1.0 + rand() * 0.5));
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    group.add(mesh);
  }
  scene.add(group);
  return group;
}

export function createBirds(scene) {
  const count = 14;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute([
    -0.55, 0, 0, 0, 0.12, 0.1, 0, 0, -0.12,
    0, 0, -0.12, 0, 0.12, 0.1, 0.55, 0, 0,
  ], 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshBasicMaterial({ color: 0x30392f, side: THREE.DoubleSide, transparent: true, opacity: 0.78, fog: true });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.frustumCulled = false;
  mesh.userData.skipAO = true;
  const rand = mulberry32(6021);
  const birds = [];
  for (let i = 0; i < count; i++) {
    birds.push({
      cx: (rand() - 0.5) * 80,
      cz: -20 - rand() * 110,
      radius: 12 + rand() * 35,
      height: 18 + rand() * 22,
      speed: 0.02 + rand() * 0.045,
      phase: rand() * 6.28,
      scale: 0.7 + rand() * 0.8,
    });
  }
  const dummy = new THREE.Object3D();
  scene.add(mesh);
  return {
    mesh,
    update(time) {
      for (let i = 0; i < count; i++) {
        const b = birds[i];
        const a = b.phase + time * b.speed;
        dummy.position.set(b.cx + Math.cos(a) * b.radius, b.height + Math.sin(time * 0.3 + b.phase) * 1.5, b.cz + Math.sin(a) * b.radius);
        dummy.rotation.set(0, -a + Math.PI / 2, Math.sin(time * 4 + b.phase) * 0.25);
        dummy.scale.setScalar(b.scale);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}
