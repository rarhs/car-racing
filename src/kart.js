import * as THREE from 'three';
import { config } from './config.js';

export class Kart {
  constructor({ scene, model, position, heading, isPlayer, color }) {
    this.position = position.clone();
    this.heading = heading;
    this.speed = 0;
    this.isPlayer = isPlayer;
    this.color = color;

    this.driftActive = false;
    this.driftDir = 0;
    this.driftCharge = 0;
    this.boostTimer = 0;
    this.boostMultiplier = 1;
    this.spinTimer = 0;
    this.shieldTimer = 0;

    this.heldItem = null;
    this.lap = -1;
    this.sampleIndex = 0;
    this.lastSampleIndex = null;
    this.totalProgress = 0;

    this.useItemRequested = false;

    this.root = new THREE.Group();
    this.body = model;
    this.body.scale.setScalar(1.4);
    tintModel(this.body, color);
    this.root.add(this.body);

    this.bodyTilt = new THREE.Group();
    this.root.remove(this.body);
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

  dispose(scene) { scene.remove(this.root); }

  idle(dt) {
    this.syncTransform();
  }

  applyItemEffects() {
    return {
      isBoosting: this.boostTimer > 0,
      hasShield: this.shieldTimer > 0,
      isSpinning: this.spinTimer > 0,
    };
  }

  hit(kind) {
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

  giveItem(name) {
    if (!this.heldItem) this.heldItem = name;
  }

  consumeItem() {
    const item = this.heldItem;
    this.heldItem = null;
    return item;
  }

  update(dt, inputCtl, track) {
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
      const itemDown = inputCtl.wasPressed && inputCtl.wasPressed('item');

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

  activateBoost(multiplier, duration) {
    this.boostTimer = Math.max(this.boostTimer, duration);
    this.boostMultiplier = Math.max(this.boostMultiplier, multiplier);
  }

  activateShield(duration) {
    this.shieldTimer = duration;
    this.shieldMesh.visible = true;
  }

  forward() {
    return new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
  }

  resolveWallCollisions(track) {
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

  syncTransform() {
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

function tintModel(model, color) {
  const c = new THREE.Color(color);
  model.traverse((node) => {
    if (node.isMesh && node.material) {
      const mats = Array.isArray(node.material) ? node.material : [node.material];
      mats.forEach((m, i) => {
        if (m.color && m.name && m.name.toLowerCase().includes('body')) {
          m.color = c.clone();
        }
      });
    }
  });
}
