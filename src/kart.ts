import * as THREE from 'three';
import { config } from './config.js';
import type { KartInput } from './input.js';
import type { Track } from './track.js';

export type ItemName = 'boost' | 'banana' | 'missile' | 'shield';
export type HitKind = 'spin';

interface KartOpts {
  scene: THREE.Scene;
  model: THREE.Group;
  position: THREE.Vector3;
  heading: number;
  isPlayer: boolean;
  color: number;
}

export class Kart {
  position: THREE.Vector3;
  heading: number;
  speed = 0;
  isPlayer: boolean;
  color: number;

  driftActive = false;
  driftDir = 0;
  driftCharge = 0;
  boostTimer = 0;
  boostMultiplier = 1;
  spinTimer = 0;
  shieldTimer = 0;

  heldItem: ItemName | null = null;
  lap = -1;
  sampleIndex = 0;
  lastSampleIndex: number | null = null;
  totalProgress = 0;

  useItemRequested = false;

  // AI-only fields, attached by AIController
  aiIndex?: number;
  aiAccelBonus = 0;

  root: THREE.Group;
  body: THREE.Group;
  bodyTilt: THREE.Group;
  shieldMesh: THREE.Mesh;

  constructor({ scene, model, position, heading, isPlayer, color }: KartOpts) {
    this.position = position.clone();
    this.heading = heading;
    this.isPlayer = isPlayer;
    this.color = color;

    this.root = new THREE.Group();
    this.body = model;
    this.body.scale.setScalar(1.4);
    tintModel(this.body, color);

    this.bodyTilt = new THREE.Group();
    this.bodyTilt.add(this.body);
    this.root.add(this.bodyTilt);

    this.shieldMesh = new THREE.Mesh(
      new THREE.SphereGeometry(1.5, 16, 12),
      new THREE.MeshBasicMaterial({
        color: 0x66ddff, transparent: true, opacity: 0.35, depthWrite: false,
      })
    );
    this.shieldMesh.visible = false;
    this.root.add(this.shieldMesh);

    scene.add(this.root);
    this.syncTransform();
  }

  dispose(scene: THREE.Scene): void { scene.remove(this.root); }

  idle(_dt: number): void {
    this.syncTransform();
  }

  hit(kind: HitKind): boolean {
    if (this.shieldTimer > 0) {
      this.shieldTimer = 0;
      this.shieldMesh.visible = false;
      return false;
    }
    if (kind === 'spin') {
      this.spinTimer = config.items.banana.spinDuration;
      this.speed = Math.min(this.speed, 0);
      return true;
    }
    return false;
  }

  giveItem(name: ItemName): void {
    if (!this.heldItem) this.heldItem = name;
  }

  consumeItem(): ItemName | null {
    const item = this.heldItem;
    this.heldItem = null;
    return item;
  }

