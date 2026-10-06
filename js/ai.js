import * as THREE from './three.module.js';

// ---------------------------------------------------------------------------
// AIController: drives an AI car by following the track centerline with a
// look-ahead, dodging other cars, and rubber-banding to keep the pack close.
// ---------------------------------------------------------------------------

export class AIController {
  constructor(car, track, { skill = 0.85, aggression = 0.5 } = {}) {
    this.car = car;
    this.track = track;
    this.skill = skill;             // 0..1, affects speed & reaction
    this.aggression = aggression;   // 0..1, how hard it cuts in
    this.lookAhead = 0.02;          // fraction of track to look ahead
    this.targetLateral = 0;         // where on the road it wants to be
    this.dodgeTimer = 0;
    this._tmp = new THREE.Vector3();
  }

  // Returns an input object { throttle, brake, steer, drift } for the car.
  update(dt, allCars) {
    const car = this.car;
    const track = this.track;

    // Where is the car on the track?
    const myT = car.progress;
    // Look-ahead target point.
    const targetT = (myT + this.lookAhead) % 1;
    const target = track.pointAt(targetT);
    const targetTan = track.tangentAt(targetT);

    // Desired heading toward the look-ahead point (with a lateral bias).
    const aim = this._tmp.copy(target).addScaledVector(
      new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0), targetTan).normalize(),
      this.targetLateral * 3
    );
    const desired = Math.atan2(aim.x - car.pos.x, aim.z - car.pos.z);

    // Steering: turn toward desired heading.
    let err = desired - car.heading;
    err = Math.atan2(Math.sin(err), Math.cos(err)); // wrap to [-PI,PI]
    const steer = THREE.MathUtils.clamp(err * 2.2, -1, 1);

    // Throttle / brake based on how straight the road is ahead and speed.
    const aheadT = (myT + this.lookAhead * 2.5) % 1;
    const aheadTan = track.tangentAt(aheadT);
    const curTan = track.tangentAt(myT);
    const curve = 1 - Math.max(0, curTan.dot(aheadTan)); // 0 straight, 1 sharp
    const maxSpeed = car.maxSpeed * (0.55 + 0.45 * this.skill);
    const wantSpeed = maxSpeed * (1 - curve * 0.55);

    let throttle = 0, brake = 0;
    if (car.speed < wantSpeed) throttle = 1;
    else if (car.speed > wantSpeed + 3) brake = 1;
    else throttle = 0.4;

    // Drift on sharp corners for style + speed.
    const drift = curve > 0.35 && car.speed > 20 && Math.random() < 0.3;

    // --- Overtaking / dodging --------------------------------------------
    this.dodgeTimer -= dt;
    let dodge = 0;
    for (const other of allCars) {
      if (other === car) continue;
      const d = car.distanceTo(other);
      if (d < 6) {
        // Nudge laterally away from the other car.
        const away = Math.sign(car.pos.x - other.pos.x) || 1;
        dodge = away * this.aggression;
        // Brake a little to avoid a head-on.
        if (car.speed > other.speed) brake = Math.max(brake, 0.6);
      }
    }
    if (dodge !== 0) {
      this.targetLateral = THREE.MathUtils.clamp(dodge, -0.7, 0.7);
      this.dodgeTimer = 0.6;
    } else if (this.dodgeTimer <= 0) {
      // Ease back toward center.
      this.targetLateral *= (1 - dt * 2);
    }

    return { throttle, brake, steer, drift };
  }

  // Rubber-band: nudge AI speed relative to the player so the race stays
  // exciting but not impossible. Called by main loop.
  rubberband(player, dt) {
    const car = this.car;
    const gap = player.totalDistance - car.totalDistance; // + = player ahead
    // If player is far ahead, AI gets a boost; if far behind, AI slows.
    const factor = THREE.MathUtils.clamp(1 - gap * 0.0008, 0.85, 1.15);
    car.maxSpeed = 46 * (0.55 + 0.45 * this.skill) * factor;
  }
}