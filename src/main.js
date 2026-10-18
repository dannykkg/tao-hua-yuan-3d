import "./style.css";
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { SMAAPass } from "three/addons/postprocessing/SMAAPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { CHAPTERS, NOTES, HOTSPOTS } from "./content.js";
import { loadAssets } from "./world/assets.js";
import {
  createSky, createClouds, createDistantMountains, createTerrain, createWater,
  createLighting, createGroundMist, createPetals, createMotes, createFloatingPetals,
} from "./world/environment.js";
import { createCave } from "./world/cave.js";
import {
  createPeachGrove, createMulberryGrove, createBambooGrove,
  createGrassAndReeds, createPines, createLotus, createGroundDetails, createBirds, createWillows,
} from "./world/vegetation.js";
import { createVillage } from "./world/village.js";
import {
  groundHeight, routeCurve, distanceToStream, distanceToRoute,
  makeDustTexture, clamp, smoothstep, lerp,
} from "./world/util.js";
import { Ambience } from "./core/audio.js";

/* ================================================================== */
/* DOM                                                                */
/* ================================================================== */
const $ = (s) => document.querySelector(s);
const dom = {
  canvas: $("#view"),
  loading: $("#loading"),
  loadingText: $(".loading-text"),
  loadingSub: $(".loading-sub"),
  intro: $("#intro"),
  hud: $("#hud"),
  btnWalk: $("#btn-walk"),
  btnTour: $("#btn-tour"),
  chapterCard: $("#chapter-card"),
  chapterNo: $("#chapter-no"),
  chapterKicker: $("#chapter-kicker"),
  chapterTitle: $("#chapter-title"),
  chapterQuote: $("#chapter-quote"),
  chapterNote: $("#chapter-note"),
  chapterPlace: $("#chapter-place"),
  chapterClose: $("#chapter-close"),
  chapterMore: $("#chapter-more"),
  chapterList: $("#chapter-list"),
  notesList: $("#notes-list"),
  journal: $("#journal"),
  journalClose: $("#journal-close"),
  btnJournal: $("#btn-journal"),
  tabRoute: $("#tab-route"),
  tabNotes: $("#tab-notes"),
  routePanel: $("#route-panel"),
  notesPanel: $("#notes-panel"),
  quoteCard: $("#quote-card"),
  quoteText: $(".quote-text"),
  placeIndex: $(".place-index"),
  placeName: $(".place-name"),
  objLabel: $(".obj-label"),
  objDist: $(".obj-dist"),
  interactPrompt: $("#interact-prompt"),
  interactLabel: $("#interact-label"),
  crosshair: $("#crosshair"),
  toast: $("#toast"),
  hotspotModal: $("#hotspot-modal"),
  hotspotClose: $("#hotspot-close"),
  hotspotTag: $("#hotspot-tag"),
  hotspotTitle: $("#hotspot-title"),
  hotspotBody: $("#hotspot-body"),
  hotspotSource: $("#hotspot-source"),
  helpPanel: $("#help-panel"),
  helpClose: $("#help-close"),
  btnHelp: $("#btn-help"),
  btnAudio: $("#btn-audio"),
  audioGlyph: $(".audio-glyph"),
  btnFullscreen: $("#btn-fullscreen"),
  btnMode: $("#btn-mode"),
  modeStatus: $(".mode-status"),
  modeLabel: $("#mode-label"),
  ending: $("#ending"),
  btnReturn: $("#btn-return"),
  btnRestart: $("#btn-restart"),
  mobileUI: $("#mobile-ui"),
  joystick: $("#joystick"),
  mobileInteract: $("#btn-mobile-interact"),
};

/* ================================================================== */
/* state                                                              */
/* ================================================================== */
const app = {
  started: false,
  mode: "free",          // free | tour | paused
  visited: new Set(),
  currentChapter: 0,
  overlayOpen: false,
  time: 0,
  caveFactor: 0,
  chapterTimer: null,
  quoteTimer: null,
  pointerLocked: false,
  dragging: false,
  introPhase: 0,
  endingShown: false,
  endingTimer: null,
};

const player = {
  pos: new THREE.Vector3(),
  footY: 0,
  vel: new THREE.Vector3(),
  yaw: 0,
  pitch: -0.035,
  bob: 0,
  bobPhase: 0,
  moving: false,
  height: 1.68,
};

const tour = {
  t: 0.002,
  pause: 0,
  look: new THREE.Vector3(),
  pos: new THREE.Vector3(),
  active: false,
};

const keys = new Set();
const joystick = { x: 0, y: 0, active: false, id: null, sx: 0, sy: 0 };
const lookDrag = { active: false, id: null, x: 0, y: 0, moved: 0 };

let scene, camera, renderer, composer, bloom, smaa, gtao, assets;
let sky, clouds, mountains, terrain, water, lighting, mist, petals, floatingPetals, motes, cave, village, birds, peachGrove;
let hotspotAnchors = [];
let hotspotLabels = [];
let raycaster, pointerNDC;
const ambience = new Ambience();
const baseFog = new THREE.Color("#d0d8ca");
const caveFog = new THREE.Color("#15150f");
const tmpVec = new THREE.Vector3();
const tmpVec2 = new THREE.Vector3();
const tmpObj = new THREE.Object3D();

