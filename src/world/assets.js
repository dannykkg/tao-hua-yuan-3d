import * as THREE from "three";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const BASE = import.meta.env.BASE_URL || "/";
const assetUrl = (path) => `${BASE}assets/${path}`;
const TEX_BASE = assetUrl("textures");
const HDRI_URL = assetUrl("hdri/kloofendal_28d_misty_2k.hdr");

const SET_FILES = {
  rock: "mossy_rock",
  dirt: "dirt",
  grass: "leafy_grass",
  wood: "dark_planks",
  plaster: "worn_plaster_wall",
  tile: "grey_roof_tiles",
  thatch: "thatch_roof_angled",
  linen: "rough_linen",
};

function configureTexture(tex, { srgb = false, repeat = [1, 1], anisotropy = 8 } = {}) {
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat[0], repeat[1]);
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.anisotropy = anisotropy;
  tex.needsUpdate = true;
  return tex;
}

function cloneRepeat(tex, repeat) {
  const t = tex.clone();
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.needsUpdate = true;
  return t;
}

class AssetLibrary {
  constructor() {
    this.sets = {};
    this.envMap = null;
    this.models = { peachTrees: [], houses: { tile: [], thatch: [] }, cavePortal: [] };
    this.cache = new Map();
    this.anisotropy = 8;
  }

  /** Create a cached PBR material from one of the texture sets. */
  pbr(name, options = {}) {
    const {
      repeat = [1, 1], color = 0xffffff, roughness = 1, metalness = 0,
      normalScale = 1, side = THREE.FrontSide, transparent = false,
      opacity = 1, emissive = 0x000000, emissiveIntensity = 1,
      vertexColors = false, alphaTest = 0, envMapIntensity = 1,
    } = options;
    const key = JSON.stringify([name, repeat, color, roughness, metalness, normalScale, side, transparent, opacity, emissive, emissiveIntensity, vertexColors, alphaTest, envMapIntensity]);
    if (this.cache.has(key)) return this.cache.get(key);
    const set = this.sets[name];
    if (!set) throw new Error(`Unknown material set: ${name}`);
    const map = cloneRepeat(set.map, repeat);
    const normalMap = cloneRepeat(set.normal, repeat);
    const roughnessMap = cloneRepeat(set.rough, repeat);
    const mat = new THREE.MeshStandardMaterial({
      map, normalMap, roughnessMap,
      color, roughness, metalness, normalScale: new THREE.Vector2(normalScale, normalScale),
      side, transparent, opacity, emissive, emissiveIntensity,
      vertexColors, alphaTest, envMapIntensity,
    });
    this.cache.set(key, mat);
    return mat;
  }

  /** Clone a set's maps for custom shader-based materials. */
  maps(name, repeat = [1, 1]) {
    const set = this.sets[name];
    return {
      map: cloneRepeat(set.map, repeat),
      normalMap: cloneRepeat(set.normal, repeat),
      roughnessMap: cloneRepeat(set.rough, repeat),
    };
  }
}

export async function loadAssets(renderer, onProgress) {
  const manager = new THREE.LoadingManager();
  manager.onProgress = (_url, loaded, total) => {
    if (onProgress) onProgress(loaded, total);
  };
  const texLoader = new THREE.TextureLoader(manager);
  const hdriLoader = new HDRLoader(manager);
  const gltfLoader = new GLTFLoader(manager);

  const lib = new AssetLibrary();

  const loadTexture = (url, srgb = false) => new Promise((resolve, reject) => {
    texLoader.load(url, (t) => resolve(configureTexture(t, { srgb })), undefined, reject);
  });

  const tasks = [];
  for (const [key, folder] of Object.entries(SET_FILES)) {
    tasks.push((async () => {
      const [map, normal, rough] = await Promise.all([
        loadTexture(`${TEX_BASE}/${folder}/${folder}_diff_2k.jpg`, true),
        loadTexture(`${TEX_BASE}/${folder}/${folder}_nor_gl_2k.jpg`, false),
        loadTexture(`${TEX_BASE}/${folder}/${folder}_rough_2k.jpg`, false),
      ]);
      lib.sets[key] = { map, normal, rough };
    })());
  }

  const envTask = new Promise((resolve, reject) => {
    hdriLoader.load(HDRI_URL, (hdr) => resolve(hdr), undefined, reject);
  });

  const loadTreeMesh = (url) => new Promise((resolve, reject) => {
    gltfLoader.load(url, (gltf) => {
      const bark = gltf.scene.getObjectByName("PeachBark");
      const blossoms = gltf.scene.getObjectByName("PeachBlossoms");
      resolve({ bark: bark?.geometry, blossoms: blossoms?.geometry });
    }, undefined, reject);
  });
  const treeTasks = [0, 1, 2].map((i) => Promise.all([
    loadTreeMesh(assetUrl(`models/peach_tree_${i}.glb`)),
    loadTreeMesh(assetUrl(`models/peach_tree_lod_${i}.glb`)),
  ]).then(([high, low]) => ({
    bark: high.bark,
    blossoms: high.blossoms,
    lowBlossoms: low.blossoms,
  })));

  const houseTask = (kind) => new Promise((resolve, reject) => {
    gltfLoader.load(assetUrl(`models/hanjin_house_${kind}.glb`), (gltf) => {
      const meshes = [];
      gltf.scene.updateMatrixWorld(true);
      gltf.scene.traverse((o) => {
        if (!o.isMesh) return;
        const geo = o.geometry.clone();
        geo.applyMatrix4(o.matrixWorld);
        meshes.push({ geometry: geo, material: o.material });
      });
      resolve(meshes);
    }, undefined, reject);
  });

  const portalTask = new Promise((resolve, reject) => {
    gltfLoader.load(assetUrl("models/cave_portal.glb"), (gltf) => {
      const meshes = [];
      gltf.scene.updateMatrixWorld(true);
      gltf.scene.traverse((o) => {
        if (!o.isMesh) return;
        const geo = o.geometry.clone();
        geo.applyMatrix4(o.matrixWorld);
        meshes.push(geo);
      });
      resolve(meshes);
    }, undefined, reject);
  });

  const [hdr, ...modelResults] = await Promise.all([
    envTask, ...tasks, ...treeTasks,
    houseTask("tile"), houseTask("thatch"), portalTask,
  ]);
  const treeCount = 3;
  lib.models.peachTrees = modelResults.slice(tasks.length, tasks.length + treeCount);
  lib.models.houses.tile = modelResults[tasks.length + treeCount];
  lib.models.houses.thatch = modelResults[tasks.length + treeCount + 1];
  lib.models.cavePortal = modelResults[tasks.length + treeCount + 2] || [];

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envRT = pmrem.fromEquirectangular(hdr);
  lib.envRT = envRT;
  lib.envMap = envRT.texture;
  hdr.dispose();
  pmrem.dispose();

  return lib;
}
