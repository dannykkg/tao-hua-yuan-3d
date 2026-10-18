import * as THREE from "three";
import { groundHeight, mulberry32, routeCurve, clamp, smoothstep } from "./util.js";

/* ================================================================== */
/* helpers                                                            */
/* ================================================================== */
const SKIN = 0xc79a72;
const SKIN_LIGHT = 0xd3ac85;
const HAIR = 0x241d17;

let FABRIC_SOURCE = null;
const FABRIC_CACHE = new Map();

function garmentMaterial(color) {
  const key = String(color);
  if (FABRIC_CACHE.has(key)) return FABRIC_CACHE.get(key);
  let m;
  if (FABRIC_SOURCE) {
    m = FABRIC_SOURCE.clone();
    m.map = null;
    m.color.setHex(color);
    m.roughness = 0.94;
    m.metalness = 0;
    m.side = THREE.FrontSide;
  } else {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.96, metalness: 0 });
  }
  FABRIC_CACHE.set(key, m);
  return m;
}

function skinMaterial(color) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.78, metalness: 0 });
  m.emissive = new THREE.Color(color).multiplyScalar(0.12);
  m.emissiveIntensity = 1;
  return m;
}

/* ================================================================== */
/* a mid-distance person in Han–Jin style robes                        */
/* ================================================================== */
function makePerson(opts = {}) {
  const {
    robe = 0x52626a, sash = 0x8a6b45, skin = SKIN, hair = HAIR,
    hat = false, female = false, elder = false, child = false,
    seated = false, basket = false, staff = false, hoe = false,
  } = opts;

  const group = new THREE.Group();
  const torso = new THREE.Group();
  group.add(torso);
  const scale = child ? 0.62 : elder ? 0.95 : 0.98;
  group.scale.setScalar(scale);

  const robeMat = garmentMaterial(robe);
  const robeLightMat = garmentMaterial(new THREE.Color(robe).multiplyScalar(1.16).getHex());
  const sashMat = garmentMaterial(sash);
  const skinMat = skinMaterial(skin);
  const hairMat = new THREE.MeshStandardMaterial({ color: elder ? 0xd9d4c6 : hair, roughness: 0.9 });

  // A-line robe
  const profile = [
    [0.295, -0.53], [0.30, -0.4], [0.278, -0.2], [0.248, 0.05],
    [0.225, 0.25], [0.208, 0.42], [0.188, 0.56],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const bodyGeo = new THREE.LatheGeometry(profile, 16);
  const bodyMesh = new THREE.Mesh(bodyGeo, robeMat);
  bodyMesh.position.y = 0.84;
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  torso.add(bodyMesh);

  // lower inner hem / dark under-robe
  const underGeo = new THREE.CylinderGeometry(0.30, 0.31, 0.1, 16, 1, true);
  const under = new THREE.Mesh(underGeo, garmentMaterial(0x403930));
  under.position.y = 0.34;
  torso.add(under);

  // shoulder drape
  const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.225, 12, 8), robeLightMat);
  shoulder.scale.set(1.0, 0.5, 0.75);
  shoulder.position.y = 1.31;
  shoulder.castShadow = true;
  torso.add(shoulder);

  // cross-collar, front overlap and waist sash
  const collarL = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.4, 0.045), sashMat);
  collarL.position.set(-0.06, 1.16, 0.215);
  collarL.rotation.z = 0.62;
  torso.add(collarL);
  const collarR = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.4, 0.045), sashMat);
  collarR.position.set(0.06, 1.16, 0.215);
  collarR.rotation.z = -0.62;
  torso.add(collarR);
  const overlap = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.42, 0.04), robeLightMat);
  overlap.position.set(0.02, 0.98, 0.232);
  overlap.rotation.z = -0.12;
  torso.add(overlap);

  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.284, 0.294, 0.12, 16), sashMat);
  belt.position.y = 0.82;
  torso.add(belt);
  for (const sx of [-1, 1]) {
    const sashEnd = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.42, 0.03), sashMat);
    sashEnd.position.set(sx * 0.09, 0.58, 0.282);
    sashEnd.rotation.z = sx * 0.05;
    sashEnd.castShadow = true;
    torso.add(sashEnd);
  }
  const placket = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.5, 0.018), sashMat);
  placket.position.set(0.015, 0.94, 0.278);
  placket.rotation.z = -0.04;
  torso.add(placket);
  const foldMat = garmentMaterial(new THREE.Color(robe).multiplyScalar(0.82).getHex());
  for (const a of [-0.55, 0.55, -1.05, 1.05, -1.55, 1.55]) {
    const fold = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.46, 0.012), foldMat);
    fold.position.set(Math.sin(a) * 0.267, 0.55, Math.cos(a) * 0.267);
    fold.rotation.y = a;
    torso.add(fold);
  }

  // neck and head
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.14, 8), skinMat);
  neck.position.y = 1.40;
  torso.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 12), skinMat);
  head.scale.set(0.92, 1.04, 0.94);
  head.position.y = 1.53;
  head.castShadow = true;
  torso.add(head);
  for (const sx of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.028, 7, 6), skinMat);
    ear.scale.set(0.45, 0.8, 0.65);
    ear.position.set(sx * 0.11, 1.53, 0.0);
    torso.add(ear);
  }
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.06, 5), skinMat);
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, 1.53, 0.112);
  torso.add(nose);
  // eyes and brows
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.009, 6, 5), new THREE.MeshBasicMaterial({ color: 0x33241a }));
    eye.position.set(sx * 0.042, 1.55, 0.108);
    torso.add(eye);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.008, 0.008), hairMat);
    brow.position.set(sx * 0.043, 1.578, 0.106);
    brow.rotation.z = sx * 0.08;
    torso.add(brow);
  }
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.008, 0.008), new THREE.MeshBasicMaterial({ color: 0x6f3b32 }));
  mouth.position.set(0, 1.49, 0.112);
  torso.add(mouth);
  if (elder) {
    const beard = new THREE.Mesh(new THREE.ConeGeometry(0.052, 0.18, 7), hairMat);
    beard.position.set(0, 1.42, 0.09);
    beard.rotation.x = 0.12;
    torso.add(beard);
  }

  // hair
  const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.124, 13, 10, 0, Math.PI * 2, 0, Math.PI * 0.52), hairMat);
  hairCap.position.set(0, 1.565, -0.006);
  hairCap.rotation.x = -0.24;
  torso.add(hairCap);
  if (female) {
    const bun = new THREE.Mesh(new THREE.SphereGeometry(0.06, 9, 7), hairMat);
    bun.position.set(0, 1.63, -0.09);
    torso.add(bun);
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.2, 4), garmentMaterial(0xb59a62));
    pin.rotation.z = Math.PI / 2;
    pin.position.set(0, 1.63, -0.09);
    torso.add(pin);
  } else {
    const topknot = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.042, 0.075, 7), hairMat);
    topknot.position.set(0, 1.66, -0.01);
    torso.add(topknot);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.043, 0.043, 0.02, 8), sashMat);
    band.position.set(0, 1.635, -0.01);
    torso.add(band);
  }

  if (hat) {
    const brim = new THREE.Mesh(
      new THREE.ConeGeometry(0.29, 0.13, 14, 1, true),
      new THREE.MeshStandardMaterial({ color: 0xb49c68, roughness: 1, side: THREE.DoubleSide })
    );
    brim.position.y = 1.65;
    brim.rotation.x = Math.PI / 2;
    torso.add(brim);
    const crown = new THREE.Mesh(
      new THREE.ConeGeometry(0.145, 0.19, 10, 1, true),
      new THREE.MeshStandardMaterial({ color: 0xa38a5a, roughness: 1, side: THREE.DoubleSide })
    );
    crown.position.y = 1.73;
    torso.add(crown);
  }
  if (female && !hat) {
    const scarf = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.12, 0.025), sashMat);
    scarf.position.set(0, 1.58, -0.075);
    torso.add(scarf);
  }

  // sleeves and hands
  const armL = new THREE.Group();
  const armR = new THREE.Group();
  armL.position.set(-0.235, 1.33, 0);
  armR.position.set(0.235, 1.33, 0);
  armL.rotation.z = 0.08;
  armR.rotation.z = -0.08;
  torso.add(armL, armR);
  const sleeveGeo = new THREE.CylinderGeometry(0.055, 0.105, 0.6, 9);
  sleeveGeo.translate(0, -0.30, 0);
  const leftSleeve = new THREE.Mesh(sleeveGeo, robeMat);
  const rightSleeve = new THREE.Mesh(sleeveGeo, robeMat);
  leftSleeve.castShadow = rightSleeve.castShadow = true;
  armL.add(leftSleeve);
  armR.add(rightSleeve);
  for (const arm of [armL, armR]) {
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.105, 0.065, 9), robeLightMat);
    cuff.position.y = -0.58;
    arm.add(cuff);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.048, 7, 6), skinMat);
    hand.scale.set(1, 1.25, 0.8);
    hand.position.y = -0.66;
    arm.add(hand);
  }

  // feet
  const footGeo = new THREE.BoxGeometry(0.095, 0.065, 0.21);
  const shoeMat = garmentMaterial(0x3c352b);
  const footL = new THREE.Mesh(footGeo, shoeMat);
  const footR = new THREE.Mesh(footGeo, shoeMat);
  footL.position.set(-0.09, 0.08, 0.07);
  footR.position.set(0.09, 0.08, 0.07);
  footL.castShadow = footR.castShadow = true;
  if (!seated) {
    group.add(footL, footR);
    const legGeo = new THREE.CylinderGeometry(0.06, 0.07, 0.32, 8);
    const trouserMat = garmentMaterial(0x494237);
    const legL = new THREE.Mesh(legGeo, trouserMat);
    const legR = new THREE.Mesh(legGeo, trouserMat);
    legL.position.set(-0.09, 0.26, 0);
    legR.position.set(0.09, 0.26, 0);
    legL.castShadow = legR.castShadow = true;
    group.add(legL, legR);
  }

  // accessories
  if (staff) {
    const staffMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.03, 1.6, 6), garmentMaterial(0x4e3b26));
    staffMesh.position.set(0.34, 0.86, 0.16);
    staffMesh.rotation.x = 0.08;
    staffMesh.castShadow = true;
    group.add(staffMesh);
  }
  if (hoe) {
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.026, 1.7, 5), garmentMaterial(0x5d452b));
    handle.position.set(0, -0.58, 0.10);
    handle.rotation.x = 1.2;
    handle.castShadow = true;
    armR.add(handle);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.24, 0.04), new THREE.MeshStandardMaterial({ color: 0x55534a, roughness: 0.5, metalness: 0.4 }));
    blade.position.set(0, -1.15, 0.72);
    blade.rotation.x = 1.2;
    blade.castShadow = true;
    armR.add(blade);
  }
  if (basket) {
    const basketMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.17, 0.27, 10, 1, true), garmentMaterial(0x9c7d4d));
    basketMesh.position.set(-0.36, 0.82, 0.16);
    basketMesh.castShadow = true;
    torso.add(basketMesh);
    const fruits = new THREE.Mesh(new THREE.SphereGeometry(0.1, 7, 5), garmentMaterial(0xb36f48));
    fruits.position.set(-0.36, 0.97, 0.16);
    torso.add(fruits);
  }

  const baseTorsoY = seated ? -0.24 : 0;
  torso.position.y = baseTorsoY;
  if (seated) {
    armL.rotation.x = -0.5;
    armR.rotation.x = -0.5;
    armL.rotation.z = 0.18;
    armR.rotation.z = -0.18;
  }

  group.userData = {
    body: torso, head, armL, armR, hairCap, footL, footR, scale,
    baseTorsoY, anim: "idle", phase: Math.random() * 10,
  };
  return group;
}