class FilteredGTAOPass extends GTAOPass {
  // Alpha-tested foliage is rendered as full quads by the G-buffer
  // override material. Hide it while GTAO builds normals/depth, then
  // restore it before the AO blend. The colour buffer already contains it.
  render(renderer, writeBuffer, readBuffer, deltaTime, maskActive) {
    const hidden = [];
    this.scene.traverse((o) => {
      if (!o.visible) return;
      if (o.isSprite || o.isPoints || o.isLine) {
        hidden.push(o);
        o.visible = false;
        return;
      }
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      if (o.userData.skipAO || mats.some((m) => m && (m.alphaTest > 0 || m.transparent))) {
        hidden.push(o);
        o.visible = false;
      }
    });
    super.render(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
    for (const o of hidden) o.visible = true;
  }
  setSize(width, height) {
    // AO at half resolution is enough after denoising and keeps the
    // full-res flower cards from tanking the frame rate.
    super.setSize(Math.max(1, Math.floor(width * 0.5)), Math.max(1, Math.floor(height * 0.5)));
  }
}

/* ================================================================== */
/* boot                                                               */
/* ================================================================== */
async function boot() {
  try {
    dom.loadingText.textContent = "正在缘溪寻源";
    await tick(40);

    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(baseFog.clone(), 0.0052);

    camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.06, 900);
    camera.rotation.order = "YXZ";

    renderer = new THREE.WebGLRenderer({
      canvas: dom.canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    const mobileQuality = window.matchMedia("(max-width: 860px)").matches;
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobileQuality ? 1.0 : 1.65));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.shadowMap.enabled = true;

    composer = new EffectComposer(renderer);
    composer.setSize(window.innerWidth, window.innerHeight);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.addPass(new RenderPass(scene, camera));
    gtao = new FilteredGTAOPass(scene, camera, Math.floor(window.innerWidth * 0.5), Math.floor(window.innerHeight * 0.5));
    gtao.output = GTAOPass.OUTPUT.Default;
    gtao.blendIntensity = 0.42;
    gtao.updateGtaoMaterial({ radius: 0.38, distanceExponent: 1.0, thickness: 0.9, scale: 1.0, samples: 12 });
    composer.addPass(gtao);
    bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.13, 0.62, 1.0);
    composer.addPass(bloom);
    smaa = new SMAAPass();
    composer.addPass(smaa);
    composer.addPass(new OutputPass());
    if (mobileQuality) {
      // desktop-first photoreal; mobile keeps a lighter post stack
      bloom.enabled = false;
      smaa.enabled = false;
      gtao.enabled = false;
    }

    raycaster = new THREE.Raycaster();
    pointerNDC = new THREE.Vector2();

    dom.loadingText.textContent = "取石 · 理材";
    await tick(30);
    assets = await loadAssets(renderer, (loaded, total) => {
      const pct = Math.round((loaded / Math.max(total, 1)) * 100);
      dom.loadingSub.textContent = `CC0 石纹 · 木纹 · 天光 · ${pct}%`;
    });
    scene.environment = assets.envMap;
    scene.environmentIntensity = 0.55;
    dom.loadingSub.textContent = "CC0 HDRI · PBR 材质 · Blender 资产";

    dom.loadingText.textContent = "叠山";
    await tick(30);
    const skyData = createSky(scene);
    sky = skyData.sky;
    clouds = createClouds(scene);
    mountains = createDistantMountains(scene);

    await tick(30);
    dom.loadingText.textContent = "理水";
    const terrainData = createTerrain(scene, assets);
    terrain = terrainData.terrain;
    water = createWater(scene);
    lighting = createLighting(scene);

    await tick(30);
    dom.loadingText.textContent = "种桃";
    peachGrove = createPeachGrove(scene, assets);
    createMulberryGrove(scene, assets);
    createBambooGrove(scene, assets);
    createPines(scene);
    createGrassAndReeds(scene);
    createGroundDetails(scene, assets);
    createLotus(scene);

    await tick(30);
    dom.loadingText.textContent = "凿洞";
    cave = createCave(scene, assets);

    await tick(30);
    dom.loadingText.textContent = "结庐";
    village = createVillage(scene, assets);
    colliders = village.colliders;

    await tick(30);
    dom.loadingText.textContent = "落英";
    mist = createGroundMist(scene);
    petals = createPetals(scene);
    floatingPetals = createFloatingPetals(scene);
    motes = createMotes(scene);
    birds = createBirds(scene);

    setupHotspots();
    buildUI();
    bindEvents();
    adaptMobileCopy();
    resetPlayer(0.004, -0.06);
    setupIntroCamera();
    updateCameraFromPlayer();
    sky.position.copy(camera.position);

    await tick(50);
    dom.loading.classList.add("done");
    setTimeout(() => {
      dom.intro.classList.remove("hidden");
    }, 250);
    dom.loadingSub.textContent = "入此绝境，遂与外人间隔";

    requestAnimationFrame(loop);
  } catch (err) {
    console.error(err);
    dom.loadingText.textContent = "山径忽然迷了";
    dom.loadingSub.textContent = String(err?.message || err);
    if (dom.loading.querySelector(".loading-track")) {
      dom.loading.querySelector(".loading-track").style.display = "none";
    }
  }
}

function tick(ms = 16) {
  return new Promise((r) => setTimeout(r, ms));
}

/* ================================================================== */
/* hotspots                                                           */
/* ================================================================== */
function setupHotspots() {
  const map = makeDustTexture();
  const group = new THREE.Group();
  for (const h of HOTSPOTS) {
    const [x, y, z] = h.position;
    const anchor = new THREE.Group();
    anchor.position.set(x, y, z);
    const spriteMat = new THREE.SpriteMaterial({
      map,
      color: 0xffd79a,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
    });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(0.8, 0.8, 1);
    sprite.position.y = 0.25;
    anchor.add(sprite);

    const ringGeo = new THREE.RingGeometry(0.28, 0.36, 24);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffd79a,
      transparent: true,
      opacity: 0.26,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.y = -y + groundHeight(x, z) + 0.1;
    anchor.add(ring);
    anchor.userData = { hotspot: h, sprite, ring, baseY: y };
    scene.add(anchor);
    hotspotAnchors.push(anchor);

    const label = document.createElement("button");
    label.className = "hotspot-label";
    label.innerHTML = `<i></i><span>${h.title}</span><kbd>E</kbd>`;
    label.addEventListener("click", (e) => {
      e.stopPropagation();
      openHotspot(h);
    });
    dom.hud.appendChild(label);
    hotspotLabels.push({ el: label, h, anchor });
  }
  scene.add(group);
}

