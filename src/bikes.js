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
    sagF: 0.28,
    sagR: 0.33,
    progF: 1.8,
    progR: 2.4,
    dampComp: 0.3,
    dampReb: 0.8,
    bikeMass: 16,
    riderMass: 70,
    comY: 0.7,
    comZ: 0.04,
    inertia: [15, 12, 9], // pitch, yaw, roll
    cdA: 0.42,
    rollingRes: 0.018,
    grip: 1.3,
    pedalForce: 380,
    pedalPower: 750,
    brakeFront: 1300,
    brakeRear: 1100,
    hop: 3.2,
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
