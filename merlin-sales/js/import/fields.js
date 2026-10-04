// Our field names, the kinds of file the importer understands, and the column-heading
// synonyms used to match Merlin ERP's columns to our fields.
//
// We have not seen Merlin ERP's real exports yet. When they arrive, add their exact headings
// to the synonym lists below (brief section 14) and save a profile for them.

// kind: code (kept as text), text, date, money, number, postcode
const F = (label, kind, synonyms, extra = {}) => ({ label, kind, synonyms, ...extra });

const ACCOUNT = ['acc', 'account', 'a/c', 'ac', 'a/c no', 'a/c code', 'cust code', 'customer code', 'customer no',
  'customer number', 'cust no', 'cust num', 'account code', 'account no', 'account number', 'acc no', 'acc code',
  'customer account', 'customer a/c', 'cust a/c', 'customer id', 'cust id', 'account ref', 'customer ref', 'acct', 'acct no'];
const CUSTOMER_NAME = ['customer name', 'cust name', 'account name', 'company', 'company name', 'trading name', 'customer', 'name'];
const INVOICE = ['inv no', 'invoice', 'invoice no', 'invoice number', 'inv', 'inv number', 'invoice ref', 'inv ref',
  'document no', 'document number', 'doc no', 'transaction no', 'tran no', 'trans no', 'invoice/credit no', 'document'];
const INV_DATE = ['inv date', 'invoice date', 'date', 'tran date', 'trans date', 'transaction date', 'doc date', 'document date', 'posting date'];
const LINE = ['line', 'line no', 'line number', 'seq', 'sequence', 'line seq'];
const PRODUCT = ['product code', 'product', 'prod code', 'stock code', 'item', 'item code', 'item no', 'part no', 'part number', 'sku', 'product no', 'code'];
const DESCRIPTION = ['description', 'desc', 'item description', 'product description', 'product name', 'item name', 'details', 'stock description'];
const GROUP = ['product group', 'prod group', 'group', 'category', 'product category', 'analysis code', 'analysis group',
  'family', 'product family', 'stock group', 'sales group', 'department', 'dept'];
const QTY = ['qty', 'quantity', 'units', 'qty sold', 'quantity sold', 'qty invoiced', 'quantity invoiced', 'sold qty'];
const NET = ['nett', 'net', 'goods value', 'value', 'net value', 'nett value', 'net amount', 'nett amount', 'sales value',
  'line value', 'goods', 'amount', 'net sales', 'nett sales', 'sales', 'line total', 'goods amount', 'ex vat', 'value ex vat', 'net total'];
const GROSS = ['gross', 'gross value', 'gross amount', 'total inc vat', 'value inc vat', 'inc vat', 'amount inc vat', 'gross total', 'total incl vat'];
const VAT = ['vat', 'vat value', 'vat amount', 'tax', 'tax amount'];
const COST = ['cost', 'cost value', 'line cost', 'total cost', 'cost of sale', 'cost of sales', 'cos', 'cost amount'];
const REP = ['rep', 'sales rep', 'salesman', 'salesperson', 'sales person', 'account manager', 'acc manager', 'rep code', 'rep name', 'representative'];
const CHANNEL = ['channel', 'sale type', 'order type', 'type', 'delivery method', 'despatch method', 'method', 'route', 'source'];

