import * as THREE from "three";
import {
  groundHeight, mulberry32, distanceToRoute, distanceToStream,
  makeTileTexture, makeThatchTexture, makePlasterTexture, makeLatticeTexture,
  makeCloudTexture, makeDustTexture, makeNoiseCanvasTexture, makeRibbon,
  clamp, smoothstep, POND,
} from "./util.js";
import { createVillagers, createAnimals, createChickenFlock } from "./life.js";

/* ================================================================== */
/* shared village materials                                           */
/* ================================================================== */
function makeMaterials(assets) {
  const latticeTex = makeLatticeTexture();
  if (assets) {
    return {
      plaster: assets.pbr("plaster", { repeat: [2, 1], color: 0xe3d8c1, roughness: 0.96 }),
      plasterWarm: assets.pbr("plaster", { repeat: [2, 1], color: 0xD3C4A7, roughness: 0.96 }),
      wood: assets.pbr("wood", { repeat: [1, 1], color: 0x8a6c4c, roughness: 0.9 }),
      woodLight: assets.pbr("wood", { repeat: [1, 1], color: 0xb08b5e, roughness: 0.92 }),
      darkWood: assets.pbr("wood", { repeat: [1, 1], color: 0x5b432d, roughness: 0.95 }),
      stone: assets.pbr("rock", { repeat: [1, 1], color: 0x928b7b, roughness: 0.98 }),
      stoneLight: assets.pbr("rock", { repeat: [1, 1], color: 0xa9a18d, roughness: 0.98 }),
      tile: assets.pbr("tile", { repeat: [2.4, 2], color: 0xd0d0c7, roughness: 0.88, side: THREE.DoubleSide, normalScale: 1.2 }),
      thatch: assets.pbr("thatch", { repeat: [2.5, 1.5], color: 0xd4bd8a, roughness: 1, side: THREE.DoubleSide, normalScale: 1.15 }),
      lattice: new THREE.MeshStandardMaterial({ map: latticeTex, roughness: 0.8, side: THREE.DoubleSide }),
      paper: new THREE.MeshStandardMaterial({ color: 0xd7c49a, roughness: 0.9, emissive: 0x2a1b08, emissiveIntensity: 0.2 }),
      red: new THREE.MeshStandardMaterial({ color: 0x8e3428, roughness: 0.85 }),
      bronze: new THREE.MeshStandardMaterial({ color: 0x806a3f, roughness: 0.55, metalness: 0.45 }),
      earth: assets.pbr("dirt", { repeat: [2, 2], color: 0xb49a73, roughness: 1, normalScale: 0.9 }),
      linen: assets.pbr("linen", { repeat: [1, 1], color: 0xb9ae96, roughness: 0.95, side: THREE.DoubleSide }),
    };
  }
  const tileTex = makeTileTexture();
  const thatchTex = makeThatchTexture();
  const plasterTex = makePlasterTexture();
  return {
    plaster: new THREE.MeshStandardMaterial({ color: 0xd9cfb8, map: plasterTex, roughness: 1 }),
    plasterWarm: new THREE.MeshStandardMaterial({ color: 0xcbbd9e, map: plasterTex, roughness: 1 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x4d3927, roughness: 0.92 }),
    woodLight: new THREE.MeshStandardMaterial({ color: 0x70563a, roughness: 0.95 }),
    darkWood: new THREE.MeshStandardMaterial({ color: 0x33261b, roughness: 0.95 }),
    stone: new THREE.MeshStandardMaterial({ color: 0x777366, roughness: 1, flatShading: true }),
    stoneLight: new THREE.MeshStandardMaterial({ color: 0x918b7a, roughness: 1, flatShading: true }),
    tile: new THREE.MeshStandardMaterial({ color: 0x8b908b, map: tileTex, roughness: 0.92, side: THREE.DoubleSide }),
    thatch: new THREE.MeshStandardMaterial({ color: 0xb09a64, map: thatchTex, roughness: 1, side: THREE.DoubleSide }),
    lattice: new THREE.MeshStandardMaterial({ map: latticeTex, roughness: 0.8, side: THREE.DoubleSide }),
    paper: new THREE.MeshStandardMaterial({ color: 0xd7c49a, roughness: 0.9, emissive: 0x2a1b08, emissiveIntensity: 0.2 }),
    red: new THREE.MeshStandardMaterial({ color: 0x8e3428, roughness: 0.85 }),
    bronze: new THREE.MeshStandardMaterial({ color: 0x806a3f, roughness: 0.55, metalness: 0.45 }),
    earth: new THREE.MeshStandardMaterial({ color: 0x8b7c5d, roughness: 1 }),
    linen: new THREE.MeshStandardMaterial({ color: 0xb9ae96, roughness: 1, side: THREE.DoubleSide }),
  };
}

function addBox(group, mat, w, h, d, x, y, z, cast = true) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = cast;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function addCylinder(group, mat, rt, rb, h, x, y, z, seg = 7, cast = true) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = cast;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

/* ================================================================== */
/* roof                                                               */
/* ================================================================== */
function makeRoofGeometry(w, d, rise, overhang = 0.75) {
  const rw = w / 2 + overhang;
  const rd = d / 2 + overhang;
  const rx = w * 0.27;
  const A = [-rw, 0.16, rd];
  const B = [rw, 0.16, rd];
  const C = [rw, 0.16, -rd];
  const D = [-rw, 0.16, -rd];
  const R1 = [-rx, rise, 0];
  const R2 = [rx, rise, 0];
  const verts = [];
  const uvs = [];
  const push = (p, u, v) => { verts.push(...p); uvs.push(u, v); };
  // front slope
  push(A, 0, 0); push(B, 1, 0); push(R2, 1, 1);
  push(A, 0, 0); push(R2, 1, 1); push(R1, 0, 1);
  // back slope
  push(C, 0, 0); push(D, 1, 0); push(R1, 1, 1);
  push(C, 0, 0); push(R1, 1, 1); push(R2, 0, 1);
  // left hip
  push(D, 0, 0); push(A, 1, 0); push(R1, 1, 1);
  // right hip
  push(B, 0, 0); push(C, 1, 0); push(R2, 1, 1);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.computeVertexNormals();
  return geo;
}

