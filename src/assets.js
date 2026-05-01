import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const loader = new GLTFLoader();

function loadGLB(url) {
  return new Promise((resolve, reject) => {
    loader.load(url, (gltf) => resolve(gltf.scene), undefined, reject);
  });
}

function setupModel(model, { receiveShadow = false, castShadow = true } = {}) {
  model.traverse((c) => {
    if (c.isMesh) {
      c.castShadow = castShadow;
      c.receiveShadow = receiveShadow;
      if (c.material) {
        c.material.metalness = 0.1;
        c.material.roughness = 0.7;
      }
    }
  });
  return model;
}

const KART_FILES = {
  player: '/models/cars/kart-oobi.glb',
  ai: [
    '/models/cars/kart-oodi.glb',
    '/models/cars/kart-ooli.glb',
    '/models/cars/kart-oopi.glb',
    '/models/cars/kart-oozi.glb',
  ],
};

const PROP_FILES = {
  itemBox: '/models/cars/box.glb',
  barrierRed: '/models/racing/barrierRed.glb',
  barrierWhite: '/models/racing/barrierWhite.glb',
  flagCheckers: '/models/racing/flagCheckers.glb',
  grandStand: '/models/racing/grandStand.glb',
  billboard: '/models/racing/billboard.glb',
  tree: '/models/racing/treeLarge.glb',
  treeSmall: '/models/racing/treeSmall.glb',
};

export async function loadAssets(onProgress) {
  const tasks = [];
  const total = 1 + KART_FILES.ai.length + Object.keys(PROP_FILES).length;
  let done = 0;
  const tick = () => { done++; if (onProgress) onProgress(done / total); };

  const playerKartP = loadGLB(KART_FILES.player).then(m => { tick(); return setupModel(m); });
  tasks.push(playerKartP);

  const aiKartPs = KART_FILES.ai.map(url =>
    loadGLB(url).then(m => { tick(); return setupModel(m); })
  );
  tasks.push(...aiKartPs);

  const propEntries = Object.entries(PROP_FILES);
  const propPs = propEntries.map(([key, url]) =>
    loadGLB(url).then(m => { tick(); return [key, setupModel(m)]; })
  );
  tasks.push(...propPs);

  const [playerKart, ...rest] = await Promise.all([playerKartP, ...aiKartPs, ...propPs]);
  const aiKarts = rest.slice(0, KART_FILES.ai.length);
  const propResults = rest.slice(KART_FILES.ai.length);
  const props = Object.fromEntries(propResults);

  return {
    karts: { player: playerKart, ai: aiKarts },
    props,
  };
}
