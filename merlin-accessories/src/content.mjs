// Every word and fact the site shows lives here. The page templates in build.mjs
// only arrange it.
//
// Copy is taken from the public pages of merlinaccessories.com. Anything marked
// TODO is a gap that should be filled with the live site's exact wording or file.

export const company = {
  name: 'Merlin Accessories Ltd',
  shortName: 'Merlin Accessories',
  tagline: 'Silicone Sealant, Fasteners & Fixings',
  town: 'Winchester, Hampshire',
  since: 1980,
  phone: '01962 842 002',
  phoneHref: 'tel:+441962842002',
  email: 'sales@merlinaccessories.com',
  address: ['Unit G, Nickel Close', 'Winnall Trading Estate', 'Winchester', 'SO23 7RJ'],
  mapsHref: 'https://www.google.com/maps/search/?api=1&query=Merlin+Accessories+Ltd+Unit+G+Nickel+Close+Winchester+SO23+7RJ',
  facebook: 'https://www.facebook.com/MerlinAccessoriesLtd/',
  productCount: 'Over 8,000 essential products that trade professionals rely on every day.',
  // Day index follows JS Date: 0 = Sunday. Times are UK local.
  hours: {
    office: { label: 'Office', days: [1, 2, 3, 4, 5], open: '07:30', close: '17:00' },
    counter: { label: 'Trade Counter', days: [1, 2, 3, 4, 5], open: '07:00', close: '17:00' },
  },
};

export const intro =
  'Merlin Accessories Ltd are a trusted supplier of high-quality building products, sealants, ' +
  'fixings, fasteners and power tools to the trade. We are based on the Winnall Trading Estate ' +
  'in Winchester, where we have been trading since 1980.';

export const supplyLine =
  'We source and supply Adhesive & Chemicals, Silicone Sealants, Fasteners & Fixings, Abrasives, ' +
  'Screws, Nails & Staples, Site Protection & PPE, Hand & Power Tools + accessories, Ironmongery, ' +
  'Gate and Fence & Building Hardware from all of the best brands in the trade.';

