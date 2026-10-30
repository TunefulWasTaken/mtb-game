// Track definitions. Points are (x, z) control points on the mountain, from the
// start at the top to the finish at the bottom. Feature positions are distances
// along the trail in metres.

export const DOWNHILL = {
  id: 'downhill',
  name: 'Downhill',
  halfWidth: 1.6,
  seed: 4242,
  points: [
    [0, -505], [14, -455], [-12, -405], [22, -350], [44, -300], [18, -255],
    [-26, -215], [-44, -160], [-14, -105], [24, -60], [12, -5], [-26, 40],
    [-52, 95], [-30, 150], [10, 190], [38, 245], [26, 300], [-8, 340],
    [-34, 390], [-14, 440], [8, 490],
  ],
  features: [
    { type: 'roots', from: 55, to: 105 },
    { type: 'table', at: 140, lipLen: 4.5, lipH: 0.9, top: 4, land: 7 },
    { type: 'rocks', from: 165, to: 215, density: 1.0 },
    { type: 'drop', at: 262, h: 1.2 },
    { type: 'roots', from: 300, to: 360 },
    { type: 'table', at: 410, lipLen: 5, lipH: 1.2, top: 6, land: 8 },
    { type: 'rocks', from: 450, to: 520, density: 1.3 },
    { type: 'drop', at: 575, h: 1.6 },
    { type: 'roots', from: 620, to: 680 },
    { type: 'table', at: 730, lipLen: 5, lipH: 1.1, top: 5, land: 8 },
    { type: 'rocks', from: 770, to: 840, density: 1.6 },
    { type: 'drop', at: 900, h: 1.0 },
    { type: 'roots', from: 930, to: 990 },
    { type: 'table', at: 1040, lipLen: 5.5, lipH: 1.3, top: 7, land: 9 },
  ],
};

// A flowing jump line: a long run of tabletops and a few gaps, with berms in
// between. Sizes build up as you go down.
const JUMP_SIZES = {
  small: { lipLen: 4.5, lipH: 1.7, top: 5, land: 8.5 },
  medium: { lipLen: 5, lipH: 2.2, top: 6.5, land: 10 },
  large: { lipLen: 5.5, lipH: 2.7, top: 8, land: 11.5 },
};
const JUMP_ORDER = [
  'small', 'small', 'medium', 'small', 'medium', 'medium', 'large', 'medium',
  'medium', 'large', 'gap', 'medium', 'large', 'large', 'gap', 'medium',
  'large', 'large', 'gap', 'large', 'medium', 'large', 'gap', 'large', 'large',
];

function jumpLine() {
  const features = [];
  let s = 48;
  for (const kind of JUMP_ORDER) {
    if (kind === 'gap') {
      features.push({ type: 'gap', at: s, lipLen: 5, lipH: 2.2, gap: 5, depth: 0.8, land: 10 });
      s += 5 + 5 + 10 + 22;
    } else {
      const j = JUMP_SIZES[kind];
      features.push({ type: 'table', at: s, ...j });
      s += j.top + j.land + 22 + j.lipLen;
    }
  }
  return features;
}

export const JUMPLINE = {
  id: 'jumpline',
  name: 'Jump Line',
  halfWidth: 2.3,
  seed: 777,
  maxGrade: 0.2,
  minGrade: 0.11,
  points: [
    [105, -505], [112, -450], [102, -390], [116, -330], [104, -270], [94, -210],
    [108, -150], [120, -90], [106, -30], [94, 30], [108, 90], [120, 150],
    [106, 210], [96, 270], [110, 330], [118, 390], [104, 450], [108, 490],
  ],
  features: jumpLine(),
};

export const TRACKS = [JUMPLINE, DOWNHILL];
