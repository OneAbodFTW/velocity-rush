import * as THREE from './three.module.js';
import { TRACK_WIDTH } from './track.js';

// ---------------------------------------------------------------------------
// Car: arcade vehicle physics (accel, brake, reverse, steering, drift,
// traction, off-road, collisions) plus a stylized low-poly mesh.
// ---------------------------------------------------------------------------

const UP = new THREE.Vector3(0, 1, 0);

export class Car {
  constructor({ scene, track, color, isPlayer = false, name = 'Racer' }) {
    this.scene = scene;
    this.track = track;
    this.isPlayer = isPlayer;
    this.name = name;

    // State
    this.pos = new THREE.Vector3();
    this.heading = 0;            // yaw, radians
    this.speed = 0;              // signed longitudinal speed (m/s)
    this.steer = 0;              // smoothed steering angle
    this.drifting = false;
    this.driftCharge = 0;        // 0..1 while drifting
    this.offroad = false;
    this.sampleHint = 0;         // cached nearest sample index
    this.progress = 0;           // 0..1 along track
    this.lap = 0;
    this.lastCheckpoint = 0;
    this.racePos = 1;
    this.finished = false;
    this.finishTime = 0;
    this.lapTimes = [];
    this.lapStart = 0;
    this.totalDistance = 0;      // cumulative progress for ranking
    this.lastProgress = 0;
    this.item = null;            // stored power-up (player)
    this.shielded = false;
    this._shieldTime = 0;

    // Tunables
    this.maxSpeed = 46;
    this.maxReverse = 12;
    this.accel = 26;
    this.brake = 42;
    this.engineBrake = 8;
    this.traction = 6.5;         // how fast lateral velocity is killed
    this.driftTraction = 2.2;
    this.turnRate = 2.6;
    this.color = color;

    this.buildMesh();
  }

