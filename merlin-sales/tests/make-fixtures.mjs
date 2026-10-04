// Writes the small fake fixture files in tests/fixtures/. Run: node tests/make-fixtures.mjs
//
// These files are invented. They do not follow Merlin ERP's real layout (which we have not
// seen yet); they deliberately include the messy things ERP exports tend to contain, so each
// cleaning rule in the brief (section 6.2) has a case to test against:
//
//   customers.csv        report title above the header, leading-zero account codes, codes
//                        with stray spaces, a CASH account, a name with a comma, missing
//                        postcode / rep / trade type, invoice and delivery postcodes
//   sales-lines.csv      combined lines: report titles, repeated header rows at page breaks,
//                        monthly subtotal rows, a grand total, blank rows, £ signs, thousands
//                        separators, (brackets) and trailing-minus negatives, credit notes,
//                        CASH sales, a duplicate line, an account missing from the customer
//                        file, and a product called "Total Seal" that must not be read as a total
//   invoice-headers.csv  header/lines shape: dates as dd-MMM-yy
//   invoice-lines.csv    ...one line whose invoice is not in the headers file
//   sales-lines.xlsx     Excel version: serial-number dates, account codes that Excel turned
//                        into numbers (leading zeros lost), numeric values, a total row
//   stock.csv            stock snapshot: a products-with-no-sales row, a negative stock row,
//                        a totals row; one sold product is missing from it
//   dates-ambiguous.csv  every date could be dd/mm or mm/dd
//   sales-gross.csv      values include VAT and there is no VAT column (the app must ask)
//   sales-net-vat.csv    net, VAT and gross columns (the app must use net)
//
// Names and postcodes are fictional. Postcodes use the non-existent ZZ area so nothing here
// can be mistaken for a real address.

import { writeFileSync, mkdirSync } from 'node:fs';
import { XLSX } from './xlsx-node.mjs';

const OUT = new URL('./fixtures/', import.meta.url);
mkdirSync(OUT, { recursive: true });