function addRoof(group, w, d, rise, y, mats, kind = "tile", overhang = 0.8) {
  const mat = kind === "thatch" ? mats.thatch : mats.tile;
  const roof = new THREE.Mesh(makeRoofGeometry(w, d, rise, overhang), mat);
  roof.position.y = y;
  roof.castShadow = true;
  roof.receiveShadow = true;
  group.add(roof);
  // ridge beam
  const ridge = addCylinder(group, mats.darkWood, 0.08, 0.1, w * 0.56, 0, y + rise, 0, 5);
  ridge.rotation.z = Math.PI / 2;
  // eave shadow boards
  const boardF = addBox(group, mats.darkWood, w + overhang * 2, 0.1, 0.12, 0, y + 0.12, d / 2 + overhang);
  const boardB = addBox(group, mats.darkWood, w + overhang * 2, 0.1, 0.12, 0, y + 0.12, -d / 2 - overhang);
  boardF.castShadow = false; boardB.castShadow = false;
  return roof;
}

/* ================================================================== */
/* house compound                                                     */
/* ================================================================== */
function createHouse(opts, mats) {
  const { x, z, rot = 0, scale = 1, kind = "tile", side = false } = opts;
  const group = new THREE.Group();
  const baseY = groundHeight(x, z);
  group.position.set(x, baseY, z);
  group.rotation.y = rot;
  group.scale.setScalar(scale);

  const W = 6.2, D = 4.2, wallH = 2.45;
  const courtyardW = 10.5, courtyardD = 9;

  // stone foundation and steps
  addBox(group, mats.stone, W + 1.0, 0.46, D + 1.0, 0, 0.18, -0.6);
  addBox(group, mats.stoneLight, 2.0, 0.22, 0.9, 0, 0.28, 2.3);

  // main hall body
  addBox(group, mats.plaster, W, wallH, D, 0, 0.42 + wallH / 2, -0.6);
  // timber frame: corner columns and horizontal beams
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      addCylinder(group, mats.wood, 0.13, 0.16, wallH + 0.25, sx * (W / 2 - 0.08), 0.42 + (wallH + 0.25) / 2, -0.6 + sz * (D / 2 - 0.08), 7);
    }
  }
  addBox(group, mats.wood, W + 0.3, 0.22, 0.2, 0, 0.42 + wallH, 1.45);
  addBox(group, mats.wood, W + 0.3, 0.16, 0.16, 0, 0.42 + wallH - 0.55, 1.45);

  // front porch
  addBox(group, mats.woodLight, W + 0.5, 0.14, 1.0, 0, 0.45, 2.0);
  for (const sx of [-1, 1]) {
    addCylinder(group, mats.wood, 0.11, 0.13, 2.2, sx * (W / 2 - 0.25), 1.55, 2.35, 6);
  }

  // door and lattice windows
  const door = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.95), mats.darkWood);
  door.position.set(0, 1.42, 1.52);
  group.add(door);
  const doorFrame = addBox(group, mats.wood, 1.55, 2.1, 0.08, 0, 1.46, 1.48, false);
  doorFrame.material = mats.wood;
  for (const sx of [-1, 1]) {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(1.35, 1.1), mats.lattice);
    win.position.set(sx * 2.0, 1.65, 1.53);
    group.add(win);
    addBox(group, mats.wood, 1.52, 0.1, 0.1, sx * 2.0, 2.24, 1.5, false);
    addBox(group, mats.wood, 1.52, 0.1, 0.1, sx * 2.0, 1.06, 1.5, false);
  }

  // roof
  addRoof(group, W, D, 1.75, 2.75, mats, kind, 0.85);

  // side wing / kitchen
  if (side) {
    const kx = -W / 2 - 1.7;
    const kitchen = new THREE.Group();
    kitchen.position.x = kx;
    group.add(kitchen);
    addBox(kitchen, mats.plasterWarm, 3.0, 1.9, 3.4, 0, 0.42 + 0.95, -1.0);
    addRoof(kitchen, 3.2, 3.6, 0.9, 2.3, mats, "thatch", 0.55);
    const chimney = addBox(kitchen, mats.stone, 0.42, 1.7, 0.42, -1.0, 2.65, -2.1);
    chimney.castShadow = true;
  }

  // low compound walls with a gate
  const wallH2 = 1.15, t = 0.26;
  const frontZ = courtyardD / 2;
  const backZ = -courtyardD / 2;
  const sideX = courtyardW / 2;
  // left / right
  addBox(group, mats.earth, t, wallH2, courtyardD, -sideX, wallH2 / 2, 0);
  addBox(group, mats.earth, t, wallH2, courtyardD, sideX, wallH2 / 2, 0);
  // back
  addBox(group, mats.earth, courtyardW, wallH2, t, 0, wallH2 / 2, backZ);
  // front split around gate
  const gw = 2.4;
  addBox(group, mats.earth, (courtyardW - gw) / 2, wallH2, t, -(gw / 2 + (courtyardW - gw) / 4), wallH2 / 2, frontZ);
  addBox(group, mats.earth, (courtyardW - gw) / 2, wallH2, t, (gw / 2 + (courtyardW - gw) / 4), wallH2 / 2, frontZ);
  // gate posts and little roof
  for (const sx of [-1, 1]) {
    addCylinder(group, mats.wood, 0.13, 0.15, 2.0, sx * (gw / 2), 1.0, frontZ, 6);
  }
  addRoof(group, gw + 0.7, 1.1, 0.55, 2.0, mats, "thatch", 0.3).position.z = frontZ;
  // gate doors
  const gate = new THREE.Mesh(new THREE.PlaneGeometry(gw - 0.2, 1.5), mats.darkWood);
  gate.position.set(0, 0.85, frontZ + 0.02);
  group.add(gate);

  // courtyard path and vegetable patch
  addBox(group, mats.stoneLight, 1.1, 0.06, 3.4, 0, 0.04, 2.8, false);
  for (let i = 0; i < 4; i++) {
    addBox(group, mats.earth, 1.9, 0.08, 0.65, 3.2, 0.08, 1.2 + i * 0.9, false);
    addBox(group, new THREE.MeshStandardMaterial({ color: 0x637a45, roughness: 1 }), 1.7, 0.16, 0.42, 3.2, 0.16, 1.2 + i * 0.9, false);
  }

  // jars by the door
  for (let i = 0; i < 2; i++) {
    const jar = addCylinder(group, mats.earth, 0.22, 0.28, 0.5, -2.7 + i * 0.55, 0.67, 2.3, 9);
    jar.scale.y = 1.1;
  }

  // lantern at the gate
  const lantern = new THREE.Mesh(
    new THREE.SphereGeometry(0.17, 8, 6),
    new THREE.MeshStandardMaterial({ color: 0xd56c40, emissive: 0xb74c24, emissiveIntensity: 1.4, roughness: 0.7 })
  );
  lantern.position.set(0, 1.75, frontZ + 0.35);
  group.add(lantern);
  const lanternLight = new THREE.PointLight(0xffa063, 2.2, 6, 2);
  lanternLight.position.copy(lantern.position).add(new THREE.Vector3(0, 0, 0.2));
  group.add(lanternLight);

  group.updateMatrixWorld(true);
  return {
    group,
    colliders: [{ x, z, radius: 6.6 * scale }],
    chimneyLocal: side ? [-W / 2 - 2.7, 3.4, -3.1] : null,
    lanternWorld: lantern.getWorldPosition(new THREE.Vector3()),
    position: new THREE.Vector3(x, baseY, z),
  };
}