/* ================================================================== */
/* villagers                                                          */
/* ================================================================== */
export function createVillagers(scene, mats) {
  FABRIC_SOURCE = mats?.linen || null;
  FABRIC_CACHE.clear();
  const group = new THREE.Group();
  const colliders = [];
  const people = [];
  const rand = mulberry32(3301);

  const add = (person, x, z, rot = 0, meta = {}) => {
    person.position.set(x, groundHeight(x, z) + 0.09, z);
    person.rotation.y = rot;
    person.userData.baseY = person.position.y;
    Object.assign(person.userData, meta);
    group.add(person);
    people.push(person);
    return person;
  };

  // farmers in the west fields
  add(makePerson({ robe: 0x5f6a52, sash: 0x6c4d30, hat: true, hoe: true }), -43, -115, 2.5, { anim: "hoe", phase: 0.2 });
  add(makePerson({ robe: 0x6b6650, sash: 0x7e5a34, hat: true, hoe: true }), -51, -139, 2.9, { anim: "hoe", phase: 2.4 });
  add(makePerson({ robe: 0x4f5b5d, sash: 0x6e4b2f, hat: true, hoe: true }), 23, -157, 2.85, { anim: "hoe", phase: 4.1 });
  add(makePerson({ robe: 0x6d5b46, sash: 0x5a402a, hat: true, hoe: true }), 61, -158, 2.4, { anim: "hoe", phase: 1.2 });

  // walkers on the village path
  const w1 = add(makePerson({ robe: 0x56636b, sash: 0x927247, female: true, basket: true }), 0, -60, 0, {
    anim: "walkRoute", phase: 0.39, speed: 0.0011, basket: true,
  });
  const w2 = add(makePerson({ robe: 0x6f5c45, sash: 0x4e3c29, hat: false }), 0, -72, 0, {
    anim: "walkRoute", phase: 0.52, speed: 0.00085,
  });
  const w3 = add(makePerson({ robe: 0x5e6d5e, sash: 0x8d6c43, female: true }), 0, -122, 0, {
    anim: "walkRoute", phase: 0.72, speed: -0.0009,
  });

  // elders by the big tree / square
  add(makePerson({ robe: 0x5a5d54, sash: 0x72543a, elder: true, staff: true }), -8.4, -83.7, 0.55, { anim: "elder", phase: 1.0 });
  add(makePerson({ robe: 0x6a5f4d, sash: 0x6b4c30, elder: true, seated: true }), -6.7, -87.6, 0.9, { anim: "sit", phase: 2.0 });
  add(makePerson({ robe: 0x4e5b5a, sash: 0x80623d, elder: true, seated: true }), -8.6, -89.0, 2.0, { anim: "sit", phase: 3.0 });

  // woman at the well
  add(makePerson({ robe: 0x6a5f6e, sash: 0x9a7449, female: true }), 6.9, -87.6, -1.9, { anim: "well", phase: 0.4 });

  // children playing near the square
  add(makePerson({ robe: 0x7c634d, sash: 0x95513e, child: true }), 3.5, -84.5, 1.2, {
    anim: "child", phase: 0.3, centerX: 3.0, centerZ: -85.0, radius: 2.8, speed: 0.55,
  });
  add(makePerson({ robe: 0x5a6b63, sash: 0x9f5b41, child: true }), 0.2, -82.2, 0.4, {
    anim: "child", phase: 2.4, centerX: 0.5, centerZ: -84.0, radius: 3.6, speed: 0.42,
  });
  add(makePerson({ robe: 0x79664d, sash: 0x8b4a35, child: true }), 5.0, -82.5, 2.4, {
    anim: "child", phase: 4.0, centerX: 3.2, centerZ: -84.4, radius: 4.1, speed: 0.5,
  });

  // seated guests at the banquet pavilion
  const bx = -15, bz = -101, brot = 0.18;
  const local = (lx, lz) => ({
    x: bx + lx * Math.cos(brot) + lz * Math.sin(brot),
    z: bz - lx * Math.sin(brot) + lz * Math.cos(brot),
  });
  const guestDefs = [
    { lx: -2.1, lz: 1.15, rot: Math.PI + 0.15, robe: 0x64574a, sash: 0x8d6b40, elder: true },
    { lx: 0.1, lz: 1.15, rot: Math.PI - 0.1, robe: 0x536567, sash: 0x7f5c35 },
    { lx: 2.1, lz: 1.15, rot: Math.PI + 0.1, robe: 0x6c5a48, sash: 0x8d6a3e, female: true },
    { lx: -1.0, lz: -1.0, rot: 0.15, robe: 0x5d6654, sash: 0x77532f, elder: true },
    { lx: 1.2, lz: -1.0, rot: -0.1, robe: 0x6e5e52, sash: 0x7e5a35 },
  ];
  for (const g of guestDefs) {
    const w = local(g.lx, g.lz);
    const p = makePerson({
      robe: g.robe, sash: g.sash, female: g.female, elder: g.elder,
      seated: true, hat: false,
    });
    add(p, w.x, w.z, g.rot, { anim: "banquet", phase: rand() * 8 });
  }

  // one standing host at the banquet
  const hostPos = local(3.8, -0.2);
  add(makePerson({ robe: 0x7a5d44, sash: 0x5f432b, female: true }), hostPos.x, hostPos.z, 2.4, { anim: "host", phase: 1.2 });

  // story circle by the fire
  const fireX = 8.5, fireZ = -113;
  const circle = [
    { a: 0.5, robe: 0x5f6653, elder: true, seated: true },
    { a: 1.65, robe: 0x68584a, elder: true, seated: true },
    { a: 2.9, robe: 0x556a6e, female: true, seated: true },
    { a: 4.1, robe: 0x6f5f4b, seated: true },
  ];
  circle.forEach((c, i) => {
    const r = 1.9;
    add(makePerson({
      robe: c.robe, sash: 0x7f5c36, elder: c.elder, female: c.female, seated: true,
    }), fireX + Math.cos(c.a) * r, fireZ + Math.sin(c.a) * r, -c.a + Math.PI / 2, { anim: "listen", phase: i * 1.4 });
  });

  scene.add(group);

  const tmp = new THREE.Vector3();
  const update = (time, dt) => {
    for (const p of people) {
      const u = p.userData;
      const t = time + u.phase;
      switch (u.anim) {
        case "hoe": {
          u.armR.rotation.x = -0.9 + Math.sin(t * 1.5) * 0.85;
          u.armL.rotation.x = -0.5 + Math.sin(t * 1.5 + 0.4) * 0.2;
          u.body.rotation.x = 0.08 + Math.sin(t * 1.5) * 0.08;
          p.rotation.z = Math.sin(t * 1.5) * 0.02;
          break;
        }
        case "walkRoute": {
          const tt = ((u.phase + time * u.speed) % 1 + 1) % 1;
          const pt = routeCurve.getPoint(tt);
          const tan = routeCurve.getTangent(tt);
          p.position.set(pt.x + Math.sin(t * 1.3) * 0.2, groundHeight(pt.x, pt.z) + 0.09, pt.z);
          p.rotation.y = Math.atan2(tan.x, tan.z);
          u.armL.rotation.x = Math.sin(t * 4.2) * 0.55;
          u.armR.rotation.x = -Math.sin(t * 4.2) * 0.55;
          u.body.position.y = u.baseTorsoY + Math.abs(Math.sin(t * 4.2)) * 0.025;
          break;
        }
        case "child": {
          const a = t * 0.8;
          p.position.x = u.centerX + Math.cos(a) * u.radius;
          p.position.z = u.centerZ + Math.sin(a) * u.radius * 0.7;
          p.position.y = groundHeight(p.position.x, p.position.z) + 0.09 + Math.abs(Math.sin(t * 7)) * 0.16;
          p.rotation.y = Math.atan2(-Math.sin(a), Math.cos(a) * 0.7) + Math.PI / 2;
          u.armL.rotation.x = Math.sin(t * 7) * 0.9;
          u.armR.rotation.x = -Math.sin(t * 7) * 0.9;
          break;
        }
        case "elder": {
          u.armL.rotation.x = Math.sin(t * 0.6) * 0.08;
          u.armR.rotation.x = -0.15 + Math.sin(t * 0.6) * 0.05;
          u.body.rotation.z = Math.sin(t * 0.45) * 0.012;
          break;
        }
        case "well": {
          u.armR.rotation.x = -0.65 + Math.sin(t * 0.9) * 0.35;
          u.armL.rotation.x = -0.3 + Math.sin(t * 0.9 + 1) * 0.1;
          u.body.rotation.x = 0.02 + Math.sin(t * 0.9) * 0.03;
          break;
        }
        case "host": {
          u.armR.rotation.x = -0.35 + Math.sin(t * 0.8) * 0.4;
          u.armL.rotation.x = -0.25;
          u.head.rotation.y = Math.sin(t * 0.4) * 0.35;
          break;
        }
        case "sit": {
          u.head.rotation.y = Math.sin(t * 0.35) * 0.35;
          u.head.rotation.x = Math.sin(t * 0.27) * 0.06;
          break;
        }
        case "banquet": {
          u.armR.rotation.x = -0.7 + Math.sin(t * 0.65) * 0.3;
          u.armL.rotation.x = -0.6 + Math.sin(t * 0.5 + 2) * 0.18;
          u.head.rotation.y = Math.sin(t * 0.33) * 0.4;
          break;
        }
        case "listen": {
          u.head.rotation.y = Math.sin(t * 0.28) * 0.18;
          u.head.rotation.x = Math.sin(t * 0.8) * 0.04;
          break;
        }
        default: {
          u.head.rotation.y = Math.sin(t * 0.3) * 0.2;
        }
      }
    }
  };
  return { group, people, colliders, update };
}