// Deterministic random numbers, so the files are the same every time.
let seed = 20261003;
function rand() {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

function csvCell(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const csv = (rows) => rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
const write = (name, text) => writeFileSync(new URL(name, OUT), text);

// ---------- Customers ----------

const customers = [
  // code, name, addr, town, inv pc, del pc, rep, type, credit, terms, opened, contact, phone, email
  ['000101', 'Fixture Windows Ltd', '1 Example Road', 'Winchester', 'ZZ1 1AA', 'ZZ1 1AB', 'Tom', 'Glazing', '£5,000.00', '30 days', '12/03/2015', 'Pat Example', '01000 000101', 'pat@fixture-windows.invalid'],
  ['000102', 'Testbridge Glazing', '2 Sample Street', 'Eastleigh', 'ZZ1 2AA', '', 'Tom', 'Glazing', '£2,500.00', '30 days', '01/07/2019', '', '01000 000102', ''],
  ['000103', 'Mockford Builders', '3 Demo Lane', 'Romsey', 'ZZ1 3AA', 'ZZ1 3AB', 'Steve', 'Builder', '£1,000.00', '30 days', '15/11/2020', 'Sam Mock', '', ''],
  [' 000104 ', 'Smith, Jones & Co', '4 Trial Way', 'Andover', 'ZZ1 4AA', '', 'Steve', 'Joiner', '', 'Cash with order', '22/01/2022', '', '', ''],
  ['000105', 'Placeholder Fencing', '5 Test Close', 'Basingstoke', '', '', '', 'Fencing', '£750.00', '30 days', '03/05/2018', '', '', ''],
  ['000106', "O'Neill Maintenance", '6 Dummy Drive', 'Southampton', 'ZZ1 6AA', 'ZZ1 6AB', 'Counter', '', '', '7 days', '09/09/2021', '', '', ''],
  ['000107', 'Sampleton Joinery', '7 Fiction Row', 'Alresford', 'ZZ1 7AA', '', '', '', '£1,500.00', '30 days', '28/02/2017', '', '', ''],
  ['000108', 'Examplar Glass', '8 Imaginary Ave', 'Portsmouth', 'ZZ1 8AA', 'ZZ1 8AB', 'Tom', 'Glazing', '£10,000.00', '60 days', '14/06/2012', 'Lee Glass', '01000 000108', 'lee@examplar.invalid'],
  ['000109', 'Notreal Kitchens', '9 Pretend Place', 'Fareham', 'ZZ1 9AA', '', 'Steve', '', '', '30 days', '30/09/2023', '', '', ''],
  ['000110', 'Quiet Account Ltd', '10 Silent Street', 'Winchester', 'ZZ2 1AA', '', 'Counter', 'Builder', '', '30 days', '01/01/2016', '', '', ''],
  ['CASH', 'Cash Sales', 'Trade counter', 'Winchester', '', '', 'Counter', '', '', '', '', '', '', ''],
];

write('customers.csv', csv([
  ['Merlin Accessories Ltd (fixture)'],
  ['Customer list printed 30/09/2026'],
  [],
  ['Acc', 'Customer Name', 'Address 1', 'Town', 'Inv Postcode', 'Del Postcode', 'Rep', 'Type', 'Credit Limit', 'Terms', 'Opened', 'Contact', 'Telephone', 'Email'],
  ...customers,
]));

// ---------- Products ----------

const products = [
  ['SIL-LMN-C', 'LMN silicone clear 310ml', 'Silicone', 4.2, 6.1],
  ['SIL-SAN-W', 'Sanitary silicone white 310ml', 'Silicone', 3.1, 4.95],
  ['SCR-WF-430', 'Window fab screw 4.3x30 box 1000', 'Window fabrication screws', 9.5, 14.8],
  ['FIX-FR-100', 'Frame fixing 10x100 box 50', 'Fixings and bolting', 6.0, 9.4],
  ['PAK-FLT-3', 'Flat packer 3mm bag 100', 'Packers and vents', 2.2, 3.9],
  ['CMP-TP600', 'Expanding foam tape TP600 15/3', 'EPDM and Compriband', 11.0, 17.5],
  ['PPE-GLV-L', 'Nitrile grip gloves large pair', 'PPE', 0.9, 1.75],
  ['TSL-310', 'Total Seal hybrid adhesive 310ml', 'Adhesives and foams', 5.4, 8.2],
  ['TAP-ALU-50', 'Aluminium tape 50mm x 45m', 'Tapes', 3.3, 5.6],
];

// ---------- Invoices ----------

// 24 months ending 30/09/2026. Day numbers include values above 12, so the date format is clear.
const accounts = ['000101', '000102', '000103', '000104', '000105', '000106', '000107', '000108', '000109', 'CASH', '000999'];
const lines = []; // { inv, date:'yyyy-mm-dd', acc, prod, qty, net, cost, rep, channel }
let invNo = 50001;
for (let m = 0; m < 24; m++) {
  const y = 2024 + Math.floor((9 + m) / 12);
  const mo = ((9 + m) % 12) + 1;
  const invoicesThisMonth = 3 + Math.floor(rand() * 3);
  for (let i = 0; i < invoicesThisMonth; i++) {
    const day = 1 + Math.floor(rand() * 28);
    const date = `${y}-${String(mo).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    let acc = pick(accounts);
    // 000110 never buys (a customer with no sales); 000109 only buys in the last 12 months
    if (acc === '000109' && m < 12) acc = '000101';
    const inv = `INV${invNo++}`;
    const n = 1 + Math.floor(rand() * 3);
    for (let l = 0; l < n; l++) {
      const p = pick(products);
      const qty = 1 + Math.floor(rand() * 40);
      const net = Math.round(qty * p[4] * 100) / 100;
      const cost = Math.round(qty * p[3] * 100) / 100;
      lines.push({ inv, line: l + 1, date, acc, prod: p, qty, net, cost, rep: acc === 'CASH' ? 'Counter' : '', channel: acc === 'CASH' ? 'Counter' : pick(['Delivery', 'Collection']) });
    }
  }
  // One credit note every few months
  if (m % 5 === 2) {
    const src = lines[lines.length - 2];
    const day = 15 + (m % 10);
    lines.push({ inv: `CRN${invNo++}`, line: 1, date: `${y}-${String(mo).padStart(2, '0')}-${day}`, acc: src.acc, prod: src.prod, qty: -2, net: -Math.round(2 * src.prod[4] * 100) / 100, cost: -Math.round(2 * src.prod[3] * 100) / 100, rep: '', channel: 'Delivery' });
  }
}
// A large line so a thousands separator appears
lines.splice(10, 0, { ...lines[10], line: 9, prod: products[5], qty: 120, net: 2100, cost: 1320 });
// An exact duplicate line (same invoice, line, product, quantity and value)
lines.splice(30, 0, { ...lines[29] });

function moneyText(v, i) {
  // Mix of formats an ERP export might produce
  const abs = Math.abs(v).toFixed(2);
  const withCommas = Number(abs).toLocaleString('en-GB', { minimumFractionDigits: 2 });
  if (v < 0) return [`(${abs})`, `${abs}-`, `-${abs}`][i % 3];
  if (v >= 1000) return `£${withCommas}`;
  return i % 4 === 0 ? `£${abs}` : abs;
}
const ukd = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

const salesHeader = ['Inv No', 'Inv Date', 'A/C', 'Product Code', 'Description', 'Prod Group', 'Qty', 'Nett', 'Cost', 'Rep', 'Channel'];
const salesRows = [['Sales analysis by invoice line (fixture)'], ['Period 01/10/2024 to 30/09/2026'], [], salesHeader];
let page = 1;
let monthKey = lines[0].date.slice(0, 7);
let mQty = 0;
let mNet = 0;
lines.forEach((l, i) => {
  const key = l.date.slice(0, 7);
  if (key !== monthKey) {
    salesRows.push(['', '', '', '', `Total for ${monthKey}`, '', mQty, moneyText(Math.round(mNet * 100) / 100, 1), '', '', '']);
    monthKey = key; mQty = 0; mNet = 0;
  }
  if (i > 0 && i % 40 === 0) {
    page++;
    salesRows.push([], [`Sales analysis by invoice line (fixture)    Page ${page}`], salesHeader);
  }
  mQty += l.qty; mNet += l.net;
  salesRows.push([l.inv, ukd(l.date), l.acc, l.prod[0], l.prod[1], l.prod[2], l.qty < 0 && i % 2 ? `${Math.abs(l.qty)}-` : l.qty, moneyText(l.net, i), moneyText(l.cost, i + 1), l.rep, l.channel]);
});
salesRows.push(['', '', '', '', `Total for ${monthKey}`, '', mQty, moneyText(Math.round(mNet * 100) / 100, 1), '', '', '']);
const grand = lines.reduce((s, l) => s + l.net, 0);
salesRows.push([], ['Grand Total', '', '', '', '', '', lines.reduce((s, l) => s + l.qty, 0), moneyText(Math.round(grand * 100) / 100, 1), '', '', '']);
write('sales-lines.csv', csv(salesRows));

// ---------- Invoice headers + lines ----------

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dmy = (iso) => `${iso.slice(8, 10)}-${MON[Number(iso.slice(5, 7)) - 1]}-${iso.slice(2, 4)}`;
const headerMap = new Map();
for (const l of lines) if (!headerMap.has(l.inv)) headerMap.set(l.inv, l);
write('invoice-headers.csv', csv([
  ['Invoice', 'Date', 'Customer No', 'Salesman', 'Type'],
  ...[...headerMap.values()].map((l) => [l.inv, dmy(l.date), l.acc, l.rep, l.channel]),
]));
write('invoice-lines.csv', csv([
  ['Invoice', 'Line', 'Item', 'Item Description', 'Category', 'Quantity', 'Goods Value', 'Cost Value'],
  ...lines.map((l) => [l.inv, l.line, l.prod[0], l.prod[1], l.prod[2], l.qty, l.net < 0 ? `${Math.abs(l.net).toFixed(2)}-` : l.net.toFixed(2), l.cost.toFixed(2)]),
  ['INV99999', 1, 'SIL-LMN-C', 'LMN silicone clear 310ml', 'Silicone', 5, '30.50', '21.00'],
]));

// ---------- Excel version ----------

const toSerial = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000);
};
const aoa = [salesHeader];
for (const l of lines) {
  aoa.push([l.inv, toSerial(l.date), l.acc === 'CASH' || l.acc === '000999' ? l.acc : Number(l.acc), l.prod[0], l.prod[1], l.prod[2], l.qty, l.net, l.cost, l.rep, l.channel]);
}
aoa.push(['Total', '', '', '', '', '', lines.reduce((s, l) => s + l.qty, 0), Math.round(grand * 100) / 100, '', '', '']);
const ws = XLSX.utils.aoa_to_sheet(aoa);
for (let r = 1; r <= lines.length; r++) {
  const cell = ws[XLSX.utils.encode_cell({ r, c: 1 })];
  cell.t = 'n';
  cell.z = 'dd/mm/yyyy';
}
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'Sales');
writeFileSync(new URL('sales-lines.xlsx', OUT), XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));

// ---------- Stock ----------

const stockRows = [
  ['Stock Code', 'Description', 'Group', 'Free Stock', 'Avg Cost', 'Sell Price', 'Supplier', 'Re-order Level', 'On Order', 'Last Receipt'],
  ['SIL-LMN-C', 'LMN silicone clear 310ml', 'Silicone', '1,200', '4.20', '6.10', 'Sealant Supplier A', '300', '600', '12/09/2026'],
  ['SIL-SAN-W', 'Sanitary silicone white 310ml', 'Silicone', '96', '3.10', '4.95', 'Sealant Supplier A', '100', '0', '02/08/2026'],
  ['SCR-WF-430', 'Window fab screw 4.3x30 box 1000', 'Window fabrication screws', '40', '9.50', '14.80', 'Screw Supplier B', '20', '0', '20/07/2026'],
  ['FIX-FR-100', 'Frame fixing 10x100 box 50', 'Fixings and bolting', '75', '6.00', '9.40', 'Fixings Supplier C', '30', '0', '14/05/2026'],
  ['PAK-FLT-3', 'Flat packer 3mm bag 100', 'Packers and vents', '300', '2.20', '3.90', 'Packer Supplier D', '50', '0', '01/09/2026'],
  ['CMP-TP600', 'Expanding foam tape TP600 15/3', 'EPDM and Compriband', '-4', '11.00', '17.50', 'Tape Supplier E', '10', '24', '30/06/2026'],
  ['PPE-GLV-L', 'Nitrile grip gloves large pair', 'PPE', '480', '0.90', '1.75', 'PPE Supplier F', '100', '0', '11/09/2026'],
  ['TSL-310', 'Total Seal hybrid adhesive 310ml', 'Adhesives and foams', '60', '5.40', '8.20', 'Adhesive Supplier G', '24', '0', '03/03/2026'],
  ['OLD-DRILL-9', 'Discontinued drill bit set', 'Power tool accessories', '18', '£22.50', '39.99', 'Tool Supplier H', '0', '0', '15/01/2023'],
  ['OLD-HINGE-2', 'Bronze butt hinge pair', 'Architectural hardware', '250', '3.75', '7.50', 'Hardware Supplier I', '0', '0', '04/04/2022'],
  ['Totals', '', '', '2,465', '', '', '', '', '', ''],
];
// TAP-ALU-50 is sold but deliberately missing from the stock file.
write('stock.csv', csv(stockRows));

// ---------- Ambiguous dates ----------

write('dates-ambiguous.csv', csv([
  ['Invoice Number', 'Invoice Date', 'Account', 'Customer', 'Product', 'Product Group', 'Quantity', 'Net Value'],
  ['A1', '03/04/2026', '000101', 'Fixture Windows Ltd', 'SIL-LMN-C', 'Silicone', '10', '61.00'],
  ['A2', '05/06/2026', '000102', 'Testbridge Glazing', 'PAK-FLT-3', 'Packers and vents', '4', '15.60'],
  ['A3', '01/12/2025', '000101', 'Fixture Windows Ltd', 'PPE-GLV-L', 'PPE', '20', '35.00'],
  ['A4', '11/02/2026', '000103', 'Mockford Builders', 'FIX-FR-100', 'Fixings and bolting', '2', '18.80'],
]));

// ---------- VAT ----------

write('sales-gross.csv', csv([
  ['Invoice No', 'Date', 'Account Code', 'Product Code', 'Description', 'Quantity', 'Gross Value'],
  ['G1', '14/09/2026', '000101', 'SIL-LMN-C', 'LMN silicone clear 310ml', '10', '73.20'],
  ['G2', '15/09/2026', '000102', 'PAK-FLT-3', 'Flat packer 3mm bag 100', '4', '18.72'],
  ['G3', '16/09/2026', '000103', 'FIX-FR-100', 'Frame fixing 10x100 box 50', '2', '22.56'],
]));

write('sales-net-vat.csv', csv([
  ['Invoice No', 'Date', 'Account Code', 'Product Code', 'Description', 'Quantity', 'Net', 'VAT', 'Gross'],
  ['V1', '14/09/2026', '000101', 'SIL-LMN-C', 'LMN silicone clear 310ml', '10', '61.00', '12.20', '73.20'],
  ['V2', '15/09/2026', '000102', 'PAK-FLT-3', 'Flat packer 3mm bag 100', '4', '15.60', '3.12', '18.72'],
  ['V3', '16/09/2026', '000103', 'FIX-FR-100', 'Frame fixing 10x100 box 50', '2', '18.80', '3.76', '22.56'],
]));

console.log(`Wrote fixtures: ${lines.length} invoice lines, ${customers.length} customers, ${stockRows.length - 2} stock lines.`);
