// The mountain: terrain, carved trails, trail features, rocks, roots, tape and gates.
import * as THREE from 'three';
import { mulberry32, createNoise2D, fbm, clamp, lerp, smoothstep } from './noise.js';
import { TRACKS } from './tracks.js';

export const GROUP_WORLD = 0x0001;
export const GROUP_BIKE = 0x0002;
export const GROUP_RAGDOLL = 0x0004;
export const groups = (member, filter) => ((member & 0xffff) << 16) | (filter & 0xffff);
export const WORLD_GROUPS = groups(GROUP_WORLD, 0xffff);

const X0 = -160;
const Z0 = -560;
const WIDTH = 320;
const LENGTH = 1120;
const NX = WIDTH + 1;
const NZ = LENGTH + 1;

// Friction of each kind of surface.
export const SURFACE = {
  trail: { mu: 1.0, kind: 'trail' },
  forest: { mu: 0.82, kind: 'forest' },
  root: { mu: 0.62, kind: 'root' },
  rock: { mu: 0.78, kind: 'rock' },
  wood: { mu: 0.85, kind: 'wood' },
};

function boxSmooth(arr, radius) {
  const n = arr.length;
  const out = new Float32Array(n);
  let sum = 0;
  let count = 0;
  for (let i = 0; i < Math.min(n, radius + 1); i++) {
    sum += arr[i];
    count++;
  }
  for (let i = 0; i < n; i++) {
    out[i] = sum / count;
    const add = i + radius + 1;
    const rem = i - radius;
    if (add < n) {
      sum += arr[add];
      count++;
    }
    if (rem >= 0) {
      sum -= arr[rem];
      count--;
    }
  }
  return out;
}

