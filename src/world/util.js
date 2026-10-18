import * as THREE from "three";

/* ------------------------------------------------------------------ */
/* deterministic randomness + noise                                   */
/* ------------------------------------------------------------------ */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash2(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

function smooth(t) {
  return t * t * (3 - 2 * t);
}

export function valueNoise(x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const a = hash2(xi, yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1);
  const d = hash2(xi + 1, yi + 1);
  const u = smooth(xf);
  const v = smooth(yf);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

export function fbm(x, y, octaves = 4) {
  let value = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < octaves; i++) {
    value += amp * valueNoise(x * freq, y * freq);
    freq *= 2.03;
    amp *= 0.5;
  }
  return value;
}

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
export const invSmoothstep = (e0, e1, x) => 1 - smoothstep(e0, e1, x);

/* ------------------------------------------------------------------ */
/* route + stream geometry                                            */
/* ------------------------------------------------------------------ */
export const ROUTE_POINTS = [
  [7, 164], [10, 150], [14.5, 137], [14, 124], [9, 110], [8, 96],
  [12, 82], [12.5, 68], [10.5, 54], [9, 42], [0.3, 31], [0.4, 24],
  [0, 16], [0, 6], [0, -5], [0, -15], [0, -23],
  [-2.5, -31], [-6.5, -41], [-3.5, -53], [0.5, -66], [3.5, -79],
  [0.5, -91], [-4.5, -103], [-1.5, -115], [5.5, -127], [3.5, -140], [0.5, -152],
];

export const STREAM_POINTS = [
  [4, 180], [2, 162], [6, 145], [11, 131], [6, 116], [1, 102],
  [4, 88], [9, 75], [3, 61], [7, 47], [4.5, 40], [2.5, 36],
];

export const routeCurve = new THREE.CatmullRomCurve3(
  ROUTE_POINTS.map(([x, z]) => new THREE.Vector3(x, 0, z)),
  false,
  "catmullrom",
  0.18
);

export const streamCurve = new THREE.CatmullRomCurve3(
  STREAM_POINTS.map(([x, z]) => new THREE.Vector3(x, 0, z)),
  false,
  "catmullrom",
  0.22
);

const streamSamples = [];
const STREAM_SAMPLE_COUNT = 90;
for (let i = 0; i <= STREAM_SAMPLE_COUNT; i++) {
  const p = streamCurve.getPoint(i / STREAM_SAMPLE_COUNT);
  streamSamples.push([p.x, p.z]);
}
const routeSamples = [];
const ROUTE_SAMPLE_COUNT = 220;
for (let i = 0; i <= ROUTE_SAMPLE_COUNT; i++) {
  const p = routeCurve.getPoint(i / ROUTE_SAMPLE_COUNT);
  routeSamples.push([p.x, p.z]);
}

function distToPolyline(x, z, samples) {
  let best = Infinity;
  for (let i = 0; i < samples.length - 1; i++) {
    const [ax, az] = samples[i];
    const [bx, bz] = samples[i + 1];
    const vx = bx - ax;
    const vz = bz - az;
    const wx = x - ax;
    const wz = z - az;
    const len2 = vx * vx + vz * vz || 1;
    let t = (wx * vx + wz * vz) / len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const dx = x - (ax + vx * t);
    const dz = z - (az + vz * t);
    const d = dx * dx + dz * dz;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

export function distanceToStream(x, z) {
  return distToPolyline(x, z, streamSamples);
}

export function distanceToRoute(x, z) {
  return distToPolyline(x, z, routeSamples);
}

/* ------------------------------------------------------------------ */
/* terrain height                                                     */
/* ------------------------------------------------------------------ */
export const POND = { x: 38, z: -118, r: 12.5 };

export function groundHeight(x, z) {
  const broad = fbm(x * 0.022 + 4.1, z * 0.022 - 2.3, 4);
  const fine = fbm(x * 0.11 - 8.2, z * 0.11 + 6.7, 3);
  let h = 0.36 + (broad - 0.5) * 0.48 + (fine - 0.5) * 0.09;

  // the stream's shallow valley (only on the outside stretch)
  if (z > 22) {
    const d = distanceToStream(x, z);
    h -= Math.exp(-Math.pow(d / 4.8, 2)) * 1.55;
    h += Math.exp(-Math.pow(d / 1.4, 2)) * 0.06;
    const side = smoothstep(40, 105, Math.abs(x));
    h += side * (11 + fbm(x * 0.04, z * 0.04, 4) * 28);
    // gentle shoulders immediately beside the stream
    h += smoothstep(8, 24, d) * 0.28;
  }

  // the mountain wall that the stream runs into
  const ridge = Math.exp(-Math.pow(z / 25, 2));
  if (ridge > 0.004) {
    const wall = smoothstep(4.0, 27, Math.abs(x));
    const shoulder = smoothstep(6.0, 15, Math.abs(x));
    h += ridge * (wall * 40 + shoulder * 8);
    h += ridge * (fbm(x * 0.08 + 2, z * 0.08, 3) - 0.5) * wall * 9;
  }

  // enclosing hills at the sides and far end of the village
  const village = smoothstep(-18, -40, z) * (1 - smoothstep(-178, -215, z));
  if (village > 0.001) {
    const ex = smoothstep(82, 132, Math.abs(x));
    const ez = smoothstep(-176, -212, z) * 0 + smoothstep(176, 212, -z);
    h += (ex * 25 + ez * 27) * village;
    h += ex * (fbm(x * 0.05, z * 0.05, 4) * 14) * village;
  }

  // pond basin
  if (z < -85 && z > -150) {
    const dx = x - POND.x;
    const dz = z - POND.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    h -= smoothstep(POND.r, POND.r * 0.3, d) * 1.35;
  }

  // keep the cave corridor walkable
  if (z < 27 && z > -28 && Math.abs(x) < 5) {
    h = Math.min(h, 0.5 + fine * 0.05);
  }
  return h;
}

export function groundNormal(x, z, out = new THREE.Vector3()) {
  const e = 0.45;
  const hl = groundHeight(x - e, z);
  const hr = groundHeight(x + e, z);
  const hd = groundHeight(x, z - e);
  const hu = groundHeight(x, z + e);
  out.set(hl - hr, 2 * e, hd - hu).normalize();
  return out;
}

export function isCaveAt(x, z) {
  return z < 25.5 && z > -24.5 && Math.abs(x) < 4.6;
}

/* ------------------------------------------------------------------ */
/* geometry helpers                                                   */
/* ------------------------------------------------------------------ */
export function makeRibbon(curve, width, segments = 160, yOffset = 0.04, taper = null) {
  const positions = [];
  const uvs = [];
  const indices = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const p = curve.getPoint(t);
    const tangent = curve.getTangent(t);
    const nx = -tangent.z;
    const nz = tangent.x;
    const w = taper ? width * taper(t) : width;
    const gy = groundHeight(p.x, p.z) + yOffset;
    positions.push(p.x + nx * w * 0.5, gy, p.z + nz * w * 0.5);
    positions.push(p.x - nx * w * 0.5, gy, p.z - nz * w * 0.5);
    uvs.push(0, t * 6, 1, t * 6);
    if (i < segments) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

export function box(w, h, d, color, opts = {}) {
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.9,
    metalness: opts.metalness ?? 0,
    flatShading: opts.flat ?? false,
    ...opts.material,
  });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.castShadow = opts.castShadow ?? true;
  mesh.receiveShadow = opts.receiveShadow ?? true;
  return mesh;
}

/* ------------------------------------------------------------------ */
/* procedural textures                                                */
/* ------------------------------------------------------------------ */
function canvasTexture(size, draw, repeat = [1, 1]) {
  const c = document.createElement("canvas");
  c.width = size[0];
  c.height = size[1];
  const ctx = c.getContext("2d");
  draw(ctx, c.width, c.height);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat[0], repeat[1]);
  tex.anisotropy = 4;
  return tex;
}

export function makeTileTexture() {
  return canvasTexture([256, 256], (ctx, w, h) => {
    ctx.fillStyle = "#4c4f4a";
    ctx.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 16) {
      const shade = 42 + Math.floor(Math.random() * 16);
      ctx.fillStyle = `rgb(${shade},${shade + 3},${shade + 1})`;
      ctx.fillRect(x + 1, 0, 13, h);
      ctx.fillStyle = "rgba(18,20,18,.45)";
      ctx.fillRect(x, 0, 2, h);
      ctx.fillStyle = "rgba(255,255,255,.07)";
      ctx.fillRect(x + 2, 0, 2, h);
    }
    for (let y = 0; y < h; y += 22) {
      ctx.fillStyle = "rgba(15,17,15,.38)";
      ctx.fillRect(0, y, w, 2);
      ctx.fillStyle = "rgba(255,255,255,.05)";
      ctx.fillRect(0, y + 2, w, 1);
    }
    for (let i = 0; i < 320; i++) {
      ctx.fillStyle = `rgba(${Math.random() > 0.5 ? "255,255,255" : "0,0,0"},${Math.random() * 0.06})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 1);
    }
  }, [2, 3]);
}

export function makeThatchTexture() {
  return canvasTexture([256, 256], (ctx, w, h) => {
    ctx.fillStyle = "#8b764c";
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) {
      const x = Math.random() * w;
      const y = Math.random() * h;
      ctx.strokeStyle = `rgba(${90 + Math.random() * 75},${72 + Math.random() * 55},${40 + Math.random() * 35},${0.25 + Math.random() * 0.4})`;
      ctx.lineWidth = 0.6 + Math.random() * 1.4;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (Math.random() - 0.5) * 4, y + 12 + Math.random() * 24);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(55,44,25,.2)";
    for (let y = 0; y < h; y += 18) ctx.fillRect(0, y, w, 1);
  }, [3, 2]);
}

export function makePlasterTexture() {
  return canvasTexture([256, 256], (ctx, w, h) => {
    ctx.fillStyle = "#d8ceb8";
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) {
      const g = 190 + Math.random() * 45;
      ctx.fillStyle = `rgba(${g},${g - 7},${g - 22},${Math.random() * 0.16})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 1 + Math.random() * 3);
    }
    for (let i = 0; i < 40; i++) {
      ctx.strokeStyle = `rgba(110,99,75,${Math.random() * 0.14})`;
      ctx.beginPath();
      const x = Math.random() * w;
      ctx.moveTo(x, 0);
      ctx.bezierCurveTo(x + 6, h * 0.3, x - 5, h * 0.6, x + 3, h);
      ctx.stroke();
    }
  }, [1, 1]);
}

