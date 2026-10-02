// Every word and fact the site shows lives here. The page templates in build.mjs
// only arrange it.
//
// All copy, links, brochure files and images are taken from the live
// merlinaccessories.com. Image paths are relative to assets/img/. Sub-ranges for each
// product category are in ranges.mjs and the Latest News posts are in posts.mjs.

import { ranges } from './ranges.mjs';
import { posts } from './posts.mjs';

export { posts };

export const LIVE = 'https://www.merlinaccessories.com';
const pdf = (id) => `${LIVE}/_files/ugd/bd98e3_${id}.pdf`;

export const company = {
  name: 'Merlin Accessories Ltd',
  shortName: 'Merlin Accessories',
  tagline: 'Silicone Sealant, Fasteners & Fixings',
  town: 'Winchester, Hampshire',
  since: 1980,
  yearsLine: 'Supplying the trade for over 45 years',
  expertLine: 'Expert guidance for every project whatever the size',
  phone: '01962 842 002',
  phoneHref: 'tel:+441962842002',
  email: 'sales@merlinaccessories.com',
  accountsEmail: 'accounts@merlinaccessories.com',
  address: ['Unit G, Nickel Close', 'Winnall Trading Estate', 'Winchester', 'SO23 7RJ'],
  mapsHref: 'https://www.google.com/maps/search/?api=1&query=Merlin+Accessories+Ltd+Unit+G+Nickel+Close+Winchester+SO23+7RJ',
  facebook: 'https://www.facebook.com/MerlinAccessoriesLtd',
  linkedin: 'https://www.linkedin.com/company/6148502/admin/feed/posts/',
  instagram: 'https://www.instagram.com/merlinaccessoriesltd',
  hashtag: '#MerlinAccessoriesLtd',
  ebay: 'https://www.ebay.co.uk/usr/merlinaccessoriesltd',
  regNo: '1448569',
  vatNo: '329 8288 14',
  productCount: 'Over 6000 products in stock and access to thousands more',
  // Day index follows JS Date: 0 = Sunday. Times are UK local.
  hours: {
    office: { label: 'Office', days: [1, 2, 3, 4, 5], open: '07:30', close: '17:00' },
    counter: { label: 'Trade Counter', days: [1, 2, 3, 4, 5], open: '07:00', close: '17:00' },
  },
};

export const intro =
  'Merlin Accessories Ltd are a trusted supplier of high-quality building products, sealants, ' +
  'fixings, fasteners and power tools to the trade.';

export const introMore =
  'With years of experience in the industry, we understand the unique needs and requirements of our ' +
  'customers, delivering an exceptional level of customer service.';

export const visitLine = 'Come and visit our well stocked trade counter in Winchester, Hampshire';

// Shown on the Products page (the live site repeats it on every product page).
export const productsIntro =
  'We have an array of products, including top-tier Adhesives & Chemicals for robust bonding solutions. ' +
  'Secure your structures with precision using our reliable Fasteners & Fixings and Screws. Achieve a flawless ' +
  'finish with our premium Abrasives, and add a touch of sophistication with our Architectural Hardware. ' +
  'Safety is paramount, and that\'s why we provide top-notch Site Protection & PPE to ensure a secure working ' +
  'environment. Empower your team with the latest in Power Tools & Hand Tools, engineered for efficiency and durability.';

export const productsLead =
  'At Merlin we offer a comprehensive range of high-quality products for your projects however big or small';

export const whyChoose = [
  { title: 'Industry Experts', text: 'Our Merlin team have decades of experience in delivering expert advice and the best service to our customers' },
  { title: 'Customer Support', text: 'We go the extra mile to help our customers. We are on hand to assist you with queries, product selection and order tracking' },
  { title: 'Product Range', text: 'With years of building supplier relationships we have access to a vast range of products for your projects however big or small' },
  { title: 'Delivery Service', text: 'Our dedicated drivers are ready to deliver your order to you. We have no minimum order or carriage for local delivery*', link: 'delivery' },
];

export const newsletter = {
  heading: 'Sign up to our newsletter to receive the latest offers and news',
  placeholder: 'Enter your email address here',
};

// Trading partners shown as a logo strip across the site ("Some of our trading partnerships").
export const partners = [
  { name: 'Bosch', file: 'partners/bosch.png' },
  { name: 'Draper Tools', file: 'partners/draper-tools.png' },
  { name: 'Rapierstar', file: 'partners/rapierstar.png' },
  { name: 'Blum', file: 'partners/blum.png' },
  { name: 'Soudal', file: 'partners/soudal.jpg' },
  { name: 'Timco', file: 'partners/timco.jpg' },
  { name: 'Mirka', file: 'partners/mirka.jpg' },
  { name: 'Glazpart', file: 'partners/glazpart.png' },
  { name: 'From the Anvil', file: 'partners/from-the-anvil.png' },
  { name: 'SIA', file: 'partners/sia.webp' },
  { name: 'Carlisle Brass', file: 'partners/carlisle-brass.png' },
  { name: 'Alpen', file: 'partners/alpen.png' },
  { name: 'Rustins', file: 'partners/rustins.png' },
  { name: 'Toolbank B2B', file: 'partners/toolbank-b2b.png' },
  { name: 'Trend', file: 'partners/trend.jpg' },
];