export class Track {
  constructor(def, index, natural) {
    this.def = def;
    this.index = index;
    this.halfWidth = def.halfWidth;
    const curve = new THREE.CatmullRomCurve3(
      def.points.map(([x, z]) => new THREE.Vector3(x, 0, z)),
      false,
      'centripetal',
    );
    const length = curve.getLength();
    const segs = Math.round(length / 0.5);
    const pts = curve.getSpacedPoints(segs);
    const n = pts.length;
    this.n = n;
    this.ds = length / segs;
    this.length = length;

    this.px = new Float32Array(n);
    this.pz = new Float32Array(n);
    this.tx = new Float32Array(n);
    this.tz = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      this.px[i] = pts[i].x;
      this.pz[i] = pts[i].z;
    }
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 1);
      const b = Math.min(n - 1, i + 1);
      const dx = this.px[b] - this.px[a];
      const dz = this.pz[b] - this.pz[a];
      const l = Math.hypot(dx, dz) || 1;
      this.tx[i] = dx / l;
      this.tz[i] = dz / l;
    }

    // Trail base height follows the mountain, smoothed so it flows.
    let y = new Float32Array(n);
    for (let i = 0; i < n; i++) y[i] = natural(this.px[i], this.pz[i]);
    y = boxSmooth(boxSmooth(y, 18), 18);
    // Optionally guarantee a minimum downhill grade (keeps a jump line flowing):
    // the closest profile that always drops at least minGrade (pool-adjacent-violators).
    if (def.minGrade) {
      const g = def.minGrade * this.ds;
      const val = [];
      const cnt = [];
      for (let i = 0; i < n; i++) {
        val.push(y[i] + g * i);
        cnt.push(1);
        while (val.length > 1 && val[val.length - 1] > val[val.length - 2]) {
          const c1 = cnt.pop();
          const v1 = val.pop();
          const top = val.length - 1;
          val[top] = (val[top] * cnt[top] + v1 * c1) / (cnt[top] + c1);
          cnt[top] += c1;
        }
      }
      let i = 0;
      for (let b = 0; b < val.length; b++) {
        for (let k = 0; k < cnt[b]; k++, i++) y[i] = val[b] - g * i;
      }
    }
    // Spread out pitches that are too steep (or uphill) over their neighbours.
    const maxDown = (def.maxGrade ?? 0.32) * this.ds;
    const maxUp = -(def.minGrade ?? -0.06) * this.ds;
    for (let it = 0; it < 400; it++) {
      let changed = false;
      for (let i = 0; i < n - 1; i++) {
        const dy = y[i + 1] - y[i];
        let fix = 0;
        if (dy < -maxDown) fix = (dy + maxDown) / 2;
        else if (dy > maxUp) fix = (dy - maxUp) / 2;
        if (fix !== 0) {
          y[i] += fix;
          y[i + 1] -= fix;
          changed = true;
        }
      }
      if (!changed) break;
    }
    y = boxSmooth(y, 4);
    this.py = y;

    // Signed curvature (positive = turning right) drives berm banking.
    let k = new Float32Array(n);
    for (let i = 1; i < n - 1; i++) {
      const dtx = (this.tx[i + 1] - this.tx[i - 1]) / (2 * this.ds);
      const dtz = (this.tz[i + 1] - this.tz[i - 1]) / (2 * this.ds);
      k[i] = dtx * -this.tz[i] + dtz * this.tx[i];
    }
    k = boxSmooth(k, 10);
    this.bankTan = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const ang = clamp((Math.abs(k[i]) - 1 / 90) * 18, 0, 0.62);
      this.bankTan[i] = Math.sign(k[i]) * Math.tan(ang);
    }

    // Built features (jumps, drops) as height offsets along the trail.
    this.feat = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const s = i * this.ds;
      let off = 0;
      for (const f of def.features) {
        if (f.type === 'table') {
          const a = f.at - f.lipLen;
          if (s >= a && s < f.at) {
            // curvature eases off towards the lip so it doesn't buck the rear wheel
            const t = (s - a) / f.lipLen;
            off += f.lipH * Math.pow(t, 1.5);
          } else if (s >= f.at && s < f.at + f.top) {
            off += f.lipH;
          } else if (s >= f.at + f.top && s < f.at + f.top + f.land) {
            const t = (s - f.at - f.top) / f.land;
            off += f.lipH * 0.5 * (1 + Math.cos(Math.PI * t));
          }
        } else if (f.type === 'drop') {
          // flat run-in, a short steep face, then a steeper-than-trail landing ramp
          const land = 3 + f.h * 2.5;
          if (s >= f.at - 16 && s < f.at) {
            off += f.h * smoothstep(f.at - 16, f.at - 7, s);
          } else if (s >= f.at && s < f.at + 0.6) {
            off += f.h * (1 - 0.5 * ((s - f.at) / 0.6));
          } else if (s >= f.at + 0.6 && s < f.at + 0.6 + land) {
            const t = (s - f.at - 0.6) / land;
            off += f.h * 0.5 * (1 - t) * (1 - t * 0.3);
          }
        } else if (f.type === 'gap') {
          // lip, a trench you have to clear, then a landing knoll
          const a = f.at - f.lipLen;
          const face = f.at + f.gap - 0.8;
          const peak = f.lipH * 0.85;
          if (s >= a && s < f.at) {
            off += f.lipH * Math.pow((s - a) / f.lipLen, 1.5);
          } else if (s >= f.at && s < face) {
            off -= f.depth * Math.sin((Math.PI * (s - f.at)) / (face - f.at));
          } else if (s >= face && s < f.at + f.gap) {
            off += peak * smoothstep(face, f.at + f.gap, s);
          } else if (s >= f.at + f.gap && s < f.at + f.gap + f.land) {
            const t = (s - f.at - f.gap) / f.land;
            off += peak * 0.5 * (1 + Math.cos(Math.PI * t));
          }
        }
      }
      this.feat[i] = off;
    }
  }

  // Height of the riding surface on the centre line, before cross-section shaping.
  centreHeight(i) {
    return this.py[i] + this.feat[i];
  }

  indexAt(s) {
    return clamp(Math.round(s / this.ds), 0, this.n - 1);
  }

  // Nearest point on the trail to (x, z).
  nearest(x, z) {
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < this.n; i += 6) {
      const dx = x - this.px[i];
      const dz = z - this.pz[i];
      const d = dx * dx + dz * dz;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    const a = Math.max(0, best - 6);
    const b = Math.min(this.n - 1, best + 6);
    for (let i = a; i <= b; i++) {
      const dx = x - this.px[i];
      const dz = z - this.pz[i];
      const d = dx * dx + dz * dz;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return { i: best, s: best * this.ds, d: Math.sqrt(bestD) };
  }
}

export class World {
  constructor(RAPIER, physics, scene) {
    this.R = RAPIER;
    this.physics = physics;
    this.scene = scene;
    this.surfaces = new Map();
    this.batches = new Map();
    this.noise = createNoise2D(mulberry32(9001));
    this.noise2 = createNoise2D(mulberry32(77));
    this.noise3 = createNoise2D(mulberry32(31337));
    this.bounds = { x0: X0, z0: Z0, x1: X0 + WIDTH, z1: Z0 + LENGTH };

    this.buildProfile();
    this.tracks = TRACKS.map((def, i) => new Track(def, i, (x, z) => this.natural(x, z)));
    this.buildHeights();
    this.buildTerrain();
    this.rockGeos = this.makeRockGeometries();
    for (const t of this.tracks) {
      this.buildTrackObstacles(t);
      this.buildTrackMarkers(t);
      this.buildGates(t);
    }
  }

