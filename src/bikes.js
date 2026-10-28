// Bike specs. Geometry is in the bike's own frame: origin halfway between the
// axles at sag, -Z forward, +Y up, +X right. Lengths in metres, mass in kg.
const deg = Math.PI / 180;

export const BIKES = {
  dh: {
    id: 'dh',
    name: 'Downhill',
    wheelR: 0.365,
    tyreW: 0.064,
    wheelbase: 1.28,
    headAngle: 63 * deg,
    forkOffset: 0.05,
    bbDrop: 0.015,
    chainstay: 0.445,
    pivot: [0, 0.1, 0.14],
    travelF: 0.2,
    travelR: 0.2,
    sagF: 0.25,
    sagR: 0.3,
    progF: 1.4,
    progR: 2.0,
    dampComp: 0.32,
    dampReb: 0.55,
    bikeMass: 17,
    riderMass: 75,
    comY: 0.74,
    comZ: 0.04,
    inertia: [24, 18, 13], // pitch, yaw, roll
    cdA: 0.46,
    rollingRes: 0.024,
    grip: 1.0,
    pedalForce: 240,
    pedalPower: 480,
    brakeFront: 1400,
    brakeRear: 1000,
    hop: 2.2,
    colors: {
      frame: 0xe8590c,
      frame2: 0x16181c,
      decal: 0xf4f4f4,
      stanchion: 0xc9a046,
      fork: 0x16181c,
      rim: 0x1d1f22,
    },
  },
};
