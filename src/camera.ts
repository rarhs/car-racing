import * as THREE from 'three';
import { config } from './config.js';
import type { Kart } from './kart.js';

export class ChaseCamera {
  camera: THREE.PerspectiveCamera;
  target: Kart;
  smoothPos: THREE.Vector3;
  smoothLook: THREE.Vector3;
  fov: number;

  constructor(camera: THREE.PerspectiveCamera, target: Kart) {
    this.camera = camera;
    this.target = target;
    this.smoothPos = camera.position.clone();
    this.smoothLook = target.position.clone();
    this.fov = config.camera.fovBase;
  }

  update(dt: number): void {
    const c = config.camera;
    const fwd = this.target.forward();
    const desired = this.target.position.clone()
      .addScaledVector(fwd, -c.distance);
    desired.y = c.height;

    const lookAt = this.target.position.clone()
      .addScaledVector(fwd, c.lookAhead);
    lookAt.y = 0.5;

    this.smoothPos.lerp(desired, 1 - Math.pow(c.damping, dt * 60));
    this.smoothLook.lerp(lookAt, 1 - Math.pow(c.damping, dt * 60));

    this.camera.position.copy(this.smoothPos);
    this.camera.lookAt(this.smoothLook);

    const targetFov = this.target.boostTimer > 0 ? c.fovBoosted : c.fovBase;
    this.fov += (targetFov - this.fov) * (1 - Math.pow(c.fovLerp, dt * 60));
    this.camera.fov = this.fov;
    this.camera.updateProjectionMatrix();
  }
}
