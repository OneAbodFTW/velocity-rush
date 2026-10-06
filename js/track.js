import * as THREE from './three.module.js';

// ---------------------------------------------------------------------------
// Track: a closed Catmull-Rom circuit with elevation changes, a ribbon road,
// barriers, checkpoints, scenery and landmarks.
// ---------------------------------------------------------------------------

export const TRACK_WIDTH = 12;      // road half-width is ~6
export const SAMPLES = 1200;        // resolution of the centerline

// Control points (x, z, y=elevation). Designed as a varied circuit:
// long start/finish straight, a hairpin, an uphill climb, a downhill sweeper,
// a chicane, and a final high-speed corner.
const CONTROL = [
  [  0,   0,  0],   // start/finish straight (south, heading +x)
  [ 40,   0,  0],
  [ 80,   4,  0],
  [110,  18,  2],    // first right sweeper, slight rise
  [125,  45,  6],
  [120,  72, 10],    // uphill climb
  [ 95,  88, 14],
  [ 60,  92, 16],    // top of the hill
  [ 30,  84, 12],
  [  8,  66,  8],    // hairpin approach
  [ -6,  48,  4],
  [  4,  30,  0],    // hairpin (tight left)
  [ 24,  26, -2],
  [ 44,  34, -4],    // downhill sweeper
  [ 62,  46, -6],
  [ 78,  52, -6],
  [ 92,  44, -4],    // chicane
  [ 96,  30, -2],
  [ 84,  18,  0],
  [ 60,  10,  0],
];

export class Track {
  constructor(scene) {
    this.scene = scene;
    this.curve = new THREE.CatmullRomCurve3(
      CONTROL.map(([x, z, y]) => new THREE.Vector3(x, y, z)),
      true, 'catmullrom', 0.5
    );
    this.buildGeometry();
    this.buildBarriers();
    this.buildCheckpoints();
    this.buildScenery();
    this.buildLandmarks();
    this.buildStartGrid();
  }

  // Sample the centerline into a dense array with normals/binormals.
  buildGeometry() {
    this.points = [];
    this.normals = [];
    this.tangents = [];
    for (let i = 0; i < SAMPLES; i++) {
      const t = i / SAMPLES;
      const p = this.curve.getPointAt(t);
      const tan = this.curve.getTangentAt(t);
      tan.y = 0; tan.normalize();
      const up = new THREE.Vector3(0, 1, 0);
      const n = new THREE.Vector3().crossVectors(up, tan).normalize();
      this.points.push(p);
      this.tangents.push(tan);
      this.normals.push(n);
    }

    // Road ribbon: two edges left/right of centerline.
    const verts = [], uvs = [], idx = [];
    const hw = TRACK_WIDTH / 2;
    for (let i = 0; i < SAMPLES; i++) {
      const p = this.points[i], n = this.normals[i];
      const l = new THREE.Vector3().copy(p).addScaledVector(n, hw);
      const r = new THREE.Vector3().copy(p).addScaledVector(n, -hw);
      verts.push(l.x, l.y, l.z, r.x, r.y, r.z);
      uvs.push(0, i / 12, 1, i / 12);
    }
    for (let i = 0; i < SAMPLES; i++) {
      const a = i * 2, b = i * 2 + 1;
      const c = ((i + 1) % SAMPLES) * 2, d = ((i + 1) % SAMPLES) * 2 + 1;
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx);
    g.computeVertexNormals();

    const road = new THREE.Mesh(g, new THREE.MeshStandardMaterial({
      color: 0x3a3f4a, roughness: 0.95, metalness: 0.0,
    }));
    road.receiveShadow = true;
    this.scene.add(road);
    this.roadMesh = road;

    // Center dashed line + edge lines via a thin canvas texture strip.
    this.buildStripes();
  }

