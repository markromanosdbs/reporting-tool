import type { DescnParts, ProductConfig } from './ProductJobSheet.js';

/**
 * Products calculated from BUZ data with their job sheet formulas (Door Screen has its own module).
 * Each template is the newest job sheet of that product, verified line by line against Excel.
 */

// ---- Roller Blinds (ROLL): template = job sheet 40426.A ----

// Fabric suppliers as BUZ names them (first part of Inventory.Descn after "ROLL")
const RB_SUPPLIERS = ['Shaw Fabrics', 'Texstyle', 'Wilson Fabrics', 'Charles Parsons', 'Mermet', 'Resene', 'Warwick', 'Louvolite', 'Uniline', 'Four Families'];
// The fabric range name ends with its type; whatever follows is the colour
const RB_TYPE_END = /\b(Blockout|Light Filtering|Translucent|Sunscreen(?: \d+(?:\.\d+)?%)?|Screen(?: \d+(?:\.\d+)?%)?)(?=\s|$)/gi;

/** "ROLL Texstyle Metroshade Blockout Ice Grey" → BN supplier "Texstyle", BO fabric "Metroshade Blockout", BP colour "Ice Grey". */
export function parseRollerFabric(descn: string): DescnParts {
  const warnings: string[] = [];
  let rest = descn.trim().replace(/^\S+\s+/, '');
  const supplier = [...RB_SUPPLIERS].sort((a, b) => b.length - a.length)
    .find(s => rest.toLowerCase().startsWith(s.toLowerCase() + ' ')) ?? rest.split(' ')[0];
  if (!RB_SUPPLIERS.includes(supplier)) warnings.push(`Unknown fabric supplier in "${descn}"`);
  rest = rest.slice(supplier.length).trim();

  let end = -1;
  for (const m of rest.matchAll(RB_TYPE_END)) end = m.index! + m[0].length;
  if (end < 0) { // no type word: assume a one-word colour
    const i = rest.lastIndexOf(' ');
    end = i < 0 ? rest.length : i;
    warnings.push(`Unknown fabric type in "${descn}"`);
  }
  return { BN: supplier, BO: rest.slice(0, end).trim(), BP: rest.slice(end).trim(), warnings };
}

export const ROLLER_BLINDS: ProductConfig = {
  table: 'roller_blind_components',
  label: 'roller-blinds',
  groups: ['ROLL'],
  template: 'RollerBlinds_Template.xlsm',
  mappingFile: 'ROLLERBLINDS_POSITIONAL_MAPPING.json',
  // Job Sheet G (Blind Width) and AR (Control) refer to each other; Excel settles it lazily
  cycleBreaks: [{ sheet: 'Job Sheet', column: 'G', refColumn: 'AR', helperColumn: 'ZZ' }],
  lineAX: 'Roller Blinds',
  lineBM: 'Production - Roller Blinds',
  parseDescn: parseRollerFabric,
  textColumns: ['Fabric'],
  baseColumns: { Quote_No: 4, Line_No: 5, Order_Item_Code: 6, Business_Name: 7, Quote_Ref: 8 },
  envFlag: 'ROLLERBLINDS_FROM_ENGINE',
};

// ---- Roller Shutters (RLSH): template = job sheet 11804.C ----

/** "RLSH 42mm Standard Slat Mag Cream" → BN slat "42mm Standard Slat", BO colour "Mag Cream" (BP unused). */
export function parseRollerShutterSlat(descn: string): DescnParts {
  const rest = descn.trim().replace(/^\S+\s+/, '');
  const m = rest.match(/^(.*\bSlat)\b\s*(.*)$/i);
  if (!m) return { BN: rest, BO: '', BP: '', warnings: [`Unknown slat type in "${descn}"`] };
  return { BN: m[1].trim(), BO: m[2].trim(), BP: '', warnings: m[2].trim() ? [] : [`No colour in "${descn}"`] };
}

export const ROLLER_SHUTTERS: ProductConfig = {
  table: 'roller_shutter_components',
  label: 'roller-shutters',
  groups: ['RLSH'],
  template: 'RollerShutters_Template.xlsm',
  mappingFile: 'ROLLERSHUTTERS_POSITIONAL_MAPPING.json',
  lineAX: 'Roller Shutters',
  lineBM: 'Production - Roller Shutters',
  parseDescn: parseRollerShutterSlat,
  baseColumns: { Quote_No: 4, Line_No: 5, Order_Item_Code: 6, Product: 7, Business_Name: 8, Quote_Ref: 9 },
  envFlag: 'ROLLERSHUTTERS_FROM_ENGINE',
  // all open jobs, like Curtain Tracks (user request 30 Sep 2026): dbsproduction only has the lines already
  // in production; dbswip also has the ones still being ordered/checked
  jobsView: 'dbswip',
  excludeStatuses: ['Completed', 'Cancelled'],
};