/* ================================================================== */
/* well                                                               */
/* ================================================================== */
function createWell(x, z, mats) {
  const group = new THREE.Group();
  const y = groundHeight(x, z);
  group.position.set(x, y, z);
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.15, 0.95, 16, 1, true), mats.stone);
  ring.position.y = 0.48;
  ring.castShadow = true; ring.receiveShadow = true;
  group.add(ring);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.07, 0.12, 6, 16), mats.stoneLight);
  rim.rotation.x = Math.PI / 2; rim.position.y = 0.96; rim.castShadow = true;
  group.add(rim);
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(0.9, 24),
    new THREE.MeshStandardMaterial({ color: 0x263d39, roughness: 0.18, metalness: 0.25 })
  );
  water.rotation.x = -Math.PI / 2; water.position.y = 0.55;
  group.add(water);
  for (const sx of [-1, 1]) {
    addCylinder(group, mats.wood, 0.09, 0.11, 2.1, sx * 1.05, 1.7, 0, 6);
  }
  addRoof(group, 2.6, 1.7, 0.75, 2.65, mats, "thatch", 0.25);
  addCylinder(group, mats.woodLight, 0.06, 0.06, 2.0, 0, 2.25, 0, 6).rotation.z = Math.PI / 2;
  // bucket
  const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.17, 0.28, 8, 1, true), mats.woodLight);
  bucket.position.set(0, 1.2, 0);
  bucket.castShadow = true;
  group.add(bucket);
  const rope = addCylinder(group, mats.woodLight, 0.015, 0.015, 0.75, 0, 1.62, 0, 4, false);
  sceneSafeAdd(group, x, z);
  return { group, position: new THREE.Vector3(x, y, z), collider: { x, z, radius: 1.6 } };
}

function sceneSafeAdd(group, x, z) {
  group.userData.worldPosition = new THREE.Vector3(x, groundHeight(x, z), z);
}

/* ================================================================== */
/* pavilion + banquet                                                 */
/* ================================================================== */
function createBanquet(mats) {
  const x = -15, z = -101;
  const group = new THREE.Group();
  const y = groundHeight(x, z);
  group.position.set(x, y, z);
  group.rotation.y = 0.18;

  // open pavilion
  addBox(group, mats.stone, 7.4, 0.22, 5.8, 0, 0.08, 0);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      addCylinder(group, mats.wood, 0.12, 0.16, 2.7, sx * 3.1, 1.45, sz * 2.2, 7);
    }
  }
  addRoof(group, 7.4, 5.8, 1.25, 2.85, mats, "thatch", 0.85);
  // low tables
  for (let t = 0; t < 3; t++) {
    const tx = (t - 1) * 2.0;
    const tz = 0.25;
    addBox(group, mats.woodLight, 2.0, 0.1, 0.85, tx, 0.58, tz);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      addCylinder(group, mats.wood, 0.045, 0.055, 0.5, tx + sx * 0.82, 0.3, tz + sz * 0.3, 4);
    }
    // mats
    for (const sz of [-1, 1]) {
      const mat = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.9), new THREE.MeshStandardMaterial({ color: 0xa8956f, roughness: 1, side: THREE.DoubleSide }));
      mat.rotation.x = -Math.PI / 2;
      mat.position.set(tx, 0.215, tz + sz * 1.0);
      mat.receiveShadow = true;
      group.add(mat);
    }
    // bowls, cups, platters
    for (let b = 0; b < 5; b++) {
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.07, 0.08, 9), mats.paper);
      bowl.position.set(tx - 0.72 + b * 0.36, 0.67, tz + (b % 2 === 0 ? 0.12 : -0.12));
      bowl.castShadow = true;
      group.add(bowl);
    }
    if (t === 1) {
      const platter = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 12), mats.paper);
      platter.position.set(tx, 0.68, tz);
      group.add(platter);
      const chicken = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), new THREE.MeshStandardMaterial({ color: 0xa86b37, roughness: 0.8 }));
      chicken.scale.set(1, 0.72, 1.35);
      chicken.position.set(tx, 0.76, tz);
      group.add(chicken);
    }
  }
  // wine jars
  const jarMat = new THREE.MeshStandardMaterial({ color: 0x6b5137, roughness: 0.85 });
  const jarPositions = [[-3.9, 0.42, 1.8], [-4.3, 0.42, 1.15], [3.8, 0.42, 1.6], [4.1, 0.42, 0.95], [3.2, 0.42, 1.95]];
  for (const [jx, jy, jz] of jarPositions) {
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), jarMat);
    body.scale.set(1, 1.15, 1);
    body.position.set(jx, 0.42, jz);
    body.castShadow = true;
    group.add(body);
    addCylinder(group, jarMat, 0.1, 0.14, 0.18, jx, 0.72, jz, 8);
    const seal = new THREE.Mesh(new THREE.CircleGeometry(0.13, 8), mats.red);
    seal.rotation.x = -Math.PI / 2; seal.position.set(jx, 0.82, jz);
    group.add(seal);
  }
  // lantern posts
  for (const sx of [-1, 1]) {
    addCylinder(group, mats.wood, 0.05, 0.07, 2.0, sx * 3.7, 1.0, 2.4, 5);
    const lantern = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 9, 7),
      new THREE.MeshStandardMaterial({ color: 0xd46b3f, emissive: 0xb54b26, emissiveIntensity: 1.7, roughness: 0.65 })
    );
    lantern.position.set(sx * 3.7, 1.95, 2.4);
    group.add(lantern);
  }
  const light = new THREE.PointLight(0xff9d5c, 4.5, 12, 2);
  light.position.set(0, 2.2, 1.0);
  group.add(light);

  return { group, position: new THREE.Vector3(x, y, z), collider: { x, z, radius: 4.4 } };
}

