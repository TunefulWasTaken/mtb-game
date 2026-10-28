// Detailed bike built from shapes: frame, dual-crown fork, linkage and shock,
// spoked wheels with knobby tyres, brakes, drivetrain and cockpit. The moving
// parts (steering, fork, swingarm, shock, wheels, cranks, chain) are animated
// from the physics state every frame.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const V3 = THREE.Vector3;
const UP = new V3(0, 1, 0);

// Key points shared by the model and the physics.
export function bikeGeometry(cfg) {
  const h = cfg.headAngle;
  const L = cfg.wheelbase;
  const sa = new V3(0, Math.sin(h), Math.cos(h)); // steering axis, pointing up
  const perp = new V3(0, Math.cos(h), -Math.sin(h)); // forward, square to the steering axis
  const frontAxle = new V3(0, 0, -L / 2);
  const rearAxle = new V3(0, 0, L / 2);
  const axisPoint = frontAxle.clone().addScaledVector(perp, -cfg.forkOffset);
  const bbZ = L / 2 - Math.sqrt(cfg.chainstay ** 2 - cfg.bbDrop ** 2);
  const bb = new V3(0, -cfg.bbDrop, bbZ);
  const pivot = new V3(...cfg.pivot);
  const at = (t) => axisPoint.clone().addScaledVector(sa, t);
  const axisF = sa.clone().negate();
  const d = rearAxle.clone().sub(pivot);
  const axisR = new V3(0, -d.z, d.y).normalize();
  const sagXF = cfg.travelF * cfg.sagF;
  const sagXR = cfg.travelR * cfg.sagR;
  const hubTopF = frontAxle.clone().addScaledVector(axisF, -(cfg.travelF - sagXF));
  const hubTopR = rearAxle.clone().addScaledVector(axisR, -(cfg.travelR - sagXR));
  return {
    sa, perp, frontAxle, rearAxle, axisPoint, bb, pivot, at, axisF, axisR,
    sagXF, sagXR, hubTopF, hubTopR, swingLen: d.length(),
    htBottom: at(0.585), htTop: at(0.735),
  };
}

function tube(a, b, r, mat, seg = 12, r2 = r) {
  const dir = new V3().subVectors(b, a);
  const len = dir.length();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r2, r, len, seg), mat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(UP, dir.normalize());
  return m;
}

const _d = new V3();
function setTube(mesh, a, b) {
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  _d.subVectors(b, a);
  const len = _d.length();
  mesh.quaternion.setFromUnitVectors(UP, _d.divideScalar(len || 1));
  mesh.scale.set(1, len, 1);
}

function axleCyl(r, len, mat, seg = 16) {
  const g = new THREE.CylinderGeometry(r, r, len, seg);
  g.rotateZ(Math.PI / 2);
  return new THREE.Mesh(g, mat);
}

function makeMaterials(cfg) {
  const c = cfg.colors;
  return {
    frame: new THREE.MeshStandardMaterial({ color: c.frame, roughness: 0.35, metalness: 0.25 }),
    frame2: new THREE.MeshStandardMaterial({ color: c.frame2, roughness: 0.45, metalness: 0.3 }),
    decal: new THREE.MeshStandardMaterial({ color: c.decal, roughness: 0.4 }),
    stanchion: new THREE.MeshStandardMaterial({ color: c.stanchion, roughness: 0.2, metalness: 0.75 }),
    fork: new THREE.MeshStandardMaterial({ color: c.fork, roughness: 0.4, metalness: 0.3 }),
    alu: new THREE.MeshStandardMaterial({ color: 0xb8bcc2, roughness: 0.3, metalness: 0.85 }),
    darkAlu: new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.35, metalness: 0.7 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.92 }),
    tyreWall: new THREE.MeshStandardMaterial({ color: 0x2a2622, roughness: 0.95 }),
    rim: new THREE.MeshStandardMaterial({ color: c.rim, roughness: 0.4, metalness: 0.5 }),
    spoke: new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.3, metalness: 0.9 }),
    rotor: new THREE.MeshStandardMaterial({ color: 0xc9ccd0, roughness: 0.25, metalness: 0.95 }),
    spring: new THREE.MeshStandardMaterial({ color: 0xf2c418, roughness: 0.35, metalness: 0.4 }),
    chain: new THREE.MeshStandardMaterial({ color: 0x55585e, roughness: 0.4, metalness: 0.8 }),
    plate: new THREE.MeshStandardMaterial({ color: 0xf5f5f0, roughness: 0.6 }),
  };
}

