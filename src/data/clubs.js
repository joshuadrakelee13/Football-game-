// The English pyramid, based on the 2025/26 season.
// Tuple layout keeps one club per line so the table stays scannable and tweakable:
//   [id, name, short, abbr, stadium, capacity, prestige, primary, secondary, pattern?]
//
// `prestige` (1-100) is the anchor for everything derived: squad quality, transfer
// budget, wage ceiling, recruitment ambition and fan base. It is what stops the world
// drifting away from plausibility over twenty simulated seasons.
// `pattern` drives the club colour bar in the UI: solid (default), stripes, hoops, halves.

const PREMIER_LEAGUE = [
  ['ars', 'Arsenal', 'Arsenal', 'ARS', 'Emirates Stadium', 60704, 92, '#EF0107', '#FFFFFF'],
  ['avl', 'Aston Villa', 'Aston Villa', 'AVL', 'Villa Park', 42785, 80, '#95BFE5', '#670E36'],
  ['bou', 'AFC Bournemouth', 'Bournemouth', 'BOU', 'Vitality Stadium', 11307, 68, '#DA291C', '#000000', 'stripes'],
  ['bre', 'Brentford', 'Brentford', 'BRE', 'Gtech Community Stadium', 17250, 67, '#E30613', '#FFFFFF', 'stripes'],
  ['bha', 'Brighton & Hove Albion', 'Brighton', 'BHA', 'Amex Stadium', 31800, 73, '#0057B8', '#FFFFFF', 'stripes'],
  ['bur', 'Burnley', 'Burnley', 'BUR', 'Turf Moor', 21944, 63, '#6C1D45', '#99D6EA'],
  ['che', 'Chelsea', 'Chelsea', 'CHE', 'Stamford Bridge', 40343, 88, '#034694', '#FFFFFF'],
  ['cry', 'Crystal Palace', 'Crystal Palace', 'CRY', 'Selhurst Park', 25486, 71, '#1B458F', '#C4122E', 'stripes'],
  ['eve', 'Everton', 'Everton', 'EVE', 'Hill Dickinson Stadium', 52888, 72, '#003399', '#FFFFFF'],
  ['ful', 'Fulham', 'Fulham', 'FUL', 'Craven Cottage', 29600, 70, '#FFFFFF', '#000000'],
  ['lee', 'Leeds United', 'Leeds', 'LEE', 'Elland Road', 37645, 69, '#FFFFFF', '#1D428A'],
  ['liv', 'Liverpool', 'Liverpool', 'LIV', 'Anfield', 61276, 94, '#C8102E', '#00B2A9'],
  ['mci', 'Manchester City', 'Man City', 'MCI', 'Etihad Stadium', 53400, 95, '#6CABDD', '#1C2C5B'],
  ['mun', 'Manchester United', 'Man United', 'MUN', 'Old Trafford', 74310, 90, '#DA291C', '#FBE122'],
  ['new', 'Newcastle United', 'Newcastle', 'NEW', "St James' Park", 52305, 83, '#241F20', '#FFFFFF', 'stripes'],
  ['nfo', 'Nottingham Forest', 'Nottm Forest', 'NFO', 'City Ground', 30404, 72, '#DD0000', '#FFFFFF'],
  ['sun', 'Sunderland', 'Sunderland', 'SUN', 'Stadium of Light', 49000, 66, '#EB172B', '#FFFFFF', 'stripes'],
  ['tot', 'Tottenham Hotspur', 'Tottenham', 'TOT', 'Tottenham Hotspur Stadium', 62850, 85, '#FFFFFF', '#132257'],
  ['whu', 'West Ham United', 'West Ham', 'WHU', 'London Stadium', 62500, 74, '#7A263A', '#1BB1E7'],
  ['wol', 'Wolverhampton Wanderers', 'Wolves', 'WOL', 'Molineux', 31750, 70, '#FDB913', '#231F20'],
];