// `slug` matches the live site's URL (/products/<slug>). `groups` come from ranges.mjs.
// Order follows the live home page tiles.
export const categories = [
  {
    slug: 'screws', name: 'Screws', icon: 'screw', image: 'ranges/cat-screws',
    lead: 'We stock a range of premium screws, wood screws, landscaping screws and masonry screws',
    brochures: [{ label: 'Download Screws Brochure', href: pdf('5d518f58701645499cf9124c4972a529') }],
  },
  {
    slug: 'adhesivesandchemicals', name: 'Adhesives & Chemicals', icon: 'tube', image: 'ranges/cat-adhesivesandchemicals',
    lead: 'Merlin has the solution, offering a comprehensive range of Adhesives & Chemicals',
    brochures: [
      { label: 'Download Soudal Brochure', href: pdf('b56f9c0633324c49a69e2b7d17d25bb1') },
      { label: 'Download Timco Brochure', href: pdf('53900ef74f1b4341ab6f9df98f74f6cf') },
    ],
    featured: ['soudaclean', 'koniguk'],
  },
  {
    slug: 'fastenersandfixings', name: 'Fasteners & Fixings', icon: 'bolt', image: 'ranges/cat-fastenersandfixings',
    lead: 'We stock a range of high quality fasteners & fixings from screws, nuts and bolts to rivets and washers',
    brochures: [{ label: 'Download Fasteners & Fixings Brochure', href: pdf('0e620b2b14f24ab6bf058596b995bb88') }],
  },
  {
    slug: 'abrasives', name: 'Abrasives', icon: 'disc', image: 'ranges/cat-abrasives',
    lead: 'We stock a range of Abrasives and sanding tools',
    featured: ['madetoordersandingbelts'],
  },
  {
    slug: 'gateandfencehardware', name: 'Gate & Fence Hardware', icon: 'gate', image: 'ranges/cat-gateandfencehardware',
    lead: 'We stock a range of locks, latches handles, hinges and catches',
    brochures: [{ label: 'Download Gate & Fence Hardware Brochure', href: pdf('754572b78dbd47728a04bdc1c35938ac') }],
  },
  {
    slug: 'nailsandstaples', name: 'Nails & Staples', icon: 'nail', image: 'ranges/cat-nailsandstaples',
    lead: 'We stock a range of collated, loose nails, staples and pins',
    brochures: [{ label: 'Download Nails Brochure', href: pdf('12b8f020cfea4d0798803b4629408583') }],
  },
  {
    slug: 'buildinghardware', name: 'Building Hardware', icon: 'brick', image: 'ranges/cat-buildinghardware',
    lead: 'We stock a range of hardware such as Hangers, plates & braces, bracketry, packers & cable ties & clips',
    brochures: [{ label: 'Download Building Hardware Brochure', href: pdf('140674e59cb44fa59b414c8aa7b967d3') }],
  },
  {
    slug: 'siteprotectionandppe', name: 'Site Protection & PPE', icon: 'helmet', image: 'ranges/cat-siteprotectionandppe',
    lead: 'We stock a range of Janitorial, site protection, paint, tapes and PPE',
    brochures: [{ label: 'Download Site Protection & PPE Brochure', href: pdf('8f1d779a4b154db28466ac1fbc9ef265') }],
    featured: ['moldex'],
  },
  {
    slug: 'architecturalhardware', name: 'Architectural Hardware', icon: 'hinge', image: 'ranges/cat-architecturalhardware',
    lead: 'We stock a range of hardware fittings for windows, doors and drawers from locks & latches to handles, knobs & runners',
    sub: [{ slug: 'blum', name: 'Blum', note: 'Hinge, lift and runner systems' }],
  },
  {
    slug: 'powertoolsandhandtools', name: 'Power Tools & Hand Tools', icon: 'drill', image: 'ranges/cat-powertoolsandhandtools',
    lead: 'We stock a range of high-quality essential Power Tool & Hand Tools',
    brochures: [{ label: 'Download Hand Tools Brochure', href: pdf('9b9d816b75894821b9ed997072638f0e') }],
    related: ['toolrepairservice'],
  },
  {
    slug: 'powertoolaccessories', name: 'Power Tool Accessories', icon: 'blade', image: 'ranges/cat-powertoolaccessories',
    lead: 'We stock a range of Power Tool Accessories for drilling and cutting',
    brochures: [{ label: 'Download Power Tool Accessories Brochure', href: pdf('3c946d053acf4637a00bc93d93df1c61') }],
    related: ['toolrepairservice'],
  },
  {
    slug: 'clearance', name: 'Clearance', icon: 'tag',
    lead: 'Our range of clearance products from our trusted brands',
    clearance: {
      text: ['Check back soon to view our clearance and sale stock', 'Coming soon'],
      ebay: { label: 'View the Merlin Accessories ebay store', href: 'https://www.ebay.co.uk/usr/merlinaccessoriesltd', logo: 'brands/ebay' },
    },
  },
].map((c) => ({ ...c, groups: ranges[c.slug] || [] }));

