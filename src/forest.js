// Trees, bushes, ferns, fallen logs and loose rocks.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from './noise.js';

function colored(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(hex);
  const n = g.getAttribute('position').count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  g.deleteAttribute('uv');
  return g;
}

function jitter(geo, amount, seed) {
  const rand = mulberry32(seed);
  const p = geo.getAttribute('position');
  const seen = new Map();
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    let o = seen.get(key);
    if (!o) {
      o = [(rand() - 0.5) * amount, (rand() - 0.5) * amount, (rand() - 0.5) * amount];
      seen.set(key, o);
    }
    p.setXYZ(i, p.getX(i) + o[0], p.getY(i) + o[1], p.getZ(i) + o[2]);
  }
  return geo;
}

function pineGeometry(seed) {
  const parts = [colored(new THREE.CylinderGeometry(0.13, 0.24, 3.2, 7).translate(0, 1.6, 0), 0x4e3423)];
  const layers = 5;
  for (let l = 0; l < layers; l++) {
    const t = l / (layers - 1);
    const r = 2.3 - t * 1.6;
    const h = 2.6 - t * 0.9;
    const y = 2.2 + l * 1.45;
    const cone = new THREE.ConeGeometry(r, h, 9, 1).translate(0, y + h / 2, 0);
    jitter(cone, 0.25, seed * 13 + l);
    parts.push(colored(cone, l % 2 ? 0x2f5a2e : 0x2a5129));
  }
  const g = mergeGeometries(parts);
  g.computeVertexNormals();
  return g;
}

function firGeometry(seed) {
  const parts = [colored(new THREE.CylinderGeometry(0.1, 0.2, 3, 6).translate(0, 1.5, 0), 0x55392a)];
  const layers = 7;
  for (let l = 0; l < layers; l++) {
    const t = l / (layers - 1);
    const r = 1.6 - t * 1.25;
    const h = 1.9 - t * 0.6;
    const y = 1.6 + l * 1.25;
    const cone = new THREE.ConeGeometry(r, h, 8, 1).translate(0, y + h / 2, 0);
    jitter(cone, 0.2, seed * 17 + l);
    parts.push(colored(cone, 0x2c4d33));
  }
  const g = mergeGeometries(parts);
  g.computeVertexNormals();
  return g;
}

function broadleafGeometry(seed) {
  const rand = mulberry32(seed);
  const parts = [colored(new THREE.CylinderGeometry(0.12, 0.2, 4.2, 7).translate(0, 2.1, 0), 0x6b5a48)];
  const blobs = [[0, 5.2, 0, 2.1], [1.1, 4.4, 0.3, 1.5], [-1.0, 4.6, -0.4, 1.6], [0.2, 6.3, 0.5, 1.4]];
  for (const [x, y, z, r] of blobs) {
    const blob = new THREE.IcosahedronGeometry(r, 1).translate(x, y, z);
    jitter(blob, 0.4, Math.floor(rand() * 1e6));
    parts.push(colored(blob, rand() < 0.5 ? 0x4f7a2c : 0x5d8a33));
  }
  const g = mergeGeometries(parts);
  g.computeVertexNormals();
  return g;
}

function bushGeometry(seed) {
  const rand = mulberry32(seed);
  const parts = [];
  for (let i = 0; i < 4; i++) {
    const r = 0.35 + rand() * 0.3;
    const b = new THREE.IcosahedronGeometry(r, 0).translate((rand() - 0.5) * 0.7, r * 0.6, (rand() - 0.5) * 0.7);
    parts.push(colored(b, rand() < 0.5 ? 0x3e6a2a : 0x4d7a2e));
  }
  const g = mergeGeometries(parts);
  g.computeVertexNormals();
  return g;
}

function fernGeometry() {
  const parts = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const leaf = new THREE.ConeGeometry(0.09, 0.7, 3, 1);
    leaf.rotateX(Math.PI / 2 - 0.55);
    leaf.translate(0, 0.18, 0.3);
    leaf.rotateY(a);
    parts.push(colored(leaf, 0x4c8a32));
  }
  const g = mergeGeometries(parts);
  g.computeVertexNormals();
  return g;
}