/* ================================================================== */
/* UI build                                                           */
/* ================================================================== */
function buildUI() {
  dom.chapterList.innerHTML = "";
  CHAPTERS.forEach((ch, i) => {
    const li = document.createElement("li");
    li.className = "chapter-item";
    li.dataset.index = i;
    li.innerHTML = `
      <span class="ci-no">${ch.no}</span>
      <span><span class="ci-title">${ch.title}</span><span class="ci-line">${ch.place}</span></span>
      <span class="ci-state">未至</span>
    `;
    li.addEventListener("click", () => {
      teleportToChapter(i);
    });
    dom.chapterList.appendChild(li);
  });

  dom.notesList.innerHTML = NOTES.map((n) => `
    <article class="note-card">
      <h3>${n.title}</h3>
      <p>${n.body}</p>
      <span class="note-tag">${n.tag}</span>
    </article>
  `).join("");

  updateJournalStates();
}

function updateJournalStates() {
  [...dom.chapterList.children].forEach((li, i) => {
    const state = li.querySelector(".ci-state");
    const visited = app.visited.has(i);
    li.classList.toggle("locked", false);
    li.classList.toggle("current", i === app.currentChapter && visited);
    state.textContent = visited ? (i === app.currentChapter ? "所在" : "已阅") : "未至";
  });
}

/* ================================================================== */
/* events                                                             */
/* ================================================================== */
function bindEvents() {
  dom.btnWalk.addEventListener("click", () => startExperience("free"));
  dom.btnTour.addEventListener("click", () => startExperience("tour"));

  window.addEventListener("resize", onResize);

  dom.canvas.addEventListener("click", (e) => {
    if (!app.started) return;
    if (app.overlayOpen || app.endingShown) return;
    if (app.mode === "free" && !isMobile() && document.pointerLockElement !== dom.canvas) {
      dom.canvas.requestPointerLock?.();
    }
  });

  document.addEventListener("pointerlockchange", () => {
    app.pointerLocked = document.pointerLockElement === dom.canvas;
  });

  document.addEventListener("mousemove", (e) => {
    if (app.mode !== "free" || app.overlayOpen) return;
    if (document.pointerLockElement === dom.canvas) {
      player.yaw -= e.movementX * 0.0021;
      player.pitch -= e.movementY * 0.0018;
      player.pitch = clamp(player.pitch, -1.25, 1.25);
    }
  });

  // drag-to-look fallback (also works before pointer lock)
  dom.canvas.addEventListener("pointerdown", (e) => {
    if (!app.started || app.overlayOpen || app.endingShown) return;
    if (e.pointerType === "mouse" && document.pointerLockElement === dom.canvas) return;
    if (e.target.closest(".hotspot-label")) return;
    lookDrag.active = true;
    lookDrag.id = e.pointerId;
    lookDrag.x = e.clientX;
    lookDrag.y = e.clientY;
    lookDrag.moved = 0;
    dom.canvas.setPointerCapture?.(e.pointerId);
  });
  dom.canvas.addEventListener("pointermove", (e) => {
    if (!lookDrag.active || e.pointerId !== lookDrag.id) return;
    const dx = e.clientX - lookDrag.x;
    const dy = e.clientY - lookDrag.y;
    lookDrag.x = e.clientX;
    lookDrag.y = e.clientY;
    lookDrag.moved += Math.abs(dx) + Math.abs(dy);
    if (app.mode === "free") {
      player.yaw -= dx * 0.0042;
      player.pitch -= dy * 0.0036;
      player.pitch = clamp(player.pitch, -1.25, 1.25);
    }
  });
  const endDrag = (e) => {
    if (!lookDrag.active || (e.pointerId != null && e.pointerId !== lookDrag.id)) return;
    lookDrag.active = false;
    if (e.pointerType === "mouse" && lookDrag.moved < 5 && app.mode === "free" && !isMobile()) {
      dom.canvas.requestPointerLock?.();
    }
  };
  dom.canvas.addEventListener("pointerup", endDrag);
  dom.canvas.addEventListener("pointercancel", endDrag);

  window.addEventListener("keydown", (e) => {
    if (!app.started) return;
    const k = e.key.toLowerCase();
    if (["w", "a", "s", "d", "shift", "e", "m", "escape"].includes(k)) {
      if (k === "m") {
        e.preventDefault();
        toggleJournal();
        return;
      }
      if (k === "e") {
        e.preventDefault();
        interact();
        return;
      }
      if (k === "escape") {
        closeOverlays();
        return;
      }
      if (app.overlayOpen) return;
      if (app.mode === "tour" && ["w", "a", "s", "d"].includes(k)) {
        switchToFree(false);
      }
      if (app.mode !== "free") return;
      keys.add(k);
      if (k === "shift") keys.add("shift");
    }
  });
  window.addEventListener("keyup", (e) => {
    keys.delete(e.key.toLowerCase());
  });

  dom.chapterClose.addEventListener("click", hideChapterCard);
  dom.chapterMore.addEventListener("click", () => {
    openJournal("notes");
  });

  dom.btnJournal.addEventListener("click", () => toggleJournal());
  dom.journalClose.addEventListener("click", closeJournal);
  dom.journal.addEventListener("click", (e) => {
    if (e.target === dom.journal) closeJournal();
  });
  dom.tabRoute.addEventListener("click", () => switchJournalTab("route"));
  dom.tabNotes.addEventListener("click", () => switchJournalTab("notes"));

  dom.hotspotClose.addEventListener("click", closeHotspot);
  dom.hotspotModal.addEventListener("click", (e) => {
    if (e.target === dom.hotspotModal) closeHotspot();
  });

  dom.btnHelp.addEventListener("click", () => {
    app.overlayOpen = true;
    dom.helpPanel.classList.add("open");
    document.exitPointerLock?.();
  });
  dom.helpClose.addEventListener("click", () => {
    dom.helpPanel.classList.remove("open");
    app.overlayOpen = false;
  });
  dom.helpPanel.addEventListener("click", (e) => {
    if (e.target === dom.helpPanel) {
      dom.helpPanel.classList.remove("open");
      app.overlayOpen = false;
    }
  });

  dom.btnAudio.addEventListener("click", () => {
    const on = !ambience.enabled;
    ambience.setEnabled(on);
    dom.audioGlyph.classList.toggle("muted", !on);
    showToast(on ? "声音已开启" : "声音已关闭");
  });

  dom.btnFullscreen.addEventListener("click", () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
    else document.exitFullscreen?.();
  });

  dom.btnMode.addEventListener("click", () => {
    if (app.mode === "tour") switchToFree(true);
    else if (app.mode === "free") switchToTour();
  });

  dom.btnReturn.addEventListener("click", () => {
    hideEnding();
    setModeFreeAtEnd();
  });
  dom.btnRestart.addEventListener("click", () => {
    hideEnding(true);
  });

  window.addEventListener("blur", () => keys.clear());
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) keys.clear();
  });

  setupMobile();
}