// Blum sub-page of Architectural Hardware (/products/architecturalhardware/blum).
export const blum = {
  name: 'Blum',
  groups: ranges.architecturalhardware_blum,
  hinges: {
    title: 'Hinges in Onyx Black Finish',
    text: 'We stock a range of hinges in stylish onyx black finish. They discreetly complement furniture pieces or create a visual impact. For greater design freedom in furniture without compromising on function.',
    brochure: { label: 'Download Hinges in Onyx Black Brochure', href: pdf('6a2d31773f9e410e96deec5221dd91a7') },
  },
  others: 'Our other product ranges from Blum:',
  catalogue: { label: 'Download the full Blum Catalogue here', href: pdf('ccad5449216148b7a7adbfc0857a0b22') },
};

// Live store category pages are not rebuilt here yet, so links to them go to the live site.
export const store = {
  base: `${LIVE}/category/`,
  all: `${LIVE}/category/all-products`,
  note: 'The online product catalogue lives on the main Merlin website.',
  // The live Products menu lists these online catalogue categories (slug on the live site, label as shown there).
  categories: [
    ['accessories', 'Accessories'], ['adhesive', 'Adhesive'], ['silcone', 'Silcone'], ['bolting', 'Bolting'], ['cutting', 'Cutting'],
    ['drilling-cutting', 'Drilling'], ['epdms-compriband', "EPDM's & Compriband"], ['fasteners-fixings', 'Fasteners & Fixings'],
    ['fire-rated', 'Fire Rated'], ['hand-tools', 'Hand Tools'], ['nuts', 'Nuts'], ['packers', 'Packers'], ['sanding', 'Sanding'],
    ['sanitary', 'Sanitary'], ['concrete-screws', 'Concrete Screws'], ['construction-screws', 'Construction Screws'],
    ['machine-screws', 'Machine Screws'], ['self-tapping-screws', 'Self-Tapping Screws'], ['window-fabrication-screws', 'Window Fabrication Screws'],
    ['wood-screws', 'Wood Screws'], ['tapes', 'Tapes'], ['touch-up-repair', 'Touch Up & Repair'], ['washers', 'Washers'], ['soudal', 'Soudal'],
  ],
};

