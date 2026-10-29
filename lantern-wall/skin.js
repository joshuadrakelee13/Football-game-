/*  LANTERN WALL — SKIN
    Everything about how the game LOOKS lives in this file.
    Gameplay (speeds, the jump arc, hitboxes, level layouts) lives in game.js and levels.js,
    so nothing you change here can alter how the game plays.

    HOW TO CUSTOMISE
    - Recolour anything: change a hex colour in `palette`, `scene`, `ui` or `particles`.
    - Redraw a sprite: edit its letter grid. Each letter is a colour from `palette`,
      '.' is transparent. Every row of one sprite must be the same length.
      The hero is 12 x 16 and faces right (the game mirrors it for left).
      The hero's hitbox is fixed in game.js, so a bigger or smaller drawing plays the same.
      The queen in the tower window is 10 x 12. The climbing knight is 12 x 16 and,
      like the hero, faces right. The belfry bell is 11 x 10; the HUD bells are 7 x 7.
    - Rename the game: change `title` (two lines) and `subtitle`.
    - Move the moon, change the sky bands, the brick colours or the water in `scene`.
*/
window.SKIN = {
  title: ['LANTERN', 'WALL'],
  subtitle: 'RESCUE THE QUEEN',
  goalHint: 'RING THE BELL >',
  towerHint: 'RESCUE THE QUEEN >',
  bellBanner: 'BELL RUNG!',
  clearBanner: 'RESCUED!',
  scanlines: true,

  palette: {
    // knight
    G: '#d8dde6',  // helmet steel (also bolt tips and spikes)
    g: '#8a91a6',  // steel shadow and chain mail
    R: '#e0433a',  // plume (also bolt fletching)
    S: '#f7c59f',  // skin
    E: '#1b1b2f',  // eyes
    C: '#3d6fd6',  // tabard
    c: '#24479a',  // tabard shadow
    h: '#f2c14e',  // gold: tabard emblem, crown
    B: '#7a4524',  // boots
    L: '#ffd84a',  // lantern light
    l: '#c46a12',  // lantern frame
    // queen
    N: '#3b2418',  // hair
    U: '#8e4fc9',  // gown
    u: '#5e2f8f',  // gown shadow
    // bats
    V: '#7b4bb3',  // wing
    K: '#2b1b3f',  // body
    // fire
    Y: '#fff3a0',  // flame core (also bat eyes)
    O: '#ffb43a',  // flame
    F: '#ff5a1f',  // flame edge
    f: '#b8231a',  // flame base
    // metal and wood
    W: '#c8925a',  // bolt shaft
    I: '#6c7088',  // brazier iron
    i: '#3a3d52',  // brazier shadow
    A: '#7a2e1a',  // cold coals
    // lamp oil flask
    k: '#8a5a2b',  // cork
    q: '#bfe3ff',  // glass
    o: '#ffb43a',  // oil
    // climbing knight
    D: '#5b6178',  // black steel
    d: '#2c3044',  // black steel shadow
    X: '#b3202a',  // crimson plume and tabard
    x: '#6e1219',  // tabard shadow
    Z: '#ff5040',  // glowing visor slit
    // bell
    H: '#f2c14e',  // bronze
    J: '#fff0a8',  // shine
    j: '#a8741a',  // shadow and lip
    b: '#5c3a1a',  // clapper
    n: '#3b3f66',  // empty bell slot in the HUD
  },

  sprites: {
    heroIdle: [
      '.....RR.....',
      '....RRR.....',
      '....GGGG....',
      '...GGGGGG...',
      '...GGGGGGg..',
      '...GSSSESg..',
      '...gSSSSSg..',
      '...ggggggg..',
      '..CCChCCC...',
      '..CChhhCSl..',
      '..CCChCC.LL.',
      '..cCCCCc.LL.',
      '..gggggg.ll.',
      '...gg.gg....',
      '...gg.gg....',
      '..BBB.BBB...',
    ],
    heroWalk1: [
      '.....RR.....',
      '....RRR.....',
      '....GGGG....',
      '...GGGGGG...',
      '...GGGGGGg..',
      '...GSSSESg..',
      '...gSSSSSg..',
      '...ggggggg..',
      '..CCChCCC...',
      '..CChhhCSl..',
      '..CCChCC.LL.',
      '..cCCCCc.LL.',
      '..gggggg.ll.',
      '..gg...gg...',
      '.gg.....gg..',
      'BBB.....BBB.',
    ],
    heroWalk2: [
      '.....RR.....',
      '....RRR.....',
      '....GGGG....',
      '...GGGGGG...',
      '...GGGGGGg..',
      '...GSSSESg..',
      '...gSSSSSg..',
      '...ggggggg..',
      '..CCChCCC...',
      '..CChhhCSl..',
      '..CCChCC.LL.',
      '..cCCCCc.LL.',
      '..gggggg.ll.',
      '....ggg.....',
      '....ggg.....',
      '...BBBB.....',
    ],
    heroJump: [
      '.....RR.....',
      '....RRR.....',
      '....GGGG....',
      '...GGGGGG...',
      '...GGGGGGg..',
      '...GSSSESg..',
      '...gSSSSSg..',
      '...ggggggg..',
      '..CCChCCC...',
      '..CChhhCSl..',
      '..CCChCC.LL.',
      '..cCCCCc.LL.',
      '..gggggg.ll.',
      '..ggggg.....',
      '.BBB..gg....',
      '......BBB...',
    ],
    heroLife: [
      '.....RR.....',
      '....RRR.....',
      '....GGGG....',
      '...GGGGGG...',
      '...GGGGGGg..',
      '...GSSSESg..',
      '...gSSSSSg..',
    ],
    queenWave1: [
      '...h.h.h..',
      '...hhhhh..',
      '..NNNNNNN.',
      '..NSSSSSN.',
      '..NSESESN.',
      '..NNSSSNNS',
      '...NUUUNS.',
      '..UUUUUU..',
      '..UuUUuU..',
      '.UUUUUUUU.',
      '.UuUUUUuU.',
      'UUUUUUUUUU',
    ],
    queenWave2: [
      '...h.h.h..',
      '...hhhhh..',
      '..NNNNNNN.',
      '..NSSSSSN.',
      '..NSESESN.',
      '..NNSSSNN.',
      '..SNUUUNS.',
      '..UUUUUU..',
      '..UuUUuU..',
      '.UUUUUUUU.',
      '.UuUUUUuU.',
      'UUUUUUUUUU',
    ],
    queenCheer: [
      '...h.h.h..',
      '...hhhhh..',
      '..NNNNNNN.',
      '..NSSSSSN.',
      '..NSESESN.',
      'S.NNSSSNNS',
      'S..NUUUN.S',
      '..UUUUUU..',
      '..UuUUuU..',
      '.UUUUUUUU.',
      '.UuUUUUuU.',
      'UUUUUUUUUU',
    ],
    knightWalk1: [
      '....XX....G.',
      '...XXX....G.',
      '...DDDD...G.',
      '..DDDDDD..G.',
      '..DDDDDDd.G.',
      '..DZZZZDd.G.',
      '..dDDDDDd.G.',
      '..dddddddhhh',
      '.dXXXXXXDDD.',
      '.dXXxXXXd...',
      '.dXxxxXXd...',
      '.dXXxXXXd...',
      '..ddddddd...',
      '..gg...gg...',
      '.gg.....gg..',
      'BBB.....BBB.',
    ],
    knightWalk2: [
      '....XX....G.',
      '...XXX....G.',
      '...DDDD...G.',
      '..DDDDDD..G.',
      '..DDDDDDd.G.',
      '..DZZZZDd.G.',
      '..dDDDDDd.G.',
      '..dddddddhhh',
      '.dXXXXXXDDD.',
      '.dXXxXXXd...',
      '.dXxxxXXd...',
      '.dXXxXXXd...',
      '..ddddddd...',
      '...ggg......',
      '...ggg......',
      '..BBBB......',
    ],
    knightClimb: [         // seen from behind, one hand up; mirrored for the other hand
      '.DD.........',
      '.DD..XX.....',
      '..D.XXXX....',
      '..DDDDDDD...',
      '..DDDDDDDd..',
      '..dDDDDDDd..',
      '..dXXXXXXd..',
      '..dXXxxXXdDD',
      '..dXXxxXXd.D',
      '..dXXXXXXd..',
      '..dddddddd..',
      '...gg..gg...',
      '...gg..gg...',
      '..BBB...gg..',
      '........BBB.',
      '............',
    ],
    knightLife: [
      '....XX....G.',
      '...XXX....G.',
      '...DDDD...G.',
      '..DDDDDD..G.',
      '..DDDDDDd.G.',
      '..DZZZZDd.G.',
      '..dDDDDDd.G.',
    ],
    bell: [
      '....jjj....',
      '....j.j....',
      '...HHHHH...',
      '..HJHHHHj..',
      '..HJHHHHj..',
      '..HJHHHHj..',
      '.HHJHHHHHj.',
      '.HHHHHHHHj.',
      'jjjjjjjjjjj',
      '.....b.....',
    ],
    bellIcon: [
      '...j...',
      '..HHH..',
      '.HJHHj.',
      '.HJHHj.',
      'HHHHHHj',
      'jjjjjjj',
      '...b...',
    ],
    bellSlot: [
      '...n...',
      '..nnn..',
      '.n...n.',
      '.n...n.',
      'n.....n',
      'nnnnnnn',
      '.......',
    ],
    bolt: [
      '......RR',
      'GGWWWWWR',
      '......RR',
    ],
    bat1: [
      'V........V',
      'VV.K..K.VV',
      'VVVKKKKVVV',
      '.VVKYYKVV.',
      '...KKKK...',
      '....KK....',
    ],
    bat2: [
      '...K..K...',
      '...KKKK...',
      '.VVKYYKVV.',
      'VVVKKKKVVV',
      'VV..KK..VV',
      'V........V',
    ],
    spikes: [
      '.G...G..',
      '.G...G..',
      'GgG.GgG.',
      'GgG.GgG.',
      'GggGGggG',
      'gggggggg',
    ],
    brazier: [
      'IIIIIIIIIIIIIIII',
      '.IAAAAAAAAAAAAI.',
      '.iIIIIIIIIIIIIi.',
      '..iIIIIIIIIIIi..',
      '...iiiiiiiiii...',
      '......iIIi......',
      '......iIIi......',
      '......iIIi......',
      '......iIIi......',
      '......iIIi......',
      '.....iiIIii.....',
      '....iiiiiiii....',
    ],
    flame: [
      '.....O......',
      '....OO......',
      '....OOO..O..',
      '...OOYO..O..',
      '..OOYYOO.OO.',
      '..OYYYYOOOO.',
      '.OOYYYYYOOO.',
      '.FOYYYYYYOF.',
      '.FOOYYYYOOF.',
      'FFOOOYYOOOFF',
      'fFFOOOOOOFFf',
      '.fFFFFFFFFf.',
    ],
    flask: [
      '..kk..',
      '..qq..',
      '.q..q.',
      'q....q',
      'qooooq',
      'qooooq',
      'qooooq',
      '.qqqq.',
    ],
  },

  scene: {
    sky: ['#0a0e29', '#111943', '#1a275e', '#283877'],   // top to bottom
    star: '#fff6d8',
    starDim: '#8d93c9',
    moonPos: { x: 40, y: 52, r: 10 },
    moon: '#f4ecc8',
    moonShade: '#d6cb9f',
    skyline: '#090c20',
    window: '#ffcf5a',
    parapet: '#3a3550',
    parapetTop: '#55507a',
    coping: '#b9a98f',
    copingLight: '#e3d6bd',
    copingShadow: '#7d6f5c',
    brick: ['#8e4f3b', '#9c5a44', '#81483a'],
    mortar: '#4e2d26',
    breach: '#120d19',
    breachEdge: '#22182a',
    crumble: '#a8977a',
    crack: '#4e3f33',
    water: ['#1d3f73', '#163360', '#10264a'],
    waterLight: '#5f8fd6',
    moonGlint: '#e8e2b8',
    wood: '#8a5a2b',
    woodDark: '#5c3a1a',
    rope: '#c9b48a',
    ropeDark: '#8a7650',
    roof: '#4a2a1c',
    roofLight: '#6e3f26',
    chain: '#aab2c8',
    chainDark: '#5d6378',
    plank: '#a9733b',
    plankDark: '#6e4620',
    grate: '#1c1a26',
    towerStone: '#6d6680',
    towerLight: '#8f88a3',
    towerDark: '#3f3a52',
    towerWindow: '#2a1a14',
    towerWindowGlow: '#7a4a1e',
    glow: 'rgba(255, 200, 90, 0.10)',
    hudBar: '#05060f',
  },

  ui: {
    text: '#ffffff',
    label: '#ff5a4e',
    score: '#ffffff',
    hi: '#ffd84a',
    bonus: '#5fe0ff',
    box: '#5fe0ff',
    dim: '#8d93c9',
    good: '#7cf27c',
    logo: '#ffb43a',
    logoShadow: '#8a2c12',
    banner: '#ffd84a',
    panel: 'rgba(6, 8, 22, 0.82)',
    progress: '#ff4fd8',     // the stretch of wall already walked on the progress map
    progressTrack: '#3b3f66',
  },

  particles: {
    splash: ['#5f8fd6', '#a8d0ff', '#ffffff'],
    rubble: ['#b9a98f', '#7d6f5c', '#8e4f3b'],
    spark: ['#ffd84a', '#ffb43a', '#fff3a0'],
  },
};