/* ================================================================== */
/* chickens, dogs, ox                                                 */
/* ================================================================== */
function makeChicken(seed, rooster = false) {
  const group = new THREE.Group();
  const bodyColor = rooster ? 0xa8643d : seed % 2 === 0 ? 0xd6c6a2 : 0xb68b5f;
  const bodyMat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.95, flatShading: true });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 6), bodyMat);
  body.scale.set(0.9, 0.9, 1.32);
  body.position.y = 0.38;
  body.castShadow = true;
  group.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 7, 6), bodyMat);
  head.position.set(0, 0.62, 0.26);
  head.castShadow = true;
  group.add(head);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.13, 5), new THREE.MeshStandardMaterial({ color: 0xd99a3c, roughness: 0.8 }));
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, 0.61, 0.4);
  group.add(beak);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.44, 5), bodyMat);
  tail.rotation.x = -1.0;
  tail.position.set(0, 0.55, -0.28);
  group.add(tail);
  if (rooster) {
    const combMat = new THREE.MeshStandardMaterial({ color: 0xb3342c, roughness: 0.7 });
    for (let i = 0; i < 3; i++) {
      const comb = new THREE.Mesh(new THREE.SphereGeometry(0.045, 5, 4), combMat);
      comb.position.set(0, 0.76 + i * 0.02, 0.25 - i * 0.06);
      group.add(comb);
    }
  }
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.015, 0.18, 4), new THREE.MeshStandardMaterial({ color: 0xc99a43 }));
    leg.position.set(sx * 0.08, 0.14, 0.03);
    group.add(leg);
  }
  group.userData = { head, body, tail, baseY: 0 };
  return group;
}

