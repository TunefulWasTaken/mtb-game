// Third-person chase camera and first-person helmet camera.
import * as THREE from 'three';

const V3 = THREE.Vector3;

export class CameraRig {
  constructor(camera, world) {
    this.camera = camera;
    this.world = world;
    this.mode = 'third';
    this.pos = new V3();
    this.look = new V3();
    this.heading = new V3(0, 0, -1);
    this.initialised = false;
  }

  toggle() {
    this.mode = this.mode === 'third' ? 'first' : 'third';
    this.initialised = false;
  }

  snap() {
    this.initialised = false;
  }

  // target: bike position; fwd/up: bike axes; head: rider head position; vel: bike velocity
  update(dt, { target, fwd, up, head, vel, crashed, focus }) {
    const cam = this.camera;
    if (this.mode === 'first' && !crashed) {
      cam.fov = 82;
      cam.updateProjectionMatrix();
      const eye = head.clone().addScaledVector(fwd, 0.06).addScaledVector(up, 0.02);
      cam.position.copy(eye);
      // look along the bike, with roll softened so the horizon is readable
      const flatFwd = fwd.clone();
      const look = eye.clone().addScaledVector(flatFwd, 10).addScaledVector(up, -1.6);
      const softUp = up.clone().lerp(new V3(0, 1, 0), 0.55).normalize();
      cam.up.copy(softUp);
      cam.lookAt(look);
      this.initialised = false;
      return;
    }

    cam.fov = 68;
    cam.updateProjectionMatrix();
    cam.up.set(0, 1, 0);
    const centre = crashed ? focus : target;
    // heading follows travel direction when moving, the bike otherwise
    const flatVel = new V3(vel.x, 0, vel.z);
    const want = flatVel.lengthSq() > 4 && !crashed ? flatVel.normalize() : new V3(fwd.x, 0, fwd.z).normalize();
    if (want.lengthSq() > 0.5) {
      this.heading.lerp(want, 1 - Math.exp(-dt * (crashed ? 0.8 : 3))).normalize();
    }
    const dist = crashed ? 6 : 4.4;
    const height = crashed ? 2.6 : 1.7;
    const desired = centre.clone().addScaledVector(this.heading, -dist);
    desired.y += height;
    const ground = this.world.heightAt(desired.x, desired.z) + 0.6;
    if (desired.y < ground) desired.y = ground;
    const lookAt = centre.clone().add(new V3(0, 0.9, 0)).addScaledVector(this.heading, 2);

    if (!this.initialised) {
      this.pos.copy(desired);
      this.look.copy(lookAt);
      this.initialised = true;
    } else {
      const k = 1 - Math.exp(-dt * 7);
      this.pos.lerp(desired, k);
      this.look.lerp(lookAt, 1 - Math.exp(-dt * 12));
      const g2 = this.world.heightAt(this.pos.x, this.pos.z) + 0.5;
      if (this.pos.y < g2) this.pos.y = g2;
    }
    cam.position.copy(this.pos);
    cam.lookAt(this.look);
  }
}