function setupMobile() {
  const stick = dom.joystick;
  const knob = stick.querySelector("i");
  const start = (e) => {
    joystick.active = true;
    joystick.id = e.pointerId;
    const r = stick.getBoundingClientRect();
    joystick.sx = r.left + r.width / 2;
    joystick.sy = r.top + r.height / 2;
    move(e);
    stick.setPointerCapture?.(e.pointerId);
  };
  const move = (e) => {
    if (!joystick.active) return;
    let dx = e.clientX - joystick.sx;
    let dy = e.clientY - joystick.sy;
    const max = 32;
    const len = Math.hypot(dx, dy);
    if (len > max) { dx = (dx / len) * max; dy = (dy / len) * max; }
    joystick.x = dx / max;
    joystick.y = dy / max;
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
  };
  const end = () => {
    joystick.active = false;
    joystick.x = joystick.y = 0;
    knob.style.transform = "";
  };
  stick.addEventListener("pointerdown", start);
  stick.addEventListener("pointermove", move);
  stick.addEventListener("pointerup", end);
  stick.addEventListener("pointercancel", end);
  dom.mobileInteract.addEventListener("click", () => interact());
  const lookBtn = document.querySelector("#btn-mobile-look");
  lookBtn?.addEventListener("click", () => showToast("在画面上拖动手指，即可环顾四周"));
}

function isMobile() {
  return window.matchMedia("(max-width: 860px)").matches;
}

function adaptMobileCopy() {
  if (!isMobile()) return;
  const walkSub = dom.btnWalk.querySelector("span");
  const tourSub = dom.btnTour.querySelector("span");
  if (walkSub) walkSub.textContent = "自由漫游 · 摇杆 + 拖动";
  if (tourSub) tourSub.textContent = "自动导览 · 约三分钟";
  const tip = document.querySelector(".intro-tip");
  if (tip) tip.innerHTML = '拖动画面环顾 &nbsp;·&nbsp; 左侧摇杆行走 &nbsp;·&nbsp; 点「察看」看细节';
}

/* ================================================================== */
/* start / modes                                                      */
/* ================================================================== */
function startExperience(mode) {
  ambience.resume();
  ambience.setEnabled(true);
  dom.intro.classList.add("is-leaving");
  setTimeout(() => dom.intro.classList.add("hidden"), 1100);
  dom.hud.classList.remove("is-hidden");
  dom.mobileUI.classList.add("active");
  app.started = true;

  if (mode === "tour") {
    app.mode = "tour";
    tour.t = 0.003;
    tour.pause = 0;
    tour.active = true;
    tour.look.copy(tourAhead(0.003));
    updateTourCamera(1);
    setModeUI();
    showToast("随波入源 · 可随时接管脚步");
  } else {
    app.mode = "free";
    resetPlayer(0.004, -0.06);
    updateCameraFromPlayer();
    setModeUI();
    if (!isMobile()) {
      setTimeout(() => dom.canvas.requestPointerLock?.(), 240);
    }
    showToast(isMobile() ? "左侧摇杆行走 · 拖动画面环顾" : "WASD 行走 · 鼠标环顾 · E 察看");
  }
  app.visited.clear();
  updateJournalStates();
  setTimeout(() => {
    if (!app.endingShown && app.currentChapter === 0) triggerChapter(0, true);
  }, 1500);
  setTimeout(() => {
    dom.quoteCard.classList.add("show");
  }, 2200);
}

function setModeUI() {
  const auto = app.mode === "tour";
  dom.btnMode.innerHTML = auto ? "<span>接管</span>" : "<span>自动</span>";
  dom.modeStatus.classList.toggle("auto", auto);
  dom.modeLabel.textContent = auto ? "导览" : "漫游";
}

function switchToFree(requestLock = true) {
  if (app.mode !== "tour") return;
  app.mode = "free";
  tour.active = false;
  const pos = camera.position.clone();
  player.pos.set(pos.x, groundHeight(pos.x, pos.z), pos.z);
  player.footY = player.pos.y;
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  player.yaw = Math.atan2(-dir.x, -dir.z);
  player.pitch = Math.asin(clamp(dir.y, -1, 1));
  player.vel.set(0, 0, 0);
  updateCameraFromPlayer();
  setModeUI();
  showToast("已接管脚步");
  if (requestLock && !isMobile()) setTimeout(() => dom.canvas.requestPointerLock?.(), 120);
}

function switchToTour() {
  if (app.mode !== "free") return;
  app.mode = "tour";
  tour.active = true;
  tour.pause = 0;
  document.exitPointerLock?.();
  // nearest point on the route
  let bestT = 0, bestD = Infinity;
  for (let i = 0; i <= 300; i++) {
    const t = i / 300;
    const p = routeCurve.getPoint(t);
    const d = (p.x - camera.position.x) ** 2 + (p.z - camera.position.z) ** 2;
    if (d < bestD) { bestD = d; bestT = t; }
  }
  tour.t = bestT;
  tour.look.copy(tourAhead(tour.t));
  setModeUI();
  showToast("自动导览 · 点击「接管」可自由行走");
}

