// Bike physics. The bike and rider are one rigid body in Rapier. Each wheel is a
// ball swept down its suspension axis to find the ground; spring and damper
// forces, tyre grip (a friction circle per surface), brakes, pedalling, drag
// and the rider's balance are applied as impulses every physics step.
import * as THREE from 'three';
import { bikeGeometry } from './bikeModel.js';
import { GROUP_BIKE, GROUP_WORLD, groups } from './world.js';
import { clamp, lerp, smoothstep } from './noise.js';

const V3 = THREE.Vector3;
const G = 9.81;
const IDENT = { x: 0, y: 0, z: 0, w: 1 };
const QUERY_GROUPS = groups(GROUP_BIKE, GROUP_WORLD);
// Ray angles (radians, around the wheel axle) used to trace the wheel's rim.
const FAN = [];
for (let a = -70; a <= 70; a += 7) FAN.push((a * Math.PI) / 180);

export class Bike {
  constructor(R, physics, world, cfg) {
    this.R = R;
    this.physics = physics;
    this.world = world;
    this.cfg = cfg;
    this.geo = bikeGeometry(cfg);
    const g = this.geo;
    const m = cfg.bikeMass + cfg.riderMass;
    this.mass = m;
    this.inertia = cfg.inertia;
    this.comLocal = new V3(0, cfg.comY, cfg.comZ);
    this.comHeight = cfg.comY + cfg.wheelR;

    // Spring rates give the chosen sag under the static load on each wheel.
    const frontShare = (cfg.wheelbase / 2 - cfg.comZ) / cfg.wheelbase;
    const loadF = m * G * frontShare;
    const loadR = m * G * (1 - frontShare);
    const mkWheel = (front) => {
      const travel = front ? cfg.travelF : cfg.travelR;
      const sag = front ? cfg.sagF : cfg.sagR;
      const prog = front ? cfg.progF : cfg.progR;
      const load = front ? loadF : loadR;
      const k = load / (travel * sag * (1 + prog * sag * sag));
      const crit = 2 * Math.sqrt(k * m * 0.5);
      return {
        front,
        travel,
        prog,
        k,
        cComp: crit * cfg.dampComp,
        cReb: crit * cfg.dampReb,
        hubTop: (front ? g.hubTopF : g.hubTopR).clone(),
        axis: (front ? g.axisF : g.axisR).clone(),
        x: travel * sag,
        xPrev: travel * sag,
        contact: false,
        load: 0,
        normal: new V3(0, 1, 0),
        point: new V3(),
        surface: null,
        slip: 0,
        spin: 0,
        spinRate: 0,
        airTime: 0,
      };
    };
    this.wheels = [mkWheel(true), mkWheel(false)];
    this._ray = new R.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
    this._hubTop = new V3();
    this._axis = new V3();
    this._dir = new V3();
    this._hitPoint = new V3();

    const body = physics.createRigidBody(
      R.RigidBodyDesc.dynamic()
        .setAdditionalMassProperties(
          m,
          { x: this.comLocal.x, y: this.comLocal.y, z: this.comLocal.z },
          { x: cfg.inertia[0], y: cfg.inertia[1], z: cfg.inertia[2] },
          IDENT,
        )
        .setCcdEnabled(true)
        .setAngularDamping(0.15)
        .setCanSleep(false),
    );
    this.body = body;
    const solid = groups(GROUP_BIKE, GROUP_WORLD);
    // Frame: down tube area and the two "bottom-out" balls at the top of travel.
    const dtA = g.bb.clone().add(new V3(0, 0.05, -0.03));
    const dtB = g.htBottom.clone();
    const mid = dtA.clone().add(dtB).multiplyScalar(0.5);
    const dir = dtB.clone().sub(dtA);
    const q = new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), dir.clone().normalize());
    physics.createCollider(
      R.ColliderDesc.capsule(dir.length() / 2, 0.07)
        .setTranslation(mid.x, mid.y, mid.z)
        .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
        .setDensity(0)
        .setFriction(0.5)
        .setCollisionGroups(solid),
      body,
    );
    for (const w of this.wheels) {
      physics.createCollider(
        R.ColliderDesc.ball(cfg.wheelR * 0.9)
          .setTranslation(w.hubTop.x, w.hubTop.y, w.hubTop.z)
          .setDensity(0)
          .setFriction(0.6)
          .setRestitution(0.05)
          .setCollisionGroups(solid),
        body,
      );
    }
    // The rider's torso and head: if these touch anything, it's a crash.
    this.riderSensor = physics.createCollider(
      R.ColliderDesc.capsule(0.24, 0.17)
        .setTranslation(0, 1.12, 0.0)
        .setRotation(new THREE.Quaternion().setFromAxisAngle(new V3(1, 0, 0), -0.75))
        .setSensor(true)
        .setDensity(0)
        .setCollisionGroups(solid),
      body,
    );
    this.headSensor = physics.createCollider(
      R.ColliderDesc.ball(0.15)
        .setTranslation(0, 1.42, -0.2)
        .setSensor(true)
        .setDensity(0)
        .setCollisionGroups(solid),
      body,
    );

    this.steer = 0;
    this.steerInput = 0;
    this.brakeLevel = 0;
    this.lean = 0;
    this.crank = Math.PI / 2;
    this.pedalling = 0;
    this.crouch = 0;
    this.hopCharge = 0;
    this.crashed = false;
    this.crashReason = '';
    this.velHistory = [];
    this.airTime = 0;
    this.speed = 0;
    this.groundedTime = 0;

    // scratch
    this._q = new THREE.Quaternion();
    this._pos = new V3();
    this._com = new V3();
    this._lv = new V3();
    this._av = new V3();
    this.fwd = new V3();
    this.up = new V3();
    this.right = new V3();
  }

  readState() {
    const b = this.body;
    const r = b.rotation();
    this._q.set(r.x, r.y, r.z, r.w);
    const t = b.translation();
    this._pos.set(t.x, t.y, t.z);
    const c = b.worldCom();
    this._com.set(c.x, c.y, c.z);
    const lv = b.linvel();
    this._lv.set(lv.x, lv.y, lv.z);
    const av = b.angvel();
    this._av.set(av.x, av.y, av.z);
    this.fwd.set(0, 0, -1).applyQuaternion(this._q);
    this.up.set(0, 1, 0).applyQuaternion(this._q);
    this.right.set(1, 0, 0).applyQuaternion(this._q);
  }

  // 1 / effective mass of the body at offset r in direction d.
  invMassAt(r, d) {
    const rd = new V3().crossVectors(r, d);
    const inv = this._q.clone().invert();
    rd.applyQuaternion(inv);
    const I = this.inertia;
    return 1 / this.mass + (rd.x * rd.x) / I[0] + (rd.y * rd.y) / I[1] + (rd.z * rd.z) / I[2];
  }

  setMass(mass, com, inertia) {
    this.mass = mass;
    this.inertia = inertia;
    this.body.setAdditionalMassProperties(
      mass,
      { x: com.x, y: com.y, z: com.z },
      { x: inertia[0], y: inertia[1], z: inertia[2] },
      IDENT,
      true,
    );
  }

  // After a crash the rider has left: the bike carries on with only its own mass.
  dropRider() {
    this.setMass(this.cfg.bikeMass, new V3(0, 0.25, 0), [1.6, 1.4, 0.5]);
  }

  placeAt(position, forward) {
    this.setMass(this.cfg.bikeMass + this.cfg.riderMass, this.comLocal, this.cfg.inertia);
    const f = forward.clone().normalize();
    const right = new V3().crossVectors(f, new V3(0, 1, 0)).normalize();
    const up = new V3().crossVectors(right, f).normalize();
    const m = new THREE.Matrix4().makeBasis(right, up, f.clone().negate());
    const q = new THREE.Quaternion().setFromRotationMatrix(m);
    const p = position.clone().addScaledVector(up, this.cfg.wheelR + 0.04);
    this.body.setTranslation({ x: p.x, y: p.y, z: p.z }, true);
    this.body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.body.resetForces(true);
    this.body.resetTorques(true);
    for (const w of this.wheels) {
      w.x = w.xPrev = w.travel * (w.front ? this.cfg.sagF : this.cfg.sagR);
      w.spinRate = 0;
      w.contact = false;
    }
    this.steer = 0;
    this.steerInput = 0;
    this.crashed = false;
    this.crashReason = '';
    this.spawnGrace = 0.25;
    this.velHistory.length = 0;
    this.airTime = 0;
    this.hopCharge = 0;
    this.crouch = 0;
  }

  // Finds how far the wheel can drop along its suspension axis before its rim
  // touches the ground. A fan of rays from the hub (at full compression) traces
  // the round wheel, so it rolls up onto rocks and roots instead of clipping them.
  castWheel(w) {
    const R = this.cfg.wheelR;
    const hubTop = this._hubTop.copy(w.hubTop).applyQuaternion(this._q).add(this._pos);
    const axis = this._axis.copy(w.axis).applyQuaternion(this._q);
    const reach = w.travel + R + 0.02;
    let best = Infinity;
    let bestHit = null;
    const ray = this._ray;
    ray.origin = hubTop;
    for (const ang of FAN) {
      const d = this._dir.copy(axis).applyAxisAngle(this.right, ang);
      ray.dir = d;
      const hit = this.physics.castRayAndGetNormal(ray, reach, true, undefined, QUERY_GROUPS, undefined, this.body);
      if (!hit) continue;
      const t = hit.timeOfImpact;
      // where along the axis the wheel centre sits when its rim reaches this point
      const along = t * d.dot(axis);
      const perp = t * Math.sqrt(Math.max(0, 1 - d.dot(axis) ** 2));
      if (perp >= R) continue;
      const s = along - Math.sqrt(R * R - perp * perp);
      if (s < best) {
        best = s;
        bestHit = hit;
        this._hitPoint.copy(hubTop).addScaledVector(d, t);
      }
    }
    w.xPrev = w.x;
    if (!bestHit || best > w.travel) {
      w.contact = false;
      // the wheel extends at roughly the rebound damper's speed
      w.x = Math.max(0, w.x - (w.k * w.x * 1.5 / w.cReb + 0.2) / 120);
      w.load = 0;
      return;
    }
    w.contact = true;
    w.x = clamp(w.travel - best, 0, w.travel);
    const n = w.normal.set(bestHit.normal.x, bestHit.normal.y, bestHit.normal.z);
    if (n.lengthSq() < 0.5) n.copy(this.up);
    if (n.dot(axis) > 0) n.negate();
    n.normalize();
    w.point.copy(this._hitPoint);
    w.surface = this.world.surfaceFor(bestHit.collider, w.point.x, w.point.z);
  }

  // input: { throttle, brake, steer, pitch, hop } ; returns crash reason or ''
  step(dt, input) {
    const cfg = this.cfg;
    const b = this.body;
    this.readState();
    const fwd = this.fwd;
    const up = this.up;
    const right = this.right;
    const lv = this._lv;
    const av = this._av;
    const com = this._com;

    const alive = !this.crashed;
    const throttle = alive ? input.throttle : 0;
    // brakes come on progressively, like squeezing a lever
    const brakeTarget = alive ? input.brake : 0;
    this.brakeLevel += clamp(brakeTarget - this.brakeLevel, -dt * 10, dt * 3.5);
    const brake = this.brakeLevel;
    let frontBrakeF = 0;
    const steerIn = alive ? input.steer : 0;
    const pitchIn = alive ? input.pitch : 0;

    const vF = lv.dot(fwd);
    const v = Math.max(0, vF);
    this.speed = lv.length();

    for (const w of this.wheels) this.castWheel(w);
    const grounded = this.wheels[0].contact || this.wheels[1].contact;
    if (grounded) {
      this.groundedTime += dt;
    } else {
      this.groundedTime = 0;
    }
    const wasAir = this.airTime;
    this.airTime = grounded ? 0 : this.airTime + dt;

    // ---------- Lean and steering ----------
    const worldUp = new V3(0, 1, 0);
    const uRef = worldUp.clone().addScaledVector(fwd, -fwd.dot(worldUp)).normalize();
    const rRef = new V3().crossVectors(fwd, uRef);
    const lean = Math.atan2(up.dot(rRef), up.dot(uRef));
    this.lean = lean;
    const rollRate = av.dot(fwd);
    const yawRateRight = -av.dot(uRef);

    this.steerInput += clamp(steerIn - this.steerInput, -dt * 8, dt * 8);
    // the rider judges how hard to lean from the grip under the tyres
    let muRef = 0.95;
    for (const w of this.wheels) if (w.contact && w.surface) muRef = Math.min(muRef, w.surface.mu * 0.92);
    muRef *= cfg.grip;
    const kMax = Math.min(1 / 2.6, (muRef * G * 0.9) / Math.max(v * v, 0.01));
    const targetLean = clamp(Math.atan((v * v * this.steerInput * kMax) / G), -0.95, 0.95);

    const L = cfg.wheelbase;
    // ground speed, so a bike sliding sideways isn't treated as slow
    const vGround = Math.max(v, Math.hypot(lv.x, lv.z) * 0.9);
    const steerKin = Math.atan((L * G * Math.tan(lean)) / Math.max(v * v, 0.3));
    const blend = smoothstep(1.5, 4.5, vGround);
    let steer = lerp(this.steerInput * 0.55, steerKin, blend);
    const maxSteer = lerp(0.6, 0.06, smoothstep(1.5, 13, vGround));
    steer = clamp(steer, -maxSteer, maxSteer);
    const both = this.wheels[0].contact && this.wheels[1].contact;
    // with a wheel off the ground the rider just holds the bars steady
    if (!both) steer = this.steer + clamp(this.steerInput * 0.08 - this.steer, -dt * 2.5, dt * 2.5);
    if (!alive) steer = this.steer * 0.98;
    this.steer = clamp(steer, -maxSteer, maxSteer);

    const Iroll = cfg.inertia[2];
    if (alive && grounded && !both) {
      // on one wheel the rider mostly just keeps the bike upright
      const wn = 7;
      let tau = Iroll * (wn * wn * (targetLean * 0.3 - lean) - 2 * wn * rollRate);
      tau -= this.mass * this.comHeight * G * Math.sin(lean) * 0.9;
      b.applyTorqueImpulse(fwd.clone().multiplyScalar(clamp(tau, -900, 900) * dt), true);
    } else if (alive && grounded) {
      const wn = 11;
      const zeta = 0.95;
      let tau = Iroll * (wn * wn * (targetLean - lean) - 2 * zeta * wn * rollRate);
      // rider balance: cancel the unbalanced part of gravity vs. cornering
      const h = this.comHeight;
      tau -= this.mass * h * (G * Math.sin(lean) - v * yawRateRight * Math.cos(lean)) * 0.9;
      tau = clamp(tau, -1600, 1600);
      b.applyTorqueImpulse(fwd.clone().multiplyScalar(tau * dt), true);
    } else if (alive) {
      // in the air the rider levels the bike side to side
      const wn = 5;
      const tau = Iroll * (wn * wn * (this.steerInput * 0.3 - lean) - 1.6 * wn * rollRate);
      b.applyTorqueImpulse(fwd.clone().multiplyScalar(clamp(tau, -300, 300) * dt), true);
    }

    // ---------- Pitch: rider weight shift ----------
    const pitchRate = av.dot(right);
    if (alive) {
      let tq = grounded ? -pitchIn * 160 : -pitchIn * 300 - pitchRate * 10;
      if (!grounded && this.airTime > 0.1) {
        // landing help: gently line the bike up with the ground ahead
        const p = this._pos;
        const ahead = 3;
        const h0 = this.world.heightAt(p.x, p.z);
        const h1 = this.world.heightAt(p.x + fwd.x * ahead, p.z + fwd.z * ahead);
        const want = Math.sin(Math.atan2(h1 - h0, ahead * Math.hypot(fwd.x, fwd.z)));
        tq += clamp((want - fwd.y) * 260, -160, 160);
      }
      b.applyTorqueImpulse(right.clone().multiplyScalar(tq * dt), true);
    }

    // ---------- Hop ----------
    if (alive) {
      if (input.hop) {
        this.hopCharge = Math.min(1, this.hopCharge + dt * 3);
        if (grounded) {
          b.applyImpulse(up.clone().multiplyScalar(-260 * this.hopCharge * dt), true);
        }
      } else if (this.hopCharge > 0) {
        if (this.groundedTime > 0.03 || this.airTime < 0.08) {
          const dv = cfg.hop * (0.45 + 0.55 * this.hopCharge);
          const dirUp = up.clone().add(worldUp).normalize();
          b.applyImpulse(dirUp.multiplyScalar(this.mass * dv), true);
          b.applyTorqueImpulse(right.clone().multiplyScalar(4.5 * this.hopCharge), true);
        }
        this.hopCharge = 0;
      }
    }
    this.crouch = lerp(this.crouch, input.hop && alive ? this.hopCharge : 0, Math.min(1, dt * 12));

    // ---------- Wheels: suspension, tyres, brakes, pedalling ----------
    for (const w of this.wheels) {
      if (!w.contact) {
        w.load = 0;
        w.spinRate *= 1 - dt * 0.3;
        if (brake > 0.2) w.spinRate *= 1 - dt * 8;
        w.spin += w.spinRate * dt;
        continue;
      }
      const n = w.normal;
      if (this.crashed && up.dot(n) < 0.55) {
        w.load = 0;
        continue;
      }
      const r = w.point.clone().sub(com);
      const vP = lv.clone().add(new V3().crossVectors(av, r));

      // Damping uses how fast the bike is actually closing on the ground, so a
      // wheel touching down doesn't read as an instant jump in travel.
      const xr = w.x / w.travel;
      const xdot = clamp(-vP.dot(n), -4, 6);
      let F = w.k * w.x * (1 + w.prog * xr * xr) + (xdot > 0 ? w.cComp : w.cReb) * xdot;
      F = Math.max(0, F);
      if (this.crashed) F = Math.min(F, this.mass * G * 3);
      w.load = F;

      // A tyre squirms over angled edges rather than taking their full sideways
      // push, so most of the normal's component along the axle is dropped.
      const axle = right.clone();
      if (w.front) axle.multiplyScalar(Math.cos(this.steer)).addScaledVector(fwd, -Math.sin(this.steer));
      n.addScaledVector(axle, -0.7 * n.dot(axle)).normalize();

      let wf = fwd.clone();
      if (w.front) wf.multiplyScalar(Math.cos(this.steer)).addScaledVector(right, Math.sin(this.steer));
      wf.addScaledVector(n, -wf.dot(n));
      if (wf.lengthSq() < 1e-6) continue;
      wf.normalize();
      const wr = new V3().crossVectors(wf, n);

      const vLong = vP.dot(wf);
      const vLat = vP.dot(wr);

      const mLat = 1 / this.invMassAt(r, wr);
      const mLong = 1 / this.invMassAt(r, wf);
      let Flat = (-vLat * mLat * 0.45) / dt;

      let Flong = 0;
      if (!w.front && throttle > 0 && vLong > -0.5) {
        const spinOut = 1 - smoothstep(9, 15, vLong);
        Flong += throttle * Math.min(cfg.pedalForce, cfg.pedalPower / Math.max(Math.abs(vLong), 1)) * spinOut;
      }
      const brakeMax = brake * (w.front ? cfg.brakeFront : cfg.brakeRear);
      let braking = 0;
      if (brakeMax > 0) {
        braking = clamp((-vLong * mLong * 0.5) / dt, -brakeMax, brakeMax);
        Flong += braking;
      }
      if (Math.abs(vLong) > 0.05) Flong -= Math.sign(vLong) * cfg.rollingRes * F;

      const mu = (w.surface ? w.surface.mu : 0.8) * cfg.grip;
      const Fmax = mu * F;
      const total = Math.hypot(Flat, Flong);
      w.slip = 0;
      if (total > Fmax && total > 0) {
        const s = Fmax / total;
        w.slip = 1 - s;
        Flat *= s;
        Flong *= s;
        braking *= s;
      }
      if (w.front) frontBrakeF = Math.abs(braking);

      const imp = n.clone().multiplyScalar(F).addScaledVector(wf, Flong).addScaledVector(wr, Flat).multiplyScalar(dt);
      b.applyImpulseAtPoint(imp, w.point, true);

      const locked = brakeMax > 0 && w.slip > 0.2 && Math.abs(braking) >= brakeMax * 0.99;
      w.spinRate = locked ? 0 : vLong / cfg.wheelR;
      w.spin += w.spinRate * dt;
    }

    // The rider braces and shifts back under hard front braking.
    if (alive && frontBrakeF > 0) {
      b.applyTorqueImpulse(right.clone().multiplyScalar(frontBrakeF * 0.6 * dt), true);
    }

    // ---------- Air drag ----------
    const sp = lv.length();
    if (sp > 0.1) {
      const drag = 0.5 * 1.2 * cfg.cdA * sp;
      b.applyImpulse(lv.clone().multiplyScalar(-drag * dt), true);
    }

    // ---------- Cranks ----------
    const rear = this.wheels[1];
    if (alive && throttle > 0 && rear.spinRate > 0) {
      this.crank -= (rear.spinRate / 2.6) * dt;
    } else if (alive) {
      // coast with the cranks level
      const target = Math.round((this.crank - Math.PI / 2) / Math.PI) * Math.PI + Math.PI / 2;
      this.crank = lerp(this.crank, target, Math.min(1, dt * 4));
    }

    // ---------- Crash checks ----------
    if (alive) {
      const reason = this.checkCrash(grounded, wasAir, lean);
      if (reason) {
        this.crashed = true;
        this.crashReason = reason;
        return reason;
      }
    }
    return '';
  }

  checkCrash(grounded, wasAir, lean) {
    const physics = this.physics;
    // contact data is stale for a moment after respawning
    if (this.spawnGrace > 0) {
      this.spawnGrace -= 1 / 120;
      this.velHistory.length = 0;
      return '';
    }
    let hit = false;
    physics.intersectionPairsWith(this.riderSensor, () => {
      hit = true;
    });
    physics.intersectionPairsWith(this.headSensor, () => {
      hit = true;
    });
    if (hit) return 'You hit the ground';

    if (grounded && Math.abs(lean) > 1.35) return 'Lost the front';
    const upDot = this.up.y;
    if (grounded && upDot < 0.15) return 'Flipped over';

    if (grounded && wasAir > 0.25) {
      const n = this.wheels[0].contact ? this.wheels[0].normal : this.wheels[1].normal;
      const ang = Math.acos(clamp(this.up.dot(n), -1, 1));
      if (ang > 1.15) return 'Bad landing';
    }

    // a sudden change in velocity is a huge impact (trees, casing to flat)
    this.velHistory.push(this._lv.clone());
    if (this.velHistory.length > 14) this.velHistory.shift();
    const old = this.velHistory[0];
    if (old && old.distanceTo(this._lv) > 13) return 'Massive impact';
    return '';
  }

  state() {
    const avgX = (this.wheels[0].x - this.geo.sagXF + this.wheels[1].x - this.geo.sagXR) / 2;
    return {
      xF: this.wheels[0].x,
      xR: this.wheels[1].x,
      steer: this.steer,
      spinF: this.wheels[0].spin,
      spinR: this.wheels[1].spin,
      crank: this.crank,
      crouch: this.crouch,
      suspension: avgX,
    };
  }
}