  update(dt: number, inputCtl: KartInput, track: Track): void {
    const c = config.kart;

    if (this.spinTimer > 0) {
      this.spinTimer -= dt;
      this.heading += dt * 12;
      this.speed *= 1 - dt * 4;
      if (this.spinTimer < 0) this.spinTimer = 0;
    } else {
      const accelDown = inputCtl.isDown('accel');
      const brakeDown = inputCtl.isDown('brake');
      const leftDown = inputCtl.isDown('left');
      const rightDown = inputCtl.isDown('right');
      const driftDown = inputCtl.isDown('drift');
      const itemDown = inputCtl.wasPressed('item');

      const speedRatio = Math.min(1, Math.max(0, this.speed / c.maxSpeed));
      const steerMul = THREE.MathUtils.lerp(c.steerSpeed, c.steerSpeedAtMax, speedRatio);

      const turnInput = (leftDown ? 1 : 0) + (rightDown ? -1 : 0);

      if (driftDown && Math.abs(this.speed) > 8 && turnInput !== 0) {
        if (!this.driftActive) {
          this.driftActive = true;
          this.driftDir = Math.sign(turnInput);
        }
      } else if (!driftDown && this.driftActive) {
        this.driftActive = false;
        if (this.driftCharge >= config.drift.miniTurboThreshold) {
          this.activateBoost(config.drift.miniTurboBoost, config.drift.miniTurboDuration);
        }
        this.driftCharge = 0;
      }

      const driftMul = this.driftActive ? 1.55 : 1.0;
      this.heading += turnInput * steerMul * driftMul * dt;

      if (this.driftActive) {
        this.driftCharge += dt * config.drift.chargeRate;
      }

      let accel = 0;
      if (accelDown) accel += c.accel;
      if (brakeDown) accel -= c.brakeAccel;

      this.speed += accel * dt;

      if (this.boostTimer > 0) {
        this.boostTimer -= dt;
        const target = c.maxSpeed * (1 + this.boostMultiplier);
        if (this.speed < target) this.speed += c.accel * 1.2 * dt;
      } else {
        this.boostMultiplier = 0;
      }

      const effectiveOff = track.isOffTrack(this.position) ? c.offTrackMultiplier : 1;
      const effectiveMax = c.maxSpeed * effectiveOff * (this.boostTimer > 0 ? (1 + this.boostMultiplier) : 1);
      if (this.speed > effectiveMax) this.speed = effectiveMax;
      const minSpeed = -c.reverseMaxSpeed * effectiveOff;
      if (this.speed < minSpeed) this.speed = minSpeed;

      this.speed *= 1 - c.drag * dt;

      if (itemDown) this.useItemRequested = true;
    }

    if (this.shieldTimer > 0) {
      this.shieldTimer -= dt;
      if (this.shieldTimer < 0) this.shieldTimer = 0;
      this.shieldMesh.visible = this.shieldTimer > 0;
    }

    const fwd = this.forward();
    const dx = fwd.x * this.speed * dt;
    const dz = fwd.z * this.speed * dt;
    this.position.x += dx;
    this.position.z += dz;

    this.resolveWallCollisions(track);

    this.syncTransform();
  }

  activateBoost(multiplier: number, duration: number): void {
    this.boostTimer = Math.max(this.boostTimer, duration);
    this.boostMultiplier = Math.max(this.boostMultiplier, multiplier);
  }

  activateShield(duration: number): void {
    this.shieldTimer = duration;
    this.shieldMesh.visible = true;
  }

  forward(): THREE.Vector3 {
    return new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
  }

  resolveWallCollisions(track: Track): void {
    const r = config.kart.radius;
    for (const wall of track.walls) {
      const ax = wall.a.x, az = wall.a.z;
      const bx = wall.b.x, bz = wall.b.z;
      const ex = bx - ax, ez = bz - az;
      const len2 = ex * ex + ez * ez;
      if (len2 < 0.0001) continue;
      const px = this.position.x - ax;
      const pz = this.position.z - az;
      let t = (px * ex + pz * ez) / len2;
      t = Math.max(0, Math.min(1, t));
      const cx = ax + ex * t;
      const cz = az + ez * t;
      const dx = this.position.x - cx;
      const dz = this.position.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        const d = Math.max(0.0001, Math.sqrt(d2));
        const nx = dx / d, nz = dz / d;
        const push = r - d + 0.01;
        this.position.x += nx * push;
        this.position.z += nz * push;
        this.speed *= config.kart.wallBounceDamp;
      }
    }
  }

  syncTransform(): void {
    this.root.position.copy(this.position);
    this.root.position.y = 0.15;
    this.root.rotation.y = this.heading;

    if (this.driftActive) {
      const tilt = -this.driftDir * 0.35;
      this.bodyTilt.rotation.y = tilt;
      this.bodyTilt.rotation.z = -this.driftDir * 0.08;
    } else {
      this.bodyTilt.rotation.y *= 0.85;
      this.bodyTilt.rotation.z *= 0.85;
    }
  }
}

function tintModel(model: THREE.Object3D, color: number): void {
  const c = new THREE.Color(color);
  model.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      const mm = m as THREE.MeshStandardMaterial;
      if (mm.color && mm.name && mm.name.toLowerCase().includes('body')) {
        mm.color = c.clone();
      }
    }
  });
}
