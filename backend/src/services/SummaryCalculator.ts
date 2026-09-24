/**
 * Summary rows for the Components Report (Total Required, Install Booked,
 * Install Booked next 7 days, Kanban Minimum Stock Level).
 *
 * Moved from the frontend (DataTable.tsx calculateSums/getDivisor) unchanged:
 * same divisors (from the original SQL stored procedures), same "Confirmed"
 * and 7-day rules. Kanban is 0 as before.
 */

export interface ColumnSummary {
  total: number;
  ib_total: number;
  ib7_total: number;
  kanban_min: number;
}

/** Shape the page already uses: sums[col] = total, sums._details[col] = breakdown. */
export type SummaryResult = { [column: string]: any; _details?: Record<string, ColumnSummary> };

// Table-specific divisor maps (from SQL stored procedures)
const DIVISOR_MAPS: { [key: string]: { [key: string]: number } } = {
  'roller_blind_components': {
    'd30_bottom_rail_anodised_silver': 5800, 'd30_bottom_rail_white': 5800, 'd30_bottom_rail_black': 5800, 'd30_bottom_rail_sandstone': 5800, 'd30_bottom_rail_bone': 5800,
    'pelmet_95_anodised': 5800, 'pelmet_95_white': 5800, 'pelmet_95_black': 5800, 'pelmet_95_cream': 5800,
    'cf90_cassette_back_black': 4800, 'cf90_cassette_back_white': 4800, 'cf90_cassette_back_cream': 4800, 'cf90_cassette_back_anodised_silver': 4800,
    'cf90_cassette_square_front_white': 4800, 'cf90_cassette_square_front_black': 4800, 'cf90_cassette_square_front_cream': 4800, 'cf90_cassette_square_front_anodised_silver': 4800,
    'cf90_cassette_round_front_white': 4800, 'cf90_cassette_round_front_black': 4800, 'cf90_cassette_round_front_cream': 4800, 'cf90_cassette_round_front_anodised_silver': 4800,
    'cf90_cassette_side_guide_white': 5800, 'cf90_cassette_side_guide_black': 5800, 'cf90_cassette_side_guide_cream': 5800, 'cf90_cassette_side_guide_anodised_silver': 5800,
    'aluminium_valance_100mm_white': 5800, 'mounting_rail': 5800, 'lath': 3600, 'weight_bar': 2000,
    '15mm_spline': 100000, '38mm_tube': 5800, '43mm_tube': 5800, '43mm_heavy_duty_tube': 5800, '60mm_tube': 3600, '80mm_tube': 4800,
    '38mm_chain_winder_white': 1, '38mm_chain_winder_black': 1, '43mm_chain_winder_white': 1, '43mm_chain_winder_black': 1,
    '40mm_bracket_white': 1, '40mm_bracket_black': 1, '55mm_bracket_white': 1, '55mm_bracket_black': 1,
  },
  'roller_shutter_components': {
    // Pattern-based divisors from SQL: axle_idle, bottom_bar_end_cap, steel_weight_bar, perforated_slat, pelmet_back_cover, angle, square_tube, axle, bottom_bar, side_guides
  },
};