  // Overall mountain slope: steeper and flatter sections from top to bottom.
  buildProfile() {
    const prof = new Float32Array(NZ);
    for (let i = NZ - 2; i >= 0; i--) {
      const z = Z0 + i;
      const grade = 0.16 + 0.07 * Math.sin(z * 0.011 + 0.5) + 0.04 * Math.sin(z * 0.037 + 2.0);
      prof[i] = prof[i + 1] + grade;
    }
    this.prof = prof;
  }

  profile(z) {
    const f = clamp(z - Z0, 0, NZ - 1.001);
    const i = Math.floor(f);
    return lerp(this.prof[i], this.prof[i + 1], f - i);
  }

  natural(x, z) {
    const nx = x / 160;
    return (
      this.profile(z) +
      32 * nx * nx +
      5 * nx +
      9 * fbm(this.noise, x / 110, z / 110, 4) +
      1.6 * fbm(this.noise2, x / 22, z / 22, 3) +
      0.22 * this.noise3(x / 4.5, z / 4.5)
    );
  }

  buildHeights() {
    const N = NX * NZ;
    const dist = new Float32Array(N).fill(1e9);
    const lat = new Float32Array(N);
    const along = new Float32Array(N);
    const idx = new Int32Array(N).fill(-1);
    const trk = new Int8Array(N).fill(-1);

    for (const t of this.tracks) {
      const R = t.halfWidth + 7.5;
      const r = Math.ceil(R);
      for (let i = 0; i < t.n; i++) {
        const cx = t.px[i];
        const cz = t.pz[i];
        const rx = -t.tz[i];
        const rz = t.tx[i];
        const gx0 = Math.max(0, Math.floor(cx - X0) - r);
        const gx1 = Math.min(NX - 1, Math.ceil(cx - X0) + r);
        const gz0 = Math.max(0, Math.floor(cz - Z0) - r);
        const gz1 = Math.min(NZ - 1, Math.ceil(cz - Z0) + r);
        for (let gz = gz0; gz <= gz1; gz++) {
          const dz = Z0 + gz - cz;
          for (let gx = gx0; gx <= gx1; gx++) {
            const dx = X0 + gx - cx;
            const d = Math.sqrt(dx * dx + dz * dz);
            const k = gz * NX + gx;
            if (d < dist[k]) {
              dist[k] = d;
              lat[k] = dx * rx + dz * rz;
              along[k] = dx * t.tx[i] + dz * t.tz[i];
              idx[k] = i;
              trk[k] = t.index;
            }
          }
        }
      }
    }

    const h = new Float32Array(N);
    for (let gz = 0; gz < NZ; gz++) {
      for (let gx = 0; gx < NX; gx++) {
        const k = gz * NX + gx;
        const x = X0 + gx;
        const z = Z0 + gz;
        const nat = this.natural(x, z);
        if (idx[k] < 0) {
          h[k] = nat;
          continue;
        }
        const t = this.tracks[trk[k]];
        const i = idx[k];
        const u = lat[k];
        // sideways distance (Euclidean only past the ends of the trail)
        const d = Math.hypot(u, Math.max(0, Math.abs(along[k]) - t.ds));
        const hw = t.halfWidth;
        // interpolate trail values at this point's exact distance along the trail
        const fi = clamp(i + along[k] / t.ds, 0, t.n - 1.001);
        const i0 = Math.floor(fi);
        const f = fi - i0;
        const py = lerp(t.py[i0], t.py[i0 + 1], f);
        const feat = lerp(t.feat[i0], t.feat[i0 + 1], f);
        const bankTan = lerp(t.bankTan[i0], t.bankTan[i0 + 1], f);
        let bank = -u * bankTan;
        bank = clamp(bank, -0.15, 1.5);
        const cup = d < hw ? -0.05 * (1 - (d / hw) ** 2) : 0;
        const surf = py + bank + cup;
        const w = smoothstep(hw + 0.3, hw + 6.5, d);
        h[k] = lerp(surf, nat, w) + feat * (1 - smoothstep(hw + 0.5, hw + 2.6, d));
      }
    }
    this.heights = h;
    this.trailDist = dist;
    this.trailLat = lat;
    this.trailIdx = idx;
    this.trailTrk = trk;
  }