export function createChickenFlock(scene) {
  const group = new THREE.Group();
  const chicks = [];
  const rand = mulberry32(9090);
  const centers = [
    [22, -57], [29, -79], [-25, -55], [-31, -137], [50, -75], [4, -93], [-13, -97],
  ];
  for (let i = 0; i < 11; i++) {
    const c = centers[i % centers.length];
    const ck = makeChicken(i, i === 0 || i === 6);
    const x = c[0] + (rand() - 0.5) * 5;
    const z = c[1] + (rand() - 0.5) * 5;
    ck.position.set(x, groundHeight(x, z), z);
    ck.rotation.y = rand() * 6.28;
    ck.userData = {
      ...ck.userData,
      centerX: c[0], centerZ: c[1],
      phase: rand() * 10, speed: 0.05 + rand() * 0.12,
      angle: rand() * 6.28, radius: 0.8 + rand() * 2.2,
      baseY: groundHeight(x, z),
      peck: 0,
    };
    group.add(ck);
    chicks.push(ck);
  }
  scene.add(group);
  return {
    group,
    update(time) {
      for (const c of chicks) {
        const u = c.userData;
        const a = u.angle + time * u.speed;
        const x = u.centerX + Math.cos(a) * u.radius;
        const z = u.centerZ + Math.sin(a) * u.radius;
        c.position.set(x, groundHeight(x, z), z);
        c.rotation.y = -a + Math.PI / 2;
        u.head.rotation.x = Math.max(0, Math.sin(time * 2.2 + u.phase)) * 0.65;
        u.tail.rotation.z = Math.sin(time * 3 + u.phase) * 0.15;
        c.position.y += Math.max(0, Math.sin(time * 5 + u.phase)) * 0.015;
      }
    },
  };
}