// ---- External Blinds: one page, one template per product code (each has its own job sheet formulas) ----
// AUTO = job sheet 11925.B, FGSUN = 12085.A, VERTC = 12085.A; SDPB, PAAW, WIRG = BUZ blank templates (28 Sep 2026)

// Outdoor fabric suppliers as BUZ names them (first part of Inventory.Descn after "AUTO")
const EB_SUPPLIERS = ['Ricky', 'HVG', 'Bradmill', 'Nolans', 'Dickson', 'Serge Ferrari', 'Docril', 'Mermet', 'Textilene', 'Vistaweave', 'Coolaroo'];
const EB_TYPE_END = /\b(Sunscreen|Canvas|Mesh|Blockout|Screen|Acrylic|PVC|Clear)(?=\s|$)/gi;

/**
 * "AUTO Ricky Skyline 99 702 Surfmist" → BN "Ricky", BO "Skyline 99", BP "702 Surfmist";
 * "AUTO HVG Visiontex Plus Sunscreen Graphite" → "HVG" / "Visiontex Plus Sunscreen" / "Graphite".
 * The colour starts at a colour code (3+ digits) if there is one, else after the fabric type word.
 */
export function parseOutdoorFabric(descn: string): DescnParts {
  const warnings: string[] = [];
  let rest = descn.trim().replace(/^\S+\s+/, '');
  const supplier = [...EB_SUPPLIERS].sort((a, b) => b.length - a.length)
    .find(s => rest.toLowerCase().startsWith(s.toLowerCase() + ' ')) ?? rest.split(' ')[0];
  if (!EB_SUPPLIERS.includes(supplier)) warnings.push(`Unknown fabric supplier in "${descn}"`);
  rest = rest.slice(supplier.length).trim();

  const code = rest.match(/\s(\d{3,}\b.*)$/);
  if (code) return { BN: supplier, BO: rest.slice(0, code.index).trim(), BP: code[1].trim(), warnings };
  let end = -1;
  for (const m of rest.matchAll(EB_TYPE_END)) end = m.index! + m[0].length;
  if (end < 0) { // no colour code or type word: assume a one-word colour
    const i = rest.lastIndexOf(' ');
    end = i < 0 ? rest.length : i;
    warnings.push(`Unknown fabric type in "${descn}"`);
  }
  return { BN: supplier, BO: rest.slice(0, end).trim(), BP: rest.slice(end).trim(), warnings };
}

export const EXTERNAL_BLINDS_AUTO: ProductConfig = {
  table: 'external_blinds_components',
  label: 'external-blinds-auto',
  groups: ['AUTO'],
  template: 'ExternalBlinds_AUTO_Template.xlsm',
  mappingFile: 'EXTERNALBLINDS_POSITIONAL_MAPPING.json',
  lineAX: 'Auto Sunblinds',
  lineBM: 'Production - Outdoor Blinds',
  parseDescn: parseOutdoorFabric,
  textColumns: ['Fabric'],
  baseColumns: { Quote_No: 4, Line_No: 5, Order_Item_Code: 6, Product: 7, Business_Name: 8, Quote_Ref: 9 },
  envFlag: 'EXTERNALBLINDS_FROM_ENGINE',
};

export const EXTERNAL_BLINDS_FGSUN: ProductConfig = {
  ...EXTERNAL_BLINDS_AUTO,           // same page, columns, base columns and description style
  label: 'external-blinds-fgsun',
  groups: ['FGSUN'],
  template: 'ExternalBlinds_FGSUN_Template.xlsm',
  lineAX: 'Fixed Guide Sunblinds',
};

export const EXTERNAL_BLINDS_VERTC: ProductConfig = {
  ...EXTERNAL_BLINDS_AUTO,           // same page, columns, base columns and description style
  label: 'external-blinds-vertc',
  groups: ['VERTC'],
  template: 'ExternalBlinds_VERTC_Template.xlsm',
  lineAX: 'Verticali & Zipscreen',
};

// SDPB template = BUZ's blank "Straight Drop Patio Blinds" job sheet (28 Sep 2026); its formulas only test Data!AX for blank
export const EXTERNAL_BLINDS_SDPB: ProductConfig = {
  ...EXTERNAL_BLINDS_AUTO,           // same page, columns, base columns and description style
  label: 'external-blinds-sdpb',
  groups: ['SDPB'],
  template: 'ExternalBlinds_SDPB_Template.xlsm',
  lineAX: 'Straight Drop Patio Blinds',
};