  // Bilinear height of the ground at (x, z).
  heightAt(x, z) {
    const fx = clamp(x - X0, 0, NX - 1.001);
    const fz = clamp(z - Z0, 0, NZ - 1.001);
    const ix = Math.floor(fx);
    const iz = Math.floor(fz);
    const ax = fx - ix;
    const az = fz - iz;
    const k = iz * NX + ix;
    const h = this.heights;
    return lerp(lerp(h[k], h[k + 1], ax), lerp(h[k + NX], h[k + NX + 1], ax), az);
  }

  // Distance from (x, z) to the nearest trail centre line (large when far away).
  distToTrail(x, z) {
    const gx = Math.round(clamp(x - X0, 0, NX - 1));
    const gz = Math.round(clamp(z - Z0, 0, NZ - 1));
    return this.trailDist[gz * NX + gx];
  }

  surfaceFor(collider, x, z) {
    const s = this.surfaces.get(collider.handle);
    if (s !== SURFACE.trail) return s || SURFACE.forest;
    const gx = Math.round(clamp(x - X0, 0, NX - 1));
    const gz = Math.round(clamp(z - Z0, 0, NZ - 1));
    const k = gz * NX + gx;
    const t = this.tracks[this.trailTrk[k]];
    if (t && this.trailDist[k] < t.halfWidth + 0.6) return SURFACE.trail;
    return SURFACE.forest;
  }