export function buildForest(world, scene) {
  const rand = mulberry32(2024);
  const { x0, z0, x1, z1 } = world.bounds;
  const types = [
    { geo: pineGeometry(1), trunk: 0.22, weight: 0.45 },
    { geo: firGeometry(2), trunk: 0.18, weight: 0.35 },
    { geo: broadleafGeometry(3), trunk: 0.18, weight: 0.2 },
  ];
  const decor = [
    { geo: bushGeometry(5), count: 3500, minTrail: 2.4, scale: [0.7, 1.6] },
    { geo: fernGeometry(), count: 9000, minTrail: 2.0, scale: [0.8, 1.7] },
  ];
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });

  // Instances are grouped into square tiles so tiles off-screen or far away
  // can be skipped (see update() below).
  const TILE = 64;
  const tileKey = (x, z) => `${Math.floor((x - x0) / TILE)},${Math.floor((z - z0) / TILE)}`;
  const makeBuckets = () => new Map();
  const push = (buckets, x, z, item) => {
    const k = tileKey(x, z);
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(item);
  };
  const treeBuckets = types.map(makeBuckets);
  const decorBuckets = decor.map(makeBuckets);

  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const tilt = new THREE.Quaternion();
  const tint = new THREE.Color();

  const TREES = 7000;
  for (let n = 0; n < TREES; n++) {
    const x = x0 + 3 + rand() * (x1 - x0 - 6);
    const z = z0 + 3 + rand() * (z1 - z0 - 6);
    if (world.distToTrail(x, z) < 4.2) continue;
    let r = rand();
    let ti = 0;
    while (ti < types.length - 1 && r > types[ti].weight) {
      r -= types[ti].weight;
      ti++;
    }
    const s = 0.7 + rand() * 0.75;
    const y = world.heightAt(x, z) - 0.15;
    q.setFromAxisAngle(up, rand() * Math.PI * 2);
    tilt.setFromEuler(new THREE.Euler((rand() - 0.5) * 0.08, 0, (rand() - 0.5) * 0.08));
    q.multiply(tilt);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(s, s * (0.9 + rand() * 0.25), s));
    push(treeBuckets[ti], x, z, { m, shade: 0.8 + rand() * 0.35 });

    world.addPrism('wood', new THREE.Vector3(x, y - 0.3, z), new THREE.Vector3(x, y + 4.4, z), types[ti].trunk * s, 7);
  }

  decor.forEach((d, di) => {
    for (let n = 0; n < d.count; n++) {
      const x = x0 + rand() * (x1 - x0);
      const z = z0 + rand() * (z1 - z0);
      if (world.distToTrail(x, z) < d.minTrail) continue;
      const s = d.scale[0] + rand() * (d.scale[1] - d.scale[0]);
      q.setFromAxisAngle(up, rand() * Math.PI * 2);
      const m = new THREE.Matrix4().compose(new THREE.Vector3(x, world.heightAt(x, z) - 0.05, z), q, new THREE.Vector3(s, s, s));
      push(decorBuckets[di], x, z, { m, shade: 0.75 + rand() * 0.4 });
    }
  });

  const tiles = [];
  const flush = (geo, buckets, shadows, range) => {
    for (const [key, list] of buckets) {
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((it, i) => {
        im.setMatrixAt(i, it.m);
        im.setColorAt(i, tint.setScalar(it.shade));
      });
      im.castShadow = shadows;
      im.receiveShadow = true;
      im.computeBoundingSphere();
      scene.add(im);
      const [tx, tz] = key.split(',').map(Number);
      tiles.push({ mesh: im, x: x0 + (tx + 0.5) * TILE, z: z0 + (tz + 0.5) * TILE, range });
    }
  };
  types.forEach((t, i) => flush(t.geo, treeBuckets[i], true, 330));
  decor.forEach((d, i) => flush(d.geo, decorBuckets[i], false, 110));

  // Fallen logs and loose rocks scattered through the woods.
  const logGeo = new THREE.CylinderGeometry(0.25, 0.3, 1, 9, 1);
  const logMat = new THREE.MeshStandardMaterial({ color: 0x5e4330, roughness: 0.95, flatShading: true });
  const logs = [];
  for (let n = 0; n < 260; n++) {
    const x = x0 + rand() * (x1 - x0);
    const z = z0 + rand() * (z1 - z0);
    if (world.distToTrail(x, z) < 5) continue;
    const len = 3 + rand() * 5;
    const yaw = rand() * Math.PI;
    const dx = Math.cos(yaw);
    const dz = Math.sin(yaw);
    const ax = x - dx * len / 2;
    const az = z - dz * len / 2;
    const bx = x + dx * len / 2;
    const bz = z + dz * len / 2;
    if (world.distToTrail(ax, az) < 4 || world.distToTrail(bx, bz) < 4) continue;
    const a = new THREE.Vector3(ax, world.heightAt(ax, az) + 0.18, az);
    const b = new THREE.Vector3(bx, world.heightAt(bx, bz) + 0.18, bz);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const dir = b.clone().sub(a);
    const l = dir.length();
    const lq = new THREE.Quaternion().setFromUnitVectors(up, dir.normalize());
    logs.push(new THREE.Matrix4().compose(mid, lq, new THREE.Vector3(1, l, 1)));
    world.addPrism('wood', a, b, 0.27, 8);
  }
  const lim = new THREE.InstancedMesh(logGeo, logMat, logs.length);
  logs.forEach((m, i) => lim.setMatrixAt(i, m));
  lim.castShadow = true;
  lim.receiveShadow = true;
  lim.computeBoundingSphere();
  scene.add(lim);

  const rocks = [[], [], [], [], [], []];
  for (let n = 0; n < 700; n++) {
    const x = x0 + rand() * (x1 - x0);
    const z = z0 + rand() * (z1 - z0);
    if (world.distToTrail(x, z) < 3.5) continue;
    const size = 0.3 + Math.pow(rand(), 2) * 1.6;
    const y = world.heightAt(x, z) - size * 0.3;
    world.addRock(rocks, Math.floor(rand() * 6), x, y, z, size * (0.8 + rand() * 0.5), size * (0.6 + rand() * 0.4), size, rand() * 6.3);
  }
  world.flushRocks(rocks, 0x86827a);
  world.flushStatic();

  return {
    // Hide tiles beyond their draw distance (ferns and bushes go first).
    update(camPos) {
      const half = TILE * 0.71;
      for (const t of tiles) {
        const d = Math.hypot(t.x - camPos.x, t.z - camPos.z) - half;
        t.mesh.visible = d < t.range;
      }
    },
  };
}