/* ================================================================== */
/* fire pit                                                           */
/* ================================================================== */
function createFirePit(x, z, mats) {
  const group = new THREE.Group();
  const y = groundHeight(x, z);
  group.position.set(x, y, z);
  const stoneMat = mats.stone;
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22 + Math.random() * 0.1, 0), stoneMat);
    rock.position.set(Math.cos(a) * 0.8, 0.15, Math.sin(a) * 0.8);
    rock.scale.y = 0.65;
    rock.castShadow = true;
    group.add(rock);
  }
  for (let i = 0; i < 4; i++) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 1.1, 5), mats.darkWood);
    log.rotation.set(Math.PI / 2, (i / 4) * Math.PI, 0.4);
    log.position.set(0, 0.22 + i * 0.06, 0);
    group.add(log);
  }
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xff9f4a, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const flames = [];
  for (let i = 0; i < 4; i++) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.22 - i * 0.035, 0.8 + i * 0.18, 6), flameMat);
    f.position.set((Math.random() - 0.5) * 0.2, 0.5 + i * 0.12, (Math.random() - 0.5) * 0.2);
    group.add(f);
    flames.push(f);
  }
  const light = new THREE.PointLight(0xff8a3f, 6, 14, 2);
  light.position.set(0, 1.2, 0);
  group.add(light);
  return {
    group,
    position: new THREE.Vector3(x, y, z),
    collider: { x, z, radius: 1.2 },
    update(time) {
      flames.forEach((f, i) => {
        const s = 1 + Math.sin(time * 7 + i * 1.7) * 0.18;
        f.scale.set(s, 1 + Math.sin(time * 9 + i) * 0.23, s);
        f.position.y = 0.5 + i * 0.12 + Math.sin(time * 6 + i) * 0.05;
      });
      light.intensity = 5.5 + Math.sin(time * 8.3) * 1.1 + Math.sin(time * 13.7) * 0.6;
    },
  };
}