  buildStripes() {
    // A long thin ribbon slightly above the road for the center dashes.
    const hw = TRACK_WIDTH / 2;
    const verts = [], idx = [];
    const dash = 6;
    for (let i = 0; i < SAMPLES; i++) {
      const p = this.points[i], n = this.normals[i];
      const l = new THREE.Vector3().copy(p).addScaledVector(n, 0.4);
      const r = new THREE.Vector3().copy(p).addScaledVector(n, -0.4);
      l.y += 0.03; r.y += 0.03;
      verts.push(l.x, l.y, l.z, r.x, r.y, r.z);
    }
    for (let i = 0; i < SAMPLES; i++) {
      const a = i * 2, b = i * 2 + 1;
      const c = ((i + 1) % SAMPLES) * 2, d = ((i + 1) % SAMPLES) * 2 + 1;
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const mat = new THREE.MeshBasicMaterial({ color: 0xffd23f });
    this.scene.add(new THREE.Mesh(g, mat));
  }

  buildBarriers() {
    // Low walls on both edges, plus taller guard-rails at the hairpin & hill.
    const hw = TRACK_WIDTH / 2 + 0.6;
    const barrierGeo = new THREE.BoxGeometry(2.2, 1.1, 0.4);
    const barrierMat = new THREE.MeshStandardMaterial({ color: 0xd94436, roughness: 0.6 });
    const barrierMat2 = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.6 });
    const step = 4;
    for (let i = 0; i < SAMPLES; i += step) {
      const p = this.points[i], n = this.normals[i];
      for (const s of [1, -1]) {
        const pos = new THREE.Vector3().copy(p).addScaledVector(n, hw * s);
        const m = new THREE.Mesh(barrierGeo, (i / step) % 2 ? barrierMat : barrierMat2);
        m.position.copy(pos);
        m.position.y += 0.55;
        m.lookAt(pos.clone().add(n));
        m.rotateY(Math.PI / 2);
        m.castShadow = true;
        this.scene.add(m);
      }
    }
  }

  buildCheckpoints() {
    // 8 invisible checkpoints around the loop; index 0 is start/finish.
    this.checkpoints = [];
    const N = 8;
    for (let i = 0; i < N; i++) {
      const t = i / N;
      const p = this.curve.getPointAt(t);
      const tan = this.curve.getTangentAt(t);
      this.checkpoints.push({ pos: p.clone(), tangent: tan.clone(), t });
    }
    // Visible start/finish gate.
    const cp = this.checkpoints[0];
    const n = new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0), cp.tangent).normalize();
    const hw = TRACK_WIDTH / 2 + 1;
    const postGeo = new THREE.CylinderGeometry(0.4, 0.4, 6, 12);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
    for (const s of [1, -1]) {
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.copy(cp.pos).addScaledVector(n, hw * s);
      post.position.y += 3;
      post.castShadow = true;
      this.scene.add(post);
    }
    const banner = new THREE.Mesh(
      new THREE.BoxGeometry(hw * 2, 1.2, 0.3),
      new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0x553300 })
    );
    banner.position.copy(cp.pos).addScaledVector(n, 0);
    banner.position.y += 6;
    banner.lookAt(cp.pos.clone().add(n));
    this.scene.add(banner);
  }

  // Helper: place a mesh oriented along the track at parameter t.
  placeOnTrack(obj, t, lateral = 0) {
    const p = this.curve.getPointAt(t);
    const tan = this.curve.getTangentAt(t);
    const n = new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0), tan).normalize();
    obj.position.copy(p).addScaledVector(n, lateral);
    obj.lookAt(p.clone().add(tan));
    return obj;
  }

  buildScenery() {
    // Grass ground plane.
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(600, 600),
      new THREE.MeshStandardMaterial({ color: 0x3f7d3a, roughness: 1 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.5;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Trees scattered outside the track.
    const trunkGeo = new THREE.CylinderGeometry(0.5, 0.7, 4, 8);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2b });
    const leafGeo = new THREE.ConeGeometry(3, 7, 8);
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x2f6b34 });
    const rand = mulberry32(1234);
    for (let i = 0; i < 90; i++) {
      const t = rand();
      const p = this.curve.getPointAt(t);
      const tan = this.curve.getTangentAt(t);
      const n = new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0), tan).normalize();
      const side = rand() > 0.5 ? 1 : -1;
      const dist = 18 + rand() * 40;
      const pos = p.clone().addScaledVector(n, side * dist);
      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.y = 2; trunk.castShadow = true;
      const leaf = new THREE.Mesh(leafGeo, leafMat);
      leaf.position.y = 6; leaf.castShadow = true;
      tree.add(trunk, leaf);
      tree.position.copy(pos);
      tree.scale.setScalar(0.8 + rand() * 0.8);
      this.scene.add(tree);
    }

    // Rocks.
    const rockGeo = new THREE.DodecahedronGeometry(1.5, 0);
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x8a8f98, roughness: 1 });
    for (let i = 0; i < 40; i++) {
      const t = rand();
      const p = this.curve.getPointAt(t);
      const tan = this.curve.getTangentAt(t);
      const n = new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0), tan).normalize();
      const side = rand() > 0.5 ? 1 : -1;
      const dist = 16 + rand() * 30;
      const rock = new THREE.Mesh(rockGeo, rockMat);
      rock.position.copy(p).addScaledVector(n, side * dist);
      rock.position.y = 0.5;
      rock.scale.setScalar(0.6 + rand() * 1.4);
      rock.castShadow = true;
      this.scene.add(rock);
    }
  }

  buildLandmarks() {
    // A windmill near the hairpin, a lighthouse at the hilltop, and a big
    // "VELOCITY" arch over the start/finish straight.
    // Windmill.
    const wm = new THREE.Group();
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(2, 2.6, 10, 12),
      new THREE.MeshStandardMaterial({ color: 0xd8c9a8 })
    );
    base.position.y = 5; base.castShadow = true;
    const bladeGeo = new THREE.BoxGeometry(0.4, 8, 0.4);
    const bladeMat = new THREE.MeshStandardMaterial({ color: 0x995522 });
    const hub = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const b = new THREE.Mesh(bladeGeo, bladeMat);
      b.position.y = 4; b.castShadow = true;
      const pivot = new THREE.Group();
      pivot.add(b);
      pivot.rotation.z = i * Math.PI / 2;
      hub.add(pivot);
    }
    hub.position.y = 10;
    wm.add(base, hub);
    this.placeOnTrack(wm, 0.42, 22);
    this.scene.add(wm);
    this.windmill = hub;

    // Lighthouse at the hilltop.
    const lh = new THREE.Group();
    const tower = new THREE.Mesh(
      new THREE.CylinderGeometry(1.6, 2.2, 12, 16),
      new THREE.MeshStandardMaterial({ color: 0xf2f2f2 })
    );
    tower.position.y = 6; tower.castShadow = true;
    const light = new THREE.Mesh(
      new THREE.CylinderGeometry(1.8, 1.8, 2, 16),
      new THREE.MeshStandardMaterial({ color: 0xffcc33, emissive: 0x664400 })
    );
    light.position.y = 13;
    lh.add(tower, light);
    this.placeOnTrack(lh, 0.33, -24);
    this.scene.add(lh);

    // Start/finish arch.
    const cp = this.checkpoints[0];
    const n = new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0), cp.tangent).normalize();
    const hw = TRACK_WIDTH / 2 + 2;
    const arch = new THREE.Group();
    const colGeo = new THREE.BoxGeometry(1.2, 8, 1.2);
    const colMat = new THREE.MeshStandardMaterial({ color: 0x2b6cb0 });
    for (const s of [1, -1]) {
      const c = new THREE.Mesh(colGeo, colMat);
      c.position.set(0, 4, 0);
      c.position.addScaledVector(n, hw * s);
      c.castShadow = true;
      arch.add(c);
    }
    const top = new THREE.Mesh(
      new THREE.BoxGeometry(hw * 2 + 1.2, 1.4, 1.4),
      new THREE.MeshStandardMaterial({ color: 0x2b6cb0, emissive: 0x112244 })
    );
    top.position.y = 8;
    arch.add(top);
    arch.position.copy(cp.pos);
    arch.lookAt(cp.pos.clone().add(n));
    this.scene.add(arch);
  }

  buildStartGrid() {
    // 6 cars in a 2x3 grid just before the start line.
    this.startPositions = [];
    const t0 = 0.985; // just before checkpoint 0
    const n = new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0), this.curve.getTangentAt(t0)).normalize();
    const rows = 3, cols = 2;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const p = this.curve.getPointAt((t0 - (r * 0.004)) % 1);
        const lat = (c === 0 ? -1 : 1) * 2.2;
        const pos = p.clone().addScaledVector(n, lat);
        const tan = this.curve.getTangentAt((t0 - (r * 0.004)) % 1);
        this.startPositions.push({ pos, heading: Math.atan2(tan.x, tan.z) });
      }
    }
  }

  // --- Query helpers used by cars/AI --------------------------------------
  pointAt(t) { return this.curve.getPointAt(((t % 1) + 1) % 1); }
  tangentAt(t) { return this.curve.getTangentAt(((t % 1) + 1) % 1); }

  // Nearest centerline sample to a world position (spatial search cached).
  nearestSample(pos, hint = -1) {
    let best = -1, bestD = Infinity;
    const start = hint >= 0 ? hint : 0;
    const range = hint >= 0 ? 60 : SAMPLES;
    for (let k = 0; k < range; k++) {
      const i = (start + k) % SAMPLES;
      const d = this.points[i].distanceToSquared(pos);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  // Progress along the track [0,1) for a position, using a local search.
  progress(pos, hint = -1) {
    const i = this.nearestSample(pos, hint);
    return i / SAMPLES;
  }

  // Lateral offset (-1..1) of a position relative to the centerline.
  lateral(pos, hint = -1) {
    const i = this.nearestSample(pos, hint);
    const p = this.points[i], n = this.normals[i];
    const rel = new THREE.Vector3().subVectors(pos, p);
    const lat = rel.dot(n);
    return THREE.MathUtils.clamp(lat / (TRACK_WIDTH / 2), -1.2, 1.2);
  }
}

// Deterministic PRNG for stable scenery.
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}