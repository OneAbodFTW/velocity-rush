import * as THREE from './three.module.js';

// ---------------------------------------------------------------------------
// Power-ups: floating collectibles, projectiles, and effect handling.
// Items: boost (mushroom), shell (fire a projectile), shield, banana (drop).
// ---------------------------------------------------------------------------

export const ITEMS = ['boost', 'shell', 'shield', 'banana'];

export class PowerUpSystem {
  constructor(scene, track) {
    this.scene = scene;
    this.track = track;
    this.pickups = [];     // { mesh, item, pos, active }
    this.projectiles = []; // { mesh, pos, vel, owner, life, item }
    this.bananas = [];     // { mesh, pos, active }
    this.spawnTimers = {};
    this._tmp = new THREE.Vector3();
    this._placePickups();
  }

  _placePickups() {
    // Fixed pickup spots around the track (item boxes).
    const spots = [0.06, 0.16, 0.27, 0.38, 0.5, 0.62, 0.74, 0.86];
    for (const t of spots) {
      const p = this.track.pointAt(t);
      const n = new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0), this.track.tangentAt(t)).normalize();
      const lateral = (Math.random() > 0.5 ? 1 : -1) * 2.5;
      const pos = p.clone().addScaledVector(n, lateral);
      pos.y += 1.2;
      const mesh = this._makeBox();
      mesh.position.copy(pos);
      this.scene.add(mesh);
      this.pickups.push({ mesh, item: null, pos, active: true, respawn: 0 });
    }
  }

  _makeBox() {
    const g = new THREE.Group();
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 1.1, 1.1),
      new THREE.MeshStandardMaterial({ color: 0x4488ff, emissive: 0x1133aa, emissiveIntensity: 0.6, transparent: true, opacity: 0.85 })
    );
    box.castShadow = true;
    const q = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.35, 0),
      new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.8 })
    );
    g.add(box, q);
    return g;
  }

  _makeShell() {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 12, 12),
      new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.4 })
    );
    m.castShadow = true;
    return m;
  }

  _makeBanana() {
    const m = new THREE.Mesh(
      new THREE.TorusGeometry(0.5, 0.22, 8, 12, Math.PI * 1.4),
      new THREE.MeshStandardMaterial({ color: 0xffe14d, roughness: 0.6 })
    );
    m.rotation.x = Math.PI / 2;
    m.castShadow = true;
    return m;
  }

  update(dt, cars, player) {
    // Spin pickups.
    for (const p of this.pickups) {
      p.mesh.rotation.y += dt * 2;
      if (!p.active) {
        p.respawn -= dt;
        if (p.respawn <= 0) {
          p.active = true;
          p.item = ITEMS[Math.floor(Math.random() * ITEMS.length)];
          p.mesh.visible = true;
        }
      }
    }

    // Pickups collection.
    for (const p of this.pickups) {
      if (!p.active) continue;
      for (const car of cars) {
        if (car.finished) continue;
        if (car.pos.distanceTo(p.pos) < 2.2) {
          if (car.isPlayer) {
            car.item = p.item; // player stores one item
          } else {
            this._aiUseItem(car, p.item);
          }
          p.active = false;
          p.respawn = 6 + Math.random() * 4;
          p.mesh.visible = false;
          break;
        }
      }
    }

    // Projectiles.
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      pr.life -= dt;
      pr.pos.addScaledVector(pr.vel, dt);
      pr.mesh.position.copy(pr.pos);
      pr.mesh.rotation.y += dt * 10;
      let dead = pr.life <= 0;
      // Hit detection vs cars (not owner).
      for (const car of cars) {
        if (car === pr.owner || car.finished) continue;
        if (car.pos.distanceTo(pr.pos) < 1.8) {
          this._hitCar(car, pr.item, pr.owner);
          dead = true;
          break;
        }
      }
      if (dead) {
        this.scene.remove(pr.mesh);
        this.projectiles.splice(i, 1);
      }
    }

    // Bananas on the ground.
    for (let i = this.bananas.length - 1; i >= 0; i--) {
      const b = this.bananas[i];
      b.mesh.rotation.z += dt;
      for (const car of cars) {
        if (car.finished) continue;
        if (car.pos.distanceTo(b.pos) < 1.6 && Math.abs(car.speed) > 5) {
          // Spin out!
          car.speed *= 0.3;
          car.heading += (Math.random() - 0.5) * 1.5;
          car.offroad = true;
          this.scene.remove(b.mesh);
          this.bananas.splice(i, 1);
          break;
        }
      }
    }
  }

  // Player fires their stored item.
  playerFire(car) {
    if (!car.item) return;
    const item = car.item;
    car.item = null;
    if (item === 'boost') {
      car.boost(1.5, 1.6);
    } else if (item === 'shield') {
      car.shielded = true;
      car._shieldTime = 6;
    } else if (item === 'banana') {
      const b = this._makeBanana();
      const pos = car.pos.clone().addScaledVector(
        new THREE.Vector3(Math.sin(car.heading), 0, Math.cos(car.heading)), -4
      );
      pos.y = 0.4;
      b.position.copy(pos);
      this.scene.add(b);
      this.bananas.push({ mesh: b, pos, active: true });
    } else if (item === 'shell') {
      const m = this._makeShell();
      const vel = new THREE.Vector3(Math.sin(car.heading), 0, Math.cos(car.heading)).multiplyScalar(40);
      const pos = car.pos.clone().addScaledVector(vel.clone().normalize(), 2);
      pos.y = 0.8;
      m.position.copy(pos);
      this.scene.add(m);
      this.projectiles.push({ mesh: m, pos, vel, owner: car, life: 4, item: 'shell' });
    }
  }

  _aiUseItem(car, item) {
    if (item === 'boost') car.boost(1.5, 1.6);
    else if (item === 'shield') { car.shielded = true; car._shieldTime = 6; }
    else if (item === 'banana') {
      const b = this._makeBanana();
      const pos = car.pos.clone().addScaledVector(
        new THREE.Vector3(Math.sin(car.heading), 0, Math.cos(car.heading)), -4
      );
      pos.y = 0.4;
      b.position.copy(pos);
      this.scene.add(b);
      this.bananas.push({ mesh: b, pos, active: true });
    } else if (item === 'shell') {
      const m = this._makeShell();
      const vel = new THREE.Vector3(Math.sin(car.heading), 0, Math.cos(car.heading)).multiplyScalar(40);
      const pos = car.pos.clone().addScaledVector(vel.clone().normalize(), 2);
      pos.y = 0.8;
      m.position.copy(pos);
      this.scene.add(m);
      this.projectiles.push({ mesh: m, pos, vel, owner: car, life: 4, item: 'shell' });
    }
  }

  _hitCar(car, item, owner) {
    if (car.shielded) {
      car.shielded = false; // shield absorbs
      return;
    }
    if (item === 'shell') {
      car.speed *= 0.25;
      car.heading += (Math.random() - 0.5) * 0.8;
    }
  }

  // Visual shield aura on a car.
  setShieldVisual(car, on) {
    if (on && !car._shieldMesh) {
      car._shieldMesh = new THREE.Mesh(
        new THREE.SphereGeometry(2.2, 16, 16),
        new THREE.MeshBasicMaterial({ color: 0x66ccff, transparent: true, opacity: 0.25 })
      );
      this.scene.add(car._shieldMesh);
    } else if (!on && car._shieldMesh) {
      this.scene.remove(car._shieldMesh);
      car._shieldMesh = null;
    }
  }

  updateShieldVisuals(cars) {
    for (const car of cars) {
      if (car.shielded) {
        if (!car._shieldMesh) this.setShieldVisual(car, true);
        car._shieldMesh.position.copy(car.pos);
        car._shieldMesh.position.y += 0.8;
      } else if (car._shieldMesh) {
        this.setShieldVisual(car, false);
      }
    }
  }

  clear() {
    for (const p of this.pickups) this.scene.remove(p.mesh);
    for (const pr of this.projectiles) this.scene.remove(pr.mesh);
    for (const b of this.bananas) this.scene.remove(b.mesh);
    this.pickups = [];
    this.projectiles = [];
    this.bananas = [];
  }
}