const CHAMPIONSHIP = [
  ['bir', 'Birmingham City', 'Birmingham', 'BIR', "St Andrew's", 29409, 58, '#0000FF', '#FFFFFF'],
  ['blb', 'Blackburn Rovers', 'Blackburn', 'BLB', 'Ewood Park', 31367, 55, '#009EE0', '#FFFFFF', 'halves'],
  ['bri', 'Bristol City', 'Bristol City', 'BRI', 'Ashton Gate', 27000, 55, '#E21C38', '#FFFFFF'],
  ['cha', 'Charlton Athletic', 'Charlton', 'CHA', 'The Valley', 27111, 52, '#E8112D', '#FFFFFF'],
  ['cov', 'Coventry City', 'Coventry', 'COV', 'Coventry Building Society Arena', 32609, 58, '#78D0F3', '#FFFFFF'],
  ['der', 'Derby County', 'Derby', 'DER', 'Pride Park', 33597, 55, '#FFFFFF', '#000000'],
  ['hul', 'Hull City', 'Hull', 'HUL', 'MKM Stadium', 25586, 54, '#F5A12D', '#000000', 'stripes'],
  ['ips', 'Ipswich Town', 'Ipswich', 'IPS', 'Portman Road', 30311, 62, '#0044A9', '#FFFFFF'],
  ['lei', 'Leicester City', 'Leicester', 'LEI', 'King Power Stadium', 32261, 65, '#003090', '#FDBE11'],
  ['mid', 'Middlesbrough', 'Middlesbrough', 'MID', 'Riverside Stadium', 34742, 58, '#E21C38', '#FFFFFF'],
  ['mil', 'Millwall', 'Millwall', 'MIL', 'The Den', 20146, 52, '#001D5E', '#FFFFFF'],
  ['nor', 'Norwich City', 'Norwich', 'NOR', 'Carrow Road', 27359, 58, '#00A650', '#FFF200'],
  ['oxf', 'Oxford United', 'Oxford', 'OXF', 'Kassam Stadium', 12500, 46, '#FFCF00', '#00256B'],
  ['por', 'Portsmouth', 'Portsmouth', 'POR', 'Fratton Park', 21100, 52, '#001489', '#FFFFFF'],
  ['pne', 'Preston North End', 'Preston', 'PNE', 'Deepdale', 23404, 51, '#FFFFFF', '#B2B2B2'],
  ['qpr', 'Queens Park Rangers', 'QPR', 'QPR', 'Loftus Road', 18439, 52, '#1D5BA4', '#FFFFFF', 'hoops'],
  ['shu', 'Sheffield United', 'Sheffield Utd', 'SHU', 'Bramall Lane', 32050, 59, '#EE2737', '#000000', 'stripes'],
  ['shw', 'Sheffield Wednesday', 'Sheffield Wed', 'SHW', 'Hillsborough', 34835, 54, '#0066B3', '#FFFFFF', 'stripes'],
  ['sou', 'Southampton', 'Southampton', 'SOU', "St Mary's Stadium", 32384, 62, '#D71920', '#FFFFFF', 'stripes'],
  ['stk', 'Stoke City', 'Stoke', 'STK', 'bet365 Stadium', 30089, 54, '#E03A3E', '#FFFFFF', 'stripes'],
  ['swa', 'Swansea City', 'Swansea', 'SWA', 'Swansea.com Stadium', 21088, 52, '#FFFFFF', '#000000'],
  ['wat', 'Watford', 'Watford', 'WAT', 'Vicarage Road', 22200, 53, '#FBEE23', '#ED2127'],
  ['wba', 'West Bromwich Albion', 'West Brom', 'WBA', 'The Hawthorns', 26850, 57, '#122F67', '#FFFFFF', 'stripes'],
  ['wre', 'Wrexham', 'Wrexham', 'WRE', 'Racecourse Ground', 13500, 50, '#DA291C', '#FFFFFF'],
];

