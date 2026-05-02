import * as THREE from 'three';
import { config } from './config.js';
import type { Track } from './track.js';
import type { Assets } from './assets.js';
import type { Kart, ItemName } from './kart.js';
import type { Hud } from './hud.js';

const ITEM_TYPES: ItemName[] = ['boost', 'banana', 'missile', 'shield'];

interface ItemBox {
  position: THREE.Vector3;
  mesh: THREE.Object3D;
  alive: boolean;
  respawnIn: number;
}

interface Hazard {
  owner: Kart;
  position: THREE.Vector3;
  mesh: THREE.Object3D;
  life: number;
  spawnGrace: number;
}

interface Missile {
  owner: Kart;
  position: THREE.Vector3;
  mesh: THREE.Object3D;
  waypointIndex: number;
  life: number;
}

export class ItemSystem {
  scene: THREE.Scene;
  assets: Assets;
  track: Track;
  itemBoxes: ItemBox[] = [];
  hazards: Hazard[] = [];
  missiles: Missile[] = [];
  itemBoxTemplate: THREE.Group;

  constructor(scene: THREE.Scene, assets: Assets, track: Track) {
    this.scene = scene;
    this.assets = assets;
    this.track = track;
    this.itemBoxTemplate = assets.props.itemBox;
    this.spawnItemBoxes();
  }

  reset(): void {
    for (const b of this.itemBoxes) {
      b.alive = true;
      b.respawnIn = 0;
      b.mesh.visible = true;
    }
    for (const h of this.hazards) this.scene.remove(h.mesh);
    this.hazards = [];
    for (const m of this.missiles) this.scene.remove(m.mesh);
    this.missiles = [];
  }

  spawnItemBoxes(): void {
    for (const spawn of this.track.itemBoxSpawns) {
      const mesh = this.itemBoxTemplate.clone();
      mesh.scale.setScalar(1.2);
      mesh.position.copy(spawn.position);
      mesh.position.y = 1.0;
      tintBox(mesh, 0xffe04d);
      this.scene.add(mesh);
      this.itemBoxes.push({
        position: spawn.position.clone(),
        mesh, alive: true, respawnIn: 0,
      });
    }
  }

  update(dt: number, allKarts: Kart[], hud: Hud): void {
    for (const box of this.itemBoxes) {
      box.mesh.rotation.y += dt * 1.5;
      box.mesh.position.y = 1.0 + Math.sin(performance.now() * 0.003 + box.position.x) * 0.15;
      if (!box.alive) {
        box.respawnIn -= dt;
        if (box.respawnIn <= 0) {
          box.alive = true;
          box.mesh.visible = true;
        }
      } else {
        for (const kart of allKarts) {
          const dx = kart.position.x - box.position.x;
          const dz = kart.position.z - box.position.z;
          if (dx * dx + dz * dz < 2.4 * 2.4) {
            if (!kart.heldItem) {
              kart.giveItem(pickItemForRank(kart, allKarts));
            }
            box.alive = false;
            box.mesh.visible = false;
            box.respawnIn = config.items.boxRespawnSeconds;
            break;
          }
        }
      }
    }

    for (const kart of allKarts) {
      if (kart.useItemRequested && kart.heldItem) {
        this.applyUse(kart);
      }
      kart.useItemRequested = false;
    }

    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const h = this.hazards[i];
      h.life -= dt;
      h.mesh.rotation.y += dt * 2;
      for (const kart of allKarts) {
        if (kart === h.owner && h.spawnGrace > 0) continue;
        const dx = kart.position.x - h.position.x;
        const dz = kart.position.z - h.position.z;
        if (dx * dx + dz * dz < 1.6 * 1.6) {
          if (kart.hit('spin')) {
            if (kart.isPlayer) hud.toast('Banana hit!');
            this.scene.remove(h.mesh);
            this.hazards.splice(i, 1);
            break;
          }
        }
      }
      if (h.spawnGrace > 0) h.spawnGrace -= dt;
      if (h.life <= 0) {
        this.scene.remove(h.mesh);
        this.hazards.splice(i, 1);
      }
    }

    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const m = this.missiles[i];
      m.life -= dt;
      const targetWp = this.track.getWaypoint(m.waypointIndex);
      const dx = targetWp.x - m.position.x;
      const dz = targetWp.z - m.position.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < 3) m.waypointIndex = (m.waypointIndex + 1) % this.track.samples.length;
      const stepLen = config.items.missile.speed * dt;
      if (d > 0.001) {
        m.position.x += (dx / d) * stepLen;
        m.position.z += (dz / d) * stepLen;
      }
      m.mesh.position.copy(m.position);
      m.mesh.position.y = 0.7;
      m.mesh.rotation.y = Math.atan2(dx, dz);

      let hit = false;
      for (const kart of allKarts) {
        if (kart === m.owner) continue;
        const ddx = kart.position.x - m.position.x;
        const ddz = kart.position.z - m.position.z;
        if (ddx * ddx + ddz * ddz < 1.7 * 1.7) {
          if (kart.hit('spin')) {
            if (kart.isPlayer) hud.toast('Hit by missile!');
            hit = true;
            break;
          }
        }
      }
      if (hit || m.life <= 0) {
        this.scene.remove(m.mesh);
        this.missiles.splice(i, 1);
      }
    }
  }

  applyUse(kart: Kart): void {
    const item = kart.consumeItem();
    if (!item) return;
    if (item === 'boost') {
      kart.activateBoost(config.items.boost.multiplier - 1, config.items.boost.duration);
    } else if (item === 'shield') {
      kart.activateShield(config.items.shield.duration);
    } else if (item === 'banana') {
      this.dropBanana(kart);
    } else if (item === 'missile') {
      this.fireMissile(kart);
    }
  }

  dropBanana(kart: Kart): void {
    const fwd = kart.forward();
    const pos = kart.position.clone().addScaledVector(fwd, -2.0);
    pos.y = 0.25;
    const mesh = makeBananaMesh();
    mesh.position.copy(pos);
    mesh.rotation.y = Math.random() * Math.PI * 2;
    this.scene.add(mesh);
    this.hazards.push({
      owner: kart, position: pos, mesh, life: 30, spawnGrace: 0.6,
    });
  }

  fireMissile(kart: Kart): void {
    const ownerIdx = kart.sampleIndex || 0;
    const startWp = (ownerIdx + 6) % this.track.samples.length;
    const wrapper = makeMissileMesh();
    const startPos = kart.position.clone().addScaledVector(kart.forward(), 2);
    startPos.y = 0.7;
    wrapper.position.copy(startPos);
    this.scene.add(wrapper);
    this.missiles.push({
      owner: kart,
      position: startPos.clone(),
      mesh: wrapper,
      waypointIndex: startWp,
      life: config.items.missile.lifetime,
    });
  }
}