export function makeLatticeTexture() {
  return canvasTexture([128, 192], (ctx, w, h) => {
    ctx.fillStyle = "#2f2a22";
    ctx.fillRect(0, 0, w, h);
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "#b8a67a");
    grad.addColorStop(1, "#7d6e4d");
    ctx.fillStyle = grad;
    ctx.fillRect(8, 8, w - 16, h - 16);
    ctx.strokeStyle = "#302a21";
    ctx.lineWidth = 4;
    for (let x = 8; x <= w - 8; x += 22) {
      ctx.beginPath();
      ctx.moveTo(x, 8);
      ctx.lineTo(x, h - 8);
      ctx.stroke();
    }
    for (let y = 8; y <= h - 8; y += 22) {
      ctx.beginPath();
      ctx.moveTo(8, y);
      ctx.lineTo(w - 8, y);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(35,29,21,.35)";
    ctx.lineWidth = 1;
    for (let x = 8; x <= w - 8; x += 11) {
      ctx.beginPath();
      ctx.moveTo(x, 8);
      ctx.lineTo(x, h - 8);
      ctx.stroke();
    }
  });
}

export function makeCropTexture(base = "#6f8a45", accent = "#a2a35c") {
  return canvasTexture([256, 256], (ctx, w, h) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 10) {
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.25 + Math.random() * 0.4;
      ctx.fillRect(x, 0, 4, h);
      ctx.globalAlpha = 1;
    }
    for (let i = 0; i < 1500; i++) {
      ctx.fillStyle = `rgba(${45 + Math.random() * 60},${70 + Math.random() * 60},${35 + Math.random() * 35},.3)`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 1, 2 + Math.random() * 4);
    }
    for (let y = 0; y < h; y += 32) {
      ctx.fillStyle = "rgba(60,64,35,.14)";
      ctx.fillRect(0, y, w, 2);
    }
  }, [3, 3]);
}