// PAAW template = BUZ's blank "Pivot Arm Awnings" job sheet (28 Sep 2026), checked against order job sheet 38060.A
export const EXTERNAL_BLINDS_PAAW: ProductConfig = {
  ...EXTERNAL_BLINDS_AUTO,           // same page, columns, base columns and description style
  label: 'external-blinds-paaw',
  groups: ['PAAW'],
  template: 'ExternalBlinds_PAAW_Template.xlsm',
  lineAX: 'Pivot Arm Awnings',
};

// WIRG template = BUZ's blank "Wire Guide Blinds" job sheet (28 Sep 2026); Data!AX is only tested for blank / shown on a form
export const EXTERNAL_BLINDS_WIRG: ProductConfig = {
  ...EXTERNAL_BLINDS_AUTO,           // same page, columns, base columns and description style
  label: 'external-blinds-wirg',
  groups: ['WIRG'],
  template: 'ExternalBlinds_WIRG_Template.xlsm',
  lineAX: 'Wire Guide Blinds',
};

// ---- Squalonet Retractable Screens (SQNT): template = job sheet 10940.A ----
// (CUSQ "Custom Quote" lines are repairs / fabric-only jobs, not Squalonet)

/** "SQNT Pleated Flyscreen Black" → BN "Pleated Flyscreen", BO colour "Black" (BP unused). */
export function parseSqualonet(descn: string): DescnParts {
  const rest = descn.trim().replace(/^\S+\s+/, '');
  const m = rest.match(/^(.*\b(?:Flyscreen|Screen|Mesh))\b\s*(.*)$/i);
  if (m) return { BN: m[1].trim(), BO: m[2].trim(), BP: '', warnings: m[2].trim() ? [] : [`No colour in "${descn}"`] };
  const i = rest.lastIndexOf(' '); // unknown type: assume a one-word colour
  return { BN: i < 0 ? rest : rest.slice(0, i), BO: i < 0 ? '' : rest.slice(i + 1), BP: '', warnings: [`Unknown screen type in "${descn}"`] };
}

export const SQUALONET: ProductConfig = {
  table: 'squalonet_retractable_screens',
  label: 'squalonet',
  groups: ['SQNT'],
  template: 'Squalonet_SQNT_Template.xlsm',
  mappingFile: 'SQUALONET_POSITIONAL_MAPPING.json',
  lineAX: 'SqualoNet Retractable Flyscreen',
  lineBM: 'Orders - Security',
  parseDescn: parseSqualonet,
  baseColumns: { Quote_No: 4, Line_No: 5, Order_Item_Code: 6, Business_Name: 7, Quote_Ref: 8 },
  envFlag: 'SQUALONET_FROM_ENGINE',
  // this job sheet's Components tab has its headings on row 2 and line 1 on row 3
  componentsRow: 3,
  componentsHeadingRow: 2,
  arrayArithmetic: true,
};

// ---- Panel Glides (PANG): template = BUZ's blank "Panel Glides" job sheet (18 Sep 2026) ----
// Its formulas use the line's Inventory.Descn (fabric = MID(descn, 6, 80)) and test Data!AX for blank;
// BN/BO/BP only feed a printed heading, so the Roller Blind style split is enough.
export const PANEL_GLIDES: ProductConfig = {
  table: 'panel_glides',
  label: 'panel-glides',
  groups: ['PANG'],
  template: 'PanelGlides_PANG_Template.xlsm',
  mappingFile: 'PANELGLIDES_POSITIONAL_MAPPING.json',
  lineAX: 'Panel Glides',
  lineBM: 'Production - Panel Glides',
  parseDescn: parseRollerFabric,
  textColumns: ['Fabric'],
  baseColumns: { Quote_No: 4, Line_No: 5, Order_Item_Code: 6, Business_Name: 7, Quote_Ref: 8 },
  envFlag: 'PANELGLIDES_FROM_ENGINE',
  // headings on row 2 and line 1 on row 3, like Squalonet
  componentsRow: 3,
  componentsHeadingRow: 2,
};

// ---- Curtain Tracks: Curtains (CURT), template = job sheet 39776.F ----
// The formulas take the fabric from Inventory.Descn (MID(descn, 6, 80)); BN/BO/BP only feed the Installation
// sheet's label, so the split below just keeps those tidy.
const CURT_SUPPLIERS = ['Charles Parsons', 'Maurice Kain', 'Wilson Fabrics', 'Unique Fabrics', '3 Pass', 'Nettex', 'Filigree',
  'Mokum', 'Warwick', 'Hoad', 'Zepel', 'Textilia', 'Materialised', 'Westco'];