const LEAGUE_ONE = [
  ['wim', 'AFC Wimbledon', 'AFC Wimbledon', 'WIM', 'Cherry Red Records Stadium', 9215, 38, '#003399', '#FFD700'],
  ['bar', 'Barnsley', 'Barnsley', 'BAR', 'Oakwell', 23287, 44, '#E4022D', '#FFFFFF'],
  ['bpl', 'Blackpool', 'Blackpool', 'BPL', 'Bloomfield Road', 16616, 43, '#F68712', '#FFFFFF'],
  ['bol', 'Bolton Wanderers', 'Bolton', 'BOL', 'Toughsheet Community Stadium', 28723, 46, '#FFFFFF', '#08348C'],
  ['brd', 'Bradford City', 'Bradford', 'BRD', 'Valley Parade', 25136, 42, '#FFBF00', '#7C2D3A'],
  ['brt', 'Burton Albion', 'Burton', 'BRT', 'Pirelli Stadium', 6912, 36, '#FFF200', '#000000'],
  ['car', 'Cardiff City', 'Cardiff', 'CAR', 'Cardiff City Stadium', 33280, 50, '#0070B5', '#FFFFFF'],
  ['don', 'Doncaster Rovers', 'Doncaster', 'DON', 'Eco-Power Stadium', 15231, 39, '#DA291C', '#FFFFFF', 'hoops'],
  ['exe', 'Exeter City', 'Exeter', 'EXE', 'St James Park', 8696, 37, '#E2231A', '#FFFFFF', 'stripes'],
  ['hud', 'Huddersfield Town', 'Huddersfield', 'HUD', "John Smith's Stadium", 24121, 47, '#0E63AD', '#FFFFFF', 'stripes'],
  ['lor', 'Leyton Orient', 'Leyton Orient', 'LOR', 'Brisbane Road', 9271, 40, '#DA291C', '#FFFFFF'],
  ['lin', 'Lincoln City', 'Lincoln', 'LIN', 'Sincil Bank', 10669, 40, '#E1231D', '#FFFFFF', 'stripes'],
  ['lut', 'Luton Town', 'Luton', 'LUT', 'Kenilworth Road', 12000, 47, '#F78F1E', '#002D62'],
  ['man', 'Mansfield Town', 'Mansfield', 'MAN', 'Field Mill', 9186, 38, '#FFF200', '#0033A0'],
  ['nth', 'Northampton Town', 'Northampton', 'NTH', 'Sixfields Stadium', 7798, 36, '#7C2D3A', '#FFFFFF'],
  ['pet', 'Peterborough United', 'Peterborough', 'PET', 'Weston Homes Stadium', 15314, 42, '#0072CE', '#FFFFFF'],
  ['ply', 'Plymouth Argyle', 'Plymouth', 'PLY', 'Home Park', 17900, 45, '#00543C', '#FFFFFF'],
  ['pva', 'Port Vale', 'Port Vale', 'PVA', 'Vale Park', 15036, 38, '#FFFFFF', '#000000'],
  ['rea', 'Reading', 'Reading', 'REA', 'Select Car Leasing Stadium', 24161, 45, '#004494', '#FFFFFF', 'hoops'],
  ['rot', 'Rotherham United', 'Rotherham', 'ROT', 'New York Stadium', 12021, 41, '#DD1E3E', '#FFFFFF'],
  ['ste', 'Stevenage', 'Stevenage', 'STE', 'Lamex Stadium', 7800, 37, '#E4022D', '#FFFFFF'],
  ['stc', 'Stockport County', 'Stockport', 'STC', 'Edgeley Park', 10852, 41, '#003DA5', '#FFFFFF'],
  ['wig', 'Wigan Athletic', 'Wigan', 'WIG', 'Brick Community Stadium', 25138, 43, '#1D5BA4', '#FFFFFF', 'stripes'],
  ['wyc', 'Wycombe Wanderers', 'Wycombe', 'WYC', 'Adams Park', 10137, 40, '#003DA5', '#7BAFD4', 'halves'],
];