function resetPlayer(t, yawOffset = 0) {
  const p = routeCurve.getPoint(clamp(t, 0, 1));
  const tan = routeCurve.getTangent(clamp(t, 0, 1));
  player.pos.set(p.x, groundHeight(p.x, p.z), p.z);
  player.footY = player.pos.y;
  player.vel.set(0, 0, 0);
  player.yaw = Math.atan2(-tan.x, -tan.z) + yawOffset;
  player.pitch = -0.035;
  player.bob = 0;
  player.bobPhase = 0;
  keys.clear();
  updateCameraFromPlayer();
}

/* ================================================================== */
/* intro camera                                                       */
/* ================================================================== */
function setupIntroCamera() {
  camera.position.set(44, 16.5, 150);
  camera.lookAt(-3, 3.0, 55);
  app.introPhase = 0;
}

function updateIntroCamera(dt, time) {
  const drift = 0.5 - 0.5 * Math.cos(time * 0.018);
  const x = 44 - drift * 8 + Math.sin(time * 0.07) * 0.4;
  const y = 16.5 + Math.sin(time * 0.05) * 0.35;
  const z = 150 - drift * 12;
  camera.position.set(x, y, z);
  camera.lookAt(-3 + Math.sin(time * 0.045) * 0.8, 3.0, 55 + drift * 3);
}

/* ================================================================== */
/* player update                                                      */
/* ================================================================== */
function updateCameraFromPlayer() {
  camera.position.set(player.pos.x, player.footY + player.height + player.bob, player.pos.z);
  camera.rotation.set(player.pitch, player.yaw, 0);
}

function updatePlayer(dt) {
  const touchForward = -joystick.y;
  const touchStrafe = joystick.x;
  let forward = (keys.has("w") ? 1 : 0) - (keys.has("s") ? 1 : 0) + touchForward;
  let strafe = (keys.has("d") ? 1 : 0) - (keys.has("a") ? 1 : 0) + touchStrafe;
  const inputLen = Math.hypot(forward, strafe);
  if (inputLen > 1) { forward /= inputLen; strafe /= inputLen; }
  player.moving = inputLen > 0.08;

  const running = keys.has("shift");
  const speed = running ? 6.4 : 3.25;
  const sin = Math.sin(player.yaw);
  const cos = Math.cos(player.yaw);
  const fx = -sin, fz = -cos;
  const rx = cos, rz = -sin;
  const targetX = (fx * forward + rx * strafe) * speed;
  const targetZ = (fz * forward + rz * strafe) * speed;
  const damp = 1 - Math.exp(-dt * 9);
  player.vel.x = lerp(player.vel.x, targetX, damp);
  player.vel.z = lerp(player.vel.z, targetZ, damp);

  if (!player.moving) {
    player.vel.x *= Math.max(0, 1 - dt * 7);
    player.vel.z *= Math.max(0, 1 - dt * 7);
  }

  const dx = player.vel.x * dt;
  const dz = player.vel.z * dt;
  tryMove(dx, dz);

  // constrain inside the tunnel
  if (player.pos.z < 34 && player.pos.z > -30) {
    const maxX = 2.35;
    player.pos.x = clamp(player.pos.x, -maxX, maxX);
  }

  const gh = groundHeight(player.pos.x, player.pos.z);
  player.footY = lerp(player.footY, gh, 1 - Math.exp(-dt * 12));
  if (player.moving) {
    player.bobPhase += dt * (running ? 11 : 7.4);
    player.bob = Math.sin(player.bobPhase) * (running ? 0.055 : 0.032);
  } else {
    player.bob *= Math.max(0, 1 - dt * 5);
  }
  updateCameraFromPlayer();
}

function tryMove(dx, dz) {
  const startX = player.pos.x;
  const startZ = player.pos.z;
  const startY = groundHeight(startX, startZ);
  const attempt = (nx, nz) => {
    if (nx < -125 || nx > 125 || nz < -178 || nz > 172) return false;
    // walls of the passage
    if (nz < 34 && nz > -30 && Math.abs(nx) > 2.7) return false;
    const nh = groundHeight(nx, nz);
    const dist = Math.hypot(nx - startX, nz - startZ) || 0.001;
    const slope = (nh - startY) / dist;
    if (slope > 1.15) return false;
    if (slope < -1.7) return false;
    for (const c of colliders) {
      const d = Math.hypot(nx - c.x, nz - c.z);
      if (d < c.radius + 0.38) return false;
    }
    return true;
  };
  if (attempt(startX + dx, startZ + dz)) {
    player.pos.x += dx;
    player.pos.z += dz;
    return;
  }
  // slide along axes
  if (attempt(startX + dx, startZ)) { player.pos.x += dx; return; }
  if (attempt(startX, startZ + dz)) { player.pos.z += dz; }
}

let colliders = [];

/* ================================================================== */
/* tour                                                               */
/* ================================================================== */
function tourAhead(t) {
  const tt = clamp(t + 0.018, 0, 0.999);
  const p = routeCurve.getPoint(tt);
  if (tt > 0.995) {
    const tan = routeCurve.getTangent(0.995);
    p.x += tan.x * 5;
    p.z += tan.z * 5;
  }
  return new THREE.Vector3(p.x, groundHeight(p.x, p.z) + 1.55, p.z);
}

