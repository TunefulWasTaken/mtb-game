// A simple rider whose hands and feet stay on the grips and pedals (two-bone IK),
// and who turns into a ragdoll when they crash.
import * as THREE from 'three';
import { GROUP_RAGDOLL, GROUP_WORLD, groups } from './world.js';

const V3 = THREE.Vector3;
const UP = new V3(0, 1, 0);

const DIM = {
  thigh: 0.44,
  shin: 0.44,
  upperArm: 0.29,
  foreArm: 0.29,
  torso: 0.5,
  hipW: 0.1,
  shoulderW: 0.19,
};

function solveIK(root, target, l1, l2, pole, outJoint, outEnd) {
  const d = new V3().subVectors(target, root);
  let dist = d.length();
  const dir = d.divideScalar(dist || 1);
  dist = Math.min(Math.max(dist, 0.05), l1 + l2 - 1e-4);
  const a = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const p = pole.clone().addScaledVector(dir, -pole.dot(dir)).normalize();
  outJoint.copy(root).addScaledVector(dir, a).addScaledVector(p, h);
  outEnd.copy(root).addScaledVector(dir, dist);
}

// Orientation whose +Y runs along dir and whose +X is as close as possible to side.
function basisQuat(dir, side, out) {
  if (dir.lengthSq() < 1e-10) return out.identity();
  const y = dir.clone().normalize();
  const x = side.clone().addScaledVector(y, -side.dot(y));
  if (x.lengthSq() < 1e-6) x.set(1, 0, 0).addScaledVector(y, -y.x);
  x.normalize();
  const z = new V3().crossVectors(x, y);
  return out.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

export class Rider {
  constructor(scene) {
    this.scene = scene;
    const jersey = new THREE.MeshStandardMaterial({ color: 0x1f5fbf, roughness: 0.8 });
    const jersey2 = new THREE.MeshStandardMaterial({ color: 0xf0f0f0, roughness: 0.8 });
    const pants = new THREE.MeshStandardMaterial({ color: 0x2b2d31, roughness: 0.85 });
    const gloves = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.8 });
    const shoes = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.7 });
    const pads = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6 });
    const helmetMat = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.35, metalness: 0.1 });
    const helmetAccent = new THREE.MeshStandardMaterial({ color: 0xd8262c, roughness: 0.4 });
    const goggleMat = new THREE.MeshStandardMaterial({ color: 0xff8a1a, roughness: 0.1, metalness: 0.6 });

    this.group = new THREE.Group();
    scene.add(this.group);

    const capsule = (r, len, mat) => {
      const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 10), mat);
      m.castShadow = true;
      this.group.add(m);
      return m;
    };

    this.parts = {
      thighL: capsule(0.068, DIM.thigh, pants),
      thighR: capsule(0.068, DIM.thigh, pants),
      shinL: capsule(0.055, DIM.shin, pants),
      shinR: capsule(0.055, DIM.shin, pants),
      upperArmL: capsule(0.048, DIM.upperArm, jersey),
      upperArmR: capsule(0.048, DIM.upperArm, jersey),
      foreArmL: capsule(0.042, DIM.foreArm, jersey2),
      foreArmR: capsule(0.042, DIM.foreArm, jersey2),
    };
    // knee pads and shoes as children so they follow the limbs
    for (const k of ['shinL', 'shinR']) {
      const pad = new THREE.Mesh(new THREE.CapsuleGeometry(0.062, 0.12, 4, 8), pads);
      pad.position.set(0, DIM.shin / 2 - 0.08, -0.012);
      this.parts[k].add(pad);
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.27), shoes);
      shoe.position.set(0, -DIM.shin / 2 - 0.05, -0.05);
      shoe.castShadow = true;
      this.parts[k].add(shoe);
    }
    for (const k of ['foreArmL', 'foreArmR']) {
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), gloves);
      hand.position.set(0, -DIM.foreArm / 2 - 0.03, 0);
      this.parts[k].add(hand);
    }

    // torso: jersey with a number panel
    const torsoGeo = new THREE.CapsuleGeometry(0.15, DIM.torso - 0.18, 4, 12);
    torsoGeo.scale(1.25, 1, 0.78);
    this.parts.torso = new THREE.Mesh(torsoGeo, jersey);
    this.parts.torso.castShadow = true;
    this.group.add(this.parts.torso);
    const stripe = new THREE.Mesh(new THREE.CapsuleGeometry(0.152, 0.08, 4, 12), jersey2);
    stripe.scale.set(1.26, 1, 0.79);
    stripe.position.y = 0.05;
    this.parts.torso.add(stripe);
    const pelvisGeo = new THREE.CapsuleGeometry(0.13, 0.08, 4, 10);
    pelvisGeo.rotateZ(Math.PI / 2);
    pelvisGeo.scale(1, 1, 0.85);
    this.parts.pelvis = new THREE.Mesh(pelvisGeo, pants);
    this.parts.pelvis.castShadow = true;
    this.group.add(this.parts.pelvis);

    // head with a full-face helmet and goggles
    const head = new THREE.Group();
    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.145, 18, 14), helmetMat);
    shell.scale.set(0.95, 1, 1.12);
    head.add(shell);
    const stripeH = new THREE.Mesh(new THREE.SphereGeometry(0.147, 18, 14, Math.PI * 0.42, Math.PI * 0.16), helmetAccent);
    stripeH.scale.set(0.95, 1, 1.12);
    head.add(stripeH);
    // chin bar: a half ring wrapping round the front of the face
    const chin = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.032, 8, 16, Math.PI), helmetMat);
    chin.rotation.set(-Math.PI / 2, 0, 0);
    chin.position.set(0, -0.075, -0.01);
    head.add(chin);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.012, 0.09), helmetAccent);
    visor.position.set(0, 0.09, -0.16);
    visor.rotation.x = -0.25;
    head.add(visor);
    const goggles = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.05, 0.03), goggleMat);
    goggles.position.set(0, 0.0, -0.15);
    head.add(goggles);
    head.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });
    head.scale.setScalar(0.9);
    this.parts.head = head;
    this.group.add(head);

    this.firstPerson = false;
    this.ragdoll = null;

    // Pose points in world space, refreshed every frame.
    this.pts = {};
    for (const k of ['hipL', 'hipR', 'kneeL', 'kneeR', 'footL', 'footR', 'shL', 'shR', 'elL', 'elR', 'handL', 'handR', 'hipC', 'shC', 'head']) {
      this.pts[k] = new V3();
    }
    this.right = new V3(1, 0, 0);
    this.fwd = new V3(0, 0, -1);
  }

  setFirstPerson(on) {
    this.firstPerson = on;
    this.applyVisibility();
  }

  applyVisibility() {
    const hide = this.firstPerson && !this.ragdoll;
    this.parts.head.visible = !hide;
    this.parts.torso.visible = !hide;
    this.parts.pelvis.visible = !hide;
  }

  // Pose the rider on the bike. local: grips/pedals in bike frame; m: bike world matrix.
  pose(local, m, quat, input) {
    const L = (v) => v.clone();
    const shift = input.pitch;
    const crouch = input.crouch;
    const hipC = new V3(0, 0.84 - crouch * 0.16 - Math.abs(shift) * 0.04, 0.17 + shift * -0.17);
    hipC.y -= input.suspension * 0.4;
    const lean = new V3(0, 0.37 - crouch * 0.05, -0.33 - shift * 0.08).setLength(DIM.torso);
    const shC = hipC.clone().add(lean);
    const P = this.pts;
    const local3 = {};
    local3.hipL = hipC.clone().add(new V3(-DIM.hipW, 0, 0));
    local3.hipR = hipC.clone().add(new V3(DIM.hipW, 0, 0));
    local3.shL = shC.clone().add(new V3(-DIM.shoulderW, 0, 0));
    local3.shR = shC.clone().add(new V3(DIM.shoulderW, 0, 0));
    const kneeL = new V3();
    const kneeR = new V3();
    const footL = new V3();
    const footR = new V3();
    const kneePoleL = new V3(-0.25, 0, -1);
    const kneePoleR = new V3(0.25, 0, -1);
    solveIK(local3.hipL, L(local.pedalL), DIM.thigh, DIM.shin + 0.04, kneePoleL, kneeL, footL);
    solveIK(local3.hipR, L(local.pedalR), DIM.thigh, DIM.shin + 0.04, kneePoleR, kneeR, footR);
    const elL = new V3();
    const elR = new V3();
    const handL = new V3();
    const handR = new V3();
    solveIK(local3.shL, L(local.gripL), DIM.upperArm, DIM.foreArm + 0.03, new V3(-1, -0.3, 0.6), elL, handL);
    solveIK(local3.shR, L(local.gripR), DIM.upperArm, DIM.foreArm + 0.03, new V3(1, -0.3, 0.6), elR, handR);
    const headC = shC.clone().add(new V3(0, 0.2, -0.09));

    const w = (k, v) => P[k].copy(v).applyMatrix4(m);
    w('hipL', local3.hipL);
    w('hipR', local3.hipR);
    w('shL', local3.shL);
    w('shR', local3.shR);
    w('kneeL', kneeL);
    w('kneeR', kneeR);
    w('footL', footL);
    w('footR', footR);
    w('elL', elL);
    w('elR', elR);
    w('handL', handL);
    w('handR', handR);
    w('hipC', hipC);
    w('shC', shC);
    w('head', headC);
    this.right.set(1, 0, 0).applyQuaternion(quat);
    this.fwd.set(0, 0, -1).applyQuaternion(quat);

    this.placeLimbs(quat);
  }

  placeLimbs(quat) {
    const P = this.pts;
    const p = this.parts;
    const q = new THREE.Quaternion();
    const seg = (mesh, a, b, len) => {
      const dir = new V3().subVectors(a, b);
      mesh.position.copy(a).add(b).multiplyScalar(0.5);
      basisQuat(dir, this.right, q);
      mesh.quaternion.copy(q);
      void len;
    };
    seg(p.thighL, P.hipL, P.kneeL);
    seg(p.thighR, P.hipR, P.kneeR);
    seg(p.shinL, P.kneeL, P.footL);
    seg(p.shinR, P.kneeR, P.footR);
    seg(p.upperArmL, P.shL, P.elL);
    seg(p.upperArmR, P.shR, P.elR);
    seg(p.foreArmL, P.elL, P.handL);
    seg(p.foreArmR, P.elR, P.handR);
    // torso from hips to shoulders
    const tdir = new V3().subVectors(P.shC, P.hipC);
    p.torso.position.copy(P.hipC).addScaledVector(tdir, 0.5);
    basisQuat(tdir, this.right, p.torso.quaternion);
    p.pelvis.position.copy(P.hipC);
    p.pelvis.quaternion.copy(p.torso.quaternion);
    p.head.position.copy(P.head);
    p.head.quaternion.copy(quat);
  }

  // --------------- Ragdoll ---------------

  startRagdoll(R, physics, linvel, angvel, com) {
    this.endRagdoll(physics);
    const P = this.pts;
    const segs = [
      ['pelvis', P.hipL, P.hipR, 0.12, 12, true],
      ['torso', P.hipC, P.shC, 0.15, 28],
      ['head', P.shC.clone().addScaledVector(UP, 0.05), P.head.clone().addScaledVector(UP, 0.08), 0.13, 6],
      ['thighL', P.hipL, P.kneeL, 0.07, 9],
      ['thighR', P.hipR, P.kneeR, 0.07, 9],
      ['shinL', P.kneeL, P.footL, 0.055, 5],
      ['shinR', P.kneeR, P.footR, 0.055, 5],
      ['upperArmL', P.shL, P.elL, 0.05, 2.5],
      ['upperArmR', P.shR, P.elR, 0.05, 2.5],
      ['foreArmL', P.elL, P.handL, 0.045, 1.8],
      ['foreArmR', P.elR, P.handR, 0.045, 1.8],
    ];
    const bodies = {};
    const lv = new V3(linvel.x, linvel.y, linvel.z);
    const av = new V3(angvel.x, angvel.y, angvel.z);
    const c = new V3(com.x, com.y, com.z);
    const q = new THREE.Quaternion();
    const torsoDir = new V3().subVectors(P.shC, P.hipC);
    for (const [name, a, b, r, mass, isPelvis] of segs) {
      const mid = a.clone().add(b).multiplyScalar(0.5);
      const dir = new V3().subVectors(b, a);
      const len = Math.max(0.05, dir.length());
      // The pelvis shares the torso's orientation so its mesh lines up.
      basisQuat(isPelvis ? torsoDir : dir, this.right, q);
      const vel = lv.clone().add(new V3().crossVectors(av, mid.clone().sub(c)));
      const body = physics.createRigidBody(
        R.RigidBodyDesc.dynamic()
          .setTranslation(mid.x, mid.y, mid.z)
          .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
          .setLinvel(vel.x, vel.y, vel.z)
          .setAngvel({ x: av.x, y: av.y, z: av.z })
          .setAngularDamping(1.2)
          .setLinearDamping(0.05)
          .setCcdEnabled(true),
      );
      const shape = isPelvis
        ? R.ColliderDesc.cuboid(0.15, 0.09, 0.1)
        : R.ColliderDesc.capsule(Math.max(0.01, len / 2 - r * 0.5), r);
      physics.createCollider(
        shape
          .setMass(mass)
          .setFriction(0.8)
          .setRestitution(0.1)
          .setCollisionGroups(groups(GROUP_RAGDOLL, GROUP_WORLD)),
        body,
      );
      bodies[name] = { body, len };
    }
    const joint = (n1, n2, worldPoint) => {
      const b1 = bodies[n1].body;
      const b2 = bodies[n2].body;
      const toLocal = (b) => {
        const t = b.translation();
        const r = b.rotation();
        const inv = new THREE.Quaternion(r.x, r.y, r.z, r.w).invert();
        const v = worldPoint.clone().sub(new V3(t.x, t.y, t.z)).applyQuaternion(inv);
        return { x: v.x, y: v.y, z: v.z };
      };
      const j = physics.createImpulseJoint(R.JointData.spherical(toLocal(b1), toLocal(b2)), b1, b2, true);
      j.setContactsEnabled(false);
    };
    joint('pelvis', 'torso', P.hipC);
    joint('torso', 'head', P.shC.clone().addScaledVector(UP, 0.05));
    joint('pelvis', 'thighL', P.hipL);
    joint('pelvis', 'thighR', P.hipR);
    joint('thighL', 'shinL', P.kneeL);
    joint('thighR', 'shinR', P.kneeR);
    joint('torso', 'upperArmL', P.shL);
    joint('torso', 'upperArmR', P.shR);
    joint('upperArmL', 'foreArmL', P.elL);
    joint('upperArmR', 'foreArmR', P.elR);
    this.ragdoll = bodies;
    this.applyVisibility();
  }

  endRagdoll(physics) {
    if (!this.ragdoll) return;
    for (const k in this.ragdoll) physics.removeRigidBody(this.ragdoll[k].body);
    this.ragdoll = null;
    this.applyVisibility();
  }

  ragdollCentre(out) {
    const t = this.ragdoll.torso.body.translation();
    return out.set(t.x, t.y, t.z);
  }

  syncRagdoll() {
    const p = this.parts;
    const rd = this.ragdoll;
    const set = (mesh, name) => {
      const b = rd[name].body;
      const t = b.translation();
      const r = b.rotation();
      mesh.position.set(t.x, t.y, t.z);
      mesh.quaternion.set(r.x, r.y, r.z, r.w);
    };
    for (const k of ['thighL', 'thighR', 'shinL', 'shinR', 'upperArmL', 'upperArmR', 'foreArmL', 'foreArmR', 'torso', 'pelvis']) {
      set(p[k], k);
    }
    // The Y axis of every ragdoll body runs from its first point to its second,
    // the reverse of how limbs are drawn while riding, so flip them.
    const flip = new THREE.Quaternion().setFromAxisAngle(new V3(0, 0, 1), Math.PI);
    for (const k of ['thighL', 'thighR', 'shinL', 'shinR', 'upperArmL', 'upperArmR', 'foreArmL', 'foreArmR']) {
      p[k].quaternion.multiply(flip);
    }
    const hb = rd.head.body;
    const ht = hb.translation();
    const hr = hb.rotation();
    const hq = new THREE.Quaternion(hr.x, hr.y, hr.z, hr.w);
    // head body's Y points up the neck; helmet faces along its -Z
    p.head.position.set(ht.x, ht.y, ht.z).add(new V3(0, 0.04, 0).applyQuaternion(hq));
    p.head.quaternion.copy(hq);
  }
}
