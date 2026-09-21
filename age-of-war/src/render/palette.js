// Colour, per age.
//
// Evolving has to be visible from across the room, so every age repaints the
// whole world - sky, hills, ground and army - rather than only swapping the
// units. The ramp runs warm and hazy in the Stone Age, cools and hardens through
// the Castle and Renaissance, goes overcast and drab for the Modern Age, and
// ends in a clean twilight for the Future.

export const AGE_PALETTE = [
  {
    key: 'stone',
    sky: ['#F2C078', '#E38B5C', '#C8663F'],
    haze: 'rgba(255, 214, 158, 0.35)',
    hillFar: '#8E5C46', hillNear: '#6A4130',
    ground: '#7A5238', groundDark: '#5C3B27', groundLine: '#4A2F1E',
    prop: '#4A2F1E',
  },
  {
    key: 'castle',
    sky: ['#BFD6E8', '#8FB0CC', '#5E7E9E'],
    haze: 'rgba(214, 232, 245, 0.3)',
    hillFar: '#6C7F72', hillNear: '#4C5F55',
    ground: '#5F7256', groundDark: '#45543F', groundLine: '#36422F',
    prop: '#36422F',
  },
  {
    key: 'renaissance',
    sky: ['#F5DFB0', '#D9B27C', '#A87B55'],
    haze: 'rgba(255, 236, 200, 0.32)',
    hillFar: '#7E7A5E', hillNear: '#5C5942',
    ground: '#6E6A4C', groundDark: '#524F38', groundLine: '#403D2A',
    prop: '#403D2A',
  },
  {
    key: 'modern',
    sky: ['#AEB7BE', '#818C95', '#5A646C'],
    haze: 'rgba(200, 210, 218, 0.28)',
    hillFar: '#5D6A5C', hillNear: '#434E43',
    ground: '#57604F', groundDark: '#3E463A', groundLine: '#2F352C',
    prop: '#2F352C',
  },
  {
    key: 'future',
    sky: ['#1E2A46', '#2C1F4A', '#140F26'],
    haze: 'rgba(120, 200, 255, 0.16)',
    hillFar: '#26304F', hillNear: '#1A2138',
    ground: '#222A3E', groundDark: '#171D2C', groundLine: '#0F1320',
    prop: '#3A4668',
  },
];

// Each army keeps a constant identity colour across all five ages, so you never
// have to work out which half of a melee is yours.
export const TEAM = [
  { ribbon: '#2E7FD4', ribbonDark: '#1B558F', glow: '#6FB4F5', name: 'blue' },
  { ribbon: '#D14B3A', ribbonDark: '#8F2C20', glow: '#F58B6F', name: 'red' },
];

export const OUTLINE = '#1B1410';
export const OUTLINE_FUTURE = '#080B14';

export const paletteFor = (age) => AGE_PALETTE[age] ?? AGE_PALETTE[0];
export const outlineFor = (age) => (age === 4 ? OUTLINE_FUTURE : OUTLINE);
