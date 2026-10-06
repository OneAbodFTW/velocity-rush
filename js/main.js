import * as THREE from './three.module.js';
import { Track } from './track.js';
import { Car } from './car.js';
import { AIController } from './ai.js';
import { PowerUpSystem } from './powerups.js';
import { Effects } from './effects.js';
import { Audio } from './audio.js';
import { ChaseCamera } from './camera.js';
import { HUD } from './hud.js';

// ---------------------------------------------------------------------------
// Main: scene setup, game loop, state machine, race logic, collisions, input.
// ---------------------------------------------------------------------------

const TOTAL_LAPS = 3;
const CHECKPOINT_COUNT = 8;

const AI_COLORS = [0x2266ff, 0x22cc44, 0xff2266, 0xffaa00, 0xaa44ff, 0x00cccc];
const AI_NAMES = ['Blaze', 'Viper', 'Nova', 'Dash', 'Rex', 'Mango'];

class Game {
  constructor() {
    this.canvas = document.getElementById('scene');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87b8e8);
    this.scene.fog = new THREE.Fog(0x87b8e8, 120, 420);

    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 600);

    this._setupLights();
    this.track = new Track(this.scene);
    this.effects = new Effects(this.scene);
    this.audio = new Audio();
    this.cameraCtrl = new ChaseCamera(this.camera);
    this.hud = new HUD(this.track);
    this.powerups = new PowerUpSystem(this.scene, this.track);

    this.cars = [];
    this.ai = [];
    this.player = null;
    this._spawnCars();

    this.state = 'menu'; // menu | countdown | racing | finished
    this.countdown = 0;
    this.raceTime = 0;
    this._lastCount = 4;
    this._collideCooldown = {};

    this._input = { throttle: 0, brake: 0, steer: 0, drift: false };
    this._setupInput();

    window.addEventListener('resize', () => this._onResize());
    this._clock = new THREE.Clock();
    this._animate = this._animate.bind(this);
    this.renderer.setAnimationLoop(this._animate);

    this.hud.el.startBtn.addEventListener('click', () => this.startRace());
    this.hud.el.loading && this.hud.el.loading.classList.add('hidden');
  }

  _setupLights() {
    const hemi = new THREE.HemisphereLight(0xbfdfff, 0x3a5a3a, 0.9);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff2dd, 1.1);
    sun.position.set(80, 120, 60);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 10;
    sun.shadow.camera.far = 400;
    const s = 160;
    sun.shadow.camera.left = -s; sun.shadow.camera.right = s;
    sun.shadow.camera.top = s; sun.shadow.camera.bottom = -s;
    this.scene.add(sun);
    this.scene.add(new THREE.AmbientLight(0x404050, 0.4));
  }

  _spawnCars() {
    // Player first (grid slot 0), then 5 AI.
    const player = new Car({ scene: this.scene, track: this.track, color: 0xffd23f, isPlayer: true, name: 'You' });
    this.player = player;
    this.cars.push(player);
    for (let i = 0; i < 5; i++) {
      const c = new Car({ scene: this.scene, track: this.track, color: AI_COLORS[i], name: AI_NAMES[i] });
      this.cars.push(c);
      this.ai.push(new AIController(c, this.track, { skill: 0.72 + i * 0.05, aggression: 0.5 }));
    }
    this.resetRace();
  }

  resetRace() {
    this.track.startPositions.forEach((sp, i) => {
      this.cars[i].reset(sp);
    });
    this.cars.forEach(c => { c.racePos = 1; });
    this.raceTime = 0;
    this._collideCooldown = {};
    this.powerups.clear();
    this.powerups = new PowerUpSystem(this.scene, this.track);
    this.cameraCtrl.snap(this.player);
  }

  startRace() {
    this.audio.init();
    this.resetRace();
    this.state = 'countdown';
    this.countdown = 3.5;
    this._lastCount = 4;
    this.hud.hideOverlay();
    this.hud.show();
  }

  _setupInput() {
    const keys = {};
    window.addEventListener('keydown', (e) => {
      keys[e.code] = true;
      if (e.code === 'KeyR') this.restart();
      if (e.code === 'Space') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => { keys[e.code] = false; });
    this._keys = keys;
  }

  _readInput() {
    const k = this._keys;
    const inp = this._input;
    inp.throttle = (k['KeyW'] || k['ArrowUp']) ? 1 : 0;
    inp.brake = (k['KeyS'] || k['ArrowDown']) ? 1 : 0;
    inp.steer = (k['KeyA'] || k['ArrowLeft'] ? 1 : 0) - (k['KeyD'] || k['ArrowRight'] ? 1 : 0);
    inp.drift = !!k['Space'];
    // Fire item on Enter/Space? Use Enter to fire, Space to drift.
    if (k['Enter'] && this.player.item && !this._fired) {
      this.powerups.playerFire(this.player);
      this._fired = true;
    }
    if (!k['Enter']) this._fired = false;
  }

  _onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  restart() {
    if (this.state === 'menu') return;
    this.startRace();
  }

  // ---------------- Race logic ----------------
  _updateRace(dt) {
    this.raceTime += dt;
    for (const car of this.cars) {
      car.tickBoost(dt);
      // Cumulative distance for ranking (handles laps + partial progress).
      const prog = car.progress;
      let delta = prog - car.lastProgress;
      if (delta < -0.5) delta += 1;   // wrapped forward
      if (delta > 0.5) delta -= 1;    // wrapped backward
      car.totalDistance += delta;
      car.lastProgress = prog;

      // Checkpoint / lap detection.
      this._checkLap(car);
    }
    // Rank cars by total distance.
    const sorted = [...this.cars].sort((a, b) => b.totalDistance - a.totalDistance);
    sorted.forEach((c, i) => { c.racePos = i + 1; });

    // Finish: player has completed all laps.
    if (this.player.lap >= TOTAL_LAPS && !this.player.finished) {
      this.player.finished = true;
      this.player.finishTime = this.raceTime;
    }
    // End race when player finishes OR after a time cap.
    if (this.player.finished || this.raceTime > 300) {
      this._endRace();
    }
  }

  _checkLap(car) {
    // A lap is completed when the car's progress wraps from near 1 to near 0
    // (crossing the start/finish line going forward).
    const prev = car._prevProgress;
    car._prevProgress = car.progress;
    if (prev === undefined) return;
    if (prev > 0.85 && car.progress < 0.15) {
      const lapTime = this.raceTime - car.lapStart;
      car.lapTimes.push(lapTime);
      car.lapStart = this.raceTime;
      car.lap++;
      if (car.isPlayer) {
        this.hud.message(`LAP ${Math.min(car.lap + 1, TOTAL_LAPS)}`, 'go', 1.0);
        this.audio.beep(880, 0.15, 0.3);
      }
    }
  }

  _endRace() {
    this.state = 'finished';
    // Rank by actual progress (totalDistance). A car that completed all laps
    // has a higher totalDistance than one still on the track, so this yields
    // the true finishing order.
    const sorted = [...this.cars].sort((a, b) => b.totalDistance - a.totalDistance);
    sorted.forEach((c, i) => {
      c.racePos = i + 1;
      if (!c.finished) c.finishTime = this.raceTime; // display only
    });
    this.hud.showResults({ cars: this.cars, player: this.player });
    this.audio.beep(1046, 0.5, 0.4);
  }

  // ---------------- Collisions ----------------
  _updateCollisions(dt) {
    for (let i = 0; i < this.cars.length; i++) {
      for (let j = i + 1; j < this.cars.length; j++) {
        const a = this.cars[i], b = this.cars[j];
        const d = a.distanceTo(b);
        if (d < 3.2) {
          // Push apart.
          const push = new THREE.Vector3().subVectors(a.pos, b.pos).normalize().multiplyScalar((3.2 - d) * 0.5);
          a.pos.add(push); b.pos.sub(push);
          // Exchange some speed.
          const rel = Math.abs(a.speed - b.speed);
          a.speed *= 0.92; b.speed *= 0.92;
          // Camera shake + sparks + sound for the player.
          const key = i + '_' + j;
          if (this._collideCooldown[key] === undefined) this._collideCooldown[key] = 0;
          if (this._collideCooldown[key] <= 0 && rel > 3) {
            this._collideCooldown[key] = 0.4;
            const mid = new THREE.Vector3().addVectors(a.pos, b.pos).multiplyScalar(0.5);
            mid.y += 0.5;
            this.effects.sparks(mid);
            if (a.isPlayer || b.isPlayer) {
              this.cameraCtrl.shake(0.4);
              this.audio.collision();
            }
          }
        }
        if (this._collideCooldown[i + '_' + j] > 0) this._collideCooldown[i + '_' + j] -= dt;
      }
    }
  }

  // ---------------- Main loop ----------------
  _animate() {
    const dt = Math.min(this._clock.getDelta(), 0.05);

    // Animate scenery (windmill).
    if (this.track.windmill) this.track.windmill.rotation.z += dt * 0.8;

    if (this.state === 'countdown') {
      this.countdown -= dt;
      const n = Math.ceil(this.countdown);
      if (n !== this._lastCount && n >= 0) {
        this._lastCount = n;
        if (n > 0) { this.hud.message(String(n), 'count', 0.9); this.audio.countdown(false); }
        else { this.hud.message('GO!', 'go', 1.0); this.audio.countdown(true); }
      }
      if (this.countdown <= 0) this.state = 'racing';
      // Cars idle at the grid.
      this._updateEffectsAndCamera(dt, false);
    } else if (this.state === 'racing') {
      this._readInput();
      // Player.
      this.player.update(dt, this._input, this.track);
      // AI.
      for (let i = 0; i < this.ai.length; i++) {
        const inp = this.ai[i].update(dt, this.cars);
        this.cars[i + 1].update(dt, inp, this.track);
        this.ai[i].rubberband(this.player, dt);
      }
      this._updateCollisions(dt);
      this.powerups.update(dt, this.cars, this.player);
      this.powerups.updateShieldVisuals(this.cars);
      this._updateRace(dt);
      this._updateEffectsAndCamera(dt, true);
    } else if (this.state === 'finished') {
      // Let cars coast to a stop.
      for (const car of this.cars) {
        car.update(dt, { throttle: 0, brake: 0.3, steer: 0, drift: false }, this.track);
      }
      this._updateEffectsAndCamera(dt, false);
    } else {
      // menu: slow orbit around the track.
      const t = (this._clock.elapsedTime * 0.02) % 1;
      const p = this.track.pointAt(t);
      this.camera.position.set(p.x + 30, 40, p.z + 30);
      this.camera.lookAt(p);
    }

    this.effects.update(dt);
    this.hud.tick(dt);
    if (this.state === 'racing' || this.state === 'countdown') {
      this.hud.drawMinimap(this.cars, this.player);
      this.hud.drawSpeedo(this.player.speed);
      this.hud.updateText(this.player, this.player.lap, TOTAL_LAPS);
      this.audio.engine(Math.min(1, Math.abs(this.player.speed) / 46), this._input.throttle);
    }

    this.renderer.render(this.scene, this.camera);
  }

  _updateEffectsAndCamera(dt, racing) {
    // Tire smoke for drifting / off-road cars.
    for (const car of this.cars) {
      if (car.drifting || (car.offroad && Math.abs(car.speed) > 10)) {
        this.effects.tireSmoke(car);
      }
      if (car.boosting) this.effects.boostFlame(car);
    }
    this.cameraCtrl.update(dt, this.player);
  }
}

new Game();