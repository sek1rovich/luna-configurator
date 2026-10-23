// Shared 3D "photo studio": renderer, lights, environment, tweens and upholstery materials.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MATERIALS, LEG_FINISHES, byId } from './config.js';
import { createTextures } from './textures.js';

export const lerp = THREE.MathUtils.lerp;
export const deg = THREE.MathUtils.degToRad;

/* ------------------------------------------------------------------ tweens */

export const ease = {
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inCubic: (t) => t * t * t,
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outQuart: (t) => 1 - Math.pow(1 - t, 4),
  outBack: (t) => 1 + 2.4 * Math.pow(t - 1, 3) + 1.4 * Math.pow(t - 1, 2),
};
export const tweens = new Set();
export function tween({ duration = 600, delay = 0, easing = ease.outCubic, update, complete }) {
  const t = { start: performance.now() + delay, duration, easing, update, complete };
  tweens.add(t);
  return t;
}
export function runTweens(now) {
  for (const t of tweens) {
    const k = (now - t.start) / t.duration;
    if (k < 0) continue;
    const c = Math.min(1, k);
    t.update(t.easing(c));
    if (c === 1) {
      tweens.delete(t);
      t.complete?.();
    }
  }
}

/* ------------------------------------------------------------------ studio */

let sharedTex = null;

export function createStudio(container, { shadows = true, envIntensity = 0.7, ground = true } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.shadowMap.enabled = shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container?.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = envIntensity;

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60);
  camera.position.set(4, 2.4, 6);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.enablePan = false;
  controls.minDistance = 1.4;
  controls.maxDistance = 10;
  controls.minPolarAngle = deg(20);
  controls.maxPolarAngle = deg(88);
  controls.autoRotateSpeed = 0.65;
  controls.target.set(0, 0.4, 0);

  const key = new THREE.DirectionalLight(0xffffff, 2.3);
  key.position.set(-2.4, 4.4, 3.2);
  key.castShadow = shadows;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: 0.5, far: 14 });
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 5;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xfff0dc, 0.9);
  rim.position.set(3.5, 2.5, -3);
  scene.add(rim);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xe6dccd, 0.45));

  // textures are expensive to generate, so every studio on the page shares one set
  sharedTex ??= createTextures(renderer, MATERIALS);
  const tex = sharedTex;

  let contact = null;
  if (ground) {
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.14 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    contact = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: tex.contact, color: 0x000000, transparent: true, opacity: 0.5, depthWrite: false, toneMapped: false }),
    );
    contact.rotation.x = -Math.PI / 2;
    contact.position.y = 0.002;
    scene.add(contact);
  }

  return { renderer, scene, camera, controls, tex, contact, key };
}

/* ------------------------------------------------------------------ materials */

const white = new THREE.Color(1, 1, 1);

export function makeMaterials(tex, { material, color, pillowColor, legFinish }) {
  const mats = {
    upholstery: new THREE.MeshPhysicalMaterial({ color }),
    pillows: new THREE.MeshPhysicalMaterial({ color: pillowColor ?? color }),
    legs: new THREE.MeshPhysicalMaterial({ color: byId(LEG_FINISHES, legFinish).color }),
  };
  for (const m of Object.values(mats)) {
    m.emissive.set(0xffffff);
    m.emissiveIntensity = 0;
  }
  applyFabric(mats.upholstery, tex, material);
  applyFabric(mats.pillows, tex, material);
  applyLegFinish(mats.legs, tex, legFinish);
  return mats;
}

export function applyFabric(mat, tex, materialId) {
  const def = byId(MATERIALS, materialId);
  mat.normalMap = tex.normals[def.id];
  mat.normalScale.set(def.normal, def.normal);
  mat.roughness = def.roughness;
  mat.sheen = def.sheen;
  mat.sheenRoughness = def.sheenRoughness;
  mat.clearcoat = def.clearcoat;
  mat.clearcoatRoughness = 0.55;
  mat.userData.sheenTint = def.sheenTint;
  syncSheen(mat);
  mat.needsUpdate = true;
}

export function syncSheen(mat) {
  mat.sheenColor.copy(mat.color).lerp(white, mat.userData.sheenTint ?? 0.3);
}

export function applyLegFinish(mat, tex, finishId) {
  const def = byId(LEG_FINISHES, finishId);
  const metal = def.type === 'metal';
  mat.metalness = metal ? 1 : 0;
  mat.roughness = def.roughness;
  mat.map = metal ? null : tex.wood;
  mat.clearcoat = metal ? 0 : 0.35;
  mat.clearcoatRoughness = 0.4;
  mat.needsUpdate = true;
}

export function tweenColor(mat, hex, duration = 700) {
  const from = mat.color.clone();
  const to = new THREE.Color(hex);
  return tween({
    duration, easing: ease.inOutCubic,
    update: (k) => {
      mat.color.lerpColors(from, to, k);
      syncSheen(mat);
    },
  });
}

export function disposeGroup(g) {
  g.parent?.remove(g);
  const seen = new Set();
  g.traverse((o) => {
    if (o.geometry && !seen.has(o.geometry)) {
      seen.add(o.geometry);
      o.geometry.dispose();
    }
  });
}