/* ================================================================== */
/* boat                                                               */
/* ================================================================== */
function createBoat(x, z, mats) {
  const group = new THREE.Group();
  const y = 0.2;
  group.position.set(x, y, z);
  group.rotation.y = -0.35;
  const hullMat = new THREE.MeshStandardMaterial({ color: 0x59432e, roughness: 0.9, flatShading: true });
  const length = 4.2, width = 1.15, height = 0.58;
  const positions = [];
  const indices = [];
  const sections = 12;
  for (let i = 0; i <= sections; i++) {
    const t = i / sections;
    const zz = (t - 0.5) * length;
    const taper = Math.pow(Math.sin(t * Math.PI), 0.52);
    const w = width * taper;
    const h = height * (0.65 + 0.35 * taper);
    // left rim, left bottom, right bottom, right rim
    positions.push(-w, h, zz, -w * 0.72, 0, zz, w * 0.72, 0, zz, w, h, zz);
    if (i < sections) {
      const k = i * 4;
      indices.push(k, k + 4, k + 1, k + 4, k + 5, k + 1);
      indices.push(k + 1, k + 5, k + 2, k + 5, k + 6, k + 2);
      indices.push(k + 2, k + 6, k + 3, k + 6, k + 7, k + 3);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const hull = new THREE.Mesh(geo, hullMat);
  hull.material.side = THREE.DoubleSide;
  hull.castShadow = true;
  group.add(hull);
  // inner floor
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(width * 1.2, length * 0.72), mats.woodLight);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.06;
  group.add(floor);
  // seats
  for (const zz of [-0.9, 0.95]) {
    addBox(group, mats.woodLight, width * 1.5, 0.08, 0.3, 0, 0.35, zz);
  }
  // pole and net bundle
  const pole = addCylinder(group, mats.woodLight, 0.025, 0.03, 4.2, 0.85, 1.35, 0.2, 4, false);
  pole.rotation.z = 1.15;
  pole.rotation.x = 0.15;
  const bundle = new THREE.Mesh(new THREE.SphereGeometry(0.28, 7, 5), new THREE.MeshStandardMaterial({ color: 0x8b8057, roughness: 1 }));
  bundle.scale.set(1.5, 0.5, 1);
  bundle.position.set(-0.4, 0.35, -0.4);
  bundle.castShadow = true;
  group.add(bundle);
  return { group, position: new THREE.Vector3(x, y, z) };
}

/* ================================================================== */
/* fields and fences                                                  */
/* ================================================================== */
function createField(def, mats) {
  const { x, z, w, d, rot = 0, tone = "green" } = def;
  const group = new THREE.Group();
  const segX = 10, segZ = 8;
  const positions = [], uvs = [], indices = [];
  const cos = Math.cos(rot), sin = Math.sin(rot);
  for (let iz = 0; iz <= segZ; iz++) {
    for (let ix = 0; ix <= segX; ix++) {
      const lx = (ix / segX - 0.5) * w;
      const lz = (iz / segZ - 0.5) * d;
      const wx = x + lx * cos + lz * sin;
      const wz = z - lx * sin + lz * cos;
      positions.push(wx, groundHeight(wx, wz) + 0.2, wz);
      uvs.push(ix / segX, iz / segZ);
    }
  }
  for (let iz = 0; iz < segZ; iz++) {
    for (let ix = 0; ix < segX; ix++) {
      const a = iz * (segX + 1) + ix;
      indices.push(a, a + segX + 1, a + 1, a + segX + 1, a + segX + 2, a + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  // texture
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d");
  const isGold = tone === "gold";
  const isWater = tone === "water";
  ctx.fillStyle = isGold ? "#a99a52" : isWater ? "#77956f" : "#648b4d";
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) {
    const gx = Math.random() * 256, gy = Math.random() * 256;
    ctx.fillStyle = isGold
      ? `rgba(${184 + Math.random() * 40},${166 + Math.random() * 34},${80 + Math.random() * 30},.5)`
      : isWater
        ? `rgba(${92 + Math.random() * 50},${120 + Math.random() * 40},${90 + Math.random() * 30},.35)`
        : `rgba(${52 + Math.random() * 40},${90 + Math.random() * 50},${44 + Math.random() * 30},.5)`;
    ctx.fillRect(gx, gy, 1, 2 + Math.random() * 5);
  }
  for (let row = 0; row < 256; row += 22) {
    ctx.fillStyle = "rgba(55,57,31,.2)";
    ctx.fillRect(0, row, 256, 2);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(Math.max(1, w / 3), Math.max(1, d / 3));
  if (isWater) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x90a98d, map: tex, roughness: 0.45, metalness: 0.1 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    group.add(mesh);
    const waterGeo = new THREE.PlaneGeometry(w * 0.94, d * 0.9);
    waterGeo.rotateX(-Math.PI / 2);
    const water = new THREE.Mesh(waterGeo, new THREE.MeshStandardMaterial({ color: 0x718a75, roughness: 0.22, metalness: 0.12, transparent: true, opacity: 0.68 }));
    water.position.set(x, groundHeight(x, z) + 0.14, z);
    water.rotation.y = rot;
    group.add(water);
  } else {
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 1, color: 0xffffff });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  // earthen ridges around the plot
  const borderMat = mats.earth;
  const makeBorder = (len, cx, cz, ang) => {
    const bx = x + cx * cos + cz * sin;
    const bz = z - cx * sin + cz * cos;
    const b = addBox(group, borderMat, len, 0.18, 0.34, bx, groundHeight(bx, bz) + 0.25, bz, false);
    b.rotation.y = rot + ang;
    b.receiveShadow = true;
  };
  makeBorder(w, 0, d / 2, 0);
  makeBorder(w, 0, -d / 2, 0);
  makeBorder(d, w / 2, 0, Math.PI / 2);
  makeBorder(d, -w / 2, 0, Math.PI / 2);

  return { group, def };
}

function createFields(scene, mats) {
  const defs = [
    { x: -52, z: -115, w: 32, d: 16, rot: 0.03, tone: "green" },
    { x: -52, z: -139, w: 32, d: 16, rot: -0.02, tone: "gold" },
    { x: -52, z: -164, w: 32, d: 18, rot: 0.02, tone: "green" },
    { x: 24, z: -156, w: 26, d: 14, rot: 0.02, tone: "gold" },
    { x: 63, z: -158, w: 32, d: 18, rot: -0.04, tone: "green" },
    { x: 66, z: -30, w: 30, d: 14, rot: 0.08, tone: "green" },
    { x: -58, z: -38, w: 28, d: 14, rot: -0.06, tone: "water" },
    { x: 24, z: -132, w: 18, d: 12, rot: 0.04, tone: "water" },
    { x: 24, z: -72, w: 14, d: 18, rot: 0.03, tone: "green" },
    { x: -24, z: -72, w: 14, d: 18, rot: -0.03, tone: "gold" },
    { x: -16, z: -93, w: 6, d: 5, rot: 0.04, tone: "green" },
    { x: 15, z: -99, w: 5, d: 6, rot: -0.03, tone: "green" },
    { x: 17, z: -82, w: 8, d: 6, rot: 0.05, tone: "green" },
  ];
  const group = new THREE.Group();
  for (const def of defs) {
    if (distanceToRoute(def.x, def.z) < 4) continue;
    const f = createField(def, mats);
    group.add(f.group);
  }
  scene.add(group);

  // 3D rice / wheat tufts along plots
  const rand = mulberry32(2211);
  const tuftGeo = new THREE.ConeGeometry(0.13, 0.62, 4);
  tuftGeo.translate(0, 0.31, 0);
  const greenMat = new THREE.MeshStandardMaterial({ color: 0x8fa85b, roughness: 1, flatShading: true });
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xc9b565, roughness: 1, flatShading: true });
  const tuftsGreen = [];
  const tuftsGold = [];
  for (const def of defs) {
    if (def.tone === "water") continue;
    const count = def.tone === "gold" ? 240 : 300;
    for (let i = 0; i < count; i++) {
      const lx = (rand() - 0.5) * def.w * 0.92;
      const lz = (rand() - 0.5) * def.d * 0.86;
      const cos = Math.cos(def.rot), sin = Math.sin(def.rot);
      const wx = def.x + lx * cos + lz * sin;
      const wz = def.z - lx * sin + lz * cos;
      const item = { x: wx, z: wz, s: 0.65 + rand() * 0.8, r: rand() * 6.28 };
      (def.tone === "gold" ? tuftsGold : tuftsGreen).push(item);
    }
  }
  const dummy = new THREE.Object3D();
  for (const [list, mat] of [[tuftsGreen, greenMat], [tuftsGold, goldMat]]) {
    const mesh = new THREE.InstancedMesh(tuftGeo, mat, list.length);
    list.forEach((p, i) => {
      dummy.position.set(p.x, groundHeight(p.x, p.z) + 0.16, p.z);
      dummy.rotation.set(0, p.r, (rand() - 0.5) * 0.1);
      dummy.scale.set(0.8 + rand() * 0.5, p.s, 0.8 + rand() * 0.5);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  return group;
}

function createFences(scene, mats) {
  const group = new THREE.Group();
  const fences = [
    [[-50, -96], [-18, -96]],
    [[-50, -54], [-20, -54]],
    [[22, -98], [22, -140]],
    [[55, -95], [55, -140]],
    [[-80, -100], [-80, -150]],
  ];
  const postGeo = new THREE.CylinderGeometry(0.055, 0.07, 0.95, 5);
  const postMat = mats.woodLight;
  const railGeo = new THREE.BoxGeometry(1, 0.07, 0.07);
  for (const [a, b] of fences) {
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const len = Math.hypot(dx, dz);
    const count = Math.max(2, Math.round(len / 2.2));
    for (let i = 0; i <= count; i++) {
      const t = i / count;
      const x = a[0] + dx * t;
      const z = a[1] + dz * t;
      const y = groundHeight(x, z);
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(x, y + 0.45, z);
      post.castShadow = true;
      group.add(post);
    }
    for (const h of [0.45, 0.75]) {
      const rail = new THREE.Mesh(railGeo, postMat);
      rail.position.set((a[0] + b[0]) / 2, (groundHeight(a[0], a[1]) + groundHeight(b[0], b[1])) / 2 + h, (a[1] + b[1]) / 2);
      rail.scale.x = len;
      rail.rotation.y = Math.atan2(-dz, dx);
      rail.castShadow = true;
      group.add(rail);
    }
  }
  scene.add(group);
  return group;
}

/* ================================================================== */
/* granary                                                            */
/* ================================================================== */
function createGranary(x, z, mats) {
  const group = new THREE.Group();
  const y = groundHeight(x, z);
  group.position.set(x, y, z);
  group.rotation.y = -0.25;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    addCylinder(group, mats.wood, 0.12, 0.16, 1.3, sx * 1.3, 0.65, sz * 1.0, 6);
  }
  addBox(group, mats.woodLight, 3.1, 0.2, 2.5, 0, 1.32, 0);
  addBox(group, mats.plasterWarm, 2.8, 1.9, 2.2, 0, 2.35, 0);
  addRoof(group, 3.3, 2.7, 0.85, 3.35, mats, "thatch", 0.45);
  // ladder
  const ladder = addCylinder(group, mats.woodLight, 0.04, 0.05, 2.0, 1.9, 1.2, 1.1, 4);
  ladder.rotation.z = -0.45;
  const ladder2 = addCylinder(group, mats.woodLight, 0.04, 0.05, 2.0, 2.1, 1.2, 1.1, 4);
  ladder2.rotation.z = -0.45;
  return { group, collider: { x, z, radius: 2.4 } };
}

/* ================================================================== */
/* smoke                                                              */
/* ================================================================== */
function createSmoke(scene) {
  const map = makeCloudTexture();
  const rand = mulberry32(933);
  const plumes = [];
  const group = new THREE.Group();
  for (const [x, z] of [[-27.5, -50], [43, -80], [-33, -130], [57, -102]]) {
    for (let i = 0; i < 12; i++) {
      const mat = new THREE.SpriteMaterial({
        map, color: 0xd5d2c6, transparent: true, opacity: 0.0,
        depthWrite: false, fog: true,
      });
      const s = new THREE.Sprite(mat);
      s.position.set(x, groundHeight(x, z) + 4, z);
      s.scale.setScalar(1.3);
      group.add(s);
      plumes.push({
        sprite: s,
        baseX: x, baseZ: z,
        y0: groundHeight(x, z) + 4.1,
        offset: i / 12,
        drift: 0.2 + rand() * 0.4,
      });
    }
  }
  scene.add(group);
  return {
    group,
    update(time) {
      for (const p of plumes) {
        const cycle = (time * 0.14 + p.offset) % 1;
        p.sprite.position.set(
          p.baseX + cycle * 2.6 + Math.sin(time * 0.4 + p.offset * 9) * 0.7,
          p.y0 + cycle * 5.5,
          p.baseZ - cycle * 1.4
        );
        const sc = 0.6 + cycle * 2.8;
        p.sprite.scale.set(sc, sc * 0.8, 1);
        p.sprite.material.opacity = Math.sin(cycle * Math.PI) * 0.18;
      }
    },
  };
}

/* ================================================================== */
/* pond lane, dock, quern, scarecrow, haystacks                       */
/* ================================================================== */
function createPondLane(scene, mats) {
  const laneCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(3, 0, -113),
    new THREE.Vector3(10, 0, -114.5),
    new THREE.Vector3(17, 0, -116),
    new THREE.Vector3(24, 0, -117.5),
    new THREE.Vector3(29, 0, -118.5),
  ], false, "catmullrom", 0.2);
  const tex = makeNoiseCanvasTexture();
  tex.repeat.set(2, 12);
  const laneMat = new THREE.MeshStandardMaterial({
    color: 0x9b8965, map: tex, roughness: 1, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const lane = new THREE.Mesh(makeRibbon(laneCurve, 1.55, 60, 0.15), laneMat);
  lane.receiveShadow = true;
  scene.add(lane);

  const dock = new THREE.Group();
  const y = 0.28;
  dock.position.set(29.5, y, -118.5);
  const dockMat = new THREE.MeshStandardMaterial({ color: 0x4e3b27, roughness: 0.95 });
  for (let i = 0; i < 6; i++) {
    addBox(dock, dockMat, 1.6, 0.09, 0.72, 0, 0.18, i * 0.7 - 0.4);
  }
  for (const sx of [-1, 1]) {
    for (const z of [-0.5, 3.2]) {
      addCylinder(dock, mats.wood, 0.09, 0.11, 1.25, sx * 0.7, 0.0, z, 6);
    }
    const rail = addCylinder(dock, mats.wood, 0.035, 0.04, 4.0, sx * 0.7, 0.75, 1.1, 5);
    rail.rotation.x = Math.PI / 2;
  }
  scene.add(dock);
  return lane;
}

function createQuern(x, z, mats) {
  const group = new THREE.Group();
  const y = groundHeight(x, z);
  group.position.set(x, y, z);
  const base = addBox(group, mats.stone, 2.0, 0.25, 1.7, 0, 0.13, 0);
  const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.82, 0.9, 0.28, 18), mats.stoneLight);
  lower.position.y = 0.42; lower.castShadow = true; lower.receiveShadow = true;
  group.add(lower);
  const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.8, 0.3, 18), mats.stone);
  upper.position.y = 0.7; upper.castShadow = true;
  group.add(upper);
  const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.32, 8), mats.darkWood);
  hole.position.y = 0.86; group.add(hole);
  const handle = addCylinder(group, mats.wood, 0.045, 0.06, 1.15, 0.45, 1.05, 0, 6);
  handle.rotation.z = Math.PI / 2 - 0.55;
  return { group, collider: { x, z, radius: 1.55 } };
}

