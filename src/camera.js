import * as THREE from 'three';
import { config } from './config.js';

export class ChaseCamera {
  constructor(camera, target) {
    this.camera = camera;
    this.target = target;
    this.smoothPos = camera.position.clone();
    this.smoothLook = target.position.clone();
    this.fov = config.camera.fovBase;
  }

  update(dt) {
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