  buildMesh() {
    this.mesh = new THREE.Group();

    const bodyMat = new THREE.MeshStandardMaterial({ color: this.color, roughness: 0.4, metalness: 0.3 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x88ccff, roughness: 0.1, metalness: 0.6 });

    // Body
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.7, 4.2), bodyMat);
    body.position.y = 0.6; body.castShadow = true;
    // Cabin
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.6, 2.0), glassMat);
    cabin.position.set(0, 1.15, -0.2); cabin.castShadow = true;
    // Nose
    const nose = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.5, 1.0), bodyMat);
    nose.position.set(0, 0.5, 2.4); nose.castShadow = true;
    // Spoiler
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.15, 0.6), darkMat);
    spoiler.position.set(0, 1.3, -2.0); spoiler.castShadow = true;
    const sp1 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.5, 0.4), darkMat);
    sp1.position.set(0.8, 1.1, -2.0);
    const sp2 = sp1.clone(); sp2.position.x = -0.8;

    // Wheels
    const wheelGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.5, 16);
    this.wheels = [];
    const wpos = [[1.05, 1.3], [-1.05, 1.3], [1.05, -1.5], [-1.05, -1.5]];
    for (const [x, z] of wpos) {
      const w = new THREE.Mesh(wheelGeo, darkMat);
      w.rotation.z = Math.PI / 2;
      w.position.set(x, 0.55, z);
      w.castShadow = true;
      this.mesh.add(w);
      this.wheels.push(w);
    }

    this.mesh.add(body, cabin, nose, spoiler, sp1, sp2);
    this.scene.add(this.mesh);

    // Headlight glow (small emissive)
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.1),
      new THREE.MeshStandardMaterial({ color: 0xffffcc, emissive: 0xffffaa, emissiveIntensity: 0.6 }));
    hl.position.set(0.6, 0.6, 2.45);
    const hl2 = hl.clone(); hl2.position.x = -0.6;
    this.mesh.add(hl, hl2);
  }

  reset(startPos) {
    this.pos.copy(startPos.pos);
    this.heading = startPos.heading;
    this.speed = 0;
    this.steer = 0;
    this.drifting = false;
    this.driftCharge = 0;
    this.offroad = false;
    this.lap = 0;
    this.lastCheckpoint = 0;
    this.finished = false;
    this.finishTime = 0;
    this.lastProgress = this.track.progress(this.pos);
    this._prevProgress = undefined;
    this.totalDistance = 0;
    this.sampleHint = this.track.nearestSample(this.pos);
    this.updateMesh();
  }

  // Called each frame. `input` = { throttle, brake, steer, drift }
  update(dt, input, track) {
    const wasDrifting = this.drifting;
    this.drifting = input.drift && Math.abs(this.speed) > 8;

    // Steering: smooth toward target, scaled by speed for realism.
    const targetSteer = input.steer * 0.5;
    this.steer += (targetSteer - this.steer) * Math.min(1, dt * 10);

    // Longitudinal
    if (input.throttle > 0) {
      this.speed += this.accel * input.throttle * dt;
    } else if (input.brake > 0) {
      if (this.speed > 0.5) this.speed -= this.brake * input.brake * dt;
      else this.speed -= this.accel * 0.5 * input.brake * dt; // reverse
    } else {
      // engine braking / rolling friction
      const fr = this.engineBrake * dt;
      if (this.speed > 0) this.speed = Math.max(0, this.speed - fr);
      else this.speed = Math.min(0, this.speed + fr);
    }

    // Off-road penalty
    this.offroad = Math.abs(this.track.lateral(this.pos, this.sampleHint)) > 1.0;
    const boostMult = this.boosting ? this._boostMult : 1;
    const maxSpd = (this.offroad ? this.maxSpeed * 0.55 : this.maxSpeed) * boostMult;
    this.speed = THREE.MathUtils.clamp(this.speed, -this.maxReverse, maxSpd);
    // charges a boost. Steering is more responsive in a drift.
    const traction = this.drifting ? this.driftTraction : this.traction;
    if (this.drifting) {
      this.driftCharge = Math.min(1, this.driftCharge + dt * 0.5);
    } else {
      this.driftCharge = Math.max(0, this.driftCharge - dt * 0.8);
    }

    // Yaw: turning rate depends on speed and steering; drift adds a kick.
    const speedFactor = THREE.MathUtils.clamp(Math.abs(this.speed) / 12, 0, 1);
    const driftBoost = this.drifting ? 1.35 : 1.0;
    const turn = this.steer * this.turnRate * speedFactor * driftBoost * dt * Math.sign(this.speed || 1);
    this.heading += turn;

    // Velocity: blend heading-aligned forward motion with a sliding component.
    const fwd = new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
    const vel = new THREE.Vector3().copy(fwd).multiplyScalar(this.speed);
    // Lateral slide: when drifting, keep some of the old velocity direction.
    if (this.drifting && this._prevVel) {
      const lat = new THREE.Vector3().crossVectors(UP, fwd);
      const latComp = this._prevVel.dot(lat);
      vel.addScaledVector(lat, latComp * (1 - Math.min(1, dt * traction)) * 0.4);
    }
    this._prevVel = vel.clone();

    this.pos.addScaledVector(vel, dt);

    // Keep the car above the track surface (elevation follows centerline).
    const groundY = this.track.pointAt(this.track.progress(this.pos, this.sampleHint)).y;
    this.pos.y = THREE.MathUtils.lerp(this.pos.y, groundY, Math.min(1, dt * 8));

    // Update cached progress.
    this.sampleHint = this.track.nearestSample(this.pos, this.sampleHint);
    this.progress = this.sampleHint / 1200;

    // Spin-out on hard off-road at speed.
    if (this.offroad && Math.abs(this.speed) > 30) {
      this.speed *= (1 - dt * 2.5);
    }

    this.updateMesh();
  }

  updateMesh() {
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.heading;
    // Wheel spin + steer
    const spin = this.speed * 0.05;
    for (let i = 0; i < 4; i++) {
      this.wheels[i].rotation.x += spin;
      if (i < 2) this.wheels[i].rotation.y = this.steer; // front wheels steer
    }
    // Drift tilt
    const tilt = this.drifting ? this.steer * 0.12 : 0;
    this.mesh.rotation.z = THREE.MathUtils.lerp(this.mesh.rotation.z, tilt, 0.2);
  }

  // Apply a temporary boost (from power-up or drift release).
  boost(mult = 1.5, duration = 1.5) {
    this._boostUntil = (this._boostUntil || 0) + duration;
    this._boostMult = mult;
  }

  get boosting() {
    return (this._boostUntil || 0) > 0;
  }

  // Called by main loop to decay boost timer.
  tickBoost(dt) {
    if (this._boostUntil > 0) {
      this._boostUntil -= dt;
      if (this._boostUntil <= 0) this._boostMult = 1;
    }
    if (this.shielded) {
      this._shieldTime -= dt;
      if (this._shieldTime <= 0) this.shielded = false;
    }
  }

  // Distance to another car (for collision).
  distanceTo(other) { return this.pos.distanceTo(other.pos); }
}