function updateTourCamera(dt) {
  const len = routeCurve.getLength();
  const speed = 3.0;
  const slow = tour.pause > 0 ? 0.22 : 1;
  tour.t += (dt * speed * slow) / len;
  tour.pause = Math.max(0, tour.pause - dt);

  if (tour.t >= 1) {
    tour.t = 1;
    if (!app.endingShown) {
      app.mode = "paused";
      setTimeout(() => {
        if (!app.endingShown) showEnding();
      }, 900);
    }
  }

  const p = routeCurve.getPoint(tour.t);
  const gh = groundHeight(p.x, p.z);
  const target = new THREE.Vector3(p.x, gh + 2.0, p.z);
  // gentle lateral camera sway in the village
  const tan = routeCurve.getTangent(tour.t);
  const sideX = -tan.z, sideZ = tan.x;
  const villageAmt = smoothstep(-32, -55, p.z) * (1 - smoothstep(-140, -160, p.z));
  const sway = Math.sin(tour.t * 31) * 2.2 * villageAmt;
  target.x += sideX * sway;
  target.z += sideZ * sway;
  camera.position.lerp(target, 1 - Math.exp(-dt * 2.1));

  const look = tourAhead(tour.t);
  look.x += sideX * Math.sin(tour.t * 21) * 4.8 * villageAmt;
  look.z += sideZ * Math.sin(tour.t * 21) * 4.8 * villageAmt;
  if (p.z < 30 && p.z > -30) {
    // look toward the light at the end of the passage
    look.y += 0.2;
  }
  tour.look.lerp(look, 1 - Math.exp(-dt * 2.4));
  camera.lookAt(tour.look);

  // carry the player's logical position along for fog/audio/collision
  player.pos.set(camera.position.x, groundHeight(camera.position.x, camera.position.z), camera.position.z);
  player.footY = player.pos.y;
}

/* ================================================================== */
/* chapter logic                                                      */
/* ================================================================== */
function triggerChapter(index, force = false) {
  if (app.endingShown) return;
  if (!force && app.visited.has(index)) return;
  const ch = CHAPTERS[index];
  if (!ch) return;
  app.visited.add(index);
  app.currentChapter = index;
  showChapterCard(ch);
  updateJournalStates();
  updateObjective();
  updatePlaceTag(ch.place);
  if (app.mode === "tour") tour.pause = 5.2;
  if (index === 11 && !app.endingShown) {
    clearTimeout(app.endingTimer);
    app.endingTimer = setTimeout(() => {
      if (app.currentChapter === 11 && !app.endingShown) showEnding();
    }, 3800);
  }
}

function showChapterCard(ch) {
  dom.chapterNo.textContent = ch.no;
  dom.chapterKicker.textContent = ch.kicker;
  dom.chapterTitle.textContent = ch.title;
  dom.chapterQuote.textContent = ch.quote;
  dom.chapterNote.textContent = ch.note;
  dom.chapterPlace.textContent = ch.place;
  dom.chapterCard.classList.add("show");
  dom.quoteText.textContent = ch.quote;
  dom.quoteCard.classList.add("show");
  clearTimeout(app.chapterTimer);
  app.chapterTimer = setTimeout(() => hideChapterCard(), 11500);
  clearTimeout(app.quoteTimer);
  app.quoteTimer = setTimeout(() => dom.quoteCard.classList.remove("show"), 16000);
}

function hideChapterCard() {
  dom.chapterCard.classList.remove("show");
}

function updateObjective() {
  let next = null;
  for (let i = 0; i < CHAPTERS.length; i++) {
    if (!app.visited.has(i)) { next = CHAPTERS[i]; break; }
  }
  if (!next) {
    dom.objLabel.textContent = "尾声";
    dom.objDist.textContent = "后遂无问津者";
    return;
  }
  dom.objLabel.textContent = next.objective;
  const dist = Math.hypot(camera.position.x - next.at[0], camera.position.z - next.at[1]);
  let text;
  if (dist < 8) text = "就在近前";
  else if (dist < 32) text = `${Math.max(1, Math.round(dist * 1.4))} 步 · 在前`;
  else text = `${next.place} · 约 ${Math.round(dist * 1.4)} 步`;
  dom.objDist.textContent = text;
}

function updatePlaceTag(place) {
  const ch = CHAPTERS.find((c) => c.place === place);
  if (ch) {
    dom.placeIndex.textContent = ch.no;
    dom.placeName.textContent = place;
  }
}

let lastZone = "";
function updateZone() {
  const z = camera.position.z;
  let zone;
  if (z > 125) zone = ["壹", "武陵溪"];
  else if (z > 50) zone = ["贰", "桃花林"];
  else if (z > 30) zone = ["叁", "水源山口"];
  else if (z > -28) zone = ["肆", "山腹石隙"];
  else if (z > -52) zone = ["伍", "桃源村口"];
  else if (z > -106) zone = ["陆", "阡陌田畴"];
  else if (z > -150) zone = ["柒", "村中人家"];
  else zone = ["捌", "溪山尽处"];
  if (zone[1] !== lastZone) {
    lastZone = zone[1];
    dom.placeIndex.textContent = zone[0];
    dom.placeName.textContent = zone[1];
  }
}

function checkChapterProximity() {
  if (!app.started || app.overlayOpen || app.endingShown) return;
  const nextIndex = CHAPTERS.findIndex((_, i) => !app.visited.has(i));
  if (nextIndex < 0) return;
  const ch = CHAPTERS[nextIndex];
  const dist = Math.hypot(camera.position.x - ch.at[0], camera.position.z - ch.at[1]);
  if (dist < 12) triggerChapter(nextIndex);
}

/* ================================================================== */
/* overlays                                                           */
/* ================================================================== */
function toggleJournal() {
  if (dom.journal.classList.contains("open")) closeJournal();
  else openJournal("route");
}

function openJournal(tab = "route") {
  if (!app.started) return;
  app.overlayOpen = true;
  document.exitPointerLock?.();
  hideChapterCard();
  dom.journal.classList.add("open");
  switchJournalTab(tab);
  updateJournalStates();
}

function closeJournal() {
  dom.journal.classList.remove("open");
  app.overlayOpen = dom.hotspotModal.classList.contains("open") || dom.helpPanel.classList.contains("open");
  if (!app.overlayOpen && app.mode === "free" && !isMobile()) {
    setTimeout(() => dom.canvas.requestPointerLock?.(), 150);
  }
}

