import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const loader = new GLTFLoader();

function loadGLB(url: string): Promise<THREE.Group> {
  return new Promise((resolve, reject) => {
    loader.load(url, (gltf) => resolve(gltf.scene), undefined, reject);
  });
}

interface SetupOpts {
  receiveShadow?: boolean;
  castShadow?: boolean;
}

function setupModel(model: THREE.Group, { receiveShadow = false, castShadow = true }: SetupOpts = {}): THREE.Group {
  model.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) {
      const mesh = c as THREE.Mesh;
      mesh.castShadow = castShadow;
      mesh.receiveShadow = receiveShadow;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        if (m && 'metalness' in m) (m as THREE.MeshStandardMaterial).metalness = 0.1;
        if (m && 'roughness' in m) (m as THREE.MeshStandardMaterial).roughness = 0.7;
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
} as const;

const PROP_FILES = {
  itemBox: '/models/cars/box.glb',
  barrierRed: '/models/racing/barrierRed.glb',
  barrierWhite: '/models/racing/barrierWhite.glb',
  flagCheckers: '/models/racing/flagCheckers.glb',
  grandStand: '/models/racing/grandStand.glb',
  billboard: '/models/racing/billboard.glb',
  tree: '/models/racing/treeLarge.glb',
  treeSmall: '/models/racing/treeSmall.glb',
} as const;

export type PropName = keyof typeof PROP_FILES;

export interface Assets {
  karts: { player: THREE.Group; ai: THREE.Group[] };
  props: Record<PropName, THREE.Group>;
}

export async function loadAssets(onProgress?: (p: number) => void): Promise<Assets> {
  const total = 1 + KART_FILES.ai.length + Object.keys(PROP_FILES).length;
  let done = 0;
  const tick = () => { done++; if (onProgress) onProgress(done / total); };

  const playerKartP = loadGLB(KART_FILES.player).then(m => { tick(); return setupModel(m); });
  const aiKartPs = KART_FILES.ai.map(url =>
    loadGLB(url).then(m => { tick(); return setupModel(m); })
  );

  const propEntries = Object.entries(PROP_FILES) as [PropName, string][];
  const propPs = propEntries.map(([key, url]) =>
    loadGLB(url).then(m => { tick(); return [key, setupModel(m)] as const; })
  );

  const [playerKart, aiKarts, propResults] = await Promise.all([
    playerKartP,
    Promise.all(aiKartPs),
    Promise.all(propPs),
  ]);

  const props = Object.fromEntries(propResults) as Record<PropName, THREE.Group>;

  return {
    karts: { player: playerKart, ai: aiKarts },
    props,
  };
}