export const spotlights = [
  {
    slug: 'koniguk',
    name: 'Konig',
    kicker: 'Brand · Touch Up & Repair',
    summary: 'Touch-up & repair products from Konig UK.',
    category: 'adhesivesandchemicals',
    image: 'pages/konig-touch-up',
    body: [
      'We offer a range of touch-up & repair products from Konig UK, for use in a variety of areas including furniture, windows, kitchen, bedroom, flooring, caravan/mobile home, marine and polished stone.',
    ],
    listTitle: 'Our range includes:',
    list: ['Touch up pens', 'Covering lacquer', 'Hardwax', 'Softwax', 'Window Doctor Kit'],
    extra: [{ heading: 'Products & Colour charts', text: 'To enquire or order call the team on 01962 842 002 or contact us here' }],
    storeLink: { label: 'Touch Up & Repair products', href: `${LIVE}/category/touch-up-repair` },
  },
  {
    slug: 'moldex',
    name: 'Moldex PPE',
    kicker: 'Brand · PPE',
    summary: 'Is your PPE up to date? Personal protection equipment from Moldex.',
    category: 'siteprotectionandppe',
    image: 'pages/moldex-ppe',
    heading: 'Is your PPE up to date?',
    body: [
      'To help ensure you stay fit and compliant we stock a range of Personal Protection equipment from Moldex',
    ],
    listTitle: 'We stock:',
    list: ['FFP3 Masks', 'Glasses', 'Ear Plugs', 'Ear Defenders', 'Face test fit kits'],
    extra: [{ heading: 'Contact the Sales team', text: 'To enquire or order call the team on 01962 842 002 or contact us here' }],
  },
  {
    slug: 'soudaclean',
    name: 'Soudaclean',
    kicker: 'Soudal',
    summary: 'Introducing the new Soudaclean range of Fast Drying, Non, Light & Strong dissolving cleaning agent',
    category: 'adhesivesandchemicals',
    banner: 'pages/soudaclean-banner',
    body: [
      'Introducing the new Soudaclean range of Fast Drying, Non, Light & Strong dissolving cleaning agent',
    ],
    offer: {
      title: 'Introductory Offer - 4 pack £25.00+VAT',
      lead: 'pack includes:',
      items: ['1 x 1 Litre Soudaclean 5', '1 x 1 Litre Soudaclean 20', '1 x 1 Litre Soudaclean 10', '1 x 1 Litre Soudaclean 60'],
    },
    variants: [
      {
        name: 'Soudaclean 5', image: 'pages/soudaclean-5', sheet: pdf('834bc043ffe44a9baa112bc4c789fe0b'),
        text: 'Soudaclean 5 is a fast-drying, strong dissolving smoothening agent. The cleaner is well suited for the removal of scratches, cracks and abrasive traces on non-transparent rigid PVC (e.g. window frames), PS, ABS, PMMA (Acryl).',
        properties: ['Very strong dissolving', 'Fast acting', 'Fast drying'],
        applications: [
          'Smoothening (and cleaning) of most types of white PVC window frames, sills, cladding, panels and trims.',
          'For the removal of scratches, cracks and abrasive traces on non-transparent rigid PVC, PS, ABS, PMMA, Acryl (in furniture and advertising industry).',
          'Cleaning of surfaces to be bonded (prior to bonding).',
          'As a primer before applying PVC mouldings with hotmelt adhesives.',
        ],
      },
      {
        name: 'Soudaclean 10', image: 'pages/soudaclean-10', sheet: pdf('b5c7c32d54fa416b9efeab82e5924773'),
        text: 'Soudaclean 10 is a fast-drying, light-dissolving cleaning agent. The cleaner is well suited for removing ingrained dirt, marks and streaks on white PVC window frames and other hard plastics. Soudaclean 10 can also be used as a substrate preparation for subsequent bonding.',
        properties: [
          'Light-dissolving', 'No adverse effect on the weather resistance of the cleaned PVC profiles', 'Fast acting', 'Fast drying', 'Deep-cleansing effect',
        ],
        applications: [
          'Cleaning of most types of white PVC window frames, sills, cladding, panels and trims.',
          'As pretreatment of PVC window frames for subsequent bonding (e.g. strips).',
          'Cleaning of surfaces to be bonded (prior to bonding).',
          'For removing most ingrained dirt, grease, uncured sealant, pencil and pen mark.',
          'Cleaning of plastic garden furniture.',
        ],
      },
      {
        name: 'Soudaclean 20', image: 'pages/soudaclean-20', sheet: pdf('77d257ea0561438ebd84cd907d3b0957'),
        text: 'Soudaclean 20 is a fast-drying, non-dissolving cleaning agent. The cleaner is well suited for cleaning PVC (window frames) as well as various other plastics, e.g. PMMA, PC, SAN, ABS. Soudaclean 20 contains an antistatic agent that discharges static plastic surfaces which prevents the cleaned surfaces (PVC window frames) from attracting dust and other dirt.',
        properties: [
          'Non-dissolving', 'Antistatic effect', 'Fast drying', 'No streaks', 'Good compatibility with many types of plastics',
          'Safe to use in contact with the rubber seals in and around windows',
        ],
        applications: [
          'Cleaning of most types of mass-coloured PVC window frames, sills, cladding, panels and trims.',
          'Cleaning of various plastics including PVC, PMMA, PC, SAN and ABS.',
          'As post-treatment after using more dissolving cleaners (e.g. Soudaclean 5 or 10).',
          'For removal of dust, adhesive residues of protective film, pencil and pen marks, rubber residues, fresh PU foam and fresh residues of sealant, tar, bitumen.',
        ],
      },
      {
        name: 'Soudaclean 60', image: 'pages/soudaclean-60', sheet: pdf('a285f27521244be4ba1dadd49243c029'),
        text: 'Soudaclean 60 is a fast-drying, non-dissolving cleaning agent. The cleaner is well suited for cleaning and degreasing powder-coated and anodised surfaces (e.g. aluminium window frames) as well as various plastic materials (e.g. PVC window frames) and foil-laminated surfaces (e.g. foil-laminated window frames). Soudaclean 60 removes fresh adhesive residues (after corner angle bonding), adhesive remainders from protection foils, fresh PU-foam',
        properties: [
          'Non-dissolving', 'Suitable for powder coated and anodised aluminium (window) profiles', 'Suitable for most plastics and metals',
          'Good compatibility with many types of lacquered surfaces', 'Good compatibility with many types of foil laminated surfaces',
          'Fast drying', 'No streaks', 'Leaves no residue',
        ],
        applications: [
          'Cleaning of powder-coated and anodised aluminium (window) frames.',
          'Cleaning of most types of mass-coloured and foil-laminated PVC window frames, sills, cladding, panels and trims.',
          'Cleaning of lacquered surfaces in the plastics and metal processing industry.',
          'As post-treatment after using more dissolving cleaners (e.g. Soudaclean 5 or 10).',
          'Degreasing surfaces in sealant- or bonding applications.',
          'For removal of fresh adhesive residues after corner bonding.',
          'For removal of dust, adhesive residues of protective film, pencil and pen marks, rubber residues, fresh PU foam and fresh residues of sealant, tar, bitumen.',
        ],
      },
    ],
    extra: [{ heading: 'Enquiries', text: 'To enquire about Soudaclean call the team on 01962 842 002 or contact us here' }],
  },
  {
    slug: 'madetoordersandingbelts',
    name: 'Made to order sanding belts',
    kicker: 'Abrasives',
    summary: 'Wide sanding belts in a range of sizes and grit options available on request.',
    category: 'abrasives',
    pageTitle: 'Made to order - Sanding Belts',
    body: [
      'Wide sanding belts in a range of sizes and grit options available on request. For expert advice call the Merlin team on 01962 842 002',
    ],
    images: ['pages/sanding-belt-1', 'pages/sanding-belt-2', 'pages/sanding-belt-3'],
    heading: 'Custom width and length sanding belts available in a variety of grit options',
    text: 'We offer custom sized sanding belts in a range of different grit options specifically tailored to fit unique dimensions, ensuring a precise and seamless sanding experience. Whether you are working on a small woodworking project or a large industrial task, our custom sized sanding belts allow for efficient and effective sanding. By eliminating the need for cutting or modifying standard belts, custom sizes save time and effort, maximizing productivity.',
    steps: [
      { title: 'Choose your size & grit', text: 'Simply let us know your current belt width, height and grit and we will find the best price for you' },
      { title: 'Choose your abrasive', text: 'We offer various high-quality abrasives. Simply select the abrasive you need in the form below' },
    ],
    formLead: 'For all enquiries call our Merlin Sales team on or contact us using our form below',
    formTitle: 'Do you have a sanding belt that need\'s replacing?',
  },
];