function switchJournalTab(tab) {
  const route = tab === "route";
  dom.tabRoute.classList.toggle("active", route);
  dom.tabNotes.classList.toggle("active", !route);
  dom.tabRoute.setAttribute("aria-selected", String(route));
  dom.tabNotes.setAttribute("aria-selected", String(!route));
  dom.routePanel.classList.toggle("active", route);
  dom.notesPanel.classList.toggle("active", !route);
}

function teleportToChapter(index) {
  const ch = CHAPTERS[index];
  if (!ch) return;
  closeJournal();
  hideChapterCard();
  if (dom.ending.classList.contains("open")) {
    dom.ending.classList.remove("open");
    app.endingShown = false;
  }
  app.mode = "free";
  tour.active = false;
  clearTimeout(app.endingTimer);
  for (let i = 0; i <= index; i++) app.visited.add(i);
  setModeUI();
  resetPlayerAt(ch.at[0], ch.at[1], ch.heading);
  triggerChapter(index, true);
  if (!isMobile()) setTimeout(() => dom.canvas.requestPointerLock?.(), 400);
  showToast(`已至 · ${ch.place}`);
}

function resetPlayerAt(x, z, heading = 0) {
  player.pos.set(x, groundHeight(x, z), z);
  player.footY = player.pos.y;
  player.vel.set(0, 0, 0);
  player.yaw = heading;
  player.pitch = -0.03;
  player.bob = 0;
  keys.clear();
  updateCameraFromPlayer();
}

function openHotspot(h) {
  app.overlayOpen = true;
  document.exitPointerLock?.();
  hideChapterCard();
  dom.hotspotTag.textContent = h.tag;
  dom.hotspotTitle.textContent = h.title;
  dom.hotspotBody.innerHTML = h.body;
  dom.hotspotSource.textContent = h.source;
  dom.hotspotModal.classList.add("open");
}

function closeHotspot() {
  dom.hotspotModal.classList.remove("open");
  app.overlayOpen = dom.journal.classList.contains("open") || dom.helpPanel.classList.contains("open");
  if (!app.overlayOpen && app.mode === "free" && !isMobile()) {
    setTimeout(() => dom.canvas.requestPointerLock?.(), 120);
  }
}

function closeOverlays() {
  if (dom.journal.classList.contains("open")) closeJournal();
  if (dom.hotspotModal.classList.contains("open")) closeHotspot();
  if (dom.helpPanel.classList.contains("open")) {
    dom.helpPanel.classList.remove("open");
    app.overlayOpen = false;
  }
  if (dom.ending.classList.contains("open")) {
    // stay in the ending; Esc should not force a choice
  }
}

function showEnding() {
  if (app.endingShown) return;
  app.endingShown = true;
  app.mode = "paused";
  document.exitPointerLock?.();
  hideChapterCard();
  dom.ending.classList.add("open");
  dom.mobileUI.classList.remove("active");
  app.visited.add(11);
  updateJournalStates();
  updateObjective();
  ambience.setEnabled(true);
}

function hideEnding(reset = false) {
  dom.ending.classList.remove("open");
  dom.ending.classList.remove("is-leaving");
  clearTimeout(app.endingTimer);
  app.endingShown = false;
  app.mode = "free";
  dom.mobileUI.classList.add("active");
  setModeUI();
  if (reset) {
    app.visited.clear();
    updateJournalStates();
    resetPlayer(0.004, -0.06);
    updateCameraFromPlayer();
    showToast("回到溪口 · 再走一遍");
    setTimeout(() => triggerChapter(0, true), 700);
    if (!isMobile()) setTimeout(() => dom.canvas.requestPointerLock?.(), 300);
  }
}

function setModeFreeAtEnd() {
  const ch = CHAPTERS[11];
  app.currentChapter = 11;
  app.visited.add(11);
  resetPlayerAt(ch.at[0], ch.at[1], Math.PI);
  showChapterCard(ch);
  updateJournalStates();
  updateObjective();
  if (!isMobile()) setTimeout(() => dom.canvas.requestPointerLock?.(), 250);
  showToast("你留在了村中");
}

/* ================================================================== */
/* interactions                                                       */
/* ================================================================== */
let nearbyHotspot = null;

function updateInteractions() {
  if (!app.started || app.overlayOpen || app.endingShown) {
    nearbyHotspot = null;
    dom.interactPrompt.classList.remove("show");
    dom.crosshair.classList.remove("active");
    hotspotLabels.forEach((l) => l.el.classList.remove("show"));
    return;
  }
  const camPos = camera.position;
  const camDir = new THREE.Vector3();
  camera.getWorldDirection(camDir);
  let best = null, bestScore = Infinity;
  let nearestAny = null, nearestScore = Infinity;
  for (let i = 0; i < hotspotAnchors.length; i++) {
    const anchor = hotspotAnchors[i];
    const h = anchor.userData.hotspot;
    const dx = anchor.position.x - camPos.x;
    const dz = anchor.position.z - camPos.z;
    const dist = Math.hypot(dx, dz);
    const range = Math.max(6.5, h.radius);
    if (dist < nearestScore && dist < range * 0.95) {
      nearestScore = dist;
      nearestAny = h;
    }
    if (dist > range) {
      hotspotLabels[i].el.classList.remove("show");
      continue;
    }
    const dot = (dx * camDir.x + dz * camDir.z) / (dist || 1);
    const visible = dot > 0.1 && camDir.y > -0.7;
    const label = hotspotLabels[i];
    label.el.classList.toggle("show", visible);
    if (visible) {
      tmpVec.copy(anchor.position).project(camera);
      label.el.style.left = `${(tmpVec.x * 0.5 + 0.5) * window.innerWidth}px`;
      label.el.style.top = `${(-tmpVec.y * 0.5 + 0.5) * window.innerHeight}px`;
      label.el.style.opacity = String(clamp(1.2 - dist / range, 0.15, 1));
    }
    if (visible && dist < range * 0.7) {
      const score = dist;
      if (score < bestScore) { bestScore = score; best = h; }
    }
  }
  // also hide labels that were not projected this frame
  hotspotLabels.forEach((l) => { if (!l.el.classList.contains("show")) l.el.style.opacity = "0"; });

  nearbyHotspot = best || nearestAny;
  if (best) {
    dom.interactPrompt.classList.add("show");
    dom.interactLabel.textContent = `察看 · ${best.title}`;
    dom.crosshair.classList.add("active");
  } else {
    dom.interactPrompt.classList.remove("show");
    dom.crosshair.classList.remove("active");
  }
}