  buildTerrain() {
    const N = NX * NZ;
    const pos = new Float32Array(N * 3);
    for (let gz = 0; gz < NZ; gz++) {
      for (let gx = 0; gx < NX; gx++) {
        const k = gz * NX + gx;
        pos[k * 3] = X0 + gx;
        pos[k * 3 + 1] = this.heights[k];
        pos[k * 3 + 2] = Z0 + gz;
      }
    }
    const index = new Uint32Array((NX - 1) * (NZ - 1) * 6);
    let p = 0;
    for (let gz = 0; gz < NZ - 1; gz++) {
      for (let gx = 0; gx < NX - 1; gx++) {
        const a = gz * NX + gx;
        const b = a + 1;
        const c = a + NX;
        const d = c + 1;
        index[p++] = a;
        index[p++] = c;
        index[p++] = b;
        index[p++] = b;
        index[p++] = c;
        index[p++] = d;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setIndex(new THREE.BufferAttribute(index, 1));
    geo.computeVertexNormals();

    const nrm = geo.getAttribute('normal').array;
    const col = new Float32Array(N * 3);
    const cMoss = new THREE.Color(0x4b5d2b);
    const cNeedle = new THREE.Color(0x6b5534);
    const cGrass = new THREE.Color(0x67822f);
    const cDirt = new THREE.Color(0x8a6440);
    const cDirtDark = new THREE.Color(0x5c3f27);
    const cRock = new THREE.Color(0x7c776d);
    const cPacked = new THREE.Color(0xb48a5c);
    const floor = new THREE.Color();
    const dirt = new THREE.Color();
    for (let gz = 0; gz < NZ; gz++) {
      for (let gx = 0; gx < NX; gx++) {
        const k = gz * NX + gx;
        const x = X0 + gx;
        const z = Z0 + gz;
        floor.copy(cMoss).lerp(cNeedle, 0.5 + 0.5 * this.noise(x / 9, z / 9));
        const g = smoothstep(0.15, 0.55, this.noise2(x / 34, z / 34));
        floor.lerp(cGrass, g * 0.75);
        floor.multiplyScalar(0.9 + 0.2 * this.noise3(x * 0.7, z * 0.7));
        const steep = smoothstep(0.82, 0.62, nrm[k * 3 + 1]);
        floor.lerp(cRock, steep * 0.8);

        let dirtAmt = 0;
        const i = this.trailIdx[k];
        if (i >= 0) {
          const t = this.tracks[this.trailTrk[k]];
          const d = this.trailDist[k];
          const hw = t.halfWidth;
          dirtAmt = 1 - smoothstep(hw - 0.2, hw + 0.9, d);
          const bank = -this.trailLat[k] * t.bankTan[i];
          if (bank > 0.25) dirtAmt = Math.max(dirtAmt, 1 - smoothstep(hw + 1.5, hw + 3.5, d));
          if (t.feat[i] > 0.05) dirtAmt = Math.max(dirtAmt, 1 - smoothstep(hw + 1.2, hw + 2.8, d));
          dirtAmt *= 0.85 + 0.15 * this.noise(x * 1.3, z * 1.3);
        }
        dirt.copy(cDirt).lerp(cDirtDark, 0.5 + 0.5 * this.noise3(x * 0.9, z * 0.9));
        if (i >= 0) {
          // built jumps are lighter packed dirt; gap trenches are darker
          const f = this.tracks[this.trailTrk[k]].feat[i];
          dirt.lerp(cPacked, smoothstep(0.1, 0.9, f) * 0.8);
          if (f < -0.1) dirt.multiplyScalar(0.72);
        }
        floor.lerp(dirt, clamp(dirtAmt, 0, 1));
        col[k * 3] = floor.r;
        col[k * 3 + 1] = floor.g;
        col[k * 3 + 2] = floor.b;
      }
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));

    // Draw the ground as tiles so the ones behind the camera are skipped.
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
    const TILE = 64;
    for (let tz = 0; tz < NZ - 1; tz += TILE) {
      for (let tx = 0; tx < NX - 1; tx += TILE) {
        const w = Math.min(TILE, NX - 1 - tx) + 1;
        const h = Math.min(TILE, NZ - 1 - tz) + 1;
        const tPos = new Float32Array(w * h * 3);
        const tNrm = new Float32Array(w * h * 3);
        const tCol = new Float32Array(w * h * 3);
        for (let j = 0; j < h; j++) {
          for (let i = 0; i < w; i++) {
            const src = ((tz + j) * NX + tx + i) * 3;
            const dst = (j * w + i) * 3;
            for (let c = 0; c < 3; c++) {
              tPos[dst + c] = pos[src + c];
              tNrm[dst + c] = nrm[src + c];
              tCol[dst + c] = col[src + c];
            }
          }
        }
        const tIdx = new Uint32Array((w - 1) * (h - 1) * 6);
        let q = 0;
        for (let j = 0; j < h - 1; j++) {
          for (let i = 0; i < w - 1; i++) {
            const a = j * w + i;
            const b = a + 1;
            const c = a + w;
            const d = c + 1;
            tIdx.set([a, c, b, b, c, d], q);
            q += 6;
          }
        }
        const tg = new THREE.BufferGeometry();
        tg.setAttribute('position', new THREE.BufferAttribute(tPos, 3));
        tg.setAttribute('normal', new THREE.BufferAttribute(tNrm, 3));
        tg.setAttribute('color', new THREE.BufferAttribute(tCol, 3));
        tg.setIndex(new THREE.BufferAttribute(tIdx, 1));
        tg.computeBoundingSphere();
        const mesh = new THREE.Mesh(tg, mat);
        mesh.receiveShadow = true;
        this.scene.add(mesh);
      }
    }
    geo.dispose();

    const R = this.R;
    const desc = R.ColliderDesc.trimesh(pos, index, R.TriMeshFlags.FIX_INTERNAL_EDGES)
      .setCollisionGroups(WORLD_GROUPS)
      .setFriction(0.9);
    const col2 = this.physics.createCollider(desc);
    this.surfaces.set(col2.handle, SURFACE.trail);
  }

  makeRockGeometries() {
    const geos = [];
    for (let v = 0; v < 6; v++) {
      const geo = new THREE.IcosahedronGeometry(1, 1);
      const p = geo.getAttribute('position');
      const rand = mulberry32(100 + v);
      const nz = createNoise2D(rand);
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i);
        const y = p.getY(i);
        const z = p.getZ(i);
        const n = nz(x * 1.4 + z * 0.7 + v, y * 1.4 - z * 0.5);
        const s = 1 + 0.3 * n;
        p.setXYZ(i, x * s, y * s * 0.72, z * s);
      }
      geo.computeVertexNormals();
      geos.push(geo);
    }
    return geos;
  }

  // Static obstacles are gathered into one triangle mesh per surface kind and
  // per band of the mountain: thousands of separate colliders slow Rapier down.
  addStatic(kind, z, pos, idx) {
    const band = Math.floor((z - Z0) / 80);
    const key = `${kind}:${band}`;
    let b = this.batches.get(key);
    if (!b) {
      b = { kind, pos: [], idx: [] };
      this.batches.set(key, b);
    }
    const base = b.pos.length / 3;
    for (let i = 0; i < pos.length; i++) b.pos.push(pos[i]);
    if (idx) {
      for (let i = 0; i < idx.length; i++) b.idx.push(base + idx[i]);
    } else {
      for (let i = 0; i < pos.length / 3; i++) b.idx.push(base + i);
    }
  }

  // A closed n-sided prism from a to b (trunks, logs, roots).
  addPrism(kind, a, b, r, sides = 7) {
    const dir = new THREE.Vector3().subVectors(b, a).normalize();
    const side = Math.abs(dir.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const u = new THREE.Vector3().crossVectors(dir, side).normalize();
    const v = new THREE.Vector3().crossVectors(dir, u);
    const pos = [];
    const idx = [];
    for (const c of [a, b]) {
      for (let i = 0; i < sides; i++) {
        const t = (i / sides) * Math.PI * 2;
        pos.push(
          c.x + (u.x * Math.cos(t) + v.x * Math.sin(t)) * r,
          c.y + (u.y * Math.cos(t) + v.y * Math.sin(t)) * r,
          c.z + (u.z * Math.cos(t) + v.z * Math.sin(t)) * r,
        );
      }
    }
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
    const ca = sides * 2;
    const cb = ca + 1;
    for (let i = 0; i < sides; i++) {
      const j = (i + 1) % sides;
      idx.push(i, j, sides + i, j, sides + j, sides + i, ca, j, i, cb, sides + i, sides + j);
    }
    this.addStatic(kind, (a.z + b.z) / 2, pos, idx);
  }

  flushStatic() {
    for (const b of this.batches.values()) {
      const desc = this.R.ColliderDesc.trimesh(new Float32Array(b.pos), new Uint32Array(b.idx))
        .setCollisionGroups(WORLD_GROUPS)
        .setFriction(0.7);
      const c = this.physics.createCollider(desc);
      this.surfaces.set(c.handle, SURFACE[b.kind]);
    }
    this.batches.clear();
  }

  // Places a rock: an instance for drawing plus its triangles for collision.
  addRock(list, variant, x, y, z, sx, sy, sz, rotY) {
    const geo = this.rockGeos[variant];
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY),
      new THREE.Vector3(sx, sy, sz),
    );
    list[variant].push(m);
    const src = geo.getAttribute('position');
    const pts = new Float32Array(src.count * 3);
    const tmp = new THREE.Vector3();
    for (let i = 0; i < src.count; i++) {
      tmp.fromBufferAttribute(src, i).applyMatrix4(m);
      pts[i * 3] = tmp.x;
      pts[i * 3 + 1] = tmp.y;
      pts[i * 3 + 2] = tmp.z;
    }
    this.addStatic('rock', z, pts, geo.index ? geo.index.array : null);
  }

  flushRocks(list, color = 0x8b867c) {
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.95, flatShading: true });
    const tint = new THREE.Color();
    const rand = mulberry32(list.length * 7 + 3);
    list.forEach((mats, v) => {
      if (!mats.length) return;
      const im = new THREE.InstancedMesh(this.rockGeos[v], mat, mats.length);
      mats.forEach((m, i) => {
        im.setMatrixAt(i, m);
        const g = 0.75 + rand() * 0.35;
        tint.setRGB(g, g * (0.97 + rand() * 0.05), g * (0.92 + rand() * 0.08));
        im.setColorAt(i, tint);
      });
      im.castShadow = true;
      im.receiveShadow = true;
      im.computeBoundingSphere();
      this.scene.add(im);
    });
  }

  buildTrackObstacles(t) {
    const rand = mulberry32(t.def.seed);
    const hw = t.halfWidth;
    const rocks = [[], [], [], [], [], []];
    const roots = [];

    const at = (s, u) => {
      const i = t.indexAt(s);
      const x = t.px[i] + -t.tz[i] * u;
      const z = t.pz[i] + t.tx[i] * u;
      return { i, x, z };
    };

    for (const f of t.def.features) {
      if (f.from >= t.length) continue;
      const to = Math.min(f.to ?? 0, t.length - 10);
      if (f.type === 'rocks') {
        const count = Math.round((to - f.from) * 1.1 * (f.density || 1));
        for (let n = 0; n < count; n++) {
          const s = f.from + rand() * (to - f.from);
          const u = (rand() * 2 - 1) * (hw + 0.4);
          const { x, z } = at(s, u);
          // smaller rocks in the riding line, chunkier ones towards the edges
          const edge = Math.abs(u) / (hw + 0.4);
          const size = 0.1 + Math.pow(rand(), 2) * (0.22 + 0.25 * edge);
          const sx = size * (0.8 + rand() * 0.6);
          const sy = size * (0.55 + rand() * 0.5);
          const sz = size * (0.8 + rand() * 0.6);
          const y = this.heightAt(x, z) - sy * 0.35;
          this.addRock(rocks, Math.floor(rand() * 6), x, y, z, sx, sy, sz, rand() * Math.PI * 2);
        }
        // Big boulders lining the rock garden.
        for (let s = f.from; s < to; s += 6 + rand() * 6) {
          const side = rand() < 0.5 ? -1 : 1;
          const u = side * (hw + 0.9 + rand() * 1.8);
          const { x, z } = at(s, u);
          const size = 0.6 + rand() * 0.8;
          const y = this.heightAt(x, z) - size * 0.3;
          this.addRock(rocks, Math.floor(rand() * 6), x, y, z, size * 1.2, size * 0.8, size, rand() * 6.3);
        }
      } else if (f.type === 'roots') {
        for (let s = f.from; s < to; s += 1.8 + rand() * 2.2) {
          const c = at(s, (rand() - 0.5) * 1.2);
          const ang = (rand() - 0.5) * 1.1;
          const rx = -t.tz[c.i];
          const rz = t.tx[c.i];
          const ca = Math.cos(ang);
          const sa = Math.sin(ang);
          const dx = rx * ca - rz * sa;
          const dz = rx * sa + rz * ca;
          const half = hw + 0.6 + rand() * 0.8;
          const r = 0.04 + rand() * 0.04;
          const ax = c.x - dx * half;
          const az = c.z - dz * half;
          const bx = c.x + dx * half;
          const bz = c.z + dz * half;
          // Built from short pieces that hug the ground, tapering towards the ends.
          const lift = -r * 0.25;
          const pieces = Math.ceil((half * 2) / 0.6);
          let prev = null;
          for (let p = 0; p <= pieces; p++) {
            const f = p / pieces;
            const x = lerp(ax, bx, f);
            const z = lerp(az, bz, f);
            const taper = 1 - 0.45 * Math.abs(f - 0.5) * 2;
            const pt = new THREE.Vector3(x, this.heightAt(x, z) + lift * taper, z);
            if (prev) {
              const mid = prev.clone().add(pt).multiplyScalar(0.5);
              const dir = pt.clone().sub(prev);
              const len = dir.length();
              dir.normalize();
              const rr = r * (1 - 0.45 * Math.abs(f - 0.5 / pieces - 0.5) * 2);
              const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
              roots.push(new THREE.Matrix4().compose(mid, q, new THREE.Vector3(rr, len + rr, rr)));
              const ext = dir.clone().multiplyScalar(rr * 0.5);
              this.addPrism('root', prev.clone().sub(ext), pt.clone().add(ext), rr, 6);
            }
            prev = pt;
          }
        }
      } else if (f.type === 'drop') {
        // A rock slab marks the lip of each drop.
        for (let u = -hw - 0.6; u <= hw + 0.6; u += 0.9) {
          const { x, z } = at(f.at - 0.4, u + (rand() - 0.5) * 0.3);
          const y = this.heightAt(x, z) - 0.28;
          this.addRock(rocks, Math.floor(rand() * 6), x, y, z, 0.55, 0.35, 0.5, rand() * 6.3);
        }
      }
    }

    this.flushRocks(rocks);
    if (roots.length) {
      const geo = new THREE.CylinderGeometry(1, 1, 1, 7, 3);
      const p = geo.getAttribute('position');
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i);
        const wob = 1 + 0.18 * Math.sin(y * 21) * Math.cos(y * 7);
        p.setX(i, p.getX(i) * wob);
        p.setZ(i, p.getZ(i) * wob);
      }
      geo.computeVertexNormals();
      const mat = new THREE.MeshStandardMaterial({ color: 0x5b3c25, roughness: 0.9, flatShading: true });
      const im = new THREE.InstancedMesh(geo, mat, roots.length);
      roots.forEach((m, i) => im.setMatrixAt(i, m));
      im.castShadow = true;
      im.receiveShadow = true;
      im.computeBoundingSphere();
      this.scene.add(im);
    }
  }

  // Course tape on both sides of the trail.
  buildTrackMarkers(t) {
    const hw = t.halfWidth;
    const poles = [];
    const tapes = [];
    const tapeColors = [];
    const step = Math.round(9 / t.ds);
    for (const side of [-1, 1]) {
      let prev = null;
      let n = 0;
      for (let i = 6; i < t.n - 6; i += step) {
        const u = side * (hw + 1.5);
        const x = t.px[i] + -t.tz[i] * u;
        const z = t.pz[i] + t.tx[i] * u;
        // Skip where another part of a trail runs close by (switchbacks).
        const near = this.distToTrail(x, z);
        if (near < hw + 0.8) {
          prev = null;
          continue;
        }
        const y = this.heightAt(x, z);
        const top = new THREE.Vector3(x, y + 0.9, z);
        poles.push(new THREE.Matrix4().compose(
          new THREE.Vector3(x, y + 0.5, z),
          new THREE.Quaternion(),
          new THREE.Vector3(1, 1, 1),
        ));
        if (prev && prev.distanceTo(top) < 14) {
          const mid = prev.clone().add(top).multiplyScalar(0.5);
          mid.y -= 0.08;
          const dir = top.clone().sub(prev);
          const len = dir.length();
          const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir.normalize());
          tapes.push(new THREE.Matrix4().compose(mid, q, new THREE.Vector3(len, 1, 1)));
          tapeColors.push(n++ % 2 ? 0xf2f2f2 : 0xd8262c);
        }
        prev = top;
      }
    }
    const poleGeo = new THREE.CylinderGeometry(0.022, 0.028, 1.0, 6);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0xe8e2d0, roughness: 0.8 });
    const pim = new THREE.InstancedMesh(poleGeo, poleMat, poles.length);
    poles.forEach((m, i) => pim.setMatrixAt(i, m));
    pim.computeBoundingSphere();
    this.scene.add(pim);

    const tapeGeo = new THREE.BoxGeometry(1, 0.05, 0.004);
    const tapeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, side: THREE.DoubleSide });
    const tim = new THREE.InstancedMesh(tapeGeo, tapeMat, tapes.length);
    const c = new THREE.Color();
    tapes.forEach((m, i) => {
      tim.setMatrixAt(i, m);
      tim.setColorAt(i, c.set(tapeColors[i]));
    });
    tim.computeBoundingSphere();
    this.scene.add(tim);
  }

  makeBanner(text, bg, fg) {
    const cv = document.createElement('canvas');
    cv.width = 512;
    cv.height = 128;
    const g = cv.getContext('2d');
    g.fillStyle = bg;
    g.fillRect(0, 0, 512, 128);
    g.fillStyle = fg;
    g.font = 'bold 74px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 256, 68);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }

  buildGate(t, s, text, bg) {
    const i = t.indexAt(s);
    const hw = t.halfWidth;
    const group = new THREE.Group();
    const x = t.px[i];
    const z = t.pz[i];
    const y = t.centreHeight(i);
    group.position.set(x, y, z);
    group.rotation.y = Math.atan2(-t.tx[i], -t.tz[i]);
    const wood = new THREE.MeshStandardMaterial({ color: 0x7a5232, roughness: 0.9 });
    const postGeo = new THREE.BoxGeometry(0.22, 3.6, 0.22);
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(postGeo, wood);
      post.position.set(side * (hw + 0.9), 1.6, 0);
      post.castShadow = true;
      group.add(post);
      const wx = x + -t.tz[i] * side * (hw + 0.9);
      const wz = z + t.tx[i] * side * (hw + 0.9);
      const c = this.physics.createCollider(
        this.R.ColliderDesc.cuboid(0.11, 2, 0.11)
          .setTranslation(wx, this.heightAt(wx, wz) + 1.6, wz)
          .setCollisionGroups(WORLD_GROUPS),
      );
      this.surfaces.set(c.handle, SURFACE.wood);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(2 * hw + 2.2, 0.25, 0.25), wood);
    beam.position.set(0, 3.35, 0);
    beam.castShadow = true;
    group.add(beam);
    // one single-sided banner facing each way, so the text reads from both sides
    const tex = this.makeBanner(text, bg, '#ffffff');
    const bannerMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 });
    for (const yaw of [0, Math.PI]) {
      const banner = new THREE.Mesh(new THREE.PlaneGeometry(2 * hw + 1.4, 0.7), bannerMat);
      banner.position.set(0, 2.85, yaw ? -0.01 : 0.01);
      banner.rotation.y = yaw;
      group.add(banner);
    }
    this.scene.add(group);
  }

  buildGates(t) {
    this.buildGate(t, 4, 'START', '#1d6b3a');
    this.buildGate(t, t.length - 8, 'FINISH', '#b3261e');
  }

  // A rideable spawn pose on track t at distance s.
  spawnPose(t, s) {
    const i = t.indexAt(s);
    const x = t.px[i];
    const z = t.pz[i];
    const j = Math.min(t.n - 1, i + 4);
    const y0 = this.heightAt(x, z);
    const y1 = this.heightAt(t.px[j], t.pz[j]);
    const fwd = new THREE.Vector3(t.px[j] - x, y1 - y0, t.pz[j] - z).normalize();
    return { position: new THREE.Vector3(x, y0, z), forward: fwd };
  }
}