const LEAGUE_TWO = [
  ['acc', 'Accrington Stanley', 'Accrington', 'ACC', 'Wham Stadium', 5450, 28, '#DA291C', '#FFFFFF'],
  ['bnt', 'Barnet', 'Barnet', 'BNT', 'The Hive Stadium', 6500, 27, '#F58220', '#000000'],
  ['brw', 'Barrow', 'Barrow', 'BRW', 'Holker Street', 5045, 27, '#005BAC', '#FFFFFF'],
  ['bro', 'Bristol Rovers', 'Bristol Rovers', 'BRO', 'Memorial Stadium', 12300, 34, '#004B87', '#FFFFFF', 'hoops'],
  ['brm', 'Bromley', 'Bromley', 'BRM', 'Hayes Lane', 5000, 26, '#FFFFFF', '#000000'],
  ['cam', 'Cambridge United', 'Cambridge', 'CAM', 'Abbey Stadium', 8127, 31, '#F5A12D', '#000000'],
  ['chl', 'Cheltenham Town', 'Cheltenham', 'CHL', 'Completely-Suzuki Stadium', 7066, 29, '#E4022D', '#FFFFFF', 'stripes'],
  ['chs', 'Chesterfield', 'Chesterfield', 'CHS', 'SMH Group Stadium', 10504, 31, '#0033A0', '#FFFFFF'],
  ['col', 'Colchester United', 'Colchester', 'COL', 'JobServe Community Stadium', 10105, 28, '#005BAC', '#FFFFFF', 'stripes'],
  ['crw', 'Crawley Town', 'Crawley', 'CRW', 'Broadfield Stadium', 5800, 28, '#E4022D', '#FFFFFF'],
  ['cre', 'Crewe Alexandra', 'Crewe', 'CRE', 'Mornflake Stadium', 10153, 30, '#E4022D', '#FFFFFF'],
  ['fle', 'Fleetwood Town', 'Fleetwood', 'FLE', 'Highbury Stadium', 5327, 28, '#E4022D', '#FFFFFF'],
  ['gil', 'Gillingham', 'Gillingham', 'GIL', 'Priestfield Stadium', 11582, 31, '#0033A0', '#FFFFFF', 'stripes'],
  ['gri', 'Grimsby Town', 'Grimsby', 'GRI', 'Blundell Park', 9052, 30, '#000000', '#FFFFFF', 'stripes'],
  ['har', 'Harrogate Town', 'Harrogate', 'HAR', 'Wetherby Road', 5000, 25, '#FFF200', '#000000'],
  ['mkd', 'Milton Keynes Dons', 'MK Dons', 'MKD', 'Stadium MK', 30500, 33, '#FFFFFF', '#000000'],
  ['nwp', 'Newport County', 'Newport', 'NWP', 'Rodney Parade', 7850, 27, '#F5A12D', '#000000'],
  ['nts', 'Notts County', 'Notts County', 'NTS', 'Meadow Lane', 12120, 32, '#000000', '#FFFFFF', 'stripes'],
  ['old', 'Oldham Athletic', 'Oldham', 'OLD', 'Boundary Park', 13512, 30, '#005BAC', '#FFFFFF'],
  ['sal', 'Salford City', 'Salford', 'SAL', 'Moor Lane', 5108, 29, '#E4022D', '#FFFFFF'],
  ['shr', 'Shrewsbury Town', 'Shrewsbury', 'SHR', 'Croud Meadow', 9875, 30, '#0033A0', '#FFF200'],
  ['swi', 'Swindon Town', 'Swindon', 'SWI', 'County Ground', 15728, 31, '#E4022D', '#FFFFFF'],
  ['tra', 'Tranmere Rovers', 'Tranmere', 'TRA', 'Prenton Park', 16789, 30, '#FFFFFF', '#00205B'],
  ['wal', 'Walsall', 'Walsall', 'WAL', 'Bescot Stadium', 11300, 31, '#E4022D', '#000000'],
];