export const toolRepair = {
  lead: 'Let us extend the life of your Battery operated or mains powered tool in our Merlin Workshop',
  intro:
    'Is your trusty cordless drill losing its power? Is your favorite saw struggling to make the cut? Look no further! ' +
    'At Merlin Accessories our In-house technician specialises in the repair and rejuvenation of battery operated and ' +
    'main powered tools, bringing them back to life and saving you the cost of replacement.',
  notice: {
    title: 'Please note our longer Tool Repair Service lead times over the Christmas period.',
    text: 'We can still receive your tools for repair, however please be advised that they will be assessed from Jan 14th 2026',
  },
  brands: ['DeWalt', 'Makita', 'Bosch', 'Hitachi', 'Metabo', 'Milwaukee'],
  brandLogos: {
    DeWalt: 'brands/dewalt-repair', Makita: 'brands/makita-repair', Bosch: 'brands/bosch-repair',
    Hitachi: 'brands/hitachi-repair', Metabo: 'brands/metabo-repair', Milwaukee: 'brands/milwaukee-repair',
  },
  brandsText: 'We fix the top brands in power tools such as Dewalt, Makita, Metabo, Hitachi, Bosch and Milwaukee as well as many more.',
  services: [
    { title: 'Battery Replacement', text: 'We offer high-quality genuine replacement batteries for a wide range of cordless tools. Say goodbye to power issues and hello to enhanced performance.' },
    { title: 'Motor & Gearbox repair', text: 'We only use genuine manufacturers spare parts for the repair of your tool ensuring reliability and quality is of the upmost importance' },
    { title: 'Switch & Trigger Replacement', text: 'Having trouble turning your tool on or off? Our technician can replace faulty switches and triggers, restoring the control you need.' },
    { title: 'Maintenance & Servicing', text: 'Prevention is key! Schedule regular maintenance & servicing with us to keep your power tools in top condition, ensuring longevity and reliability.' },
  ],
  // Short labels used in the home banner and menus.
  checks: ['Battery replacement', 'Motor & Gearbox repairs', 'Switch & Trigger replacement', 'General maintenance & Servicing'],
  toolsText: 'We fix a variety of hand power tools such as Drills, Hammer Drills, Circular saws, Jigsaws, Orbital Sanders, Angle grinders, Reciprocating saws, Metal shears, Multi cutters and Hedge trimmers',
  tools: ['Drills', 'Hammer Drills', 'Circular saws', 'Jigsaws', 'Orbital Sanders', 'Angle grinders', 'Reciprocating saws', 'Metal shears', 'Multi cutters', 'Hedge trimmers'],
  // The /products page adds "Nanoblade Saw's and more".
  toolsMore: 'Nanoblade Saws and more',
  why: [
    { title: 'Expert Technician', text: 'Our skilled technician has years of experience in repairing battery-operated and main powered tools. Rest assured, your tools are in capable hands.' },
    { title: 'Quality Parts', text: 'We only use genuine manufacturers spare parts to help extend the life of your power tool.' },
    { title: 'Transparent Pricing', text: 'We believe in transparency. Receive a clear and detailed estimate before any work begins, so you know exactly what to expect.' },
  ],
  photos: ['pages/tool-repair-1', 'pages/tool-repair-2', 'pages/tool-repair-3', 'pages/tool-repair-4', 'pages/tool-repair-5'],
  motorImage: 'pages/tool-repair-motor-gearbox',
  formTitle: 'Do you have a tool that need\'s fixing?',
  formLead: 'For all enquiries call our Merlin Sales team on or contact us using our form below',
  toolBrandOptions: ['DeWalt', 'Makita', 'Bosch', 'Hitachi', 'Metabo', 'Milwaukee', 'Other'],
  // Shown on /products
  productsText:
    'Our in-house tool repair service can extend the life of you battery powered Tool. Our experienced technician fixes many popular ' +
    'brands including Dewalt, Makita, Metabo, Hitachi, Bosch and Milwaukee.',
  productsTools: 'Our service includes repairs to Drills, Hammerdrills, Circular saws, Jigsaws, Orbital sander\'s, Angle grinder\'s, Reciprocating saw\'s, Metal shear\'s, Multicutter\'s, Hedge trimmer\'s, Nanoblade Saw\'s and more',
  productsImage: 'ranges/cat-toolrepair',
};