export const FIELDS = {
  // customers
  account_code: F('Account code', 'code', ACCOUNT),
  name: F('Customer name', 'text', CUSTOMER_NAME),
  address1: F('Address line 1', 'text', ['address', 'address 1', 'address1', 'address line 1', 'add1', 'addr1', 'add 1', 'street']),
  address2: F('Address line 2', 'text', ['address 2', 'address2', 'address line 2', 'add2', 'addr2', 'add 2']),
  address3: F('Address line 3', 'text', ['address 3', 'address3', 'address line 3', 'add3', 'addr3', 'add 3', 'locality']),
  town: F('Town', 'text', ['town', 'city', 'post town', 'town/city', 'address 4']),
  county: F('County', 'text', ['county', 'region', 'address 5']),
  postcode: F('Postcode', 'postcode', ['postcode', 'post code', 'postal code', 'pcode', 'zip', 'post code/zip']),
  delivery_postcode: F('Delivery postcode', 'postcode', ['del postcode', 'delivery postcode', 'del post code', 'delivery post code', 'del pcode', 'ship to postcode', 'deliver to postcode', 'delivery address postcode']),
  invoice_postcode: F('Invoice postcode', 'postcode', ['inv postcode', 'invoice postcode', 'inv post code', 'invoice post code', 'billing postcode', 'statement postcode']),
  rep: F('Rep', 'text', REP),
  trade_type: F('Trade type', 'text', ['trade type', 'trade', 'type', 'customer type', 'business type', 'customer category', 'account type', 'sector', 'market', 'industry']),
  credit_limit: F('Credit limit', 'money', ['credit limit', 'credit', 'limit', 'cr limit', 'credit lmt']),
  payment_terms: F('Payment terms', 'text', ['terms', 'payment terms', 'credit terms', 'pay terms']),
  account_opened: F('Account opened', 'date', ['opened', 'date opened', 'account opened', 'open date', 'opening date', 'start date', 'created', 'date created']),
  contact_name: F('Contact name', 'text', ['contact', 'contact name', 'buyer', 'main contact']),
  phone: F('Phone', 'text', ['phone', 'telephone', 'tel', 'tel no', 'phone number', 'telephone number', 'phone no', 'mobile']),
  email: F('Email', 'text', ['email', 'e-mail', 'email address', 'e mail']),

  // sales
  invoice_no: F('Invoice number', 'code', INVOICE),
  invoice_date: F('Invoice date', 'date', INV_DATE),
  line_no: F('Line number', 'code', LINE),
  customer_name: F('Customer name', 'text', CUSTOMER_NAME),
  product_code: F('Product code', 'code', PRODUCT),
  description: F('Description', 'text', DESCRIPTION),
  product_group: F('Product group', 'text', GROUP),
  quantity: F('Quantity', 'number', QTY),
  net_value: F('Net value (ex VAT)', 'money', NET),
  gross_value: F('Value including VAT', 'money', GROSS),
  vat_value: F('VAT', 'money', VAT),
  cost: F('Cost', 'money', COST),
  channel: F('Channel', 'text', CHANNEL),

  // stock
  quantity_in_stock: F('Quantity in stock', 'number', ['free stock', 'in stock', 'stock', 'qty in stock', 'quantity in stock',
    'stock qty', 'stock quantity', 'on hand', 'qty on hand', 'quantity on hand', 'physical', 'physical stock', 'free', 'stock level', 'balance', 'qty']),
  unit_cost: F('Unit cost', 'money', ['avg cost', 'average cost', 'unit cost', 'cost price', 'cost', 'standard cost', 'std cost', 'last cost', 'av cost']),
  stock_value: F('Stock value', 'money', ['stock value', 'value', 'total value', 'valuation', 'value at cost', 'cost value']),
  sell_price: F('Sell price', 'money', ['sell price', 'selling price', 'price', 'list price', 'retail', 'sell', 'trade price', 'price 1']),
  supplier: F('Supplier', 'text', ['supplier', 'supplier name', 'vendor', 'supplier code', 'main supplier']),
  brand: F('Brand', 'text', ['brand', 'manufacturer', 'make']),
  reorder_level: F('Reorder level', 'number', ['re-order level', 'reorder level', 'reorder', 're-order', 'min', 'minimum', 'min stock', 'minimum stock', 'reorder point']),
  on_order: F('On order', 'number', ['on order', 'po qty', 'purchase order qty', 'due in', 'qty on order']),
  last_received_date: F('Last received', 'date', ['last receipt', 'last received', 'last receipt date', 'last grn', 'last delivery', 'last goods in', 'date last received']),
  last_sold_date: F('Last sold', 'date', ['last sold', 'last sale', 'last sale date', 'last issue', 'date last sold']),
};

