import * as THREE from 'three';
import { config } from './config.js';

const ITEM_TYPES = ['boost', 'banana', 'missile', 'shield'];

export class ItemSystem {
  constructor(scene, assets, track) {
    this.scene = scene;
    this.assets = assets;
    this.track = track;
    this.itemBoxes = [];
    this.hazards = [];
    this.missiles = [];

    this.itemBoxTemplate = assets.props.itemBox;
    this.spawnItemBoxes();
  }

  reset() {
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

  spawnItemBoxes() {
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

  update(dt, allKarts, hud) {
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

  applyUse(kart) {
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

  dropBanana(kart) {
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

  fireMissile(kart) {
    const ownerIdx = kart.sampleIndex || 0;
    const startWp = (ownerIdx + 6) % this.track.samples.length;
    const mesh = new THREE.Mesh(
      new THREE.ConeGeometry(0.4, 1.6, 8),
      new THREE.MeshStandardMaterial({ color: 0xff3344, emissive: 0x661111 })
    );
    mesh.rotation.x = Math.PI / 2;
    const wrapper = new THREE.Group();
    wrapper.add(mesh);
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

let bananaTemplate = null;
function makeBananaMesh() {
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

function pickItemForRank(kart, allKarts) {
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

function tintBox(model, color) {
  const c = new THREE.Color(color);
  model.traverse((node) => {
    if (node.isMesh && node.material) {
      const m = node.material.clone();
      m.color = c.clone();
      m.emissive = new THREE.Color(0x222200);
      m.metalness = 0.3;
      m.roughness = 0.4;
      node.material = m;
    }
  });
}