// `slug` matches the live site's URL (/products/<slug>) so existing links keep working.
// `groups` are the sub-ranges shown as jump links on the category page.
export const categories = [
  {
    slug: 'adhesivesandchemicals',
    name: 'Adhesives & Chemicals',
    icon: 'tube',
    summary: 'Silicone specialists: silicone, adhesives, foam, lubricants, wood filler and cleaning.',
    body:
      'We stock a range of Adhesives & Chemicals including Silicone, Adhesives, Foam, Lubricants, ' +
      'Wood filler and cleaning products with ranges from Soudal, Unibond, Evo-Stik, Nullifire, hpsa, ' +
      'Illbruck, Rustins and Barrettine.',
    groups: [
      { name: 'Silicone', items: [] },
      { name: 'Adhesives', items: [] },
      { name: 'Foam', items: [] },
      { name: 'Lubricants', items: [] },
      { name: 'Wood Filler', items: [] },
      { name: 'Cleaning Products', items: [] },
    ],
    brands: ['Soudal', 'Unibond', 'Evo-Stik', 'Nullifire', 'hpsa', 'Illbruck', 'Rustins', 'Barrettine'],
    featured: ['soudaclean', 'koniguk'],
  },
  {
    slug: 'fastenersandfixings',
    name: 'Fasteners & Fixings',
    icon: 'bolt',
    summary: 'Bolts, bars, sockets, nuts, washers, anchors and rivets.',
    body:
      'A comprehensive range of fasteners and fixings for every trade, including bolts, bars, ' +
      'sockets, nuts, washers, anchors and rivets.',
    groups: [
      { name: 'Bolts', items: [] },
      { name: 'Bars', items: [] },
      { name: 'Sockets', items: [] },
      { name: 'Nuts', items: [] },
      { name: 'Washers', items: [] },
      { name: 'Anchors', items: [] },
      { name: 'Rivets', items: [] },
    ],
    brands: [],
  },
  {
    slug: 'screws',
    name: 'Screws',
    icon: 'screw',
    summary: 'Concrete, construction, machine, self-tapping, window fabrication and wood screws.',
    body:
      'Screws for every substrate and application, from concrete and construction screws to ' +
      'machine, self-tapping, window fabrication and wood screws.',
    groups: [
      { name: 'Concrete Screws', items: [] },
      { name: 'Construction Screws', items: [] },
      { name: 'Machine Screws', items: [] },
      { name: 'Self-Tapping Screws', items: [] },
      { name: 'Window Fabrication Screws', items: [] },
      { name: 'Wood Screws', items: [] },
    ],
    brands: [],
  },
  {
    slug: 'nailsandstaples',
    name: 'Nails & Staples',
    icon: 'nail',
    summary: 'Collated nails, fuel cells, loose nails and staples.',
    body:
      'Collated nails and fuel cells for nail guns, plus galvanised, bright, stainless steel and zinc ' +
      'loose nails and staples.',
    groups: [
      { name: 'Collated Nails', items: [] },
      { name: 'Fuel Cells', items: [] },
      { name: 'Loose Nails', items: ['Galvanised', 'Bright', 'Stainless steel', 'Zinc'] },
      { name: 'Staples', items: [] },
    ],
    brands: [],
  },
  {
    slug: 'abrasives',
    name: 'Abrasives',
    icon: 'disc',
    summary: 'Abrasives from the best brands in the trade, including sanding belts made to order.',
    body: 'Abrasives from the best brands in the trade, including sanding belts made to order with Mirka.', // TODO: live copy
    groups: [
      { name: 'Sanding Belts Made to Order', items: [] },
    ],
    brands: ['Mirka'],
  },
  {
    slug: 'siteprotectionandppe',
    name: 'Site Protection & PPE',
    icon: 'helmet',
    summary: 'Ladders, rubble sacks, decorating sundries and personal protection.',
    body:
      'Everything to keep the site and the team protected: ladders, rubble sacks, paint brushes, ' +
      'rollers and trays, helmets, first aid kits, ear defenders, glasses and masks.',
    groups: [
      { name: 'Site Protection', items: ['Ladders', 'Rubble sacks', 'Paint brushes', 'Rollers', 'Trays'] },
      { name: 'PPE', items: ['Helmets', 'First aid kits', 'Ear defenders', 'Glasses', 'Masks'] },
    ],
    brands: [],
  },
  {
    slug: 'powertoolsandhandtools',
    name: 'Power Tools & Hand Tools',
    icon: 'drill',
    summary: 'Electric, battery and pneumatic power tools, plus professional hand tools.',
    body:
      'We stock electric, battery and pneumatic power tools for drilling, cutting, grinding and ' +
      'sanding, and an extensive range of branded, professional hand tools.',
    groups: [
      {
        name: 'Power Tools',
        items: ['Drills, SDS & impact drivers', 'Angle grinders', 'Multi-tools', 'Planers', 'Routers',
          'Circular saws', 'Jigsaws', 'Reciprocating saws', 'Mitre saws', 'Table saws', 'Jointers', 'Extractors'],
      },
      {
        name: 'Hand Tools',
        items: ['Hand saws', 'Hacksaws', 'Coping saws', 'Combi squares', 'Toolbox saws', 'Hammers',
          'Chisels', 'Tape measures', 'Knives', 'Toolboxes', 'Screwdrivers'],
      },
    ],
    brands: ['DeWalt', 'Makita', 'Metabo', 'HiKOKI', 'Bosch', 'Milwaukee'],
    related: ['toolrepairservice'],
  },
  {
    slug: 'powertoolaccessories',
    name: 'Power Tool Accessories',
    icon: 'blade',
    summary: 'Accessories for your power tools.', // TODO: live copy
    body: 'Accessories for your power tools from the best brands in the trade.', // TODO: live copy
    groups: [],
    brands: [],
    related: ['toolrepairservice'],
  },
  {
    slug: 'gateandfencehardware',
    name: 'Gate & Fence Hardware',
    icon: 'gate',
    summary: 'Post spikes, bolt down, arris rail, knee rail, gravel boards, twin pin and panel clips.',
    body:
      'Fence fixings and ironmongery including post spikes, bolt down, arris rail, knee rail, ' +
      'gravel boards, twin pin and panel clips.',
    groups: [
      { name: 'Post Spikes', items: [] },
      { name: 'Bolt Down', items: [] },
      { name: 'Arris Rail', items: [] },
      { name: 'Knee Rail', items: [] },
      { name: 'Gravel Boards', items: [] },
      { name: 'Twin Pin', items: [] },
      { name: 'Panel Clips', items: [] },
    ],
    brands: [],
  },
  {
    slug: 'buildinghardware',
    name: 'Building Hardware',
    icon: 'brick',
    summary: 'Building hardware and ironmongery for the trade.', // TODO: live copy
    body: 'Building hardware and ironmongery from the best brands in the trade.', // TODO: live copy
    groups: [],
    brands: [],
  },
];

// Range spotlights that sit outside the category tree on the live site.
export const spotlights = [
  {
    slug: 'soudaclean',
    name: 'Soudaclean',
    kicker: 'Soudal',
    summary: 'The full Soudaclean range in 1 litre tins.',
    body: [
      'We stock the full Soudal range of Soudaclean 5, Soudaclean 10, Soudaclean 20 and Soudaclean 60, available in 1 litre tins.',
      'We also offer Soudal Bulk Buy Boxes & Pallets of LMN Silicone. Call us on 01962 842 002 for pricing.',
    ],
    list: ['Soudaclean 5', 'Soudaclean 10', 'Soudaclean 20', 'Soudaclean 60'],
    category: 'adhesivesandchemicals',
  },
  {
    slug: 'koniguk',
    name: 'Konig UK',
    kicker: 'Touch Up & Repair',
    summary: 'Touch-up & repair products for furniture, windows, kitchens and more.',
    body: [
      'We offer a range of touch-up & repair products from Konig UK.',
      'For use in furniture, windows, kitchen, bedroom, flooring, caravan/mobile home, marine and polished stone.',
    ],
    list: ['Furniture', 'Windows', 'Kitchen', 'Bedroom', 'Flooring', 'Caravan / mobile home', 'Marine', 'Polished stone'],
    category: 'adhesivesandchemicals',
  },
];

