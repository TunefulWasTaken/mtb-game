// Test helper: rides the bike down the track without rendering.
// In the browser console: const ap = await import('/dev/autopilot.js'); ap.ride(10, 35)

const game = () => window.game;

export function snapshot(tag) {
  const { bike: b, track: tr } = game();
  const t = b.body.translation();
  const n = tr.nearest(t.x, t.z);
  return {
    tag,
    kmh: +(b.speed * 3.6).toFixed(1),
    lean: +b.lean.toFixed(2),
    steer: +b.steer.toFixed(2),
    xF: +b.wheels[0].x.toFixed(3),
    xR: +b.wheels[1].x.toFixed(3),
    contact: (b.wheels[0].contact ? 'F' : '-') + (b.wheels[1].contact ? 'R' : '-'),
    crash: b.crashReason,
    s: Math.round(n.s),
    off: +n.d.toFixed(1),
    pitch: +b.fwd.y.toFixed(2),
  };
}

// Steer towards a point `look` metres ahead on the trail and hold roughly vKmh.
export function ride(seconds, vKmh, { every = 1, look = 9, gain = 2.2, lean = 0 } = {}) {
  const { bike: b, track: tr } = game();
  const out = [];
  let maxLean = 0;
  let crash = null;
  const steps = Math.round(seconds * 120);
  for (let i = 0; i < steps; i++) {
    const t = b.body.translation();
    const n = tr.nearest(t.x, t.z);
    const j = tr.indexAt(n.s + look);
    const tx = tr.px[j] - t.x;
    const tz = tr.pz[j] - t.z;
    const f = b.fwd;
    const ang = Math.atan2(f.x * tz - f.z * tx, f.x * tx + f.z * tz);
    const v = b.speed * 3.6;
    // like a rider: in the air or near a drop, match the bike to the slope ahead
    let pitch = lean;
    const airborne = !b.wheels[0].contact && !b.wheels[1].contact;
    // pull up at the lip of a drop
    for (const f of tr.def.features) {
      if (f.type === 'drop' && n.s > f.at - 2.5 && n.s < f.at + 0.5) pitch = -0.8;
    }
    if (airborne) {
      const k = tr.indexAt(n.s + 3);
      const slope = (tr.py[k] - tr.py[n.i]) / 3;
      const want = Math.sin(Math.atan(slope));
      // pitch > 0 leans forward (nose down)
      pitch = Math.max(-1, Math.min(1, (b.fwd.y - want) * 6));
    }
    game().sim(1 / 120, {
      throttle: v < vKmh - 5 ? 1 : 0,
      brake: v > vKmh + 3 && b.wheels[0].contact && b.wheels[1].contact ? 1 : 0,
      steer: Math.max(-1, Math.min(1, ang * gain)),
      pitch,
    });
    maxLean = Math.max(maxLean, Math.abs(b.lean));
    if (b.crashed) {
      crash = snapshot('CRASH');
      break;
    }
    if (i % Math.round(120 * every) === 0) out.push(snapshot(`t${(i / 120).toFixed(1)}`));
  }
  return [...out.map((o) => JSON.stringify(o)), `maxLean ${maxLean.toFixed(2)}`, `crash ${JSON.stringify(crash)}`].join('\n');
}

// Ride like ride() but print detailed pitch/load data between two trail distances.
export function trace(sFrom, sTo, vKmh, { every = 5, lean = 0 } = {}) {
  const { bike: b, track: tr } = game();
  const rows = [];
  for (let i = 0; i < 120 * 60; i++) {
    const t = b.body.translation();
    const n = tr.nearest(t.x, t.z);
    const j = tr.indexAt(n.s + 9);
    const tx = tr.px[j] - t.x;
    const tz = tr.pz[j] - t.z;
    const f = b.fwd;
    const ang = Math.atan2(f.x * tz - f.z * tx, f.x * tx + f.z * tz);
    const v = b.speed * 3.6;
    game().sim(1 / 120, {
      throttle: v < vKmh - 5 ? 1 : 0,
      brake: v > vKmh + 3 ? 1 : 0,
      steer: Math.max(-1, Math.min(1, ang * 2.2)),
      pitch: lean,
    });
    if (n.s > sFrom && i % every === 0) {
      const av = b.body.angvel();
      const pr = av.x * b.right.x + av.y * b.right.y + av.z * b.right.z;
      rows.push(
        `s${n.s.toFixed(1)} v${v.toFixed(0)} pitch${b.fwd.y.toFixed(2)} pr${pr.toFixed(2)} lean${b.lean.toFixed(2)} ` +
          `F${b.wheels[0].load.toFixed(0)} R${b.wheels[1].load.toFixed(0)} xF${b.wheels[0].x.toFixed(3)} xR${b.wheels[1].x.toFixed(3)}`,
      );
    }
    if (b.crashed) {
      rows.push(`CRASH ${b.crashReason}`);
      break;
    }
    if (n.s > sTo) break;
  }
  return rows.join('\n');
}

// Coast down a perfectly smooth test slope far from the map and report wheel loads.
export async function planeTest(seconds = 6, grade = 0.2, ride = {}) {
  const RAPIER = (await import('@dimforge/rapier3d-compat')).default;
  const THREE = await import('three');
  const g = game();
  const b = g.bike;
  const axis = new THREE.Vector3(1, 0, 0);
  if (!window.__plane) {
    const q = new THREE.Quaternion().setFromAxisAngle(axis, -grade);
    window.__plane = g.physics.createCollider(
      RAPIER.ColliderDesc.cuboid(50, 1, 600)
        .setTranslation(1000, -300, 0)
        .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
        .setCollisionGroups((1 << 16) | 0xffff),
    );
  }
  const n = new THREE.Vector3(0, 1, 0).applyAxisAngle(axis, -grade);
  const fwd = new THREE.Vector3(0, 0, -1).applyAxisAngle(axis, -grade);
  const downhill = fwd.y < 0 ? fwd : fwd.clone().negate();
  const top = new THREE.Vector3(1000, -300, 0).addScaledVector(n, 1).addScaledVector(downhill, -500);
  b.placeAt(top, downhill);
  const loads = { F: [], R: [] };
  const steps = Math.round(seconds * 120);
  for (let i = 0; i < steps; i++) {
    g.sim(1 / 120, ride);
    if (i > 240) {
      loads.F.push(b.wheels[0].load);
      loads.R.push(b.wheels[1].load);
    }
    if (b.crashed) break;
  }
  const stats = (a) => {
    const mean = a.reduce((x, y) => x + y, 0) / a.length;
    const sd = Math.sqrt(a.reduce((x, y) => x + (y - mean) ** 2, 0) / a.length);
    return `mean ${mean.toFixed(0)} sd ${sd.toFixed(0)} min ${Math.min(...a).toFixed(0)} max ${Math.max(...a).toFixed(0)}`;
  };
  return `kmh ${(b.speed * 3.6).toFixed(0)} crash '${b.crashReason}'\nF ${stats(loads.F)}\nR ${stats(loads.R)}`;
}

export async function start() {
  await new Promise((r) => {
    const i = setInterval(() => {
      const btn = document.getElementById('startBtn');
      if (window.game) {
        clearInterval(i);
        r();
      } else if (btn && btn.style.display === 'inline-block') {
        btn.click();
      }
    }, 100);
  });
}

export function reset(s = 3) {
  game().spawn(s);
  game().sim(0.3, { brake: 1 });
}