function createScarecrow(x, z, mats) {
  const group = new THREE.Group();
  const y = groundHeight(x, z);
  group.position.set(x, y, z);
  addCylinder(group, mats.wood, 0.05, 0.07, 2.1, 0, 1.05, 0, 5);
  const arms = addCylinder(group, mats.wood, 0.035, 0.045, 1.5, 0, 1.55, 0, 5);
  arms.rotation.z = Math.PI / 2;
  const robe = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.0, 7, 1, true), new THREE.MeshStandardMaterial({ color: 0x6a6250, roughness: 1, side: THREE.DoubleSide }));
  robe.position.y = 1.0; robe.castShadow = true; group.add(robe);
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.22, 12, 1, true), new THREE.MeshStandardMaterial({ color: 0xb49b65, roughness: 1, side: THREE.DoubleSide }));
  hat.position.y = 2.12; hat.rotation.x = 0.06; group.add(hat);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 7, 5), new THREE.MeshStandardMaterial({ color: 0xb49b65, roughness: 1 }));
  head.position.y = 1.94; group.add(head);
  // hanging straw tufts at the wrists
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.35, 3), new THREE.MeshStandardMaterial({ color: 0xb6a263, roughness: 1 }));
      tuft.position.set(sx * 0.7, 1.35 - i * 0.06, (i - 1) * 0.06);
      tuft.rotation.z = sx * 0.25;
      group.add(tuft);
    }
  }
  return group;
}