const CURT_TYPE_END = /\b(Uncoated|Coated|Sheer|Lining|Blockout|Dimout|Thermal)(?=\s|$)/gi;

/** "CURT Nettex Brunswick (Continuous) Uncoated Talc" → BN "Nettex", BO "Brunswick (Continuous) Uncoated", BP "Talc". */
export function parseCurtainFabric(descn: string): DescnParts {
  let rest = descn.trim().replace(/^\S+\s+/, '');
  const supplier = [...CURT_SUPPLIERS].sort((a, b) => b.length - a.length)
    .find(x => rest.toLowerCase().startsWith(x.toLowerCase() + ' ')) ?? rest.split(' ')[0];
  rest = rest.slice(supplier.length).trim();
  let end = -1;
  for (const m of rest.matchAll(CURT_TYPE_END)) end = m.index! + m[0].length;
  if (end < 0) { const i = rest.lastIndexOf(' '); end = i < 0 ? rest.length : i; }
  return { BN: supplier, BO: rest.slice(0, end).trim(), BP: rest.slice(end).trim(), warnings: [] };
}

export const CURTAIN_TRACKS: ProductConfig = {
  table: 'curtain_tracks',
  label: 'curtain-tracks',
  groups: ['CURT'],
  template: 'CurtainTracks_CURT_Template.xlsm',
  mappingFile: 'CURTAINTRACKS_POSITIONAL_MAPPING.json',
  lineAX: 'Curtains',
  lineBM: 'Orders - Curtains',
  parseDescn: parseCurtainFabric,
  textColumns: ['Track_Status'],
  baseColumns: { Quote_No: 4, Line_No: 5, Order_Item_Code: 6, Business_Name: 7, Quote_Ref: 8 },
  envFlag: 'CURTAINTRACKS_FROM_ENGINE',
  // headings on row 2 and line 1 on row 3
  componentsRow: 3,
  componentsHeadingRow: 2,
  // all open curtain jobs: most are ordered made-up from a supplier and are only in dbswip (agreed 28 Sep 2026)
  jobsView: 'dbswip',
  excludeStatuses: ['Completed', 'Cancelled'],
};

// ---- Curtain Tracks: Curtain Tracks & Rods (CTRA), template = job sheet 12027.C ----
// BUZ splits the item into BN (track/rod) and BO (colour), which the Job Sheet tab shows in H/I.
const CTRA_COLOURS = ['Matt Black Ink', 'Birch White', 'Matt Satin', 'White', 'Black', 'Silver'];

/** "CTRA Streamline Cord Operation Birch White" → BN "Streamline Cord Operation", BO "Birch White". */
export function parseCurtainTrack(descn: string): DescnParts {
  const rest = descn.trim().replace(/^\S+\s+/, '');
  const colour = CTRA_COLOURS.find(c => rest.toLowerCase().endsWith(' ' + c.toLowerCase()));
  if (!colour) return { BN: rest, BO: '', BP: '', warnings: [`no known colour at the end of "${descn}"`] };
  return { BN: rest.slice(0, rest.length - colour.length).trim(), BO: colour, BP: '', warnings: [] };
}

export const CURTAIN_TRACKS_CTRA: ProductConfig = {
  ...CURTAIN_TRACKS,                 // same page, columns (by position), rows and job list
  label: 'curtain-tracks-ctra',
  groups: ['CTRA'],
  template: 'CurtainTracks_CTRA_Template.xlsm',
  lineAX: 'Curtain Tracks & Rods',
  lineBM: 'Production - Curtain Tracks & Rods',
  parseDescn: parseCurtainTrack,
};

export const PRODUCTS: ProductConfig[] = [
  ROLLER_BLINDS, ROLLER_SHUTTERS, SQUALONET, PANEL_GLIDES, CURTAIN_TRACKS, CURTAIN_TRACKS_CTRA,
  EXTERNAL_BLINDS_AUTO, EXTERNAL_BLINDS_FGSUN, EXTERNAL_BLINDS_VERTC, EXTERNAL_BLINDS_SDPB, EXTERNAL_BLINDS_PAAW, EXTERNAL_BLINDS_WIRG,
];
/** Page table → every template that feeds it */
export const PRODUCTS_BY_TABLE: Record<string, ProductConfig[]> = {};
for (const p of PRODUCTS) (PRODUCTS_BY_TABLE[p.table] ??= []).push(p);
/** Template for a BUZ product code, e.g. 'FGSUN' → EXTERNAL_BLINDS_FGSUN */
export function productForGroup(group: string): ProductConfig | undefined {
  return PRODUCTS.find(p => p.groups.includes(group.toUpperCase()));
}