export function getDivisor(tableName: string, columnName: string): number {
  const mapForTable = DIVISOR_MAPS[tableName || 'roller_blind_components'] || DIVISOR_MAPS['roller_blind_components'];

  // For roller_shutter_components, use pattern matching from SQL CASE statement
  if (tableName === 'roller_shutter_components') {
    if (columnName.includes('axle_idle') || columnName.includes('bottom_bar_end_cap')) return 1;
    if (columnName.includes('steel_weight_bar')) return 300;
    if (columnName.includes('perforated_slat')) return 30;
    if (columnName.includes('pelmet_back_cover') || columnName.includes('angle') ||
        columnName.includes('square_tube') || columnName.includes('axle') ||
        columnName.includes('bottom_bar') || columnName.includes('side_guides')) return 5800;
    return 1;
  }

  // For door_screen_components, use pattern matching from SQL CASE statement
  if (tableName === 'door_screen_components') {
    if (columnName.includes('standard_door_frame')) return 5950;
    if (columnName.includes('invisi_gard_door_frame')) return 6150;
    if (columnName === 'misc__flyscreen_spline') return 408000;
    if (columnName === 'misc__bug_strip_felt') return 500000;
    return 1;
  }

  // For curtain_tracks, use specific column name mappings from SQL CASE statement
  if (tableName === 'curtain_tracks') {
    if (columnName === 'wavefold_tape_metres') return 100;
    if (columnName === 'wavefold_track_white_metres' || columnName === 'wavefold_track_black_metres' ||
        columnName === 'wavefold_track_matt_satin_metres' || columnName === 'streamline_track_white_metres' ||
        columnName === 'streamline_matt_black_ink_metres' || columnName === 'streamline_birch_white_metres' ||
        columnName === 'streamline_matt_satin_metres') return 6;
    if (columnName === 'conduit') return 5000;
    return 1;
  }

  // For squalonet_retractable_screens, use pattern matching with priority order from SQL CASE statement
  // NOTE: Order matters - tape checks before track checks, magnet_holder before magnet
  if (tableName === 'squalonet_retractable_screens') {
    // Tape + track combinations (highest priority - must check before plain track)
    if ((columnName.includes('tape') && columnName.includes('top_track')) ||
        (columnName.includes('tape') && columnName.includes('top') && columnName.includes('track'))) return 66000;
    if ((columnName.includes('tape') && columnName.includes('bottom_track')) ||
        (columnName.includes('tape') && columnName.includes('bottom') && columnName.includes('track'))) return 550000;
    // Magnet combinations (magnet_holder before plain magnet)
    if (columnName.includes('magnet_holder') ||
        (columnName.includes('magnet') && columnName.includes('holder'))) return 6000;
    if (columnName.includes('magnet')) return 200000;
    // Other components
    if (columnName.includes('handle_bar') ||
        (columnName.includes('handle') && columnName.includes('bar'))) return 6000;
    if (columnName.includes('starting') && columnName.includes('channel')) return 6000;
    if (columnName.includes('receiving') && columnName.includes('channel')) return 6000;
    if ((columnName.includes('top') && columnName.includes('track')) ||
        columnName.includes('top_track')) return 6000;
    if ((columnName.includes('bottom') && columnName.includes('track')) ||
        columnName.includes('bottom_track')) return 6000;
    if (columnName.includes('angle')) return 5800;
    return 1;
  }

  // For external_blinds_components, use substring matching from SQL CHARINDEX statement
  if (tableName === 'external_blinds_components') {
    if (columnName.includes('5_side_bottom_rail')) return 6500;
    if (columnName.includes('hooding')) return 6600;
    if (columnName.includes('50mm_tube')) return 6500;
    if (columnName.includes('63mm_tube')) return 6500;
    if (columnName.includes('70mm_tube')) return 6500;
    if (columnName.includes('78mm_tube')) return 6000;
    if (columnName.includes('85mm_tube')) return 6000;
    if (columnName.includes('pull_stick_white_lengths')) return 3000;
    if (columnName.includes('fixed_guide_12mm_ballast')) return 3000;
    if (columnName.includes('inner_nylon_guide')) return 3000;
    if (columnName.includes('3_6mm_spline')) return 500000;
    if (columnName.includes('6mm_spline_soft')) return 500000;
    if (columnName.includes('6mm_spline_hard')) return 6000;
    return 1;
  }

  // For panel_glides, use pattern matching with priority from SQL LIKE statements
  // NOTE: Order matters - channel checks before plain patterns, bar_end_caps before plain bar
  if (tableName === 'panel_glides') {
    // Channel track end caps (check before plain channel_track)
    if ((columnName.includes('channel_track_end_caps')) ||
        (columnName.includes('channel') && columnName.includes('end') && columnName.includes('cap'))) return 1;
    // Channel track
    if ((columnName.includes('channel_track')) ||
        (columnName.includes('channel') && columnName.includes('track'))) return 4800;
    // Panel bar end caps (check before plain panel_bar)
    if ((columnName.includes('panel_bar_end_caps')) ||
        (columnName.includes('panel') && columnName.includes('bar') && columnName.includes('end') && columnName.includes('cap'))) return 1;
    // Panel bar
    if ((columnName.includes('panel_bar')) ||
        (columnName.includes('panel') && columnName.includes('bar'))) return 5800;
    // Spline
    if (columnName.includes('spline')) return 100000;
    // Everything else (D30 Bottom Rail, Roller Car, Nut & Bolt, Flick Stick, Brackets)
    return 1;
  }

  return mapForTable[columnName] || 1;
}

// Base columns that shouldn't have sums calculated
const SKIP_COLUMNS = ['id', 'job_tracking_action', 'dispatch_action', 'dispatch_date',
  'quote_no', 'line_no', 'order_item_code', 'product', 'business_name',
  'quote_ref', 'fabric', 'fabric_sqm', 'fabric_width', 'fabric_drop'];

/** dispatch_date as YYYY-MM-DD, whether it arrives as a Date or an ISO string. */
function dateOnly(v: any): string | null {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v.toISOString().split('T')[0];
  return String(v).split('T')[0];
}

/** Calculate sums with SQL formula logic (divisors, confirmation filtering, date ranges). */
export function calculateSummary(tableName: string, rows: any[], now: Date = new Date()): SummaryResult {
  const sums: SummaryResult = {};
  if (rows.length === 0) return sums;

  const firstRow = rows[0];
  // Use date strings for comparison to avoid timezone issues
  const todayStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
  const sevenDaysLaterStr = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  Object.keys(firstRow).forEach((key) => {
    // Skip non-numeric and base columns
    if (SKIP_COLUMNS.includes(key)) return;

    const numericValues = rows.map((row) => {
      const val = row[key];
      if (typeof val === 'string') {
        const num = parseFloat(val);
        return isNaN(num) ? 0 : num;
      }
      return typeof val === 'number' && !isNaN(val) ? val : 0;
    });

    const divisor = getDivisor(tableName, key);

    // Total Required: sum all values / divisor
    const total = numericValues.reduce((a, b) => a + b, 0) / divisor;

    // Install Booked: sum values where dispatch_action === 'Confirmed' / divisor
    const ib_total = rows.reduce((sum, row, idx) =>
      sum + (row.dispatch_action === 'Confirmed' ? numericValues[idx] : 0), 0) / divisor;

    // Install Booked next 7 days: Confirmed AND dispatch_date within 7 days / divisor
    const ib7_total = rows.reduce((sum, row, idx) => {
      const dispatchDateStr = dateOnly(row.dispatch_date);
      const isWithin7Days = dispatchDateStr && dispatchDateStr >= todayStr && dispatchDateStr < sevenDaysLaterStr;
      return sum + (row.dispatch_action === 'Confirmed' && isWithin7Days ? numericValues[idx] : 0);
    }, 0) / divisor;

    // Main total for backward compatibility, plus the breakdown for the summary rows
    sums[key] = total;
    if (!sums._details) sums._details = {};
    sums._details[key] = { total, ib_total, ib7_total, kanban_min: 0 };
  });

  return sums;
}