function makeTyreGeometries(cfg) {
  const R = cfg.wheelR;
  const w = cfg.tyreW;
  const tyre = new THREE.TorusGeometry(R - w / 2, w / 2, 12, 64);
  tyre.rotateY(Math.PI / 2);

  const knobs = [];
  const N = 40;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    // centre knobs, alternating paired and single
    if (i % 2 === 0) {
      for (const x of [-0.011, 0.011]) {
        const k = new THREE.BoxGeometry(0.016, 0.011, 0.018);
        k.translate(x, R + 0.002, 0);
        k.rotateX(a);
        knobs.push(k);
      }
    } else {
      const k = new THREE.BoxGeometry(0.02, 0.011, 0.014);
      k.translate(0, R + 0.002, 0);
      k.rotateX(a);
      knobs.push(k);
    }
    // shoulder knobs
    for (const side of [-1, 1]) {
      const k = new THREE.BoxGeometry(0.012, 0.016, 0.02);
      k.rotateZ(side * 0.7);
      k.translate(side * w * 0.42, R - w * 0.22, 0);
      k.rotateX(a + (i % 2) * 0.06);
      knobs.push(k);
    }
    void ca;
    void sa;
  }
  const knobGeo = mergeGeometries(knobs);
  return { tyre, knobGeo };
}

function makeSpokes(cfg) {
  const rimR = cfg.wheelR - cfg.tyreW - 0.004;
  const spokes = [];
  const N = 32;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const side = i % 2 ? 1 : -1;
    const lead = (i % 4 < 2 ? 1 : -1) * 0.55;
    const hub = new V3(side * 0.034, 0.028 * Math.cos(a + lead), 0.028 * Math.sin(a + lead));
    const rim = new V3(side * 0.006, rimR * Math.cos(a), rimR * Math.sin(a));
    const dir = new V3().subVectors(rim, hub);
    const len = dir.length();
    const g = new THREE.CylinderGeometry(0.0013, 0.0013, len, 4);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize()));
    const mid = hub.clone().add(rim).multiplyScalar(0.5);
    g.translate(mid.x, mid.y, mid.z);
    spokes.push(g);
  }
  return mergeGeometries(spokes);
}

function makeRotor(radius) {
  const parts = [];
  const ring = new THREE.RingGeometry(radius - 0.018, radius, 40, 1);
  parts.push(ring);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const arm = new THREE.PlaneGeometry(0.012, radius - 0.03);
    arm.translate(0, (radius - 0.03) / 2 + 0.02, 0);
    arm.rotateZ(a + 0.25);
    parts.push(arm);
  }
  const g = mergeGeometries(parts);
  g.rotateY(Math.PI / 2);
  return g;
}

function makeWheel(cfg, mats, shared, withCassette) {
  const spin = new THREE.Group();
  const R = cfg.wheelR;
  const w = cfg.tyreW;
  spin.add(new THREE.Mesh(shared.tyre, mats.tyreWall));
  spin.add(new THREE.Mesh(shared.knobGeo, mats.rubber));
  const rimR = R - w - 0.002;
  const rim = new THREE.TorusGeometry(rimR, 0.012, 6, 56);
  rim.rotateY(Math.PI / 2);
  rim.scale(1.9, 1, 1);
  spin.add(new THREE.Mesh(rim, mats.rim));
  spin.add(new THREE.Mesh(shared.spokes, mats.spoke));
  spin.add(axleCyl(0.022, 0.1, mats.darkAlu));
  for (const x of [-0.034, 0.034]) {
    const fl = axleCyl(0.032, 0.006, mats.darkAlu);
    fl.position.x = x;
    spin.add(fl);
  }
  const rotor = new THREE.Mesh(shared.rotor, mats.rotor);
  rotor.position.x = -0.062;
  spin.add(rotor);
  if (withCassette) {
    for (let i = 0; i < 7; i++) {
      const cog = axleCyl(0.026 + i * 0.0045, 0.0022, mats.alu, 20);
      cog.position.x = 0.05 - i * 0.0042;
      spin.add(cog);
    }
  }
  return spin;
}