export const about = {
  heading: 'Over 45 years experience serving the building industry',
  paragraphs: [intro, introMore, visitLine],
  // Order follows the live About page.
  points: [
    { title: 'Industry Experts', text: 'Our Merlin team have decades of experience in delivering expert advice and the best service to our customers' },
    { title: 'Product Range', text: 'With years of building supplier relationships we have access to a vast range of products for your projects however big or small' },
    { title: 'Customer Support', text: 'At Merlin Accessories we really go the extra mile to help our customers. We are on hand to assist you with product selection & order tracking' },
    { title: 'Delivery Service', text: 'Our dedicated drivers are ready to deliver your order to you. We have no minimum order for local delivery direct to your door*', link: 'delivery' },
    { title: 'Quality Assurance', text: 'Our reputable sourcing service prioritises the quality of the products we provide, ensuring that they meet industry standards and regulations.' },
    { title: 'Cost Efficiency', text: 'Our long-standing supplier relationships, enable us to help clients obtain products at competitive prices, often saving money.' },
    { title: 'Trusted by many', text: 'At Merlin we have 1000’s of customers many of whom are regular clients. Our honesty, reliability and consistent delivery of quality products and services has enabled us to grow into the established business we are today.' },
    { title: 'Custom Solutions', text: 'We can provide bespoke orders and solutions to meet your personal needs. Give our friendly sales team a call to discuss what you are looking for and we will do our best to find the solution to your problem.' },
  ],
  storyTitle: 'The Merlin story',
  timeline: [
    { year: '1980', title: 'Founded', text: 'Merlin was founded by Mike Carey with a starting budget of £200' },
    { year: '1982', title: 'Merlin doubles in size', text: 'Merlin\'s first Sales Director was appointed alongside Mike' },
    { year: '1983', title: 'New premises acquired', text: 'Due to increasing sales Merlin moves to Winnall Trading Estate in Winchester' },
    { year: '1987', title: 'Expansion & Trade counter opens', text: 'Merlin acquires the adjoining building with a premise of 2500 sq ft & the trade counter opens' },
    { year: '1990', title: 'Sales reach £1Million', text: '10 years since our launch Merlin reach the million pound sales mark' },
    { year: '2000', title: 'Merlin on the move again', text: 'We moved premises again to our larger 4,000 sq ft unit in Nickel Close on Winnall Trading Estate' },
    { year: '2005', title: 'Mezzanine Expansion', text: 'Our storage space increases to 5800 sq ft with the expansion of our mezzanine floor' },
    { year: '2016', title: 'Merlin restructure', text: 'A refocus sets up the company for continued growth into the future' },
    { year: '2018', title: 'We expand our delivery services', text: 'Our local delivery fleet doubles to meet demands' },
    { year: '2021', title: 'New Directors appointed', text: 'Merlin\'s restructure sees internal promotion for two of our loyal staff to Directors' },
    { year: '2023', title: 'Investment in new operating system', text: 'New Sales order processing and stock control software goes live' },
    { year: '2024', title: 'Continued GROWTH', text: 'Our new website is launched, our staff numbers have grown and we post record turnover figures' },
  ],
};

export const team = {
  lead: 'Meet the friendly Merlin team. We are here to help',
  members: [
    { name: 'Mike Carey', role: 'Managing Director', since: 1980, photo: 'team/mike-carey' },
    { name: 'Tom Sheppard', role: 'Key Account & Business Development Manager', since: 2012, photo: 'team/tom-sheppard' },
    { name: 'Simon Drake-Lee', role: 'Sales Director', since: 2000, photo: 'team/simon-drake-lee' },
    { name: 'Adie Winsor', role: 'Purchasing Director', since: 2004, photo: 'team/adie-winsor' },
    { name: 'Craig Hutchins', role: 'Office Manager', since: 2010, photo: 'team/craig-hutchins' },
    { name: 'Karen Crowe', role: 'Accounts Manager', since: 2016, photo: 'team/karen-crowe' },
    { name: 'Steve Howard', role: 'Area Sales Manager', since: 2024, photo: 'team/steve-howard' },
    { name: 'Richard Budd', role: 'Warehouse Manager & Sales Support', since: 1995, photo: 'team/richard-budd' },
    { name: 'Grahame Bowman', role: 'Tool Repair Specialist', since: 2016, photo: 'team/grahame-bowman' },
    { name: 'Amanda Whittington', role: 'Delivery Driver', since: 2018, photo: 'team/amanda-whittington' },
    { name: 'Owen Newman', role: 'Delivery Driver / Trade Counter', since: 2021, photo: 'team/owen-newman' },
    { name: 'Barry Coleman', role: 'Graphic Designer', since: 2023, photo: 'team/barry-coleman' },
    { name: 'Bailey Hutchins', role: 'Trade Counter & Warehouse', since: 2025, photo: 'team/bailey-hutchins' },
  ],
};

export const newsLead = 'All the latest news and offers and products from Merlin Accessories';

export const delivery = {
  title: 'Delivery Service',
  sections: [
    { title: 'Local Delivery', text: 'Our dedicated drivers are ready to deliver your products to you. We have no minimum order for local delivery direct to your door.' },
    { title: 'National Delivery', text: 'We also offer a national delivery service via courier. Get in touch to enquire about delivery rates.' },
  ],
  map: 'pages/delivery-map',
  mapAlt: 'Merlin Accessories local delivery area',
  van: 'pages/delivery-van',
  vanAlt: 'Merlin Accessories delivery van',
};

