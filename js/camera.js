import * as THREE from './three.module.js';

// ---------------------------------------------------------------------------
// ChaseCamera: smooth third-person camera that follows the player car,
// with speed-based distance, look-ahead, and impact shake.
// ---------------------------------------------------------------------------

export class ChaseCamera {
  constructor(camera) {
    this.camera = camera;
    this._pos = new THREE.Vector3();
    this._look = new THREE.Vector3();
    this._shake = 0;
    this._shakeOff = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
  }

  // Add a shake impulse (e.g. on collision).
  shake(amount = 0.3) {
    this._shake = Math.min(1, this._shake + amount);
  }

  update(dt, car) {
    const speed = Math.abs(car.speed);
    const speedNorm = Math.min(1, speed / 46);

    // Desired camera position: behind and above the car, further back at speed.
    const back = 9 + speedNorm * 4;
    const up = 4.5 + speedNorm * 1.5;
    const fwd = this._tmp.set(Math.sin(car.heading), 0, Math.cos(car.heading));
    const desired = car.pos.clone().addScaledVector(fwd, -back);
    desired.y += up;

    // Smooth follow (lerp). Faster response when turning.
    const turn = Math.abs(car.steer);
    const follow = 1 - Math.pow(0.001, dt * (5 + turn * 4));
    this._pos.lerp(desired, follow);

    // Look target: ahead of the car.
    const lookAhead = 6 + speedNorm * 6;
    const look = car.pos.clone().addScaledVector(fwd, lookAhead);
    look.y += 1.5;
    this._look.lerp(look, 1 - Math.pow(0.0005, dt * 6));

    // Shake decay + offset.
    this._shake = Math.max(0, this._shake - dt * 2.5);
    const s = this._shake * this._shake;
    this._shakeOff.set(
      (Math.random() - 0.5) * s * 1.2,
      (Math.random() - 0.5) * s * 1.2,
      (Math.random() - 0.5) * s * 1.2
    );

    this.camera.position.copy(this._pos).add(this._shakeOff);
    this.camera.lookAt(this._look.clone().add(this._shakeOff));
  }

  // Snap to a car (used at race start / reset).
  snap(car) {
    const fwd = this._tmp.set(Math.sin(car.heading), 0, Math.cos(car.heading));
    this._pos.copy(car.pos).addScaledVector(fwd, -9);
    this._pos.y += 4.5;
    this._look.copy(car.pos).addScaledVector(fwd, 6);
    this._look.y += 1.5;
    this.camera.position.copy(this._pos);
    this.camera.lookAt(this._look);
  }
}