export function makePetalTexture() {
  return canvasTexture([64, 64], (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    const grad = ctx.createRadialGradient(w * 0.5, h * 0.55, 2, w * 0.5, h * 0.5, w * 0.46);
    grad.addColorStop(0, "rgba(255,242,244,1)");
    grad.addColorStop(0.45, "rgba(255,202,214,.98)");
    grad.addColorStop(0.8, "rgba(244,160,182,.75)");
    grad.addColorStop(1, "rgba(244,160,182,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(w * 0.5, h * 0.5, w * 0.32, h * 0.46, 0.3, 0, Math.PI * 2);
    ctx.fill();
  });
}

export function makeCloudTexture() {
  return canvasTexture([256, 128], (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    for (let i = 0; i < 34; i++) {
      const x = 30 + Math.random() * (w - 60);
      const y = 36 + Math.random() * (h - 62);
      const r = 12 + Math.random() * 34;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, "rgba(255,252,244,.23)");
      g.addColorStop(0.55, "rgba(248,245,238,.12)");
      g.addColorStop(1, "rgba(248,245,238,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

export function makeDustTexture() {
  return canvasTexture([64, 64], (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, "rgba(255,244,210,.95)");
    g.addColorStop(0.4, "rgba(255,228,170,.35)");
    g.addColorStop(1, "rgba(255,228,170,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
}

export function makeNoiseCanvasTexture() {
  const size = 256;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const x = i % size;
    const y = Math.floor(i / size);
    const v = fbm(x * 0.035, y * 0.035, 4) * 255;
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export function disposeObject(root) {
  root.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((m) => {
        if (m.map) m.map.dispose();
        if (m.alphaMap) m.alphaMap.dispose();
        m.dispose();
      });
    }
  });
}

export function makeRockTexture() {
  return canvasTexture([256, 256], (ctx, w, h) => {
    ctx.fillStyle = "#d9d3c3";
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 4800; i++) {
      const g = 150 + Math.random() * 90;
      ctx.fillStyle = `rgba(${g},${g - 4},${g - 13},${0.05 + Math.random() * 0.15})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 4, 1 + Math.random() * 3);
    }
    // geological strata
    for (let y = 0; y < h; y += 13 + Math.random() * 9) {
      ctx.strokeStyle = `rgba(85,80,66,${0.05 + Math.random() * 0.09})`;
      ctx.lineWidth = 0.7 + Math.random() * 1.8;
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= w; x += 16) {
        ctx.lineTo(x, y + Math.sin(x * 0.05 + y) * 3 + (Math.random() - 0.5) * 2);
      }
      ctx.stroke();
    }
    // cracks
    for (let i = 0; i < 16; i++) {
      let x = Math.random() * w, y = Math.random() * h;
      ctx.strokeStyle = "rgba(48,45,38,.28)";
      ctx.lineWidth = 0.6 + Math.random() * 1.1;
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let k = 0; k < 4; k++) {
        x += (Math.random() - 0.5) * 26;
        y += Math.random() * 24;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }, [3, 3]);
}