export const faq = {
  title: 'Frequently Asked Questions',
  lead: 'If you have any queries and questions please see below or call the team on 01962 842 002',
  items: [
    { q: 'What is our address', a: 'Merlin Accessories Ltd, Unit G, Nickel Close, Winnall Trading Estate, Winchester, SO23 7RJ' },
    { q: 'What are our opening times?', a: 'Phones: Monday to Friday - 07:30 - 17:00\nTrade Counter - 07:00 - 17:00' },
    { q: 'How do I place an order?', a: 'Please give our friendly team a call on 01962 842002, or email us at sales@merlinaccessories.com to place an order.' },
    { q: 'Do you deliver?', a: 'Yes we can deliver locally with no minimum delivery charge. Please see our delivery area here. We can also deliver nationally via courier. Please call us on 01962 842002 to discuss rates.', link: { label: 'delivery area', to: 'delivery' } },
    { q: 'What is your VAT Number?', a: 'Our VAT number is 329 8288 14' },
    { q: 'Do you offer trade accounts?', a: 'Yes we do. If you would like to enquire about opening a trade account please contact Our Accounts Manager Karen on 01962842002 or by emailing accounts@merlinaccessories.com' },
  ],
};

// Brochures: the order follows the live Downloads page.
export const downloads = {
  lead: 'Download our brochures here',
  featured: [
    { title: 'Full Brochure', file: pdf('5cc68c62e05e494e885a30939098b796'), label: 'Download Full Brochure', image: 'downloads/full-brochure', size: 'Large file' },
    { title: 'Window Industry Brochure', file: 'https://acrobat.adobe.com/id/urn:aaid:sc:EU:f909abec-7f27-414c-b673-bf11491e2acc', label: 'Download Window Industry Brochure', image: 'downloads/window-industry', note: 'Glazing & Building Consumables Catalogue' },
  ],
  items: [
    { title: 'Gate & Fence Hardware', file: pdf('0fc56be0bd374af4819db22a84164fbb'), image: 'downloads/gate-fence' },
    { title: 'Fasteners & Fixings', file: pdf('05d3a223e13b4bc69e68a27058b829dd'), image: 'downloads/fasteners-fixings' },
    { title: 'Building Hardware', file: pdf('3440e02d3b5c4b48a94cef4feb79d207'), image: 'downloads/building-hardware' },
    { title: 'Adhesives & Chemicals', file: pdf('e0c7081b7c2a4674963b3a4d22aba764'), image: 'downloads/adhesives-chemicals' },
    { title: 'Painting & Decorating', file: pdf('8276703285574f158d5314484d68fc74'), image: 'downloads/painting-decorating' },
    { title: 'Nails', file: pdf('bd2886e5db6e40648d146697dcd0d8cf'), image: 'downloads/nails' },
    { title: 'Masonry & Cavity Fixings', file: pdf('9932ce771711465da517be53073f7ce9'), image: 'downloads/masonry-cavity-fixings' },
    { title: 'Hand Tools', file: pdf('94e248f9298e4c7f9d064b6acd3f3994'), image: 'downloads/hand-tools' },
    { title: 'Workwear, PPE & Safety', file: pdf('82986a764064455ba88d0e36120f1471'), image: 'downloads/workwear-ppe-safety' },
    { title: 'Security & Ironmongery', file: pdf('87357eef59f94edd8a8619e9fda7a4d3'), image: 'downloads/security-ironmongery' },
    { title: 'Screws', file: pdf('bf97ae20105043b487898c9effe914c3'), image: 'downloads/screws' },
    { title: 'Powertool Accessories', file: pdf('9839c0aba62342558398474fa766caa5'), image: 'downloads/powertool-accessories' },
  ],
};

export const charts = {
  title: 'Conversion Charts & Sizing',
  items: [
    { title: 'Imperial / Metric Conversion chart', image: 'charts/chart-1', id: 'imperial-metric' },
    { title: 'Spanner, countersunk socket and socket cap screw size charts', image: 'charts/chart-2', id: 'spanner-allen' },
    { title: 'Form A & B flat washers', image: 'charts/chart-3', id: 'form-a-b' },
    { title: 'Form C & D flat washers', image: 'charts/chart-4', id: 'form-c-d' },
    { title: 'Form F flat washers', image: 'charts/chart-5', id: 'form-f' },
    { title: 'Form G flat washers', image: 'charts/chart-6', id: 'form-g' },
  ],
};

