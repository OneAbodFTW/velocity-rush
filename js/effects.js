import * as THREE from './three.module.js';

// ---------------------------------------------------------------------------
// Effects: pooled particle systems for tire smoke, sparks, boost flames,
// and collision bursts. Uses a single Points cloud per effect type.
// ---------------------------------------------------------------------------

class ParticlePool {
  constructor(scene, { count, color, size, gravity = 0, spread = 1, life = 0.8, opacity = 0.8 }) {
    this.scene = scene;
    this.count = count;
    this.color = color;
    this.size = size;
    this.gravity = gravity;
    this.spread = spread;
    this.life = life;
    this.positions = new Float32Array(count * 3);
    this.velocities = new Float32Array(count * 3);
    this.ages = new Float32Array(count);
    this.lifes = new Float32Array(count);
    this.cursor = 0;
    for (let i = 0; i < count; i++) {
      this.positions[i * 3 + 1] = -1000; // hide
      this.ages[i] = 1; this.lifes[i] = 0;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    const mat = new THREE.PointsMaterial({
      color, size, transparent: true, opacity,
      depthWrite: false, sizeAttenuation: true,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  emit(pos, vel) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.count;
    this.positions[i * 3] = pos.x;
    this.positions[i * 3 + 1] = pos.y;
    this.positions[i * 3 + 2] = pos.z;
    this.velocities[i * 3] = vel.x;
    this.velocities[i * 3 + 1] = vel.y;
    this.velocities[i * 3 + 2] = vel.z;
    this.ages[i] = 0;
    this.lifes[i] = this.life * (0.7 + Math.random() * 0.6);
  }

  update(dt) {
    for (let i = 0; i < this.count; i++) {
      if (this.ages[i] >= this.lifes[i]) {
        this.positions[i * 3 + 1] = -1000;
        continue;
      }
      this.ages[i] += dt;
      this.velocities[i * 3 + 1] -= this.gravity * dt;
      this.positions[i * 3] += this.velocities[i * 3] * dt;
      this.positions[i * 3 + 1] += this.velocities[i * 3 + 1] * dt;
      this.positions[i * 3 + 2] += this.velocities[i * 3 + 2] * dt;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }
}

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.smoke = new ParticlePool(scene, { count: 400, color: 0x999999, size: 0.9, gravity: -1.5, life: 0.7, opacity: 0.5 });
    this.spark = new ParticlePool(scene, { count: 200, color: 0xffcc44, size: 0.4, gravity: 9, life: 0.5, opacity: 0.9 });
    this.flame = new ParticlePool(scene, { count: 200, color: 0xff6622, size: 0.7, gravity: -2, life: 0.4, opacity: 0.9 });
    this.boost = new ParticlePool(scene, { count: 200, color: 0x44aaff, size: 0.6, gravity: -1, life: 0.5, opacity: 0.8 });
    this._v = new THREE.Vector3();
  }

  // Tire smoke at a car's rear wheels (drifting or off-road).
  tireSmoke(car) {
    const fwd = this._v.set(Math.sin(car.heading), 0, Math.cos(car.heading));
    const rear = car.pos.clone().addScaledVector(fwd, -1.6);
    rear.y += 0.3;
    for (const s of [1, -1]) {
      const off = new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0), fwd).multiplyScalar(0.9 * s);
      this.smoke.emit(rear.clone().add(off), new THREE.Vector3((Math.random()-0.5)*2, 1+Math.random(), (Math.random()-0.5)*2));
    }
  }

  sparks(pos) {
    for (let i = 0; i < 8; i++) {
      this.spark.emit(pos, new THREE.Vector3((Math.random()-0.5)*12, 2+Math.random()*4, (Math.random()-0.5)*12));
    }
  }

  boostFlame(car) {
    const fwd = this._v.set(Math.sin(car.heading), 0, Math.cos(car.heading));
    const rear = car.pos.clone().addScaledVector(fwd, -2.2);
    rear.y += 0.5;
    this.flame.emit(rear, new THREE.Vector3((Math.random()-0.5)*2, 1, (Math.random()-0.5)*2));
    this.boost.emit(rear, new THREE.Vector3((Math.random()-0.5)*3, 1, (Math.random()-0.5)*3));
  }

  update(dt) {
    this.smoke.update(dt);
    this.spark.update(dt);
    this.flame.update(dt);
    this.boost.update(dt);
  }
}