function makeDog(seed) {
  const group = new THREE.Group();
  const fur = new THREE.MeshStandardMaterial({
    color: seed === 0 ? 0xb18b58 : 0x6b5b43, roughness: 1, flatShading: true,
  });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.27, 8, 6), fur);
  body.scale.set(0.9, 0.9, 1.7);
  body.position.y = 0.46;
  body.castShadow = true;
  group.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), fur);
  head.position.set(0, 0.64, 0.45);
  head.castShadow = true;
  group.add(head);
  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.11, 0.22), fur);
  snout.position.set(0, 0.6, 0.6);
  group.add(snout);
  for (const sx of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.17, 4), fur);
    ear.position.set(sx * 0.12, 0.8, 0.43);
    ear.rotation.z = sx * 0.3;
    group.add(ear);
  }
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.04, 0.42, 5), fur);
  tail.position.set(0, 0.63, -0.52);
  tail.rotation.x = -0.8;
  group.add(tail);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.4, 5), fur);
    leg.position.set(sx * 0.13, 0.2, sz * 0.28);
    group.add(leg);
  }
  group.userData = { head, tail };
  return group;
}

export function createAnimals(scene, mats) {
  const group = new THREE.Group();
  const dogs = [];
  const rand = mulberry32(765);
  for (let i = 0; i < 2; i++) {
    const dog = makeDog(i);
    const cx = i === 0 ? 22 : -8;
    const cz = i === 0 ? -58 : -86;
    dog.position.set(cx, groundHeight(cx, cz), cz);
    dog.userData = { ...dog.userData, cx, cz, phase: rand() * 10, radius: 2 + rand() * 2, speed: 0.12 + rand() * 0.08 };
    group.add(dog);
    dogs.push(dog);
  }

  // an ox grazing in the west field
  const ox = new THREE.Group();
  const oxMat = new THREE.MeshStandardMaterial({ color: 0x544a3d, roughness: 1, flatShading: true });
  const oxBody = new THREE.Mesh(new THREE.SphereGeometry(0.72, 9, 7), oxMat);
  oxBody.scale.set(0.9, 0.85, 1.55);
  oxBody.position.y = 1.1;
  oxBody.castShadow = true;
  ox.add(oxBody);
  const oxHead = new THREE.Mesh(new THREE.SphereGeometry(0.36, 8, 6), oxMat);
  oxHead.position.set(0, 1.25, 1.18);
  oxHead.scale.set(0.85, 0.9, 1.15);
  oxHead.castShadow = true;
  ox.add(oxHead);
  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.22, 7, 5), new THREE.MeshStandardMaterial({ color: 0x7e6a58, roughness: 1 }));
  muzzle.position.set(0, 1.08, 1.48);
  muzzle.scale.set(0.85, 0.65, 0.9);
  ox.add(muzzle);
  for (const sx of [-1, 1]) {
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.42, 5), new THREE.MeshStandardMaterial({ color: 0xd3c6a5, roughness: 0.8 }));
    horn.position.set(sx * 0.28, 1.55, 1.08);
    horn.rotation.z = sx * 0.85;
    ox.add(horn);
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 5), oxMat);
    ear.position.set(sx * 0.38, 1.36, 1.0);
    ear.scale.set(1.3, 0.5, 0.8);
    ox.add(ear);
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.85, 6), oxMat);
    leg.position.set(sx * 0.42, 0.44, sz * 0.85);
    leg.castShadow = true;
    ox.add(leg);
  }
  const oxTail = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.9, 5), oxMat);
  oxTail.position.set(0, 0.9, -1.1);
  oxTail.rotation.x = -0.25;
  ox.add(oxTail);
  ox.position.set(-47, groundHeight(-47, -151), -151);
  ox.rotation.y = 0.7;
  ox.userData = { head: oxHead, tail: oxTail, phase: 0 };
  group.add(ox);

  scene.add(group);
  return {
    group,
    colliders: [{ x: 22, z: -58, radius: 0.8 }, { x: -8, z: -86, radius: 0.8 }],
    update(time) {
      for (const dog of dogs) {
        const u = dog.userData;
        const a = time * u.speed + u.phase;
        dog.position.x = u.cx + Math.cos(a) * u.radius;
        dog.position.z = u.cz + Math.sin(a) * u.radius;
        dog.position.y = groundHeight(dog.position.x, dog.position.z);
        dog.rotation.y = -a + Math.PI / 2;
        u.tail.rotation.z = Math.sin(time * 9 + u.phase) * 0.55;
        u.head.rotation.y = Math.sin(time * 0.9 + u.phase) * 0.4;
      }
      const u = ox.userData;
      u.head.rotation.x = 0.25 + Math.sin(time * 0.5) * 0.22;
      u.tail.rotation.z = Math.sin(time * 0.8) * 0.25;
    },
  };
}