function interact() {
  if (app.overlayOpen || app.endingShown) return;
  if (nearbyHotspot) openHotspot(nearbyHotspot);
  else showToast("四下看看，走近些再察看");
}

/* ================================================================== */
/* atmosphere / effects                                               */
/* ================================================================== */
function caveAmountAt(x, z) {
  const inZ = smoothstep(31, 24, z) * smoothstep(-29, -22, z);
  const inX = 1 - smoothstep(4.6, 7.5, Math.abs(x));
  return clamp(inZ * inX, 0, 1);
}

function updateAtmosphere(dt) {
  const f = caveAmountAt(camera.position.x, camera.position.z);
  app.caveFactor = lerp(app.caveFactor, f, 1 - Math.exp(-dt * 3.2));
  const cf = app.caveFactor;
  scene.fog.color.copy(baseFog).lerp(caveFog, cf);
  scene.fog.density = lerp(0.0027, 0.022, cf);
  scene.environmentIntensity = lerp(0.55, 0.05, cf);
  const introBoost = app.started ? 0 : 0.04;
  renderer.toneMappingExposure = lerp(1.0 + introBoost, 0.92, cf);
  bloom.strength = lerp(0.1, 0.08, cf);
  lighting.hemi.intensity = lerp(0.22, 0.3, cf);
  lighting.ambient.intensity = lerp(0.04, 0.09, cf);
  lighting.sun.intensity = lerp(2.7, 0.25, cf);
  lighting.fill.intensity = lerp(0.15, 0.08, cf);
  water.update(app.time, scene.fog.color, scene.fog.density);
  sky.position.copy(camera.position);
  cave.update(app.time, cf);
  if (cave.veil) {
    const d = Math.abs(camera.position.z - cave.veil.position.z);
    cave.veil.material.opacity = clamp((d - 18) / 20, 0, 0.94);
    cave.veil.visible = cave.veil.material.opacity > 0.02;
  }
  ambience.update(dt, {
    streamDistance: distanceToStream(camera.position.x, camera.position.z),
    caveFactor: cf,
    wind: 0.075,
  });
}

/* ================================================================== */
/* toast                                                              */
/* ================================================================== */
let toastTimer = null;
function showToast(text) {
  dom.toast.textContent = text;
  dom.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => dom.toast.classList.remove("show"), 2600);
}

/* ================================================================== */
/* resize                                                             */
/* ================================================================== */
function onResize() {
  if (!camera) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, window.innerWidth < 860 ? 1.0 : 1.65));
  composer.setSize(window.innerWidth, window.innerHeight);
  composer.setPixelRatio(renderer.getPixelRatio());
  if (gtao) gtao.setSize(window.innerWidth, window.innerHeight);
  if (smaa) smaa.setSize(window.innerWidth, window.innerHeight);
}

/* ================================================================== */
/* main loop                                                          */
/* ================================================================== */
let lastFrameTime = performance.now();
function loop(now = performance.now()) {
  requestAnimationFrame(loop);
  const dt = Math.min((now - lastFrameTime) / 1000, 0.05);
  lastFrameTime = now;
  app.time += dt;
  const time = app.time;

  if (!app.started) {
    updateIntroCamera(dt, time);
    app.mode = "free";
  } else if (app.mode === "free") {
    if (!app.overlayOpen && !app.endingShown) updatePlayer(dt);
    else updateCameraFromPlayer();
  } else if (app.mode === "tour") {
    updateTourCamera(dt);
  }

  if (village) village.update(time, dt);
  if (peachGrove?.update) peachGrove.update(camera.position, time);
  if (petals) petals.update(time);
  if (floatingPetals) floatingPetals.update(time);
  if (motes) motes.update(time);
  if (birds) birds.update(time);
  if (mist) mist.update(time, camera.position);
  if (clouds) {
    clouds.children.forEach((c, i) => {
      c.position.x += Math.sin(time * 0.01 + i) * 0.002;
    });
  }
  if (lighting) lighting.update(camera.position);
  if (sky) sky.position.copy(camera.position);
  updateAtmosphere(dt);

  // hotspot markers
  for (const a of hotspotAnchors) {
    const s = a.userData.sprite;
    const r = a.userData.ring;
    const puls = 0.5 + 0.5 * Math.sin(time * 1.7 + a.position.x * 0.6);
    s.material.opacity = 0.18 + puls * 0.3;
    s.scale.setScalar(0.62 + puls * 0.2);
    r.material.opacity = 0.12 + puls * 0.12;
    r.rotation.z = time * 0.25;
  }

  if (app.started) {
    checkChapterProximity();
    updateInteractions();
    updateObjective();
    updateZone();
  }

  composer.render();
}

/* ================================================================== */
/* debug API + launch                                                 */
/* ================================================================== */
window.__TAOHUA__ = {
  get app() { return app; },
  get player() { return player; },
  get camera() { return camera; },
  get scene() { return scene; },
  get tour() { return tour; },
  get renderer() { return renderer; },
  get assets() { return assets; },
  get composer() { return composer; },
  get gtao() { return gtao; },
  setTour(t) { tour.t = clamp(t, 0, 0.999); tour.look.copy(tourAhead(tour.t)); },
  teleport(index) { teleportToChapter(index); },
  teleportTo(x, z, yaw = 0) { resetPlayerAt(x, z, yaw); },
  start(mode = "free") { startExperience(mode); },
  showChapter(index) { triggerChapter(index, true); },
  setTime(t) { app.time = t; },
};

boot();