function createHaystacks(scene) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xb7a269, roughness: 1, flatShading: true });
  const group = new THREE.Group();
  const spots = [[-63, -101], [-61, -133], [55, -146], [13, -171], [-18, -170]];
  for (const [x, z] of spots) {
    const y = groundHeight(x, z);
    const stack = new THREE.Mesh(new THREE.ConeGeometry(1.4, 2.0, 9), mat);
    stack.position.set(x, y + 1.0, z);
    stack.scale.set(1, 1, 0.85);
    stack.castShadow = true;
    stack.receiveShadow = true;
    group.add(stack);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 2.6, 5), new THREE.MeshStandardMaterial({ color: 0x5a452d }));
    pole.position.set(x, y + 1.25, z);
    group.add(pole);
  }
  scene.add(group);
  return group;
}

function createDryingRack(x, z, mats) {
  const group = new THREE.Group();
  const y = groundHeight(x, z);
  group.position.set(x, y, z);
  for (const sx of [-1, 1]) {
    addCylinder(group, mats.wood, 0.06, 0.08, 1.9, sx * 1.4, 0.95, 0, 5);
  }
  const bar = addCylinder(group, mats.wood, 0.04, 0.04, 2.9, 0, 1.72, 0, 5);
  bar.rotation.z = Math.PI / 2;
  for (let i = 0; i < 3; i++) {
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.9), mats.linen ? mats.linen.clone() : new THREE.MeshStandardMaterial({
      color: [0x8e9a89, 0xb0a17f, 0x7f8d95][i], roughness: 1, side: THREE.DoubleSide,
    }));
    if (mats.linen) cloth.material.color.setHex([0x8e9a89, 0xb0a17f, 0x7f8d95][i]);
    cloth.position.set(-0.9 + i * 0.9, 1.2, 0.02);
    group.add(cloth);
  }
  return group;
}

function createStreet(scene, mats) {
  const stones = [];
  const N = 900;
  let started = false;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const p = routeCurve.getPoint(t);
    if (p.z > -40 || p.z < -150) continue;
    started = true;
    if (i % 7 !== 0) continue;
    const tan = routeCurve.getTangent(t);
    const yaw = Math.atan2(tan.x, tan.z);
    const nx = Math.cos(yaw), nz = -Math.sin(yaw);
    for (let k = -1; k <= 1; k += 2) {
      if (Math.random() > 0.72) continue;
      const off = k * 0.62 + (Math.random() - 0.5) * 0.28;
      const x = p.x + nx * off;
      const z = p.z + nz * off;
      stones.push({
        x, z, y: groundHeight(x, z) + 0.16,
        rot: yaw + (Math.random() - 0.5) * 0.2,
        sx: 0.36 + Math.random() * 0.22,
        sz: 0.32 + Math.random() * 0.18,
        shade: 0.82 + Math.random() * 0.28,
      });
    }
  }
  const geo = new THREE.CylinderGeometry(1, 1, 0.09, 7);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true });
  const mesh = new THREE.InstancedMesh(geo, mat, stones.length);
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  stones.forEach((p, i) => {
    dummy.position.set(p.x, p.y, p.z);
    dummy.rotation.set(0, p.rot, 0);
    dummy.scale.set(p.sx, 1, p.sz);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    color.setHex(0x8e8878).multiplyScalar(p.shade);
    mesh.setColorAt(i, color);
  });
  mesh.instanceColor.needsUpdate = true;
  scene.add(mesh);

  // a few cross lanes toward the courtyards
  const laneMat = new THREE.MeshStandardMaterial({ color: 0x8c7d5e, roughness: 1, side: THREE.DoubleSide });
  const laneSpecs = [
    [-14, -72, -23, -74],
    [13, -87, 23, -88],
    [-13, -112, -24, -113],
    [11, -128, 22, -129],
  ];
  for (const [x1, z1, x2, z2] of laneSpecs) {
    const len = Math.hypot(x2 - x1, z2 - z1);
    const lane = addBox(scene, laneMat, len, 0.06, 1.15, (x1 + x2) / 2, groundHeight((x1 + x2) / 2, (z1 + z2) / 2) + 0.19, (z1 + z2) / 2, false);
    lane.rotation.y = Math.atan2(-(z2 - z1), x2 - x1);
  }
  return mesh;
}

function houseMaterial(material, mats) {
  const map = {
    Plaster: mats.plaster, PlasterWarm: mats.plasterWarm,
    Wood: mats.wood, WoodLight: mats.woodLight, DarkWood: mats.darkWood,
    Stone: mats.stone, StoneLight: mats.stoneLight, Tile: mats.tile,
    Thatch: mats.thatch, Earth: mats.earth, Lattice: mats.lattice,
    Paper: mats.paper, Red: mats.red, Plants: mats.thatch,
  };
  if (Array.isArray(material)) return material.map((m) => map[(m.name || "").replace(/\.\d+$/, "")] || mats.plaster);
  return map[(material.name || "").replace(/\.\d+$/, "")] || mats.plaster;
}

function createHouseInstances(village, defs, meshes, mats) {
  if (!meshes || !meshes.length) return false;
  const dummy = new THREE.Object3D();
  const add = (meshGeo, material, group) => {
    const inst = new THREE.InstancedMesh(meshGeo, houseMaterial(material, mats), group.length);
    inst.castShadow = true;
    inst.receiveShadow = true;
    inst.frustumCulled = false;
    group.forEach((def, i) => {
      dummy.position.set(def.x, groundHeight(def.x, def.z), def.z);
      dummy.rotation.set(0, def.rot, 0);
      dummy.scale.setScalar(def.scale);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    });
    village.add(inst);
  };
  for (const mesh of meshes) add(mesh.geometry, mesh.material, defs);
  // A few warm gate lights, not one per house (keeps the light count sane)
  defs.forEach((def, i) => {
    if (i % 2 !== 0) return;
    const local = new THREE.Vector3(0, 1.9, 4.65).applyAxisAngle(new THREE.Vector3(0, 1, 0), def.rot);
    const light = new THREE.PointLight(0xff9a57, 2.2, 7, 2);
    light.position.set(def.x + local.x, groundHeight(def.x, def.z) + local.y, def.z + local.z);
    village.add(light);
  });
  return true;
}