export const toolRepair = {
  intro:
    'Extend the life of your battery operated or mains powered tools with our Tool Repair Service. ' +
    'Our experienced technician can fix faulty DeWalt, Makita, Metabo, HiKOKI, Bosch and Milwaukee ' +
    'power tools amongst others in our workshop.',
  brands: ['DeWalt', 'Makita', 'Metabo', 'HiKOKI', 'Bosch', 'Milwaukee'],
  services: ['Battery replacement', 'Motor & Gearbox repairs', 'Switch & Trigger replacement', 'General maintenance & Servicing'],
  tools: ['Drills', 'Hammerdrills', 'Circular saws', 'Jigsaws', 'Orbital sanders', 'Angle grinders',
    'Reciprocating saws', 'Metal shears', 'Multicutters', 'Hedge trimmers'],
  steps: [
    { title: 'Call or drop in', text: 'Call 01962 842 002 to enquire, or bring the tool to our trade counter.' },
    { title: 'We assess it', text: 'Our experienced technician looks at the tool in our Winchester workshop.' },
    { title: 'Back to work', text: 'Your tool is repaired and its life extended.' },
  ],
};

export const about = {
  paragraphs: [
    intro,
    supplyLine,
    'Merlin was founded by Mike Carey in 1980 with a starting budget of £200. Due to increasing sales, ' +
      'Merlin moved to the Winnall Trading Estate in Winchester in 1983, and has spent over 40 years ' +
      'serving the building industry.',
  ],
  timeline: [
    { year: '1980', text: 'Merlin is founded by Mike Carey with a starting budget of £200.' },
    { year: '1983', text: 'Growing sales take Merlin to the Winnall Trading Estate, Winchester.' },
    { year: 'Today', text: 'Over 40 years supplying the trade from the same Winchester base.' },
  ],
};

// TODO: add the remaining team members, names and photos from /meettheteam.
export const team = [
  { name: 'Mike Carey', role: 'Managing Director', since: 1980 },
  { name: null, role: 'Key Account & Business Development Manager', since: 2000 },
];

export const news = [
  {
    title: 'Christmas tool repair lead times',
    text: 'Tool Repair Service lead times are longer over the Christmas period. Tools left with us will be assessed from 14th January 2026.',
    link: 'toolrepairservice',
  },
  {
    title: 'New Glazing & Building Consumables Catalogue',
    text: 'Our brand-new catalogue features a range of products for the Window Industry including silicones, adhesives, tapes, tools, window fabrication screws and more.',
    link: 'downloads',
  },
  {
    title: 'Our new website',
    text: 'Welcome to the brand-new Merlin Accessories website.',
  },
];

// TODO: set `file` to each PDF's URL from /downloads. Until then the card offers to email a copy.
export const downloads = [
  { title: 'Glazing & Building Consumables', topic: 'Window Industry', file: null },
  { title: 'Gate & Fence Hardware', topic: 'Gate & Fence Hardware', file: null },
  { title: 'Fasteners & Fixings', topic: 'Fasteners & Fixings', file: null },
  { title: 'Building Hardware', topic: 'Building Hardware', file: null },
  { title: 'Adhesives & Chemicals', topic: 'Adhesives & Chemicals', file: null },
];

export const bulk = {
  title: 'Bulk Boxes & Pallet Deals',
  lead: 'Buying in volume? Ask about our bulk buy boxes and pallet deals.',
  body: [
    'We offer Soudal Bulk Buy Boxes & Pallets of LMN Silicone.',
    'Call us on 01962 842 002 or email sales@merlinaccessories.com for current pricing.',
  ],
  deals: [
    { name: 'Soudal LMN Silicone', detail: 'Bulk buy boxes & pallets', link: 'adhesivesandchemicals' },
    { name: 'Soudaclean', detail: '5, 10, 20 and 60 in 1 litre tins', link: 'soudaclean' },
  ],
};

// Home page promo tiles, in the order the live site shows them.
export const promos = [
  { title: 'Tool repair', script: 'Service', link: 'toolrepairservice', cta: 'Find out more', image: 'promo-tool-repair.jpg' },
  { title: 'Sanding belts', sub: 'made to order', badge: 'Mirka', link: 'abrasives', cta: 'Find out more', image: 'promo-sanding-belts.jpg' },
  { title: 'Silicone', sub: 'specialists', link: 'adhesivesandchemicals', cta: 'View range', image: 'promo-silicone.jpg' },
  { title: 'Merlin', sub: 'Accessories Ltd', text: 'Over 8,000 essential products that trade professionals rely on every day.', link: 'products', cta: 'Browse products', image: 'promo-products.jpg', logo: true },
];