const NATIONAL_LEAGUE = [
  ['ald', 'Aldershot Town', 'Aldershot', 'ALD', 'EBB Stadium', 7100, 20, '#E4022D', '#0033A0'],
  ['alt', 'Altrincham', 'Altrincham', 'ALT', 'Moss Lane', 6085, 19, '#000000', '#FFFFFF', 'stripes'],
  ['bhw', 'Boreham Wood', 'Boreham Wood', 'BHW', 'Meadow Park', 4502, 18, '#FFFFFF', '#000000'],
  ['bos', 'Boston United', 'Boston', 'BOS', 'Jakemans Community Stadium', 5000, 17, '#F5A12D', '#000000'],
  ['brk', 'Brackley Town', 'Brackley', 'BRK', 'St James Park', 3500, 16, '#E4022D', '#FFFFFF'],
  ['bta', 'Braintree Town', 'Braintree', 'BTA', 'Cressing Road', 4222, 16, '#FF6600', '#0033A0'],
  ['crl', 'Carlisle United', 'Carlisle', 'CRL', 'Brunton Park', 17949, 24, '#0033A0', '#E4022D'],
  ['eas', 'Eastleigh', 'Eastleigh', 'EAS', 'Silverlake Stadium', 5192, 18, '#0033A0', '#FFFFFF'],
  ['hfx', 'FC Halifax Town', 'Halifax', 'HFX', 'The Shay', 10401, 20, '#0033A0', '#FFFFFF'],
  ['fgr', 'Forest Green Rovers', 'Forest Green', 'FGR', 'The New Lawn', 5147, 22, '#00A650', '#000000', 'stripes'],
  ['gat', 'Gateshead', 'Gateshead', 'GAT', 'Gateshead International Stadium', 11800, 20, '#FFFFFF', '#000000'],
  ['hrt', 'Hartlepool United', 'Hartlepool', 'HRT', 'Victoria Park', 7856, 22, '#0033A0', '#FFFFFF', 'stripes'],
  ['mor', 'Morecambe', 'Morecambe', 'MOR', 'Mazuma Stadium', 6476, 22, '#E4022D', '#FFFFFF'],
  ['roc', 'Rochdale', 'Rochdale', 'ROC', 'Spotland Stadium', 10249, 22, '#0033A0', '#FFFFFF'],
  ['scu', 'Scunthorpe United', 'Scunthorpe', 'SCU', 'Glanford Park', 9088, 21, '#E4022D', '#FFFFFF'],
  ['sol', 'Solihull Moors', 'Solihull', 'SOL', 'Damson Park', 5236, 19, '#FFF200', '#000000'],
  ['sth', 'Southend United', 'Southend', 'STH', 'Roots Hall', 12392, 23, '#0033A0', '#FFFFFF'],
  ['sut', 'Sutton United', 'Sutton', 'SUT', 'Gander Green Lane', 5013, 18, '#F5A12D', '#000000'],
  ['tam', 'Tamworth', 'Tamworth', 'TAM', 'The Lamb Ground', 4000, 16, '#E4022D', '#FFFFFF'],
  ['tru', 'Truro City', 'Truro', 'TRU', 'Treyew Road', 3000, 15, '#FFFFFF', '#000000'],
  ['wea', 'Wealdstone', 'Wealdstone', 'WEA', 'Grosvenor Vale', 4085, 16, '#0033A0', '#FFFFFF'],
  ['wok', 'Woking', 'Woking', 'WOK', 'Kingfield Stadium', 6036, 18, '#E4022D', '#FFFFFF', 'halves'],
  ['yeo', 'Yeovil Town', 'Yeovil', 'YEO', 'Huish Park', 9565, 19, '#00A650', '#FFFFFF'],
  ['yor', 'York City', 'York', 'YOR', 'LNER Community Stadium', 8500, 20, '#E4022D', '#FFFFFF'],
];

function expand(rows, tier) {
  return rows.map(([id, name, short, abbr, stadium, capacity, prestige, primary, secondary, pattern]) => ({
    id, name, short, abbr, stadium, capacity, prestige, tier,
    colors: { primary, secondary },
    pattern: pattern || 'solid',
  }));
}

// Tier 0 is the Premier League; higher numbers are further down the pyramid.
export const CLUB_DATA = [
  ...expand(PREMIER_LEAGUE, 0),
  ...expand(CHAMPIONSHIP, 1),
  ...expand(LEAGUE_ONE, 2),
  ...expand(LEAGUE_TWO, 3),
  ...expand(NATIONAL_LEAGUE, 4),
];

// The real League Two club that steps aside to make room for the player's club.
export const DISPLACED_CLUB_ID = 'acc';

export const PLAYER_CLUB_TEMPLATE = {
  id: 'you',
  name: 'Riverside FC',
  short: 'Riverside',
  abbr: 'RIV',
  stadium: 'Riverside Park',
  capacity: 2000,
  prestige: 10,
  tier: 3,
  colors: { primary: '#7BDB56', secondary: '#14151F' },
  pattern: 'solid',
};

export function clubsByTier(tier) {
  return CLUB_DATA.filter((c) => c.tier === tier);
}