// The kinds of file the importer understands. `fields` lists ours in display order;
// `required` must be mapped before the import can continue. `anyOf` means at least one of
// those fields is needed (net value, or a VAT-inclusive value the app can work from).
// `identifiers` are the fields a real data row always has: rows without them are totals,
// titles or blanks. `against` are fields that suggest the file is NOT this type.
export const FILE_TYPES = {
  customers: {
    label: 'Customer list',
    fields: ['account_code', 'name', 'address1', 'address2', 'address3', 'town', 'county', 'delivery_postcode', 'postcode',
      'invoice_postcode', 'rep', 'trade_type', 'credit_limit', 'payment_terms', 'account_opened', 'contact_name', 'phone', 'email'],
    required: ['account_code', 'name'],
    identifiers: ['account_code'],
    against: ['invoice_no', 'product_code', 'quantity', 'quantity_in_stock'],
    synonyms: { account_code: ['code'] },
  },
  sales_lines: {
    label: 'Sales lines (one file with everything)',
    fields: ['invoice_no', 'invoice_date', 'account_code', 'customer_name', 'line_no', 'product_code', 'description',
      'product_group', 'quantity', 'net_value', 'gross_value', 'vat_value', 'cost', 'rep', 'channel'],
    required: ['invoice_no', 'invoice_date', 'account_code', 'product_code', 'quantity'],
    anyOf: [['net_value', 'gross_value']],
    identifiers: ['invoice_no', 'account_code', 'product_code'],
    against: ['quantity_in_stock', 'postcode', 'credit_limit'],
  },
  invoice_headers: {
    label: 'Invoice headers',
    fields: ['invoice_no', 'invoice_date', 'account_code', 'customer_name', 'rep', 'channel'],
    required: ['invoice_no', 'invoice_date', 'account_code'],
    identifiers: ['invoice_no'],
    against: ['product_code', 'quantity', 'quantity_in_stock'],
  },
  invoice_lines: {
    label: 'Invoice lines',
    fields: ['invoice_no', 'line_no', 'product_code', 'description', 'product_group', 'quantity', 'net_value', 'gross_value', 'vat_value', 'cost', 'rep'],
    required: ['invoice_no', 'product_code', 'quantity'],
    anyOf: [['net_value', 'gross_value']],
    identifiers: ['invoice_no', 'product_code'],
    against: ['account_code', 'invoice_date', 'quantity_in_stock'],
  },
  stock: {
    label: 'Stock',
    fields: ['product_code', 'description', 'product_group', 'quantity_in_stock', 'unit_cost', 'stock_value', 'sell_price',
      'supplier', 'brand', 'reorder_level', 'on_order', 'last_received_date', 'last_sold_date'],
    required: ['product_code', 'quantity_in_stock'],
    identifiers: ['product_code'],
    against: ['invoice_no', 'account_code', 'invoice_date'],
    synonyms: { quantity_in_stock: ['quantity'] },
  },
  // Later (brief section 5.4): an aged debtors or payments export. Listed here so the place
  // to add it is obvious; `available: false` keeps it out of every screen until it is built.
  aged_debtors: {
    label: 'Aged debtors (later)',
    available: false,
    fields: ['account_code'],
    required: ['account_code'],
    identifiers: ['account_code'],
    against: [],
  },
};

export const AVAILABLE_TYPES = Object.keys(FILE_TYPES).filter((t) => FILE_TYPES[t].available !== false);

// Headings are compared in a normalised form: lower case, '&' as 'and', punctuation as spaces.
export function normaliseHeading(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Synonyms for a field within a file type, normalised.
const synCache = new Map();
export function synonymsFor(typeId, field) {
  const key = `${typeId}:${field}`;
  if (!synCache.has(key)) {
    const extra = FILE_TYPES[typeId]?.synonyms?.[field] || [];
    synCache.set(key, [...new Set([...FIELDS[field].synonyms, ...extra].map(normaliseHeading))]);
  }
  return synCache.get(key);
}

// Every normalised synonym of every field, used to find the header row.
export const ALL_SYNONYMS = new Set(
  Object.keys(FILE_TYPES).flatMap((t) => FILE_TYPES[t].fields.flatMap((f) => synonymsFor(t, f))),
);

// Cash and counter-sale accounts: their sales count in totals, but they are left out of
// customer health, the map and alerts. Editable in Settings (step 8).
export const DEFAULT_CASH_CODES = ['CASH', 'CASHSALE', 'CASHSALES', 'CASH SALE', 'CASH SALES', 'COUNTER', 'TRADE COUNTER', 'CASH01', 'CSH'];
export const CASH_NAME_RE = /^(cash|counter|trade counter)( sales?| account| customer)?s?$/i;