let bananaTemplate: THREE.Group | null = null;
function makeBananaMesh(): THREE.Group {
  if (!bananaTemplate) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.6,  0.0,    0),
      new THREE.Vector3(-0.32, 0.22,   0),
      new THREE.Vector3( 0.32, 0.22,   0),
      new THREE.Vector3( 0.6,  0.0,    0),
    ]);
    const bodyGeo = new THREE.TubeGeometry(curve, 24, 0.16, 14, false);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xffe04d, roughness: 0.45, metalness: 0.05, emissive: 0x332200,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.castShadow = true;

    const tipMat = new THREE.MeshStandardMaterial({ color: 0x4a2f15, roughness: 0.85 });
    const tipGeo = new THREE.SphereGeometry(0.16, 10, 8);
    const tipA = new THREE.Mesh(tipGeo, tipMat);
    tipA.position.copy(curve.getPoint(0));
    const tipB = new THREE.Mesh(tipGeo, tipMat);
    tipB.position.copy(curve.getPoint(1));

    const stemGeo = new THREE.CylinderGeometry(0.04, 0.06, 0.18, 6);
    const stem = new THREE.Mesh(stemGeo, tipMat);
    stem.position.set(0, 0.32, 0);
    stem.rotation.z = 0.15;

    bananaTemplate = new THREE.Group();
    bananaTemplate.add(body);
    bananaTemplate.add(tipA);
    bananaTemplate.add(tipB);
    bananaTemplate.add(stem);
  }
  return bananaTemplate.clone(true);
}

let missileTemplate: THREE.Group | null = null;
function makeMissileMesh(): THREE.Group {
  if (!missileTemplate) {
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x99aabb, metalness: 0.6, roughness: 0.3,
    });
    const warheadMat = new THREE.MeshStandardMaterial({
      color: 0xff2233, metalness: 0.4, roughness: 0.4,
    });
    const finMat = new THREE.MeshStandardMaterial({
      color: 0x778899, metalness: 0.5, roughness: 0.35,
    });
    const exhaustMat = new THREE.MeshStandardMaterial({
      color: 0xff7700, emissive: 0xff4400, emissiveIntensity: 1.2,
    });

    const fuselage = new THREE.Mesh(
      new THREE.CylinderGeometry(0.17, 0.2, 1.4, 10),
      bodyMat,
    );
    fuselage.rotation.x = Math.PI / 2;
    fuselage.castShadow = true;

    const warhead = new THREE.Mesh(
      new THREE.ConeGeometry(0.2, 0.5, 10),
      warheadMat,
    );
    warhead.rotation.x = Math.PI / 2;
    warhead.position.z = 0.95;
    warhead.castShadow = true;

    const exhaust = new THREE.Mesh(
      new THREE.SphereGeometry(0.13, 8, 6),
      exhaustMat,
    );
    exhaust.position.z = -0.75;

    const finGeo = new THREE.BoxGeometry(0.04, 0.38, 0.3);
    const fins: THREE.Mesh[] = [];
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2;
      const r = 0.2 + 0.19;
      const fin = new THREE.Mesh(finGeo, finMat);
      fin.position.set(Math.sin(angle) * r, Math.cos(angle) * r, -0.52);
      fin.rotation.z = angle;
      fin.castShadow = true;
      fins.push(fin);
    }

    missileTemplate = new THREE.Group();
    missileTemplate.add(fuselage, warhead, exhaust, ...fins);
  }
  return missileTemplate.clone(true);
}

function pickItemForRank(kart: Kart, allKarts: Kart[]): ItemName {
  const ranked = [...allKarts].sort((a, b) => (b.totalProgress || 0) - (a.totalProgress || 0));
  const pos = ranked.indexOf(kart) + 1;
  const total = ranked.length;
  const t = total > 1 ? (pos - 1) / (total - 1) : 0;
  const leader = config.items.weights.leader;
  const last = config.items.weights.last;
  const w = leader.map((lw, i) => lw + (last[i] - lw) * t);
  const sum = w.reduce((a, b) => a + b, 0);
  let r = Math.random() * sum;
  for (let i = 0; i < ITEM_TYPES.length; i++) {
    r -= w[i];
    if (r <= 0) return ITEM_TYPES[i];
  }
  return ITEM_TYPES[ITEM_TYPES.length - 1];
}

function tintBox(model: THREE.Object3D, color: number): void {
  const c = new THREE.Color(color);
  model.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    const original = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    const m = (original as THREE.MeshStandardMaterial).clone();
    m.color = c.clone();
    m.emissive = new THREE.Color(0x222200);
    m.metalness = 0.3;
    m.roughness = 0.4;
    mesh.material = m;
  });
}