export const bulk = {
  navLabel: 'Bulk Boxes & Pallet Deals',
  title: 'Bulk Buy Silicone Pallet Deals',
  lead: 'High-quality professional silicone sealant at unbeatable bulk prices',
  intro: 'We offer great deals on boxes (24 cartridges) and full pallets of Soudal LMN Neutral Silicone in White, Clear Antracite & various other colours, ideal for trade professionals, contractors, and large projects.',
  productTitle: 'Soudal LMN Neutral Silicone',
  whatTitle: 'What is Soudal LMN Silicone?',
  what: [
    'Soudal LMN Neutral Silicone is a high-performance neutral cure sealant designed for professional sealing applications where durability, flexibility, and weather resistance are essential.',
    'Unlike traditional acetoxy silicones, neutral cure technology makes LMN safe to use on a wider range of materials without causing corrosion.',
  ],
  coloursTitle: 'Available in a range of colours:',
  colours: [
    ['White', 'swatch-white'], ['Clear', 'swatch-transparent'], ['Black', 'swatch-black'], ['Anthracite Grey', 'swatch-anthracite'],
    ['Slate Grey', 'swatch-slate-grey'], ['Agate Grey', 'swatch-agate-grey'], ['Pebble Grey', 'swatch-pebble-grey'], ['Light Grey', 'swatch-light-grey'],
    ['Teak', 'swatch-teak'], ['Brown', 'swatch-brown'], ['Caramel', 'swatch-caramel'], ['Bronze', 'swatch-bronze'],
    ['Chartwell Green', 'swatch-chartwell-green'], ['Cream White', 'swatch-cream-white'],
  ],
  facts: [['Full Pallet', '1440 x Tubes'], ['Tube Size', '300ml']],
  applicationsTitle: 'Applications',
  applications: [
    'Glazing, construction and industrial sealing applications.',
    'Perimeter sealing of window and door frames.',
    'Sealing of roofline and drainage systems.',
    'Weather sealing of aluminium glazing systems, curtain walling and façade panels.',
    'Can be used with all types of glass, except self-cleaning types.',
    'Sealing of expansion joints. Roofing seals including lead, roofing slates, and fibre-cement.',
    'Industrial applications; coated metals, anodized aluminium, stainless steel. HVAC ducting, pipework and drainage joints.',
    'General maintenance and sealing.',
  ],
  propertiesTitle: 'Properties',
  properties: [
    'Low modulus neutral cure silicone',
    'Primerless adhesion on most surfaces',
    'Conforms to ISO 11600 F&G 25 LM',
    'Extensive colour range sealing.',
  ],
  docs: [
    { label: 'Technical Data Sheet', href: pdf('5df1236a67b641afa9e8433b4053056d') },
    { label: 'Declaration of Performance', href: pdf('9423e364fe9c497e98fee547ee1ae6ae') },
  ],
  shipping: 'Free Shipping',
  whyTitle: 'Why Buy From Us?',
  why: ['Competitive bulk pricing', 'Trade boxes and pallet deals', 'Direct nationwide delivery', 'Fast dispatch – 3 to 5 day delivery', 'Reliable supply for ongoing projects'],
  call: 'Call for Pallet & Box rates',
  images: { pallet: 'pages/bulk-lmn-pallet', tube: 'pages/bulk-silirub-lmn', brand: 'pages/bulk-soudal-logo' },
};

// Home page ---------------------------------------------------------------
export const slides = [
  { image: 'home/slide-tool-repair.jpg', alt: 'Merlin Accessories Tool Repair Service: battery replacement, motor & gearbox repairs, switch & trigger replacement, general maintenance & servicing', link: 'toolrepairservice' },
  { image: 'home/slide-bulk-silicone.jpg', alt: 'Merlin Accessories Soudal Bulk Buy Box & Pallets of LMN Silicone: great prices on pallets of Soudal LMN white & clear silicone', link: 'bulkboxesandpalletdeals' },
  { image: 'home/slide-catalogue.jpg', alt: 'New Merlin Accessories Glazing & Building Consumables Catalogue, available for download', link: 'downloads' },
];

export const promos = [
  { alt: 'Tool repair Service', link: 'toolrepairservice', cta: 'Find out more', image: 'home/tile-tool-repair.webp' },
  { alt: 'Sanding belts made to order', link: 'madetoordersandingbelts', cta: 'Find out more', image: 'home/tile-sanding-belts.jpg' },
  { alt: 'Silicone specialists', href: `${LIVE}/category/silcone`, cta: 'View the range', image: 'home/tile-silicone.webp' },
  { alt: 'Merlin Accessories brochure', link: 'downloads', cta: 'Brochure Download', image: 'home/tile-brochure.webp' },
];

// Brand pages linked from the Brands menu.
export const brandMenu = [
  { name: 'Konig', link: 'koniguk' },
  { name: 'Moldex PPE', link: 'moldex' },
  { name: 'Soudal', href: `${LIVE}/category/soudal` },
];

export const legal = [
  { slug: 'termsandconditions', title: 'Terms & Conditions' },
  { slug: 'privacypolicy', title: 'Privacy Policy', note: 'For any questions or queries contact us at sales@merlinaccessories.com' },
  { slug: 'cookiepolicy', title: 'Cookie Policy' },
];

// Contact form (the live form has these fields; this build opens the visitor's email app).
export const contactForm = {
  title: 'Send us a message',
  heard: ['Used us before', 'Google', 'Seen Van', 'Walk-in', 'Recommended', 'Facebook', 'Instagram', 'LinkedIn'],
};

export const sandingForm = {
  abrasives: ['Ultimax', 'Jepuflex Antistatic', 'Unknown'],
  applications: ['Hardwood', 'Softwood', 'Hardwood/Softwood', 'Other'],
};