export class BikeModel {
  constructor(cfg) {
    this.cfg = cfg;
    this.geo = bikeGeometry(cfg);
    const g = this.geo;
    const mats = makeMaterials(cfg);
    this.mats = mats;
    const root = new THREE.Group();
    this.root = root;

    const shared = {
      ...makeTyreGeometries(cfg),
      spokes: makeSpokes(cfg),
      rotor: makeRotor(0.101),
    };

    // ---------- Front triangle ----------
    const bb = g.bb;
    const ht = tube(g.htBottom.clone().addScaledVector(g.sa, -0.02), g.htTop.clone().addScaledVector(g.sa, 0.015), 0.031, mats.frame, 16);
    root.add(ht);
    const stj = new V3(0, 0.47, 0.33);
    const seatTop = new V3(0, 0.6, 0.385);
    const ttStart = g.htTop.clone().add(new V3(0, -0.015, 0.02));
    root.add(tube(ttStart, stj, 0.022, mats.frame, 12, 0.025));
    const dtStart = bb.clone().add(new V3(0, 0.035, -0.035));
    const dtEnd = g.htBottom.clone().add(new V3(0, 0.02, 0.02));
    const dt = tube(dtStart, dtEnd, 0.034, mats.frame, 14, 0.03);
    dt.scale.x = 1.15;
    root.add(dt);
    // down tube guard and decal bands
    const guard = tube(
      dtStart.clone().lerp(dtEnd, 0.08).add(new V3(0, -0.012, 0)),
      dtStart.clone().lerp(dtEnd, 0.42).add(new V3(0, -0.012, 0)),
      0.034,
      mats.frame2,
      14,
    );
    guard.scale.set(1.2, 1, 1.05);
    root.add(guard);
    for (const t of [0.55, 0.62, 0.69]) {
      const band = tube(
        dtStart.clone().lerp(dtEnd, t),
        dtStart.clone().lerp(dtEnd, t + 0.035),
        t === 0.62 ? 0.0345 : 0.0342,
        t === 0.62 ? mats.frame2 : mats.decal,
        14,
      );
      band.scale.x = 1.16;
      root.add(band);
    }
    // seat tube (interrupted around the shock), gusset and seat post
    root.add(tube(bb.clone().add(new V3(0, 0.02, 0.01)), new V3(0, 0.2, 0.255), 0.026, mats.frame));
    root.add(tube(new V3(0, 0.2, 0.255), new V3(0, 0.3, -0.12), 0.02, mats.frame));
    root.add(tube(stj.clone().add(new V3(0, -0.06, -0.015)), seatTop.clone().add(new V3(0, -0.07, -0.02)), 0.023, mats.frame));
    root.add(tube(seatTop.clone().add(new V3(0, -0.09, -0.025)), seatTop, 0.0158, mats.darkAlu));
    root.add(tube(ttStart.clone().add(new V3(0, -0.02, 0.05)), g.htBottom.clone().add(new V3(0, 0.03, 0.06)), 0.012, mats.frame));
    // shock mount tabs on top tube
    const shockF = new V3(0, 0.505, 0.07);
    for (const x of [-0.022, 0.022]) {
      const tab = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.06, 0.05), mats.frame2);
      tab.position.set(x, shockF.y + 0.02, shockF.z);
      root.add(tab);
    }
    // BB shell
    const bbShell = axleCyl(0.024, 0.085, mats.frame2);
    bbShell.position.copy(bb);
    root.add(bbShell);
    // main pivot
    const piv = axleCyl(0.022, 0.1, mats.darkAlu);
    piv.position.copy(g.pivot);
    root.add(piv);

    // saddle
    const saddleGeo = new THREE.CapsuleGeometry(0.055, 0.17, 6, 12);
    saddleGeo.rotateX(Math.PI / 2);
    saddleGeo.scale(1.15, 0.38, 1);
    const saddle = new THREE.Mesh(saddleGeo, mats.rubber);
    saddle.position.copy(seatTop).add(new V3(0, 0.02, -0.01));
    saddle.rotation.x = -0.08;
    root.add(saddle);
    const saddleNose = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, 0.08), mats.rubber);
    saddleNose.position.copy(seatTop).add(new V3(0, 0.02, -0.12));
    root.add(saddleNose);

    // ---------- Swingarm ----------
    const swing = new THREE.Group();
    swing.position.copy(g.pivot);
    root.add(swing);
    this.swing = swing;
    const axleRel = g.rearAxle.clone().sub(g.pivot);
    this.axleRel = axleRel;
    const ssTop = new V3(0, 0.3, 0.2);
    this.shockU = new V3(0, 0.17, 0.07);
    for (const s of [-1, 1]) {
      swing.add(tube(new V3(s * 0.045, 0, 0), axleRel.clone().add(new V3(s * 0.068, 0.02, -0.03)), 0.017, mats.frame, 10, 0.021));
      swing.add(tube(axleRel.clone().add(new V3(s * 0.07, 0.02, -0.02)), ssTop.clone().add(new V3(s * 0.05, 0, 0)), 0.014, mats.frame, 10, 0.016));
      swing.add(tube(ssTop.clone().add(new V3(s * 0.05, 0, 0)), this.shockU.clone().add(new V3(s * 0.03, 0, 0)), 0.016, mats.frame));
      swing.add(tube(new V3(s * 0.045, 0, 0), this.shockU.clone().add(new V3(s * 0.03, 0, 0)), 0.014, mats.frame));
      const drop = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.06, 0.07), mats.frame2);
      drop.position.copy(axleRel).add(new V3(s * 0.072, 0.012, 0));
      swing.add(drop);
    }
    swing.add(tube(ssTop.clone().add(new V3(-0.05, 0, 0)), ssTop.clone().add(new V3(0.05, 0, 0)), 0.012, mats.frame));
    // rear caliper and derailleur
    const rCal = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.045, 0.06), mats.frame2);
    rCal.position.copy(axleRel).add(new V3(-0.075, 0.07, -0.06));
    rCal.rotation.x = 0.6;
    swing.add(rCal);
    const der = new THREE.Group();
    der.position.copy(axleRel).add(new V3(0.07, -0.02, 0));
    const cage = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.11, 0.035), mats.darkAlu);
    cage.position.set(0, -0.06, -0.01);
    der.add(cage);
    for (const y of [-0.025, -0.1]) {
      const p = axleCyl(0.014, 0.01, mats.rubber);
      p.position.set(-0.008, y, -0.01);
      der.add(p);
    }
    const derBody = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.04, 0.045), mats.darkAlu);
    derBody.position.set(0, 0, 0.02);
    der.add(derBody);
    swing.add(der);

    this.rearWheel = makeWheel(cfg, mats, shared, true);
    this.rearWheel.position.copy(axleRel);
    swing.add(this.rearWheel);

    // ---------- Shock ----------
    this.shockF = shockF;
    this.shock = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1, 14), mats.darkAlu);
    this.shockBody = body;
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 1, 10), mats.alu);
    this.shockShaft = shaft;
    const coilPts = [];
    const turns = 9;
    for (let i = 0; i <= turns * 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      coilPts.push(new V3(Math.cos(a) * 0.032, i / (turns * 24), Math.sin(a) * 0.032));
    }
    const coilGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(coilPts), turns * 24, 0.0055, 6, false);
    this.coil = new THREE.Mesh(coilGeo, mats.spring);
    this.reservoir = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.09, 12), mats.darkAlu);
    root.add(body, shaft, this.coil, this.reservoir);
    this.shockEyes = [axleCyl(0.012, 0.05, mats.alu), axleCyl(0.012, 0.05, mats.alu)];
    root.add(...this.shockEyes);

    // ---------- Steering: fork and cockpit ----------
    const steerPivot = new THREE.Group();
    steerPivot.position.copy(g.axisPoint);
    steerPivot.rotation.x = Math.PI / 2 - cfg.headAngle;
    root.add(steerPivot);
    const steer = new THREE.Group();
    steerPivot.add(steer);
    this.steer = steer;
    const off = cfg.forkOffset;
    const legX = 0.079;
    // crowns
    for (const y of [0.555, 0.765]) {
      const crown = new THREE.Mesh(new THREE.BoxGeometry(legX * 2 + 0.06, 0.035, 0.07), mats.fork);
      crown.position.set(0, y, -off / 2);
      steer.add(crown);
    }
    steer.add(tube(new V3(0, 0.54, 0), new V3(0, 0.79, 0), 0.0165, mats.darkAlu));
    for (const s of [-1, 1]) {
      steer.add(tube(new V3(s * legX, 0.19, -off), new V3(s * legX, 0.795, -off), 0.018, mats.stanchion, 16));
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.02, 12), mats.darkAlu);
      cap.position.set(s * legX, 0.8, -off);
      steer.add(cap);
    }
    // lowers slide on the stanchions
    const lowers = new THREE.Group();
    steer.add(lowers);
    this.lowers = lowers;
    for (const s of [-1, 1]) {
      lowers.add(tube(new V3(s * legX, -0.03, -off), new V3(s * legX, 0.4, -off), 0.025, mats.fork, 16, 0.028));
      const seal = tube(new V3(s * legX, 0.395, -off), new V3(s * legX, 0.415, -off), 0.0215, mats.rubber, 16);
      lowers.add(seal);
      const dropout = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.07, 0.055), mats.fork);
      dropout.position.set(s * legX, 0, -off);
      lowers.add(dropout);
    }
    const fAxle = axleCyl(0.01, legX * 2 + 0.04, mats.alu);
    fAxle.position.set(0, 0, -off);
    lowers.add(fAxle);
    const fCal = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, 0.045), mats.frame2);
    fCal.position.set(-0.07, 0.085, -off + 0.06);
    lowers.add(fCal);
    // fork guard
    const fender = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.06, 24, 1, true, -0.9, 1.0), mats.fork);
    fender.rotation.z = Math.PI / 2;
    fender.scale.set(1, 1, 1);
    fender.position.set(0, 0, -off);
    fender.visible = false;
    lowers.add(fender);

    this.frontWheel = makeWheel(cfg, mats, shared, false);
    this.frontWheel.position.set(0, 0, -off);
    lowers.add(this.frontWheel);

    // cockpit, square to the ground when steering is straight
    const bar = new THREE.Group();
    bar.position.set(0, 0.8, -0.035);
    bar.rotation.x = -(Math.PI / 2 - cfg.headAngle);
    steer.add(bar);
    const stem = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.07), mats.darkAlu);
    stem.position.set(0, 0.0, 0.0);
    bar.add(stem);
    const barPts = [
      new V3(-0.4, 0.032, 0.03), new V3(-0.25, 0.03, 0.022), new V3(-0.12, 0.012, 0.006),
      new V3(-0.05, 0.0, 0.0), new V3(0.05, 0.0, 0.0), new V3(0.12, 0.012, 0.006),
      new V3(0.25, 0.03, 0.022), new V3(0.4, 0.032, 0.03),
    ];
    const barGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(barPts), 40, 0.0115, 10);
    bar.add(new THREE.Mesh(barGeo, mats.frame2));
    this.grips = [];
    for (const s of [-1, 1]) {
      const grip = axleCyl(0.016, 0.13, mats.rubber, 12);
      grip.position.set(s * 0.335, 0.032, 0.03);
      bar.add(grip);
      const endcap = axleCyl(0.017, 0.006, mats.frame);
      endcap.position.set(s * 0.402, 0.032, 0.03);
      bar.add(endcap);
      const lever = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 0.11), mats.alu);
      lever.position.set(s * 0.29, 0.02, -0.03);
      lever.rotation.y = s * 0.35;
      lever.rotation.x = 0.25;
      bar.add(lever);
      const master = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.025, 0.03), mats.frame2);
      master.position.set(s * 0.245, 0.04, 0.02);
      bar.add(master);
      const marker = new THREE.Object3D();
      marker.position.set(s * 0.345, 0.032, 0.03);
      bar.add(marker);
      this.grips.push(marker);
    }
    // number plate
    const plateTex = (() => {
      const cv = document.createElement('canvas');
      cv.width = 256;
      cv.height = 192;
      const c = cv.getContext('2d');
      c.fillStyle = '#f5f5f0';
      c.fillRect(0, 0, 256, 192);
      c.fillStyle = '#e8590c';
      c.fillRect(0, 0, 256, 34);
      c.fillStyle = '#16181c';
      c.font = 'bold 120px system-ui, sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('27', 128, 118);
      const t = new THREE.CanvasTexture(cv);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    })();
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(0.17, 0.13),
      new THREE.MeshStandardMaterial({ map: plateTex, roughness: 0.6, side: THREE.DoubleSide }),
    );
    plate.position.set(0, -0.045, -0.07);
    plate.rotation.set(-0.15, Math.PI, 0, 'YXZ');
    bar.add(plate);

    // ---------- Drivetrain ----------
    const ringGeo = (() => {
      const parts = [new THREE.TorusGeometry(0.066, 0.005, 6, 40)];
      for (let i = 0; i < 34; i++) {
        const tooth = new THREE.BoxGeometry(0.006, 0.008, 0.004);
        tooth.translate(0, 0.073, 0);
        tooth.rotateZ((i / 34) * Math.PI * 2);
        parts.push(tooth);
      }
      for (let i = 0; i < 4; i++) {
        const arm = new THREE.BoxGeometry(0.012, 0.06, 0.004);
        arm.translate(0, 0.03, 0);
        arm.rotateZ((i / 4) * Math.PI * 2);
        parts.push(arm);
      }
      const geo = mergeGeometries(parts.map((p) => p.toNonIndexed()));
      geo.rotateY(Math.PI / 2);
      return geo;
    })();
    const cranks = new THREE.Group();
    cranks.position.copy(bb);
    root.add(cranks);
    this.cranks = cranks;
    const ring = new THREE.Mesh(ringGeo, mats.darkAlu);
    ring.position.x = 0.052;
    cranks.add(ring);
    const guide = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.03, 0.09), mats.frame2);
    guide.position.set(bb.x + 0.06, bb.y + 0.08, bb.z - 0.01);
    root.add(guide);
    const crankLen = 0.165;
    this.crankLen = crankLen;
    this.pedals = [];
    this.pedalMarkers = [];
    for (const s of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.014, crankLen + 0.02, 0.028), mats.darkAlu);
      // right crank points down/forward at angle 0, left is opposite
      arm.position.set(s * 0.075, (s > 0 ? -1 : 1) * crankLen / 2, 0);
      cranks.add(arm);
      const pedal = new THREE.Group();
      pedal.position.set(s * 0.11, (s > 0 ? -1 : 1) * crankLen, 0);
      const platform = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.016, 0.1), mats.frame2);
      pedal.add(platform);
      const pinGeo = new THREE.CylinderGeometry(0.0025, 0.0025, 0.03, 4);
      for (const px of [-0.04, 0.04]) {
        for (const pz of [-0.04, 0, 0.04]) {
          const pin = new THREE.Mesh(pinGeo, mats.alu);
          pin.position.set(px, 0, pz);
          pedal.add(pin);
        }
      }
      cranks.add(pedal);
      this.pedals.push(pedal);
      const marker = new THREE.Object3D();
      marker.position.set(-s * 0.0, 0.03, 0);
      pedal.add(marker);
      this.pedalMarkers.push(marker);
    }
    const spindle = axleCyl(0.012, 0.16, mats.alu);
    cranks.add(spindle);

    this.chainTop = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 1, 5), mats.chain);
    this.chainBottom = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 1, 5), mats.chain);
    this.chainLower = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 1, 5), mats.chain);
    root.add(this.chainTop, this.chainBottom, this.chainLower);

    root.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });

    this.wheelAngleF = 0;
    this.wheelAngleR = 0;
    this._u = new V3();
    this._a = new V3();
    this._b = new V3();
  }

  // state: { xF, xR, steer, spinF, spinR, crank }
  update(state) {
    const g = this.geo;
    this.steer.rotation.y = -state.steer;
    this.lowers.position.y = state.xF - g.sagXF;
    this.frontWheel.rotation.x = -state.spinF;

    const phi = -(state.xR - g.sagXR) / g.swingLen;
    this.swing.rotation.x = phi;
    this.rearWheel.rotation.x = -state.spinR;

    // Shock between the frame mount and the swingarm's moving eye.
    const U = this._u.copy(this.shockU).applyAxisAngle(new V3(1, 0, 0), phi).add(g.pivot);
    const F = this.shockF;
    const len = U.distanceTo(F);
    const dir = this._a.subVectors(F, U).normalize();
    const bodyLen = 0.13;
    const bodyStart = this._b.copy(F).addScaledVector(dir, -bodyLen);
    setTube(this.shockBody, bodyStart, F);
    setTube(this.shockShaft, U, bodyStart);
    const coilStart = U.clone().addScaledVector(dir, 0.018);
    const coilEnd = F.clone().addScaledVector(dir, -0.035);
    this.coil.position.copy(coilStart);
    this.coil.quaternion.setFromUnitVectors(UP, dir);
    this.coil.scale.set(1, coilStart.distanceTo(coilEnd), 1);
    this.reservoir.position.copy(F).addScaledVector(dir, -0.06).add(new V3(0, 0.035, 0));
    this.reservoir.quaternion.copy(this.coil.quaternion);
    this.shockEyes[0].position.copy(U);
    this.shockEyes[1].position.copy(F);
    void len;

    // Cranks; pedals stay level.
    this.cranks.rotation.x = state.crank;
    for (const p of this.pedals) p.rotation.x = -state.crank;

    // Chain from the chainring to the cassette and through the derailleur.
    const axle = this._a.copy(this.axleRel).applyAxisAngle(new V3(1, 0, 0), phi).add(g.pivot);
    const bb = g.bb;
    const x = 0.052;
    const ringTop = new V3(x, bb.y + 0.07, bb.z - 0.004);
    const ringBot = new V3(x, bb.y - 0.07, bb.z);
    const cogTop = new V3(x, axle.y + 0.038, axle.z);
    const derLow = new V3(x, axle.y - 0.12, axle.z - 0.01);
    const derUp = new V3(x, axle.y - 0.045, axle.z - 0.01);
    setTube(this.chainTop, ringTop, cogTop);
    setTube(this.chainBottom, ringBot, derLow);
    setTube(this.chainLower, derLow, derUp);
  }

  // Positions of the grips and pedals in the bike's local frame.
  contactPoints(out) {
    this.root.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(this.root.matrixWorld).invert();
    out.gripL.setFromMatrixPosition(this.grips[0].matrixWorld).applyMatrix4(inv);
    out.gripR.setFromMatrixPosition(this.grips[1].matrixWorld).applyMatrix4(inv);
    out.pedalL.setFromMatrixPosition(this.pedalMarkers[0].matrixWorld).applyMatrix4(inv);
    out.pedalR.setFromMatrixPosition(this.pedalMarkers[1].matrixWorld).applyMatrix4(inv);
    return out;
  }
}
