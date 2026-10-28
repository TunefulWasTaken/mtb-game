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

export const TRACKS = [DOWNHILL];
