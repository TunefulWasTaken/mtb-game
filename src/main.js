import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { World } from './world.js';
import { buildForest } from './forest.js';
import { BIKES } from './bikes.js';
import { Bike } from './bike.js';
import { BikeModel } from './bikeModel.js';
import { Rider } from './rider.js';
import { Input } from './input.js';
import { CameraRig } from './cameras.js';

const $ = (id) => document.getElementById(id);
// Lets the loading message paint between the slow build steps.
const nextFrame = () => new Promise((r) => setTimeout(r, 30));
const STEP = 1 / 120;
const CHECKPOINT_GAP = 40;

function formatTime(t) {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}

function makeSky(scene) {
  const geo = new THREE.SphereGeometry(1500, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(0x4f8fd0) },
      horizon: { value: new THREE.Color(0xcfe2ec) },
      bottom: { value: new THREE.Color(0x9fb7a4) },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; varying vec3 vDir;
      void main(){ float h = vDir.y; vec3 c = h > 0.0 ? mix(horizon, top, pow(h, 0.6)) : mix(horizon, bottom, min(1.0, -h * 4.0)); gl_FragColor = vec4(c, 1.0); }`,
  });
  const sky = new THREE.Mesh(geo, mat);
  sky.frustumCulled = false;
  scene.add(sky);
  return sky;
}

async function main() {
  $('loadMsg').textContent = 'Loading physics…';
  await RAPIER.init();

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xbfd3dc, 60, 340);
  const sky = makeSky(scene);
  const camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.05, 2000);

  scene.add(new THREE.HemisphereLight(0xd6e8ff, 0x46502c, 1.1));
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -28;
  sc.right = 28;
  sc.top = 28;
  sc.bottom = -28;
  sc.near = 1;
  sc.far = 220;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  const sunOffset = new THREE.Vector3(45, 90, 30);

  const physics = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  physics.timestep = STEP;

  $('loadMsg').textContent = 'Shaping the mountain…';
  await nextFrame();
  const world = new World(RAPIER, physics, scene);

  $('loadMsg').textContent = 'Growing the forest…';
  await nextFrame();
  const forest = buildForest(world, scene);

  $('loadMsg').textContent = 'Building the bike…';
  await nextFrame();
  const cfg = BIKES.dh;
  const bike = new Bike(RAPIER, physics, world, cfg);
  const model = new BikeModel(cfg);
  scene.add(model.root);
  const rider = new Rider(scene);
  const input = new Input();
  const rig = new CameraRig(camera, world);

  let track = world.tracks[0];
  $('trackName').textContent = track.def.name;
  let checkpoint = 3;
  let runStart = -1;
  let runTime = 0;
  const bests = new Map();
  let best = null;

  function chooseTrack(t) {
    track = t;
    $('trackName').textContent = t.def.name;
    best = bests.get(t.def.id) ?? null;
    checkpoint = 3;
    spawn(checkpoint);
  }
  let clockTime = 0;
  let crashTime = 0;
  let showHelp = true;

  const local = {
    gripL: new THREE.Vector3(),
    gripR: new THREE.Vector3(),
    pedalL: new THREE.Vector3(),
    pedalR: new THREE.Vector3(),
  };

  function banner(text, seconds = 2.2) {
    const el = $('banner');
    el.textContent = text;
    el.style.opacity = 1;
    clearTimeout(banner.t);
    banner.t = setTimeout(() => (el.style.opacity = 0), seconds * 1000);
  }

  function spawn(s) {
    rider.endRagdoll(physics);
    const pose = world.spawnPose(track, s);
    bike.placeAt(pose.position, pose.forward);
    $('crash').style.display = 'none';
    rig.snap();
    if (s < 10) {
      runStart = -1;
      runTime = 0;
    }
  }
  spawn(checkpoint);

  // Settle the suspension before the first frame.
  for (let i = 0; i < 60; i++) {
    bike.step(STEP, { throttle: 0, brake: 1, steer: 0, pitch: 0, hop: false });
    physics.step();
  }

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  $('loadMsg').textContent = 'Pick a trail';
  const picker = $('trackPicker');
  await new Promise((resolve) => {
    const go = (t) => {
      window.removeEventListener('keydown', onKey);
      if (t !== track) chooseTrack(t);
      resolve();
    };
    const onKey = (e) => {
      if (e.code === 'Enter' || e.code === 'Space') go(track);
    };
    for (const t of world.tracks) {
      const b = document.createElement('button');
      b.textContent = t.def.name;
      b.addEventListener('click', () => go(t), { once: true });
      picker.appendChild(b);
    }
    picker.style.display = 'flex';
    window.addEventListener('keydown', onKey);
  });
  $('loading').style.display = 'none';
  banner('Drop in!');
  input.endFrame();

  // Moves the bike model and rider to match the physics.
  function syncVisuals(ride) {
    const t = bike.body.translation();
    const r = bike.body.rotation();
    tmpPos.set(t.x, t.y, t.z);
    tmpQuat.set(r.x, r.y, r.z, r.w);
    model.root.position.copy(tmpPos);
    model.root.quaternion.copy(tmpQuat);
    const st = bike.state();
    model.update(st);
    if (rider.ragdoll) {
      rider.syncRagdoll();
      rider.ragdollCentre(focus);
    } else {
      model.contactPoints(local);
      rider.pose(local, model.root.matrixWorld, tmpQuat, {
        pitch: ride.pitch,
        crouch: st.crouch,
        suspension: st.suspension,
      });
      focus.copy(tmpPos);
    }
  }

  function tick(ride) {
    const crash = bike.step(STEP, ride);
    physics.step();
    // fell off the edge of the map, or the numbers blew up: put the rider back
    const p = bike.body.translation();
    const { x0, x1, z0, z1 } = world.bounds;
    if (!bike.healthy() || p.x < x0 || p.x > x1 || p.z < z0 || p.z > z1 || p.y < world.heightAt(p.x, p.z) - 20) {
      spawn(checkpoint);
      return;
    }
    if (crash) {
      syncVisuals(ride);
      const b = bike.body;
      rider.startRagdoll(RAPIER, physics, b.linvel(), b.angvel(), b.worldCom());
      bike.dropRider();
      crashTime = clockTime;
      $('crashWhy').textContent = crash;
      $('crash').style.display = 'block';
      runStart = -1;
    }
  }

  const tmpPos = new THREE.Vector3();
  const tmpQuat = new THREE.Quaternion();
  const focus = new THREE.Vector3();

  // Handy for poking at the game from the browser console: game.sim(2, { throttle: 1 })
  window.game = {
    bike, rider, world, physics, rig, spawn, renderer, chooseTrack,
    get track() {
      return track;
    },
    sim(seconds, ride = {}) {
      const r = { throttle: 0, brake: 0, steer: 0, pitch: 0, hop: false, ...ride };
      for (let i = 0; i < Math.round(seconds / STEP); i++) tick(r);
    },
  };

  const clock = new THREE.Clock();
  let acc = 0;
  let frames = 0;
  let fpsTime = 0;

  function frame() {
    requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.05);
    clockTime += dt;

    if (input.took('KeyC')) {
      rig.toggle();
      rider.setFirstPerson(rig.mode === 'first');
      $('camMode').textContent = rig.mode === 'first' ? '1st person' : '3rd person';
    }
    if (input.took('KeyR')) spawn(checkpoint);
    if (input.took('KeyT')) {
      checkpoint = 3;
      spawn(checkpoint);
    }
    if (input.took('KeyN')) {
      const next = world.tracks[(world.tracks.indexOf(track) + 1) % world.tracks.length];
      chooseTrack(next);
      banner(next.def.name);
    }
    if (input.took('KeyH')) {
      showHelp = !showHelp;
      $('help').style.display = showHelp ? '' : 'none';
    }

    const ride = input.riding();
    acc += dt;
    let steps = 0;
    while (acc >= STEP && steps < 8) {
      tick(ride);
      acc -= STEP;
      steps++;
    }
    if (steps === 8) acc = 0;

    syncVisuals(ride);
    if (bike.trick) {
      banner(bike.trick, 1.6);
      bike.trick = '';
    }

    // Progress, checkpoints and the run timer.
    const near = track.nearest(tmpPos.x, tmpPos.z);
    if (!bike.crashed && near.d < track.halfWidth + 3) {
      const cp = Math.floor(near.s / CHECKPOINT_GAP) * CHECKPOINT_GAP;
      if (cp > checkpoint && cp < track.length - 15) checkpoint = cp;
      if (runStart < 0 && near.s > 4 && near.s < 20) runStart = clockTime;
      if (runStart >= 0) runTime = clockTime - runStart;
      if (runStart >= 0 && near.s > track.length - 8) {
        const final = clockTime - runStart;
        const isBest = best === null || final < best;
        if (isBest) {
          best = final;
          bests.set(track.def.id, final);
        }
        banner(`Finished in ${formatTime(final)}${isBest ? ' (best!)' : ''}`, 4);
        runStart = -1;
        runTime = final;
      }
    }
    if (bike.crashed && clockTime - crashTime > 5) spawn(checkpoint);

    rig.update(dt, {
      target: tmpPos,
      fwd: bike.fwd,
      up: bike.up,
      head: rider.pts.head,
      vel: bike._lv,
      crashed: bike.crashed,
      focus,
    });
    sky.position.copy(camera.position);
    forest.update(camera.position);
    sun.target.position.copy(focus);
    sun.position.copy(focus).add(sunOffset);

    $('kmh').textContent = Math.round(bike.speed * 3.6);
    $('dist').textContent = `${Math.round(near.s)} / ${Math.round(track.length)} m`;
    $('time').textContent = runStart >= 0 || runTime > 0 ? formatTime(runTime) : '–';
    $('best').textContent = best === null ? '–' : formatTime(best);

    renderer.render(scene, camera);
    input.endFrame();

    frames++;
    fpsTime += dt;
    if (fpsTime > 0.5) {
      $('fps').textContent = `${Math.round(frames / fpsTime)} fps`;
      frames = 0;
      fpsTime = 0;
    }
  }
  frame();
}

main().catch((err) => {
  console.error(err);
  $('loadMsg').textContent = `Something went wrong: ${err.message}`;
});