/* ================================================================== */
/* main village build                                                 */
/* ================================================================== */
export function createVillage(scene, assets) {
  const mats = makeMaterials(assets);
  const village = new THREE.Group();
  const colliders = [];

  const houseDefs = [
    { x: -23, z: -49, rot: Math.PI / 2, scale: 1.0, kind: "tile", side: true },
    { x: -43, z: -70, rot: Math.PI / 2 + 0.08, scale: 0.92, kind: "thatch", side: true },
    { x: 26, z: -53, rot: -Math.PI / 2 - 0.05, scale: 1.0, kind: "tile", side: false },
    { x: 48, z: -77, rot: -Math.PI / 2, scale: 0.9, kind: "thatch", side: true },
    { x: -26, z: -91, rot: Math.PI / 2 - 0.04, scale: 1.08, kind: "tile", side: true },
    { x: 21, z: -108, rot: -Math.PI / 2 + 0.06, scale: 1.0, kind: "thatch", side: true },
    { x: -23, z: -136, rot: Math.PI / 2 - 0.1, scale: 1.04, kind: "tile", side: true },
    { x: 42, z: -139, rot: -Math.PI / 2 + 0.04, scale: 0.95, kind: "thatch", side: true },
    { x: 58, z: -101, rot: -Math.PI / 2, scale: 0.88, kind: "tile", side: false },
    { x: -27, z: -158, rot: Math.PI / 2 + 0.05, scale: 0.94, kind: "thatch", side: true },
  ];
  const houseGLB = assets?.models?.houses;
  if (houseGLB?.tile?.length || houseGLB?.thatch?.length) {
    const tileDefs = houseDefs.filter((d) => d.kind !== "thatch");
    const thatchDefs = houseDefs.filter((d) => d.kind === "thatch");
    if (tileDefs.length) createHouseInstances(village, tileDefs, houseGLB.tile, mats);
    if (thatchDefs.length) createHouseInstances(village, thatchDefs, houseGLB.thatch, mats);
    for (const def of houseDefs) colliders.push({ x: def.x, z: def.z, radius: 6.6 * def.scale });
  } else {
    for (const def of houseDefs) {
      const h = createHouse(def, mats);
      village.add(h.group);
      colliders.push(...h.colliders);
    }
  }

  const well = createWell(5.2, -89, mats);
  village.add(well.group);
  colliders.push(well.collider);

  const banquet = createBanquet(mats);
  banquet.collider.radius = 2.2;
  village.add(banquet.group);
  colliders.push(banquet.collider);

  const fire = createFirePit(8.5, -113, mats);
  village.add(fire.group);
  colliders.push(fire.collider);

  const granary = createGranary(33, -91, mats);
  village.add(granary.group);
  colliders.push(granary.collider);

  const boat = createBoat(0.2, 37.0, mats);
  village.add(boat.group);

  const quern = createQuern(10, -81.5, mats);
  village.add(quern.group);
  colliders.push(quern.collider);

  const dockLane = createPondLane(scene, mats);
  scene.add(createScarecrow(19, -152, mats));
  createHaystacks(scene);
  const drying = createDryingRack(-18, -56, mats);
  village.add(drying);

  createStreet(scene, mats);
  createFields(scene, mats);
  createFences(scene, mats);

  // village square paving stones
  const paving = new THREE.Group();
  const paveMat = new THREE.MeshStandardMaterial({ color: 0x8b8575, roughness: 1 });
  const rand = mulberry32(551);
  for (let i = 0; i < 42; i++) {
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * 6.0;
    const x = 1.8 + Math.cos(a) * r;
    const z = -89 + Math.sin(a) * r;
    if (distanceToRoute(x, z) < 1.1) continue;
    const stone = new THREE.Mesh(new THREE.CylinderGeometry(0.36 + rand() * 0.25, 0.4 + rand() * 0.2, 0.08, 6), paveMat);
    stone.position.set(x, groundHeight(x, z) + 0.14, z);
    stone.rotation.y = rand() * 6.28;
    stone.receiveShadow = true;
    paving.add(stone);
  }
  village.add(paving);

  // scattered props: baskets, logs, jars, drying racks
  const propGroup = new THREE.Group();
  for (let i = 0; i < 16; i++) {
    const t = 0.25 + rand() * 0.68;
    const p = routeCurvePoint(t);
    const side = rand() > 0.5 ? 1 : -1;
    const x = p.x + side * (2.8 + rand() * 2.4);
    const z = p.z + (rand() - 0.5) * 3;
    if (distanceToRoute(x, z) < 2.1) continue;
    const y = groundHeight(x, z);
    if (rand() > 0.5) {
      const jar = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), mats.earth);
      jar.scale.set(1, 1.25, 1);
      jar.position.set(x, y + 0.28, z);
      jar.castShadow = true;
      propGroup.add(jar);
    } else {
      const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.2, 0.32, 9, 1, true), mats.woodLight);
      basket.position.set(x, y + 0.18, z);
      basket.castShadow = true;
      propGroup.add(basket);
    }
  }
  // firewood stacks
  for (const [x, z] of [[-20, -52], [31, -57], [-39, -73]]) {
    for (let i = 0; i < 9; i++) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.9, 5), mats.darkWood);
      log.rotation.z = Math.PI / 2;
      log.position.set(x + (i % 3) * 0.16, groundHeight(x, z) + 0.18 + Math.floor(i / 3) * 0.15, z + (i % 2) * 0.16);
      log.castShadow = true;
      propGroup.add(log);
    }
  }
  village.add(propGroup);

  scene.add(village);

  const life = createVillagers(scene, mats);
  const animals = createAnimals(scene, mats);
  const chickens = createChickenFlock(scene);
  const smoke = createSmoke(scene);
  colliders.push(...life.colliders, ...animals.colliders);

  return {
    group: village,
    colliders,
    life,
    animals,
    chickens,
    smoke,
    fire,
    boat,
    well,
    banquet,
    update(time, dt) {
      life.update(time, dt);
      animals.update(time, dt);
      chickens.update(time, dt);
      smoke.update(time);
      fire.update(time);
    },
  };
}

import { routeCurve } from "./util.js";
function routeCurvePoint(t) {
  return routeCurve.getPoint(clamp(t, 0, 1));
}
