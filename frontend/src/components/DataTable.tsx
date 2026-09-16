import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  ColumnDef,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ExportButton } from './ExportButton';
import { CommentsModal } from './CommentsModal';
import clsx from 'clsx';

interface DataTableProps {
  data: any[];
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  isLoading: boolean;
  tableName?: string;
  username?: string;
  onShowCommentsSummary?: () => void;
}

// Table-specific base columns
const TABLE_BASE_COLUMNS: { [key: string]: string[] } = {
  'door_screen_components': [
    'id',
    'Quote No',
    'quote_no',
    'Line No',
    'line_no',
    'Order Item Code',
    'order_item_code',
    'Product',
    'product',
    'Customer',
    'customer',
    'Quote Ref',
    'quote_ref',
    'job_tracking_action',
    'dispatch_action',
    'dispatch_date',
    'business_name',
  ],
  'roller_blind_components': [
    'id',
    'job_tracking_action',
    'dispatch_action',
    'dispatch_date',
    'quote_no',
    'line_no',
    'order_item_code',
    'product',
    'business_name',
    'quote_ref',
    'fabric',
    'fabric_sqm',
    'fabric_width',
    'fabric_drop',
  ],
  'roller_shutter_components': [
    'id',
    'job_tracking_action',
    'dispatch_action',
    'dispatch_date',
    'quote_no',
    'line_no',
    'order_item_code',
    'product',
    'business_name',
    'quote_ref',
  ],
  'external_blinds_components': [
    'id',
    'job_tracking_action',
    'dispatch_action',
    'dispatch_date',
    'quote_no',
    'line_no',
    'order_item_code',
    'product',
    'business_name',
    'quote_ref',
    'fabric',
    'fabric_sqm',
    'fabric_width',
    'fabric_drop',
  ],
};

// Door Screen Components - Group mappings
const DOOR_SCREEN_GROUPS: { [key: string]: string } = {
  'standard_door_frame': 'Standard Door Frame',
  'invisi_gard_door_frame': 'Invisi-Gard Door Frame',
  'screen_frame_37mm_x_11mm': 'Screen Frame 37mm x 11mm',
  'invisi_gard_screen_frame_37mm_x_11mm': 'Invisi-Gard Screen Frame 37mm x 11mm',
  'invisi_gard_screen_frame_37mm_x_9mm': 'Invisi-Gard Screen Frame 37mm x 9mm',
  'short_leg_frame': 'Short Leg Frame',
  'long_leg_frame': 'Long Leg Frame',
  '9mm_flyscreen_frame': '9mm Flyscreen Frame',
  '11mm_flyscreen_frame': '11mm Flyscreen Frame',
  'f_frame': 'F Frame',
  'z_frame': 'Z Frame',
  'high_step_z_frame': 'High Step Z Frame',
  'receiving_channel': 'Receiving Channel',
  't_mullion': 'T Mullion',
  'bug_strip': 'Bug Strip',
  'top_track': 'Top Track',
  'top_track_with_pip': 'Top Track with Pip',
  'bottom_fit_bottom_track': 'Bottom Fit Bottom Track',
  'face_fit_bottom_track': 'Face Fit Bottom Track',
  'h_channel': 'H Receiving Channel',
  'h_bottom_track': 'H Bottom Track',
  'mid_rail': 'Mid Rail',
  'invisi_gard_mid_rail': 'Invisi-Gard Mid Rail',
  'sill_winder_covers': 'Sill Winder Covers',
  'wedges': 'Wedges',
  'misc': 'Misc.',
  'triple_lock_kits': 'Triple Lock Kits',
  'corner_blocks': 'Corner Blocks',
  'flywire_parts': 'Flywire Parts',
  'door_closers': 'Door Closers',
  'hinged_handle': 'Hinged Handle',
  'push_2_go_locks': 'Push 2 Go Locks',
  'sliding_handle': 'Sliding Handle',
  'pet_doors': 'Pet Doors',
  'screen_mesh': 'Screen Mesh',
  'woven_stainless_steel_mesh': 'Woven Stainless Steel Mesh',
  'perforated_aluminium': 'Perforated Aluminium',
  'privacy_guard': 'Privacy Guard',
  'standard_diamond_grill_750_x_2050': 'Standard Diamond Grill 750 x 2050',
  'standard_diamond_grill_835_x_2050': 'Standard Diamond Grill 835 x 2050',
  'standard_diamond_grill_920_x_2050': 'Standard Diamond Grill 920 x 2050',
  'standard_diamond_grill_1200_x_2050': 'Standard Diamond Grill 1200 x 2050',
  'standard_diamond_grill_920_x_2450': 'Standard Diamond Grill 920 x 2450',
  'standard_diamond_grill_1200_x_2450': 'Standard Diamond Grill 1200 x 2450',
  'decorative_diamond_grill_770_x_2045': 'Decorative Diamond Grill 770 x 2045',
  'decorative_diamond_grill_900_x_2045': 'Decorative Diamond Grill 900 x 2045',
  'decorative_diamond_grill_1150_x_2050': 'Decorative Diamond Grill 1150 x 2050',
  'dva_mesh_700_x_2000': 'DVA Mesh 700 x 2000',
  'dva_mesh_825_x_2000': 'DVA Mesh 825 x 2000',
  'dva_mesh_900_x_2200': 'DVA Mesh 900 x 2200',
  'dva_mesh_1200_x_2200': 'DVA Mesh 1200 x 2200',
  'flyscreen_mesh': 'Flyscreen Mesh',
  'colonial_cast_sp13ab': 'Colonial Cast SP13AB',
  'colonial_cast_sp13bb': 'Colonial Cast SP13BB',
  'colonial_cast_sp14ab': 'Colonial Cast SP14AB',
  'colonial_cast_sp17ab': 'Colonial Cast SP17AB',
  'colonial_cast_sp27ab': 'Colonial Cast SP27AB',
  'colonial_cast_sp29ab': 'Colonial Cast SP29AB',
  'colonial_cast_sp34ab': 'Colonial Cast SP34AB',
  'colonial_cast_sp37ab': 'Colonial Cast SP37AB',
  'colonial_cast_sp52': 'Colonial Cast SP52',
  'colonial_cast_sp53': 'Colonial Cast SP53',
  'colonial_cast_sp55': 'Colonial Cast SP55',
  'colonial_cast_sp56': 'Colonial Cast SP56',
  'colonial_cast_sp65': 'Colonial Cast SP65',
  'colonial_cast_sp72': 'Colonial Cast SP72',
  'colonial_cast_sp74': 'Colonial Cast SP74',
  'colonial_cast_sp78': 'Colonial Cast SP78',
};

// Roller Blind Components - Group mappings (with __ separator)
const ROLLER_BLIND_GROUPS: { [key: string]: string } = {
  'tubes': 'Tubes',
  'base_rails': 'Base Rails',
  'base_rail_end_caps': 'Base Rail End Caps',
  'aluminium_pelmets': 'Aluminium Pelmets',
  'cassettes_back': 'Cassettes - Back',
  'square_cassettes_front': 'Square Cassettes - Front',
  'round_cassettes_front': 'Round Cassettes - Front',
  'cassettes_side_guides': 'Cassettes - Side Guides',
  'misc._pelmets': 'Misc. Pelmets',
  'box_120': 'Box 120',
  '38mm_chain_winders': '38mm Chain Winders',
  '38mm_fg_chain_winders': '38mm FG Chain Winders',
  '43mm_chain_winders': '43mm Chain Winders',
  '43mm_fg_chain_winders': '43mm FG Chain Winders',
  '43mm_idles': '43mm Idles',
  '40mm_brackets': '40mm Brackets',
  'single_extension_brackets': 'Single Extension Brackets',
  '40mm_motor_brackes': '40mm Motor Brackes',
  '55mm_motor_brackes': '55mm Motor Brackes',
  '40mm_bracket_covers': '40mm Bracket Covers',
  '55mm_bracket_covers': '55mm Bracket Covers',
  'dual_opposite_brackets': 'Dual Opposite Brackets',
  'dual_same_side_brackets': 'Dual Same Side Brackets',
  'dual_slimline_top_front_brackets': 'Dual Slimline Top Front Brackets',
  'dual_slimline_top_back_brackets': 'Dual Slimline Top Back Brackets',
  '40mm_link_brackets': '40mm Link Brackets',
  '55mm_link_brackets': '55mm Link Brackets',
  'dual_same_side_link_brackets': 'Dual Same Side Link Brackets',
  'dual_slimline_linked_top_blind_front_roll': 'Dual Slimline Linked Top Blind Front Roll',
  'dual_slimline_linked_top_blind_back_roll': 'Dual Slimline Linked Top Blind Back Roll',
  'metal_chains': 'Metal Chains',
  'plastic_chains_white': 'Plastic Chains - White',
  'plastic_chains_black': 'Plastic Chains - Black',
  'plastic_chains_cream': 'Plastic Chains - Cream',
  'plastic_chains_grey': 'Plastic Chains - Grey',
  'plastic_chains_barley': 'Plastic Chains - Barley',
  'stainless_steel_chains': 'Stainless Steel Chains',
  'helper_springs': 'Helper Springs',
  '43mm_link': '43mm Link',
  '60mm_link': '60mm Link',
  '38mm_springs': '38mm Springs',
  'spline': 'Spline',
  '60mm_parts': '60mm Parts',
  'chain_components': 'Chain Components',
  'acmeda_motors': 'Acmeda Motors',
  'somfy_motors': 'Somfy Motors',
  'becker_motors': 'Becker Motors',
  'acmeda_motors_accessories': 'Acmeda Motors - Accessories',
  'universal_disc_adaptors': 'Universal Disc Adaptors',
  'acmeda_6nm_motor_head': 'Acmeda 6nm Motor Head',
  'automate_60mm': 'Automate 60mm',
  'automate_ft_motor_adaptor_set': 'Automate FT Motor Adaptor Set',
  'somfy_40mm': 'Somfy 40mm',
  'somfy_50_crown': 'Somfy 50 Crown',
  'somfy_accessories': 'Somfy Accessories',
  'becker_40': 'Becker 40',
  'becker_m50_60mm_tube': 'Becker M50 - 60mm Tube',
  'adaptor_set': 'Adaptor Set',
  'acmeda_motor_remote_accessories': 'Acmeda Motor Remote Accessories',
  '12v_motor_covers': '12v Motor Covers',
  'acmeda_channel_remotes': 'Acmeda Channel Remotes',
  'acmeda_wall_mounted_white_remotes': 'Acmeda Wall Mounted White Remotes',
  'acmeda_push_pro_remotes': 'Acmeda Push Pro Remotes',
  'charging_cable': 'Charging Cable',
  'wall_charger': 'Wall Charger',
  'somfy_remotes': 'Somfy Remotes',
  'somfy_wall_mounted_smoove_white_remote': 'Somfy Wall Mounted Smoove White Remote',
  'somfy_wall_mounted_remote_cover_plate': 'Somfy Wall Mounted Remote Cover Plate',
  'app_connector': 'App Connector',
  'becker_remotes': 'Becker Remotes',
  'becker_wall_mounted_white_remote': 'Becker Wall Mounted  White Remote',
  'wall_switch': 'Wall Switch',
  'cassette_square_cover_set': 'Cassette Square Cover Set',
  'cassette_round_cover_set': 'Cassette Round Cover Set',
  'end_plate_set': 'End Plate Set',
  'square_cassette_chain_guide': 'Square Cassette Chain Guide',
  'round_cassette_chain_guide': 'Round Cassette Chain Guide',
  'cassette_side_guide': 'Cassette Side Guide',
  'cassette_side_guide_funnel': 'Cassette Side Guide Funnel',
  'cassette_side_guide_bottom_cap': 'Cassette Side Guide Bottom Cap',
  'valance_brackets': 'Valance Brackets',
  'valance_end_caps': 'Valance End Caps',
  'valance_spline': 'Valance Spline',
  'pelmet_95_end_caps': 'Pelmet 95 End Caps',
  'pelmet_95_brackets': 'Pelmet 95 Brackets',
  'mounting_rail_brackets': 'Mounting Rail Brackets',
  'box_120_parts': 'Box 120 Parts',
  'acmeda_motor_adaptor': 'Acmeda Motor Adaptor',
};

// Door Screen Components - Part Number mappings (with __ separator)
const DOOR_SCREEN_PART_NUMBERS: { [key: string]: string } = {
  'bottom_fit_bottom_track__apo_grey': 'CT/',
  'bug_strip__apo_grey': 'BUG/',
  'door_closers__black': '1308001-34',
  'door_closers__dune': '1308001-0K0',
  'door_closers__monument': '1308001-0DB',
  'door_closers__paperbark': '1308001-58',
  'door_closers__surfmist': '1308001-26',
  'door_closers__white': '1308001-10',
  'f_frame__apo_grey': 'FMI/',
  'h_bottom_track__monument': '1411077-0DB',
  'h_receiving_channel__monument': 'HT/MON',
  'high_step_z_frame__apo_grey': 'HIS/',
  'hinged_handle__black': '1308090-34',
  'hinged_handle__dune': '1308090-0K0',
  'hinged_handle__monument': '1308090-0DB',
  'hinged_handle__surfmist': '1308090-26',
  'hinged_handle__white': '1308090-10',
  'hinged_handle__woodland_grey_(green_tone)': '1308090-0A5',
  'invisi_gard_door_frame__apo_grey': '1409018-21',
  'invisi_gard_door_frame__black': '1409018-59',
  'invisi_gard_door_frame__custom_powdercoat': '1409018-',
  'invisi_gard_door_frame__dune': '1409018-0K0',
  'invisi_gard_door_frame__monument': '1409018-0DB',
  'invisi_gard_door_frame__paperbark': '1409018-58',
  'invisi_gard_door_frame__primrose': '1409018-12',
  'invisi_gard_door_frame__surfmist': '1409018-26',
  'invisi_gard_door_frame__white': '1409018-10',
  'invisi_gard_mid_rail__apo_grey': '1409015-',
  'invisi_gard_screen_frame_37mm_x_11mm__apo_grey': '1409005-',
  'invisi_gard_screen_frame_37mm_x_11mm__black': '1409005-59',
  'invisi_gard_screen_frame_37mm_x_11mm__woodland_grey_(green_tone)': '1409005-0A5',
  'invisi_gard_screen_frame_37mm_x_9mm__apo_grey': '1409010-',
  'long_leg_frame__apo_grey': 'LLB/',
  'mid_rail__apo_grey': 'JNR/',
  'misc.__lock_barrel': '1308774-0D4',
  'perforated_aluminium__1500_x_2400': '1408747-34',
  'pet_doors__small_black': 'DD',
  'push_2_go_locks__black': '1308101-34',
  'push_2_go_locks__paperbark': '1308106-58',
  'push_2_go_locks__woodland_grey_(green_tone)': '1308108-0A5',
  'receiving_channel__apo_grey': 'RC/',
  'screen_frame_37mm_x_11mm__apo_grey': 'WF/',
  'short_leg_frame__apo_grey': 'SLB/',
  'sliding_handle__black': '1308371-34',
  'sliding_handle__monument': '1308371-0DB',
  'sliding_handle__white': '1308371-10',
  'standard_door_frame__apo_grey': 'DF70',
  't_mullion__black': '1417338-59',
  't_mullion__custom_powdercoat': '1417338-',
  'triple_lock_kits__hinged_adjustable': '1308006-34',
  'triple_lock_kits__hinged_high': '1308092-99',
  'triple_lock_kits__hinged_low': '1308094-99',
  'triple_lock_kits__hinged_pool': '1308091-99',
  'triple_lock_kits__sliding_high': '1308441-99',
  'woven_stainless_steel_mesh__1200_x_2000': '1409210-59',
  'woven_stainless_steel_mesh__1200_x_2400': '1409230-59',
  'z_frame__apo_grey': 'LSI/',
};

// Roller Blind Components - Part Number mappings (289 entries)
const ROLLER_BLIND_PART_NUMBERS: { [key: string]: string } = {
  '12v_motor_covers__black': 'MT03-0502-059001',
  '12v_motor_covers__white': 'MT03-0502-077001',
  '38mm_chain_winders__barley': 'RB08-4002-283000',
  '38mm_chain_winders__birch_white': 'RB08-4002-269000',
  '38mm_chain_winders__black': 'RB08-4002-050000',
  '38mm_chain_winders__grey': 'RB08-4002-338000',
  '38mm_chain_winders__white': 'RB08-4002-069000',
  '38mm_fg_chain_winders__birch_white': 'RB07-4002-269070',
  '38mm_fg_chain_winders__black': 'RB07-4002-050070',
  '38mm_fg_chain_winders__grey': 'RB07-4002-338070',
  '38mm_fg_chain_winders__white': 'RB07-4002-069070',
  '38mm_springs__junior': 'RB01-4001-069000',
  '38mm_springs__senior': 'RB01-4002-069000',
  '40mm_bracket_covers__barley': 'RB08-4151-283040',
  '40mm_bracket_covers__birch_white': 'RB08-4151-269040',
  '40mm_bracket_covers__black': 'RB08-4151-050040',
  '40mm_bracket_covers__grey': 'RB08-4151-338040',
  '40mm_bracket_covers__white': 'RB08-4151-069040',
  '40mm_brackets__barley': 'RB08-8351-283040',
  '40mm_brackets__birch_white': 'RB08-8351-269040',
  '40mm_brackets__black': 'RB08-8351-050040',
  '40mm_brackets__grey': 'RB08-8351-338040',
  '40mm_brackets__white': 'RB08-8351-069040',
  '40mm_link_brackets__black': 'RB41-0353-050040',
  '40mm_link_brackets__cream': 'RB41-0353-269040',
  '40mm_link_brackets__white': 'RB41-0353-069040',
  '40mm_motor_brackes__black': 'RB40-8355-050040',
  '40mm_motor_brackes__white': 'RB40-8355-069040',
  '43mm_chain_winders__barley': 'RB08-4502-283000',
  '43mm_chain_winders__birch_white': 'RB08-4502-269000',
  '43mm_chain_winders__black': 'RB08-4502-050000',
  '43mm_chain_winders__grey': 'RB08-4502-338000',
  '43mm_chain_winders__white': 'RB08-4502-069000',
  '43mm_fg_chain_winders__birch_white': 'RB07-4502-269070',
  '43mm_fg_chain_winders__black': 'RB07-4502-050070',
  '43mm_fg_chain_winders__grey': 'RB07-4502-338070',
  '43mm_fg_chain_winders__white': 'RB07-4502-069070',
  '43mm_idles__black': 'RB08-0503-050045',
  '43mm_idles__white': 'RB08-0503-069045',
  '43mm_link__female_black': 'RB41-1001-050045',
  '43mm_link__female_white': 'RB41-1001-069045',
  '43mm_link__male_black': 'RB41-1002-050045',
  '43mm_link__male_white': 'RB41-1002-069045',
  '55mm_bracket_covers__birch_white': 'RB08-4151-269055',
  '55mm_bracket_covers__black': 'RB08-4151-050055',
  '55mm_bracket_covers__grey': 'RB08-4151-338055',
  '55mm_bracket_covers__white': 'RB08-4151-069055',
  '55mm_link_brackets__birch_white': 'RB41-0353-269055',
  '55mm_link_brackets__black': 'RB41-0353-050055',
  '55mm_link_brackets__white': 'RB41-0353-069055',
  '55mm_motor_brackes__black': 'RB40-8355-050055',
  '55mm_motor_brackes__white': 'RB40-8355-069055',
  '60mm_parts__idle_bracket_white': 'RB10-6500-069001',
  '60mm_parts__idle_white': 'RB56-1001-061060',
  'acmeda_6nm_motor_head__adaptor': 'RB56-0711-050509',
  'acmeda_6nm_motor_head__plate': 'RB40-1402-069401',
  'acmeda_channel_remotes__1_channel_black': 'MT02-0101-050004',
  'acmeda_channel_remotes__1_channel_white': 'MT02-0101-067004',
  'acmeda_channel_remotes__15_channel_black': 'MT02-0101-050008',
  'acmeda_channel_remotes__15_channel_white': 'MT02-0101-067008',
  'acmeda_channel_remotes__5_channel_black': 'MT02-0101-050004',
  'acmeda_channel_remotes__5_channel_white': 'MT02-0101-067004',
  'acmeda_motor_adaptor__10nm,_12v_white': 'RB56-0701-069518',
  'acmeda_motor_remote_accessories__1_channel_dry_contact_relay_module': 'MT03-0502-077001',
  'acmeda_motor_remote_accessories__1200mm_extension_charging_cable': 'MT03-0301-411005',
  'acmeda_motor_remote_accessories__210mm_extension_charging_cable': 'MT03-0301-069014',
  'acmeda_motor_remote_accessories__acmeda_3nm_&_10nm_charging_cable': 'MTDCB-CHARGE-AU',
  'acmeda_motor_remote_accessories__acmeda_charging_cable': 'MT03-0301-069016',
  'acmeda_motor_remote_accessories__acmeda_external_battery_for_dcrf_motors': 'MT03-0305-000001',
  'acmeda_motor_remote_accessories__acmeda_power_panel_for_dcrf_motors': 'MT03-0301-411005',
  'acmeda_motor_remote_accessories__acmeda_solar_panel': 'MT03-0302-067001',
  'acmeda_motor_remote_accessories__pulse_pro_automation_hub': 'MT02-0401-067001',
  'acmeda_motor_remote_accessories__usb_repeater': 'MT03-0502-059001',
  'acmeda_motors__0.7nm,12v': 'MT01-1325-069032',
  'acmeda_motors__1.1nm,_12v_dcrf': 'MT01-1225-069004',
  'acmeda_motors__1.1nm,12v': 'MT01-1325-069033',
  'acmeda_motors__2nm,12v': 'MT01-1328-069009',
  'acmeda_motors__e6': 'MT01-1135-069001',
  'acmeda_motors__standard_external_motor': 'MT01-1145-050001',
  'acmeda_motors_accessories__43mm_1.1nm,_12v_crown_&_drive_kit': 'MT03-0103-069004',
  'acmeda_motors_accessories__43mm_2nm,_12v_motor_crown_&_drive_kit': 'MT03-0103-069005',
  'acmeda_motors_accessories__60/80mm_tube_10nm,_12v_motor_drive_wheel': 'RB56-0105-050502',
  'acmeda_motors_accessories__60mm_tube_10nm,_12v_motor_crown': 'MTCRDR-35-S45',
  'acmeda_motors_accessories__6nm,_12v_motor_crown_&_drive_kit': 'MTCRDR-35-S45',
  'acmeda_motors_accessories__80mm_tube_10nm,_12v_motor_crown': 'RB56-0138-050508',
  'acmeda_push_pro_remotes__black': 'MT02-0101-050013',
  'acmeda_push_pro_remotes__white': 'MT02-0101-067013',
  'acmeda_wall_mounted_white_remotes__1_channel': 'MTRF-WS-1C',
  'acmeda_wall_mounted_white_remotes__15_channel': 'MTRF-WS-15',
  'acmeda_wall_mounted_white_remotes__2_channel': 'MTRF-WS-2C',
  'acmeda_wall_mounted_white_remotes__5_channel': 'MTRF-WS5-FLUSH',
  'adaptor_set__m50_somfy/becker_motor_head_adaptor_set': 'RB56-7103-069060',
  'aluminium_pelmets__anodised_silver': 'RB88-0150-020580',
  'aluminium_pelmets__black': 'RB88-0150-050580',
  'aluminium_pelmets__white': 'RB88-0150-069580',
  'app_connector__somfy_connexoon_app_connector': '1811591',
  'automate_60mm__crown': 'RB56-0136-050508',
  'automate_60mm__drive': 'RB56-0105-050502',
  'automate_ft_motor_adaptor_set__black': 'RB56-0701-050508',
  'automate_ft_motor_adaptor_set__somfy_43mm_12v_crown_&_drive': '9021018',
  'automate_ft_motor_adaptor_set__white': 'RB56-0701-069508',
  'base_rail_end_caps__anodised_silver': 'RB91-2131-338002',
  'base_rail_end_caps__black': 'RB91-2131-050002',
  'base_rail_end_caps__bone': 'RB91-2131-280002',
  'base_rail_end_caps__cream': 'RB91-2131-269002',
  'base_rail_end_caps__lath': 'B0-RB020',
  'base_rail_end_caps__weight_bar': 'VB05-0301-025300',
  'base_rail_end_caps__white': 'RB91-2131-069002',
  'base_rails__anodised_silver': 'RB91-1233-020580',
  'base_rails__black': 'RB91-1233-150580',
  'base_rails__bone': 'RB91-1233-280580',
  'base_rails__cream': 'RB91-1233-269580',
  'base_rails__white': 'RB91-1233-169580',
  'becker_40__crown': 'RB40-0134-050406',
  'becker_40__drive': 'RB40-0105-050406',
  'becker_m50_60mm_tube__crown': 'RB56-0136-050506',
  'becker_m50_60mm_tube__drive_wheel': 'RB56-0105-050506',
  'becker_motors__becker_molex_connection': 'molexconnection',
  'becker_motors__becker_p4_30_c12a_motor': '2009 130 124 0',
  'becker_motors__becker_r20_17_c12a_motor': '2020 130 156 0',
  'becker_remotes__1_channel_black': '4034 000 920 1',
  'becker_remotes__1_channel_white': '4034 000 920 0',
  'becker_remotes__10_channel_black': '4034 000 922 1',
  'becker_remotes__10_channel_white': '4034 000 922 0',
  'becker_remotes__5_channel_black': '4034 000 921 1',
  'becker_remotes__5_channel_white': '4034 000 921 0',
  'becker_wall_mounted_white_remote__becker_wall_mounted_5_channel_white_remote': '4034 000 909',
  'becker_wall_mounted_white_remote__becker_wall_mounted_single_channel_white_remote': '4034 000 908 0',
  'box_120_parts__chain_guide_black': 'SB11-0790-050000',
  'box_120_parts__chain_winder_adaptor': 'RB56-7109-050060',
  'box_120_parts__end_plate_cover_set_black': 'SB02-1220-050020',
  'box_120_parts__end_plate_set': 'SB02-1201-025020',
  'cassette_round_cover_set__black': 'RC01-0102-050480',
  'cassette_round_cover_set__white': 'RC01-0102-069480',
  'cassette_side_guide__ears': 'RC91-0302-338000',
  'cassette_side_guide__locks': 'RC91-0201-050000',
  'cassette_side_guide_bottom_cap__white': 'RC91-1001-069000',
  'cassette_side_guide_funnel__black': 'RC91-1002-050000',
  'cassette_side_guide_funnel__white': 'RC91-1002-069000',
  'cassette_square_cover_set__black': 'RC02-0103-050090',
  'cassette_square_cover_set__white': 'RC02-0103-069090',
  'cassettes_back__black': 'RC01-0101-050480',
  'cassettes_back__white': 'RC01-0101-069480',
  'cassettes_side_guides__black': 'RC91-0101-050580',
  'cassettes_side_guides__white': 'RC91-0101-069580',
  'chain_components__chain_safe': 'SS91-1312-001040',
  'chain_components__stopper_balls': 'VA92-1012-001000',
  'charging_cable__acmeda_push_pro': 'MT03-0301-069026',
  'dual_opposite_brackets__barley': 'RB08-8380-283115',
  'dual_opposite_brackets__birch_white': 'RB08-8380-269115',
  'dual_opposite_brackets__black': 'RB08-8380-050115',
  'dual_opposite_brackets__grey': 'RB08-8380-338115',
  'dual_opposite_brackets__white': 'RB08-8380-069115',
  'dual_same_side_brackets__barley': 'RB08-8384-283122',
  'dual_same_side_brackets__birch_white': 'RB08-8384-269122',
  'dual_same_side_brackets__black': 'RB08-8384-05012',
  'dual_same_side_brackets__grey': 'RB08-8384-338122',
  'dual_same_side_brackets__white': 'RB08-8384-069122',
  'dual_same_side_link_brackets__black': 'RB41-0384-050122',
  'dual_same_side_link_brackets__grey': 'RB41-0384-338122',
  'dual_same_side_link_brackets__white': 'RB41-0384-069122',
  'dual_slimline_linked_top_blind_front_roll__birch_white': 'RB41-8395-269148',
  'dual_slimline_linked_top_blind_front_roll__black': 'RB41-8395-050148',
  'dual_slimline_linked_top_blind_front_roll__grey': 'RB41-8395-338148',
  'dual_slimline_linked_top_blind_front_roll__white': 'RB41-8395-069148',
  'dual_slimline_top_back_brackets__birch_white_lhs': 'RB08-8397-269148',
  'dual_slimline_top_back_brackets__birch_white_rhs': 'RB08-8398-269148',
  'dual_slimline_top_back_brackets__black_lhs': 'RB08-8397-050148',
  'dual_slimline_top_back_brackets__black_rhs': 'RB08-8398-050148',
  'dual_slimline_top_back_brackets__grey_lhs': 'RB08-8397-338148',
  'dual_slimline_top_back_brackets__grey_rhs': 'RB08-8398-338148',
  'dual_slimline_top_back_brackets__white_lhs': 'RB08-8397-069148',
  'dual_slimline_top_back_brackets__white_rhs': 'RB08-8398-069148',
  'dual_slimline_top_front_brackets__birch_white_lhs': 'RB08-8395-269148',
  'dual_slimline_top_front_brackets__birch_white_rhs': 'RB08-8396-269148',
  'dual_slimline_top_front_brackets__black_lhs': 'RB08-8395-050148',
  'dual_slimline_top_front_brackets__black_rhs': 'RB08-8396-050148',
  'dual_slimline_top_front_brackets__grey_lhs': 'RB08-8395-338148',
  'dual_slimline_top_front_brackets__grey_rhs': 'RB08-8396-338148',
  'dual_slimline_top_front_brackets__white_lhs': 'RB08-8395-069148',
  'dual_slimline_top_front_brackets__white_rhs': 'RB08-8396-069148',
  'end_plate_set__cassette_end_plate_set': 'RC02-0101-338090',
  'helper_springs__43mm_lhs': 'RB04-4392-393001',
  'helper_springs__43mm_rhs': 'RB04-4392-338002',
  'helper_springs__60mm_lhs': 'RB10-6040-050041',
  'helper_springs__60mm_rhs': 'RB10-6040-050042',
  'metal_chains__100cm': 'VA01-1401-S20100',
  'metal_chains__125cm': 'VA01-1401-S20125',
  'metal_chains__150cm': 'VA01-1401-S20150',
  'metal_chains__175cm': 'VA01-1401-S20175',
  'metal_chains__200cm': 'VA01-1401-S20200',
  'metal_chains__50cm': 'VA01-1401-S20050',
  'metal_chains__75cm': 'VA01-1401-S20075',
  'misc._pelmets__aluminium_valance_anodised_silver': 'RB88-1011-020480',
  'mounting_rail_brackets__screws': 'screws',
  'pelmet_95_end_caps__black': 'RB88-0101-050001',
  'pelmet_95_end_caps__cream': 'RB88-0101-269001',
  'pelmet_95_end_caps__grey': 'RB88-0101-338001',
  'pelmet_95_end_caps__white': 'RB88-0101-069001',
  'plastic_chains_barley__100cm': 'VA01-1406-283100',
  'plastic_chains_barley__125cm': 'VA01-1406-283125',
  'plastic_chains_barley__150cm': 'VA01-1406-283150',
  'plastic_chains_barley__175cm': 'VA01-1406-283175',
  'plastic_chains_barley__200cm': 'VA01-1406-283200',
  'plastic_chains_barley__225cm': 'VA01-1406-283225',
  'plastic_chains_barley__250cm': 'VA01-1406-283250',
  'plastic_chains_barley__50cm': 'VA01-1406-283050',
  'plastic_chains_barley__75cm': 'VA01-1406-283075',
  'plastic_chains_black__100cm': 'VA01-1406-050100',
  'plastic_chains_black__125cm': 'VA01-1406-050125',
  'plastic_chains_black__150cm': 'VA01-1406-050150',
  'plastic_chains_black__175cm': 'VA01-1406-050175',
  'plastic_chains_black__200cm': 'VA01-1406-050200',
  'plastic_chains_black__50cm': 'VA01-1406-050050',
  'plastic_chains_black__75cm': 'VA01-1406-050075',
  'plastic_chains_cream__100cm': 'VA01-1406-412100',
  'plastic_chains_cream__125cm': 'VA01-1406-412125',
  'plastic_chains_cream__150cm': 'VA01-1406-412150',
  'plastic_chains_cream__175cm': 'VA01-1406-412175',
  'plastic_chains_cream__200cm': 'VA01-1406-412200',
  'plastic_chains_cream__225cm': 'VA01-1406-412225',
  'plastic_chains_cream__50cm': 'VA01-1406-412050',
  'plastic_chains_cream__75cm': 'VA01-1406-412075',
  'plastic_chains_grey__100cm': 'VA01-1406-338100',
  'plastic_chains_grey__125cm': 'VA01-1406-338125',
  'plastic_chains_grey__150cm': 'VA01-1406-338150',
  'plastic_chains_grey__175cm': 'VA01-1406-338175',
  'plastic_chains_grey__200cm': 'VA01-1406-338200',
  'plastic_chains_grey__50cm': 'VA01-1406-338050',
  'plastic_chains_grey__75cm': 'VA01-1406-338075',
  'plastic_chains_white__100cm': 'VA01-1406-069100',
  'plastic_chains_white__125cm': 'VA01-1406-069125',
  'plastic_chains_white__150cm': 'VA01-1406-069150',
  'plastic_chains_white__175cm': 'VA01-1406-069175',
  'plastic_chains_white__200cm': 'VA01-1406-069200',
  'plastic_chains_white__250cm': 'VA01-1406-069250',
  'plastic_chains_white__50cm': 'VA01-1406-069050',
  'plastic_chains_white__75cm': 'VA01-1406-069075',
  'single_extension_brackets__birch_white': 'RB08-8353-269055',
  'single_extension_brackets__black': 'RB08-8353-050055',
  'single_extension_brackets__grey': 'RB08-8353-338055',
  'single_extension_brackets__white': 'RB08-8353-069055',
  'somfy_40mm__crown': 'RB40-0234-050401',
  'somfy_40mm__drive': 'RB40-0205-050401',
  'somfy_50_crown__60mm_tube': 'RB56-0236-050501',
  'somfy_50_crown__80mm_tube': 'RB56-0238-050501',
  'somfy_accessories__m50_somfy_motor_head_adaptor_plate': 'RB56-0706-050050',
  'somfy_accessories__m50_somfy/becker_motor_head_adaptor_set': 'RB56-0711-050501',
  'somfy_accessories__somfy_50_drive_60mm/80mm_tube': 'RB56-0205-050511',
  'somfy_accessories__universal_zamack_bracket': 'RB56-0752-025050',
  'somfy_motors__somfy_12v_remote_sonesse_motor': '1240512',
  'somfy_motors__sonesse_40_rts_3/30_with_inline_connector_motor': '1002091',
  'somfy_remotes__1_channel_silver': '1800460',
  'somfy_remotes__1_channel_white': '1800459',
  'somfy_remotes__15_channel_black': '1811021',
  'somfy_remotes__15_channel_white': '1811020',
  'somfy_remotes__2_channel_silver': '1811419',
  'somfy_remotes__2_channel_white': '1811418',
  'somfy_remotes__5_channel_silver': '1811421',
  'somfy_remotes__5_channel_white': '1871415',
  'somfy_wall_mounted_remote_cover_plate__black': '9015023',
  'somfy_wall_mounted_remote_cover_plate__silver': '9015025',
  'somfy_wall_mounted_remote_cover_plate__somfy_12v_charger': '9025165',
  'somfy_wall_mounted_smoove_white_remote__1_channel': '1811045',
  'somfy_wall_mounted_smoove_white_remote__2_channel': '1800223',
  'somfy_wall_mounted_smoove_white_remote__5_channel': '1800295',
  'spline__15mm_spline': 'RB92-1502-001075',
  'square_cassette_chain_guide__right': 'RC02-0202-001090',
  'square_cassettes_front__black': 'RC01-0103-050480',
  'square_cassettes_front__white': 'RC01-0103-069480',
  'stainless_steel_chains__100cm': 'VA01-1401-X10100',
  'stainless_steel_chains__125cm': 'VA01-1401-X10125',
  'stainless_steel_chains__150cm': 'VA01-1401-X10150',
  'stainless_steel_chains__175cm': 'VA01-1401-X10175',
  'stainless_steel_chains__200cm': 'VA01-1401-X10200',
  'stainless_steel_chains__50cm': 'VA01-1401-X10050',
  'stainless_steel_chains__75cm': 'VA01-1401-X10075',
  'tubes__38mm_tube': 'RB93-6440-000582',
  'tubes__43mm_heavy_duty_tube': 'RB93-6449-000580',
  'tubes__43mm_tube': 'RB93-6444-000580',
  'tubes__60mm_tube': 'RB91-6260-000360',
  'universal_disc_adaptors__m40': 'RB40-0402-050400',
  'universal_disc_adaptors__m50': 'RB56-0711-069519',
  'valance_end_caps__black': 'RB88-1021-050100',
  'valance_end_caps__cream': 'RB88-1021-269100',
  'valance_end_caps__grey': 'RB88-1021-338100',
  'valance_end_caps__white': 'RB88-1021-069100',
  'valance_spline__round_rubber': 'SS91-5246-050300',
  'wall_charger__acmeda_automate_wall_charger': 'MT03-0301-069011',
};

// Roller Shutter Components - Group mappings
const ROLLER_SHUTTER_GROUPS: { [key: string]: string } = {
  'perforated_slat': 'Perforated Slat',
  'unperforated_slat': 'Unperforated Slat',
  '180mm_pelmet_back_and_cover': '180mm Pelmet Back & Cover',
  '205mm_pelmet_back_and_cover': '205mm Pelmet Back & Cover',
  '230mm_pelmet_back_and_cover': '230mm Pelmet Back & Cover',
  'bay_window_flashing': 'Bay Window Flashing',
  '25mm_x_25mm_angle': '25mm x 25mm Angle',
  '25mm_x_50mm_angle': '25mm x 50mm Angle',
  '25mm_x_70mm_angle': '25mm x 70mm Angle',
  '50mm_x_50mm_square_tube': '50mm x 50mm Square Tube',
  'axle': 'Axle',
  'bottom_bar': 'Bottom Bar',
  'standard_side_guides': 'Standard Side Guides',
  '68mm_side_guides': '68mm Side Guides',
  '180mm_side_frames': '180mm Side Frames',
  '205mm_side_frames': '205mm Side Frames',
  '230mm_side_frames': '230mm Side Frames',
  'misc': 'Misc.',
  'manual_override_parts': 'Manual Override Parts',
  'hole_caps': 'Hole Caps',
  'maxim': 'Maxim',
  'cwp': 'CWP',
  '12v': '12v',
  'acmeda': 'Acmeda',
  'becker': 'Becker',
  'somfy': 'Somfy',
};

// External Blinds Components - Group mappings
const EXTERNAL_BLINDS_GROUPS: { [key: string]: string } = {
  'colourbond_under_roll_hooding': 'Colourbond Under-Roll Hooding',
  'colourbond_under_roll_hood_ends': 'Colourbond Under-Roll Hood Ends',
  'colourbond_under_roll_hood_ends_with_holes': 'Colourbond Under-Roll Hood Ends with Holes',
  'colourbond_over_roll_hooding': 'Colourbond Over-Roll Hooding',
  'colourbond_over_roll_hood_ends': 'Colourbond Over-Roll Hood Ends',
  'colourbond_over_roll_hood_ends_with_holes': 'Colourbond Over-Roll Hood Ends with Holes',
  'tubes': 'Tubes',
  'drives_and_idles': 'Drives & Idles',
  '5_sided_bottom_rail': '5 Sided Bottom Rail',
  'misc': 'Misc.',
  'springs': 'Springs',
  'auto_guide': 'Auto Guide',
  'auto_guide_stainless_steel': 'Auto Guide Stainless Steel',
  'auto_arm': 'Auto Arm',
  'auto_arm_stainless_steel': 'Auto Arm Stainless Steel',
  'brackets': 'Brackets',
  'pull_stick': 'Pull Stick',
  'gearboxes': 'Gearboxes',
  'crank_handle': 'Crank Handle',
  'fixed_guide': 'Fixed Guide',
  'fixed_guide_stainless_steel': 'Fixed Guide Stainless Steel',
  'l_bracket': 'L Bracket',
  'fixed_guide_pulley': 'Fixed Guide Pulley',
  'gearbox_brackets': 'Gearbox Brackets',
  'u_bracket_stand_out': 'U Bracket Stand Out',
  'guide_stand_out': 'Guide Stand Out',
  'hood_stand_out': 'Hood Stand Out',
  'spline': 'Spline',
  'verticali': 'Verticali',
  'zipscreen': 'Zipscreen',
  'acmeda_motors': 'Acmeda Motors',
  'acmeda_controls': 'Acmeda Controls',
  'becker_motors': 'Becker Motors',
  'somfy_motors': 'Somfy Motors',
  'pivot_arm': 'Pivot Arm',
  'wire_guide': 'Wire Guide',
};

// External Blinds Components - Part Number mappings (from CSV)
const EXTERNAL_BLINDS_PART_NUMBERS: { [key: string]: string } = {
  'colourbond_under_roll_hooding__zinc': '',
  'colourbond_under_roll_hooding__black': '',
  'colourbond_under_roll_hooding__caulfield_green': '',
  'colourbond_under_roll_hooding__charcoal': '',
  'colourbond_under_roll_hooding__dune': '',
  'colourbond_under_roll_hooding__heritage_red': '',
  'colourbond_under_roll_hooding__ironstone': '',
  'colourbond_under_roll_hooding__jasper': '',
  'colourbond_under_roll_hooding__merino': '',
  'colourbond_under_roll_hooding__mist_green': '',
  'colourbond_under_roll_hooding__mountain_blue': '',
  'colourbond_under_roll_hooding__primrose': '',
  'colourbond_under_roll_hooding__shale_grey': '',
  'colourbond_under_roll_hooding__slate_grey': '',
  'colourbond_under_roll_hooding__surfmist': '',
  'colourbond_under_roll_hooding__white': '',
  'colourbond_under_roll_hood_ends__zinc': '',
  'colourbond_under_roll_hood_ends__black': '',
  'colourbond_under_roll_hood_ends__caulfield_green': '',
  'colourbond_under_roll_hood_ends__charcoal': '',
  'colourbond_under_roll_hood_ends__dune': '',
  'colourbond_under_roll_hood_ends__heritage_red': '',
  'colourbond_under_roll_hood_ends__ironstone': '',
  'colourbond_under_roll_hood_ends__jasper': '',
  'colourbond_under_roll_hood_ends__merino': '',
  'colourbond_under_roll_hood_ends__mist_green': '',
  'colourbond_under_roll_hood_ends__mountain_blue': '',
  'colourbond_under_roll_hood_ends__primrose': '',
  'colourbond_under_roll_hood_ends__shale_grey': '',
  'colourbond_under_roll_hood_ends__slate_grey': '',
  'colourbond_under_roll_hood_ends__surfmist': '',
  'colourbond_under_roll_hood_ends__white': '',
  'colourbond_under_roll_hood_ends_with_holes__zinc': '',
  'colourbond_under_roll_hood_ends_with_holes__black': '',
  'colourbond_under_roll_hood_ends_with_holes__caulfield_green': '',
  'colourbond_under_roll_hood_ends_with_holes__charcoal': '',
  'colourbond_under_roll_hood_ends_with_holes__dune': '',
  'colourbond_under_roll_hood_ends_with_holes__heritage_red': '',
  'colourbond_under_roll_hood_ends_with_holes__ironstone': '',
  'colourbond_under_roll_hood_ends_with_holes__jasper': '',
  'colourbond_under_roll_hood_ends_with_holes__merino': '',
  'colourbond_under_roll_hood_ends_with_holes__mist_green': '',
  'colourbond_under_roll_hood_ends_with_holes__mountain_blue': '',
  'colourbond_under_roll_hood_ends_with_holes__primrose': '',
  'colourbond_under_roll_hood_ends_with_holes__shale_grey': '',
  'colourbond_under_roll_hood_ends_with_holes__slate_grey': '',
  'colourbond_under_roll_hood_ends_with_holes__surf_mist': '',
  'colourbond_under_roll_hood_ends_with_holes__white': '',
  'colourbond_over_roll_hooding__zinc': '',
  'colourbond_over_roll_hooding__black': '',
  'colourbond_over_roll_hooding__caulfield_green': '',
  'colourbond_over_roll_hooding__charcoal': '',
  'colourbond_over_roll_hooding__dune': '',
  'colourbond_over_roll_hooding__heritage_red': '',
  'colourbond_over_roll_hooding__ironstone': '',
  'colourbond_over_roll_hooding__jasper': '',
  'colourbond_over_roll_hooding__merino': '',
  'colourbond_over_roll_hooding__mist_green': '',
  'colourbond_over_roll_hooding__mountain_blue': '',
  'colourbond_over_roll_hooding__primrose': '',
  'colourbond_over_roll_hooding__shale_grey': '',
  'colourbond_over_roll_hooding__slate_grey': '',
  'colourbond_over_roll_hooding__surfmist': '',
  'colourbond_over_roll_hooding__white': '',
  'colourbond_over_roll_hood_ends__zinc': '',
  'colourbond_over_roll_hood_ends__black': '',
  'colourbond_over_roll_hood_ends__caulfield_green': '',
  'colourbond_over_roll_hood_ends__charcoal': '',
  'colourbond_over_roll_hood_ends__dune': '',
  'colourbond_over_roll_hood_ends__heritage_red': '',
  'colourbond_over_roll_hood_ends__ironstone': '',
  'colourbond_over_roll_hood_ends__jasper': '',
  'colourbond_over_roll_hood_ends__merino': '',
  'colourbond_over_roll_hood_ends__mist_green': '',
  'colourbond_over_roll_hood_ends__mountain_blue': '',
  'colourbond_over_roll_hood_ends__primrose': '',
  'colourbond_over_roll_hood_ends__shale_grey': '',
  'colourbond_over_roll_hood_ends__slate_grey': '',
  'colourbond_over_roll_hood_ends__surf_mist': '',
  'colourbond_over_roll_hood_ends__white': '',
  'colourbond_over_roll_hood_ends_with_holes__zinc': '',
  'colourbond_over_roll_hood_ends_with_holes__black': '',
  'colourbond_over_roll_hood_ends_with_holes__caulfield_green': '',
  'colourbond_over_roll_hood_ends_with_holes__charcoal': '',
  'colourbond_over_roll_hood_ends_with_holes__dune': '',
  'colourbond_over_roll_hood_ends_with_holes__heritage_red': '',
  'colourbond_over_roll_hood_ends_with_holes__ironstone': '',
  'colourbond_over_roll_hood_ends_with_holes__jasper': '',
  'colourbond_over_roll_hood_ends_with_holes__merino': '',
  'colourbond_over_roll_hood_ends_with_holes__mist_green': '',
  'colourbond_over_roll_hood_ends_with_holes__mountain_blue': '',
  'colourbond_over_roll_hood_ends_with_holes__primrose': '',
  'colourbond_over_roll_hood_ends_with_holes__shale_grey': '',
  'colourbond_over_roll_hood_ends_with_holes__slate_grey': '',
  'colourbond_over_roll_hood_ends_with_holes__surf_mist': '',
  'colourbond_over_roll_hood_ends_with_holes__white': '',
  'tubes__50mm_tube': '',
  'tubes__63mm_tube': '',
  'tubes__70mm_tube': '',
  'tubes__78mm_tube': '',
  'tubes__85mm_tube': '',
  'drives_and_idles__50mm_drive_end': '',
  'drives_and_idles__50mm_idle_with_hole': '',
  'drives_and_idles__63mm_drive_end': '',
  'drives_and_idles__63mm_idle_with_hole': '',
  'drives_and_idles__70mm_drive_end': '',
  'drives_and_idles__70mm_idle_with_hole': '',
  'drives_and_idles__78mm_drive_end': '',
  'drives_and_idles__78mm_idle_with_hole': '',
  'drives_and_idles__85mm_drive_end': '',
  'drives_and_idles__85mm_idle_with_hole': '',
  '5_sided_bottom_rail__zinc': '',
  '5_sided_bottom_rail__black': '',
  '5_sided_bottom_rail__caulfield_green': '',
  '5_sided_bottom_rail__charcoal': '',
  '5_sided_bottom_rail__dune': '',
  '5_sided_bottom_rail__heritage_red': '',
  '5_sided_bottom_rail__ironstone': '',
  '5_sided_bottom_rail__jasper': '',
  '5_sided_bottom_rail__merino': '',
  '5_sided_bottom_rail__mist_green': '',
  '5_sided_bottom_rail__mountain_blue': '',
  '5_sided_bottom_rail__primrose': '',
  '5_sided_bottom_rail__shale_grey': '',
  '5_sided_bottom_rail__slate_grey': '',
  '5_sided_bottom_rail__surf_mist': '',
  '5_sided_bottom_rail__white': '',
  'misc__pivot_pin_and_plate': '',
  'misc__pivot_pin_and_plate_stainless_steel': '',
  'misc__5_sided_bottom_rail_pull_ring': '',
  'misc__5_sided_bottom_rail_end_cap': '',
  'misc__u_bracket': '',
  'misc__u_bracket_stainless_steel': '',
  'misc__guide_end_cap': '',
  'misc__side_fix_bracket_for_guide': '',
  'misc__side_fix_bracket_for_u_bracket': '',
  'misc__telescopic_corner_bracket_small': '',
  'misc__telescopic_corner_bracket_universal': '',
  'misc__fixed_guide_runners': '',
  'misc__fixed_guide_pulleys': '',
  'misc__fixed_guide_cleats': '',
  'misc__sash_cord_black': '',
  'misc__sash_cord_white': '',
  'misc__50mm_round_end_cap': '',
  'misc__stainless_steel_cable': '',
  'misc__stainless_steel_l_bracket': '',
  'misc__stainless_steel_bush_bottom_fix': '',
  'misc__stainless_steel_bush_top_fix': '',
  'misc__stainless_steel_deck_plate': '',
  'misc__chain_adaptor': '',
  'misc__chain_adaptor_stainless_steel': '',
  'misc__stainless_steel_drop_path_ring': '',
  'misc__stainless_steel_double_swivel_dog_clip': 'SSSDSH',
  'misc__stainless_steel_saddle': '',
  'misc__stainless_steel': '',
  'misc__fixed_guide_12mm_ballast': '',
  'springs__50mm_small_spring': '',
  'springs__50mm_standard_spring': 'AC150-A630MKII',
  'springs__63mm_spring': '',
  'auto_guide__900mm': '',
  'auto_guide__1050mm': '',
  'auto_guide__1200mm': '',
  'auto_guide__1350mm': '',
  'auto_guide__1500mm': '',
  'auto_guide__1650mm': '',
  'auto_guide__1800mm': '',
  'auto_guide__1950mm': '',
  'auto_guide__2100mm': '',
  'auto_guide__2400mm': '',
  'auto_guide__2700mm': '',
  'auto_guide__3000mm': '',
  'auto_guide_stainless_steel__900mm': '',
  'auto_guide_stainless_steel__1050mm': '',
  'auto_guide_stainless_steel__1200mm': '',
  'auto_guide_stainless_steel__1350mm': '',
  'auto_guide_stainless_steel__1500mm': '',
  'auto_guide_stainless_steel__1650mm': '',
  'auto_guide_stainless_steel__1800mm': '',
  'auto_guide_stainless_steel__1950mm': '',
  'auto_guide_stainless_steel__2100mm': '',
  'auto_guide_stainless_steel__2400mm': '',
  'auto_guide_stainless_steel__2700mm': '',
  'auto_guide_stainless_steel__3000mm': '',
  'auto_arm__150mm': 'AC380B-150',
  'auto_arm__225mm': 'AC380B-225',
  'auto_arm__300mm': 'AC380B-300',
  'auto_arm__450mm': 'AC380B-450',
  'auto_arm__600mm': 'AC380B-600',
  'auto_arm__900mm': 'AC380B-900',
  'auto_arm_stainless_steel__150mm': 'AC380SS-150',
  'auto_arm_stainless_steel__225mm': 'AC380SS-225',
  'auto_arm_stainless_steel__300mm': 'AC380SS-300',
  'auto_arm_stainless_steel__600mm': 'AC380SS-600',
  'brackets__spring_brackets': 'AC140-75U',
  'brackets__spring_brackets_stainless_steel': 'AC140SS-75U',
  'pull_stick__pull_stick_1500mm_white': '',
  'pull_stick__pull_stick_white_lengths': '',
  'pull_stick__pull_stick_hook': '',
  'pull_stick__pull_stick_end_cap': '',
  'gearboxes__black': '',
  'gearboxes__white': '',
  'crank_handle__black_1000mm': '',
  'crank_handle__black_1200mm': '',
  'crank_handle__black_1500mm': '',
  'crank_handle__black_1800mm': '',
  'crank_handle__black_2200mm': '',
  'crank_handle__black_2500mm': '',
  'crank_handle__black_3000mm': '',
  'crank_handle__white_1000mm': '',
  'crank_handle__white_1200mm': '',
  'crank_handle__white_1500mm': '',
  'crank_handle__white_1800mm': '',
  'crank_handle__white_2200mm': '',
  'crank_handle__white_2500mm': '',
  'crank_handle__white_3000mm': '',
  'fixed_guide__900mm': 'AC460-900',
  'fixed_guide__1200mm': 'AC460-1200',
  'fixed_guide__1500mm': 'AC460-1500',
  'fixed_guide__1800mm': 'AC460-1800',
  'fixed_guide__2100mm': 'AC460-2100',
  'fixed_guide__2400mm': 'AC460-2400',
  'fixed_guide__2700mm': 'AC460-2700',
  'fixed_guide__3000mm': 'AC460-3000',
  'fixed_guide__3500mm': 'AC460-3500',
  'fixed_guide_stainless_steel__900mm': '',
  'fixed_guide_stainless_steel__1200mm': '',
  'fixed_guide_stainless_steel__1500mm': '',
  'fixed_guide_stainless_steel__1800mm': '',
  'fixed_guide_stainless_steel__2100mm': '',
  'fixed_guide_stainless_steel__2400mm': '',
  'fixed_guide_stainless_steel__2700mm': '',
  'fixed_guide_stainless_steel__3000mm': '',
  'l_bracket__150mm': '',
  'l_bracket__225mm': '',
  'l_bracket__300mm': '',
  'l_bracket__450mm': '',
  'l_bracket__600mm': '',
  'l_bracket__150mm_stainless_steel': '',
  'l_bracket__225mm_stainless_steel': '',
  'l_bracket__300mm_stainless_steel': '',
  'fixed_guide_pulley__150mm': 'AC480-150',
  'fixed_guide_pulley__225mm': 'AC480-225',
  'fixed_guide_pulley__300mm': 'AC480-300',
  'fixed_guide_pulley__150mm_stainless_steel': 'AC480SS-150',
  'fixed_guide_pulley__300mm_stainless_steel': 'AC480SS-300',
  'gearbox_brackets__black': '',
  'gearbox_brackets__white': '',
  'gearbox_brackets__80mm_black': '',
  'gearbox_brackets__80mm_white': '',
  'gearbox_brackets__stainless_steel': '',
  'u_bracket_stand_out__25mm': '',
  'u_bracket_stand_out__50mm': '',
  'u_bracket_stand_out__75mm': '',
  'u_bracket_stand_out__100mm': '',
  'u_bracket_stand_out__125mm': '',
  'guide_stand_out__25mm': '',
  'guide_stand_out__50mm': '',
  'guide_stand_out__75mm': '',
  'guide_stand_out__100mm': '',
  'guide_stand_out__125mm': '',
  'hood_stand_out__25mm': '',
  'hood_stand_out__50mm': '',
  'hood_stand_out__75mm': '',
  'hood_stand_out__100mm': '',
  'hood_stand_out__125mm': '',
  'spline__3_6mm_spline': '',
  'spline__6mm_spline_soft': '',
  'spline__5mm_spline_hard': '',
  'verticali__verticali_standard_headbox_rear_mill_finish': '',
  'verticali__verticali_standard_headbox_front_mill_finish': '',
  'verticali__verticali_square_headbox_rear_mill_finish': '',
  'verticali__verticali_square_headbox_front_mill_finish': '',
  'verticali__verticali_125mm_tube': '',
  'verticali__verticali_outer_side_guide': '',
  'verticali__verticali_verticali_inner_side_guide': '',
  'verticali__verticali_bottom_rail': '',
  'verticali__verticali_inner_nylon_guide': '',
  'verticali__zip': '',
  'verticali__verticali_foam_spacer': '',
  'verticali__verticali_30mm_bottom_seal': '',
  'verticali__verticali_ballast': '',
  'verticali__verticali_std_hood_ends': '',
  'verticali__verticali_square_hood_ends': '',
  'verticali__verticali_wire_guide_hood_ends': '',
  'verticali__verticali_sqaure_hood_ends_for_colourbond_headbox': '',
  'verticali__verticali_78mm_reducer': '',
  'verticali__verticali_85mm_reducer': '',
  'verticali__verticali_125mm_reducer': '',
  'verticali__verticali_60mm_drive': '',
  'verticali__verticali_60mm_idle_with_hole': '',
  'verticali__verticali_bottom_rail_wire_guide_adaptor': '',
  'verticali__verticali_side_guide_end_cap': '',
  'verticali__verticali_side_guide_leg': '',
  'verticali__verticali_bottom_rail_end_cap': '',
  'verticali__verticali_bottom_rail_blank_end_cap': '002-P009',
  'verticali__verticali_side_guide_funnel': '',
  'verticali__verticali_side_guide_top_stops': '',
  'verticali__verticali_flat_saddle': '',
  'verticali__verticali_strap_adaptor': '',
  'zipscreen__zipscreen_headbox_120mm_back': '',
  'zipscreen__zipscreen_headbox_120mm_front': '',
  'zipscreen__zipscreen_headbox_120mm_semi_front': '',
  'zipscreen__zipscreen_headbox_120mm_end_caps': '',
  'zipscreen__zipscreen_spring_78mm_compact': '',
  'zipscreen__zipscreen_spring_78mm_light': '',
  'zipscreen__zipscreen_spring_78mm_standard': '',
  'zipscreen__zipscreen_spring_78mm_heavy_duty': '',
  'zipscreen__zipscreen_spring_78mm_extra_heavy_duty': '',
  'zipscreen__zipscreen_spring_78mm_ultra_heavy_duty': '',
  'zipscreen__zipscreen_78mm_to_45mm_reducer': '',
  'zipscreen__zipscreen_zipscreen_78mm_to_45mm_crown': '',
  'zipscreen__zipscreen_spring_adaptor_booster': '',
  'zipscreen__zipscreen_idler_spring_adaptor': '',
  'zipscreen__zipscreen_fabric_7mm_spline_with_15mm_tail': '',
  'zipscreen__zipscreen_f56_base_rail': '',
  'zipscreen__zipscreen_f56_base_rail_end_caps': '',
  'zipscreen__zipscreen_bottom_rail_v3_lock_seal': '',
  'zipscreen__flush_mount_deck_plates': '',
  'zipscreen__zipscreen_flat_20x5mm_ballast': '',
  'zipscreen__zipscreen_handle': '',
  'zipscreen__zipscreen_bottom_rail_lock_set': '',
  'zipscreen__zipscreen_outer_side_guides': '',
  'zipscreen__zipscreen_inner_side_guides': '',
  'zipscreen__zipscreen_l_fixing_rail': '',
  'zipscreen__zipscreen_side_guide_top_funnel': '',
  'zipscreen__zipscreen_side_guide_bottom_cap': '',
  'acmeda_motors__45mm_ft_15nm_motor': 'MT01-1145-05001',
  'acmeda_motors__63mm_drive_wheel': '',
  'acmeda_motors__63mm_crown_wheel': 'RE01-0663-050518',
  'acmeda_motors__78mm_drive_wheel': 'RE01-0680-050508',
  'acmeda_motors__78mm_crown_wheel': '',
  'acmeda_motors__45mm_ft_15nm_12v_motor': '',
  'acmeda_motors__12v_motor_external_battery_pack': '',
  'acmeda_motors__12v_motor_external_battery_chargewr_pack': '',
  'acmeda_controls__pulse_pro_automation_hub': 'MT02-0401-067001',
  'acmeda_controls__usb_repeater': 'MT03-0502-059001',
  'acmeda_controls__1_channel_remote_white': 'MT02-0101-067004',
  'acmeda_controls__1_channel_remote_black': 'MT02-0101-050004',
  'acmeda_controls__5_channel_remote_white': 'MT02-0101-067004',
  'acmeda_controls__5_channel_remote_black': 'MT02-0101-050004',
  'acmeda_controls__15_channel_remote_white': 'MT02-0101-067008',
  'acmeda_controls__15_channel_remote_black': 'MT02-0101-050008',
  'acmeda_controls__5_channel_flush_wall_mount_remote_white': '',
  'acmeda_controls__1_channel_wall_mount_remote_white': '',
  'acmeda_controls__2_channel_wall_mount_remote_white': '',
  'acmeda_controls__15_channel_wall_mount_remote_white': '',
  'acmeda_controls__acmeda_push_pro_white_remote': '',
  'acmeda_controls__acmeda_push_pro_black_remote': '',
  'acmeda_controls__acmeda_push_pro_charging_cable': '',
  'acmeda_controls__acmeda_wall_block': '',
  'acmeda_controls__wind_sensor_240v': '',
  'acmeda_controls__1_channel_dry_contact_relay_module': '',
  'becker_motors__remote_self_tensioning_motor': '2010 120 181 0',
  'becker_motors__switch_self_tensioning_motor': '',
  'becker_motors__r12_17cpsf_45mm_motor': '2010 130 225 0',
  'becker_motors__20nm_motor_r20_17_c12a_motor': '2020 130 156 0',
  'becker_motors__switch_motor': '',
  'becker_motors__crown_ring_63mm_keyway_tube': '4930 300 023 0',
  'becker_motors__drive_wheel_63mm_keyway_tube': '4930 300 084 0',
  'becker_motors__star_awning_bracket': '4930 300 053 0',
  'becker_motors__molex_connection': 'Molexconnection',
  'becker_motors__crown_78mm_tube': '4930 300 033 0',
  'becker_motors__drive_adaptor_78mm_tube': '4930 300 091 0',
  'becker_motors__1_channel_remote_white': '4034 000 920 0',
  'becker_motors__1_channel_remote_black': '',
  'becker_motors__5_channel_remote_white': '4034 000 921 0',
  'becker_motors__5_channel_remote_black': '',
  'becker_motors__10_channel_remote_white': '',
  'becker_motors__10_channel_remote_black': '',
  'becker_motors__wind_sensor': '',
  'somfy_motors__altus_50_rts_10_17': '1037432',
  'somfy_motors__altus_50_rts_15_17': '1039378',
  'somfy_motors__zamack_bracket_without_thread': '9910000',
  'somfy_motors__63mm_crown': '9707030',
  'somfy_motors__63mm_drive': '9751002',
  'somfy_motors__78mm_crown': '',
  'somfy_motors__78mm_drive': '',
  'somfy_motors__connexoon': '',
  'somfy_motors__tahoma_switch': '',
  'somfy_motors__somfy_15_channel_silver_remote': '',
  'somfy_motors__somfy_15_channel_white_remote': '',
  'somfy_motors__somfy_2_channel_silver_remote': '',
  'somfy_motors__somfy_2_channel_wall_mounted_smoove_remote_white_with_black_cover_plate': '',
  'somfy_motors__somfy_2_channel_wall_mounted_smoove_remote_white_with_silver_cover_plate': '',
  'somfy_motors__somfy_2_channel_wall_mounted_smoove_remote_white': '',
  'somfy_motors__somfy_2_channel_white_remote': '',
  'somfy_motors__somfy_5_channel_silver_remote': '',
  'somfy_motors__somfy_5_channel_wall_mounted_smoove_remote_white_with_black_cover_plate': '',
  'somfy_motors__somfy_5_channel_wall_mounted_smoove_remote_white_with_silver_cover_plate': '',
  'somfy_motors__somfy_5_channel_wall_mounted_smoove_remote_white': '',
  'somfy_motors__somfy_5_channel_white_remote': '',
  'somfy_motors__somfy_single_channel_silver_remote': '',
  'somfy_motors__somfy_single_channel_wall_mounted_smoove_remote_white_with_black_cover_plate': '',
  'somfy_motors__somfy_single_channel_wall_mounted_smoove_remote_white_with_silver_cover_plate': '',
  'somfy_motors__somfy_single_channel_wall_mounted_smoove_remote_white': '',
  'somfy_motors__somfy_single_channel_white_remote': '',
  'pivot_arm__pivot_arm_spring': '',
  'pivot_arm__pivot_arm_extrusion': '',
  'pivot_arm__pivot_arm_5_sided_clamp': '',
  'pivot_arm__pivot_arm_lock': '',
  'pivot_arm__pivot_arm_slide_track_extrusion': '',
  'wire_guide__wire_guide_base_rail_anodised': '',
  'wire_guide__wire_guide_base_rail_end_caps': '',
};

// Roller Shutter Components - Part Number mappings
const ROLLER_SHUTTER_PART_NUMBERS: { [key: string]: string } = {
  'perforated_slat__black': '10-010-305',
  'perforated_slat__clear_beige': '10-002-127',
  'perforated_slat__dune': '10-023-127',
  'perforated_slat__magnolia_cream': '10-014-101',
  'perforated_slat__monument': '10-018-101',
  'perforated_slat__shale_grey': '10-004-165',
  'perforated_slat__white': '10-003-148',
  'perforated_slat__woodland_grey': '10-015-101',
  'perforated_slat__cream': '10-001-105',
  'perforated_slat__brown': '10-005-186',
  'perforated_slat__beige': '10-006-209',
  'perforated_slat__green': '10-007-243',
  'perforated_slat__red': '10-008-263',
  'perforated_slat__bronze': '10-009-283',
  'perforated_slat__silver': '10-011-325',
  'perforated_slat__deep_ocean': '10-013-101',
  'perforated_slat__jasper': '10-020-101',
  'perforated_slat__surfmist': '10-022-127',
  'unperforated_slat__black': '10-110-641',
  'unperforated_slat__clear_beige': '10-102-504',
  'unperforated_slat__dune': '10-123-500',
  'unperforated_slat__magnolia_cream': '10-114-101',
  'unperforated_slat__monument': '10-118-101',
  'unperforated_slat__shale_grey': '10-104-569',
  'unperforated_slat__white': '10-103-519',
  'unperforated_slat__woodland_grey': '10-115-101',
  'unperforated_slat__cream': '10-101-473',
  'unperforated_slat__brown': '10-105-588',
  'unperforated_slat__beige': '10-106-609',
  'unperforated_slat__green': '10-107-621',
  'unperforated_slat__red': '10-108-633',
  'unperforated_slat__bronze': '10-109-636',
  'unperforated_slat__silver': '10-111-644',
  'unperforated_slat__deep_ocean': '10-113-101',
  'unperforated_slat__jasper': '10-120-101',
  'unperforated_slat__surfmist': '10-122-500',
  '180mm_pelmet_back_and_cover__back_black': '20-110-602',
  '180mm_pelmet_back_and_cover__cover_black': '20-110-652',
  '180mm_pelmet_back_and_cover__back_clear_beige': '20-102-202',
  '180mm_pelmet_back_and_cover__cover_clear_beige': '20-102-252',
  '180mm_pelmet_back_and_cover__back_dune': '20-123-102',
  '180mm_pelmet_back_and_cover__cover_dune': '20-123-153',
  '180mm_pelmet_back_and_cover__back_magnolia_cream': '20-114-103',
  '180mm_pelmet_back_and_cover__cover_magnolia_cream': '20-114-153',
  '180mm_pelmet_back_and_cover__back_monument': '20-118-102',
  '180mm_pelmet_back_and_cover__cover_monument': '20-118-153',
  '180mm_pelmet_back_and_cover__back_shale_grey': '20-104-602',
  '180mm_pelmet_back_and_cover__cover_shale_grey': '20-104-652',
  '180mm_pelmet_back_and_cover__back_white': '20-103-302',
  '180mm_pelmet_back_and_cover__cover_white': '20-103-352',
  '180mm_pelmet_back_and_cover__back_woodland_grey': '20-115-102',
  '180mm_pelmet_back_and_cover__cover_woodland_grey': '20-115-152',
  '180mm_pelmet_back_and_cover__back_cream': '20-101-102',
  '180mm_pelmet_back_and_cover__cover_cream': '20-101-152',
  '180mm_pelmet_back_and_cover__back_brown': '20-105-502',
  '180mm_pelmet_back_and_cover__cover_brown': '20-105-552',
  '180mm_pelmet_back_and_cover__back_surfmist': '20-122-102',
  '180mm_pelmet_back_and_cover__cover_surfmist': '20-122-152',
  '205mm_pelmet_back_and_cover__back_black': '20-110-603',
  '205mm_pelmet_back_and_cover__cover_black': '20-110-653',
  '205mm_pelmet_back_and_cover__back_clear_beige': '20-102-203',
  '205mm_pelmet_back_and_cover__cover_clear_beige': '20-102-253',
  '205mm_pelmet_back_and_cover__back_dune': '20-123-103',
  '205mm_pelmet_back_and_cover__cover_dune': '20-123-154',
  '205mm_pelmet_back_and_cover__back_magnolia_cream': '20-114-104',
  '205mm_pelmet_back_and_cover__cover_magnolia_cream': '20-114-154',
  '205mm_pelmet_back_and_cover__back_monument': '20-118-103',
  '205mm_pelmet_back_and_cover__cover_monument': '20-118-154',
  '205mm_pelmet_back_and_cover__back_shale_grey': '20-104-603',
  '205mm_pelmet_back_and_cover__cover_shale_grey': '20-104-653',
  '205mm_pelmet_back_and_cover__back_white': '20-103-303',
  '205mm_pelmet_back_and_cover__cover_white': '20-103-353',
  '205mm_pelmet_back_and_cover__back_woodland_grey': '20-115-103',
  '205mm_pelmet_back_and_cover__cover_woodland_grey': '20-115-153',
  '205mm_pelmet_back_and_cover__back_cream': '20-101-103',
  '205mm_pelmet_back_and_cover__cover_cream': '20-101-153',
  '205mm_pelmet_back_and_cover__back_brown': '20-105-503',
  '205mm_pelmet_back_and_cover__cover_brown': '20-105-553',
  '205mm_pelmet_back_and_cover__back_surfmist': '20-122-103',
  '205mm_pelmet_back_and_cover__cover_surfmist': '20-122-153',
  '230mm_pelmet_back_and_cover__back_cream': '20-101-116',
  '230mm_pelmet_back_and_cover__cover_cream': '20-101-166',
  '230mm_pelmet_back_and_cover__back_magnolia_cream': '20-114-105',
  '230mm_pelmet_back_and_cover__cover_magnolia_cream': '20-114-155',
  '230mm_pelmet_back_and_cover__back_clear_beige': '20-102-216',
  '230mm_pelmet_back_and_cover__cover_clear_beige': '20-102-266',
  '230mm_pelmet_back_and_cover__back_white': '20-103-316',
  '230mm_pelmet_back_and_cover__cover_white': '20-103-366',
  '230mm_pelmet_back_and_cover__back_shale_grey': '20-104-604',
  '230mm_pelmet_back_and_cover__cover_shale_grey': '20-104-654',
  '230mm_pelmet_back_and_cover__back_black': '20-110-604',
  '230mm_pelmet_back_and_cover__cover_black': '20-110-654',
  '230mm_pelmet_back_and_cover__back_monument': '20-118-104',
  '230mm_pelmet_back_and_cover__cover_monument': '20-118-155',
  '230mm_pelmet_back_and_cover__back_woodland_grey': '20-115-104',
  '230mm_pelmet_back_and_cover__cover_woodland_grey': '20-115-154',
  'bay_window_flashing__cream': '21-490-101',
  'bay_window_flashing__magnolia_cream': '21-490-114',
  'bay_window_flashing__clear_beige': '21-490-102',
  'bay_window_flashing__white': '21-490-103',
  'bay_window_flashing__shale_grey': '21-490-104',
  'bay_window_flashing__brown': '21-490-105',
  'bay_window_flashing__black': '21-490-110',
  'bay_window_flashing__monument': '21-490-118',
  'bay_window_flashing__woodland_grey': '21-490-115',
  'bay_window_flashing__surfmist': '21-490-122',
  'bay_window_flashing__dune': '21-490-123',
  '25mm_x_25mm_angle__cream': '21-425-101',
  '25mm_x_25mm_angle__magnolia_cream': '21-425-114',
  '25mm_x_25mm_angle__clear_beige': '21-425-102',
  '25mm_x_25mm_angle__white': '21-425-103',
  '25mm_x_25mm_angle__shale_grey': '21-425-104',
  '25mm_x_25mm_angle__brown': '21-425-105',
  '25mm_x_25mm_angle__black': '21-425-110',
  '25mm_x_25mm_angle__monument': '21-425-118',
  '25mm_x_25mm_angle__woodland_grey': '21-425-115',
  '25mm_x_25mm_angle__surfmist': '21-425-122',
  '25mm_x_25mm_angle__dune': '21-425-123',
  '25mm_x_50mm_angle__cream': '21-450-101',
  '25mm_x_50mm_angle__magnolia_cream': '21-450-114',
  '25mm_x_50mm_angle__clear_beige': '21-450-102',
  '25mm_x_50mm_angle__white': '21-450-103',
  '25mm_x_50mm_angle__shale_grey': '21-450-104',
  '25mm_x_50mm_angle__brown': '21-450-105',
  '25mm_x_50mm_angle__black': '21-450-110',
  '25mm_x_50mm_angle__monument': '21-450-118',
  '25mm_x_50mm_angle__woodland_grey': '21-450-115',
  '25mm_x_50mm_angle__surfmist': '21-450-122',
  '25mm_x_50mm_angle__dune': '21-450-123',
  '25mm_x_70mm_angle__cream': '21-470-101',
  '25mm_x_70mm_angle__magnolia_cream': '21-470-114',
  '25mm_x_70mm_angle__clear_beige': '21-470-102',
  '25mm_x_70mm_angle__white': '21-470-103',
  '25mm_x_70mm_angle__shale_grey': '21-470-104',
  '25mm_x_70mm_angle__brown': '21-470-105',
  '25mm_x_70mm_angle__black': '21-470-110',
  '25mm_x_70mm_angle__monument': '21-470-118',
  '25mm_x_70mm_angle__woodland_grey': '21-470-115',
  '25mm_x_70mm_angle__surfmist': '21-470-122',
  '25mm_x_70mm_angle__dune': '21-470-123',
  '50mm_x_50mm_square_tube__cream': '21-440-101',
  '50mm_x_50mm_square_tube__magnolia_cream': '21-440-114',
  '50mm_x_50mm_square_tube__clear_beige': '21-440-102',
  '50mm_x_50mm_square_tube__white': '21-440-103',
  '50mm_x_50mm_square_tube__shale_grey': '21-440-104',
  '50mm_x_50mm_square_tube__brown': '21-440-105',
  '50mm_x_50mm_square_tube__green': '21-440-107',
  '50mm_x_50mm_square_tube__red': '21-440-108',
  '50mm_x_50mm_square_tube__black': '21-440-110',
  '50mm_x_50mm_square_tube__monument': '21-440-118',
  '50mm_x_50mm_square_tube__mill_finish': '21-480-101',
  '50mm_x_50mm_square_tube__woodland_grey': '21-440-115',
  '50mm_x_50mm_square_tube__jasper': '21-440-120',
  '50mm_x_50mm_square_tube__surfmist': '21-440-122',
  '50mm_x_50mm_square_tube__dune': '21-440-123',
  'axle__60mm_octangle_axle': '22-999-101L',
  'bottom_bar__black': '21-110-102',
  'bottom_bar__clear_beige': '21-102-185',
  'bottom_bar__dune': '21-123-185',
  'bottom_bar__magnolia_cream': '21-114-100',
  'bottom_bar__monument': '21-118-100',
  'bottom_bar__shale_grey': '21-104-100',
  'bottom_bar__white': '21-103-237',
  'bottom_bar__woodland_grey': '21-115-100',
  'bottom_bar__cream': '21-119-085',
  'bottom_bar__brown': '21-105-407',
  'bottom_bar__mill_finish': '21-116-615',
  'bottom_bar__surfmist': '21-122-185',
  'standard_side_guides__black': '21-110-100',
  'standard_side_guides__clear_beige': '21-102-193',
  'standard_side_guides__magnolia_cream': '21-114-193',
  'standard_side_guides__monument': '21-118-101',
  'standard_side_guides__shale_grey': '21-104-193',
  'standard_side_guides__white': '21-103-257',
  'standard_side_guides__woodland_grey': '21-115-101',
  'standard_side_guides__cream': '21-119-093',
  'standard_side_guides__brown': '21-105-431',
  'standard_side_guides__mill_finish': '21-116-693',
  'standard_side_guides__surfmist': '21-122-193',
  'standard_side_guides__jasper': '21-123-193',
  '180mm_side_frames__black': '21-110-180',
  '180mm_side_frames__clear_beige': '21-102-172',
  '180mm_side_frames__dune': '21-123-180',
  '180mm_side_frames__magnolia_cream': '21-114-180',
  '180mm_side_frames__monument': '21-118-180',
  '180mm_side_frames__shale_grey': '21-104-180',
  '180mm_side_frames__white': '21-103-216',
  '180mm_side_frames__woodland_grey': '21-115-180',
  '180mm_side_frames__cream': '21-101-152',
  '180mm_side_frames__brown': '21-105-372',
  '180mm_side_frames__surfmist': '21-122-180',
  '205mm_side_frames__black': '21-110-205',
  '205mm_side_frames__clear_beige': '21-102-173',
  '205mm_side_frames__dune': '21-123-205',
  '205mm_side_frames__magnolia_cream': '21-114-205',
  '205mm_side_frames__monument': '21-118-205',
  '205mm_side_frames__shale_grey': '21-104-205',
  '205mm_side_frames__white': '21-103-217',
  '205mm_side_frames__woodland_grey': '21-115-205',
  '205mm_side_frames__cream': '21-101-153',
  '205mm_side_frames__brown': '21-105-373',
  '205mm_side_frames__surfmist': '21-122-205',
  '230mm_side_frames__cream': '21-101-154',
  '230mm_side_frames__magnolia_cream': '21-114-230',
  '230mm_side_frames__clear_beige': '21-102-175',
  '230mm_side_frames__white': '21-103-120',
  '230mm_side_frames__shale_grey': '21-104-230',
  '230mm_side_frames__black': '21-110-230',
  '230mm_side_frames__monument': '21-118-230',
  '230mm_side_frames__woodland_grey': '21-115-230',
  '230mm_side_frames__surfmist': '21-122-230',
  'hole_caps__cream': '21-101-130',
  'hole_caps__clear_beige': '21-102-200',
  'hole_caps__white': '21-103-270',
  'hole_caps__shale_grey': '21-104-400',
  'hole_caps__brown': '21-105-440',
  'hole_caps__green': '21-107-500',
  'hole_caps__red': '21-108-500',
  'hole_caps__black': '21-110-500',
  'hole_caps__monument': '21-118-130',
  'hole_caps__deep_ocean': '21-113-130',
  'hole_caps__woodland_grey': '21-115-130',
  'hole_caps__jasper': '21-120-130',
  'hole_caps__surfmist': '21-122-130',
  'hole_caps__dune': '21-123-130',
  'misc__guide_entry_flares': '',
  'misc__guide_stop_end_cap': '',
  'misc__axle_idle': '',
  'misc__slat_end_caps': '',
  'misc__security_springs': '',
  'misc__bottom_bar_end_cap': '21-999-811',
  'misc__steel_weight_bar': '10-999-820',
  'misc__corner_telescopic_bracket': '',
  'misc__bay_telescopic_bracket': '',
  'misc__wall_switch': '',
  'misc__ups': '41-999-708',
  'misc__too_small_for_motors': '',
  'manual_override_parts__crank_handle_with_hook_l_160cm': '23-999-521',
  'manual_override_parts__eyelet_lg_165': '31‑999‑302',
  'manual_override_parts__nickel_plated_crank_handle_for_use_with_universal_joint': '23-104-255',
  'manual_override_parts__handle_lock_nylon': '23-104-258',
  'manual_override_parts__joint_90_nick_2_screw_universal_hexagonal_shaft': '23-999-545',
  'manual_override_parts__bell_coupling_for_universal_joint': '23-999-440',
  'manual_override_parts__pivot_for_universal_joint': '23-999-546',
  'manual_override_parts__crank_handle_for_use_with_secret_manual_override_system': '23‑999‑522',
  'manual_override_parts__hexagonal_shaft_for_use_with_secret_manual_override_system': '31‑999‑912',
  'manual_override_parts__7mm_hexagonal_adaptor_for_use_with_secret_manual_override_system': '31‑999‑914',
  'maxim__10nm_remote_motor': '30-102-510',
  'maxim__20nm_switch_motor': '30-100-520',
  'maxim__1_channel_remote': '41-100-322',
  'maxim__6_channel_remote': '41-100-329',
  'maxim__1_channel_wall_mounted_remote': '41-100-340',
  'maxim__6_channel_wall_mounted_remote_w_timer': '41-100-342',
  'cwp__10nm_remote_motor': '',
  'cwp__20nm_remote_motor': '',
  'cwp__50nm_remote_motor': '',
  'cwp__10nm_short_switch_motor': '',
  'cwp__10nm_switch_motor': '',
  'cwp__20nm_switch_motor': '',
  'cwp__30nm_manual_override_motor': '',
  'cwp__50nm_manual_override_motor': '',
  'cwp__1_channel_remote': '',
  'cwp__5_channel_remote': '',
  'cwp__15_channel_remote': '',
  '12v__l10_motor': '',
  '12v__l10_axle_adaptor': '',
  '12v__t20_motor': '',
  '12v__t20_motor_drive_kit': '',
  '12v__t20_motor_screws': '19.900.005',
  '12v__t35_motor': '',
  '12v__ods_controller': '',
  '12v__ods_wall_plate': '',
  '12v__ods_charger': '',
  '12v__ods_controller_rf': '15.601.001',
  '12v__ods_3_way_switch': '',
  '12v__ods_rf_1_channel_remote': '15.560.001',
  '12v__ods_rf_9_channel_remote': '',
  '12v__ods_2_5m_loom_extension': '',
  'acmeda__45mm_ft_15nm_motor': 'MT01-1145-050001',
  'acmeda__ax_30nm_motor': '',
  'acmeda__45mm_50nm_motor': '',
  'acmeda__60mm_oct_drive_wheel': 'MT03-0198-050023',
  'acmeda__60mm_oct_crown_wheel': 'MT03-0198-050022',
  'acmeda__45mm_ft_15nm_12v_motor': '',
  'acmeda__12v_motor_external_battery_pack': '',
  'acmeda__12v_motor_external_battery_charger_pack': '',
  'acmeda__pulse_pro_automation_hub': 'MT02-5401-050001',
  'acmeda__1_channel_dry_contact_relay_module': '',
  'acmeda__usb_repeater': '',
  'acmeda__1_channel_remote_white': 'MT02-0101-067010',
  'acmeda__1_channel_remote_black': 'MT02-0101-050010',
  'acmeda__5_channel_remote_white': 'MT02-0101-067004',
  'acmeda__5_channel_remote_black': 'MT02-0101-050004',
  'acmeda__15_channel_remote_white': 'MT02-0101-067008',
  'acmeda__15_channel_remote_black': 'MT02-0101-050008',
  'acmeda__1_channel_wall_mount_remote_white': '',
  'acmeda__5_channel_wall_mount_remote_white': '',
  'acmeda__15_channel_wall_mount_remote_white': '',
  'acmeda__push_pro_white_remote': 'MT02-0101-067013',
  'acmeda__push_pro_black_remote': 'MT02-0101-050013',
  'acmeda__push_pro_charging_cable': 'MT03-0301-069026',
  'acmeda__wall_block': '',
  'becker__r12_17cpsf_45mm_motor': '',
  'becker__20nm_motor_r20_17_c12a_motor': '',
  'becker__crown_60mm_oct_tube': '',
  'becker__drive_60mm_oct_tube': '',
  'becker__star_awning_bracket': '',
  'becker__molex_connection': '',
  'becker__1_channel_remote_white': '',
  'becker__1_channel_remote_black': '',
  'becker__5_channel_remote_white': '',
  'becker__5_channel_remote_black': '',
  'becker__10_channel_remote_white': '',
  'becker__10_channel_remote_black': '',
  'somfy__altus_50_rts_6_17': '1032448',
  'somfy__altus_50_rts_10_17': '1037432',
  'somfy__altus_50_rts_15_17': '1039378',
  'somfy__altus_50_rts_25_17': '1043171',
  'somfy__orea_50_wt_40_17': '1117161',
  'somfy__zamack_bracket_without_thread': '',
  'somfy__crown_60mm_oct_tube': '9707025',
  'somfy__drive_60mm_oct_tube': '9751001',
  'somfy__connexoon': '',
  'somfy__tahoma_switch': '',
  'somfy__single_channel_silver_remote': '',
  'somfy__single_channel_white_remote': '1871413',
  'somfy__2_channel_silver_remote': '',
  'somfy__2_channel_white_remote': '1871417',
  'somfy__5_channel_silver_remote': '',
  'somfy__5_channel_white_remote': '1871415',
  'somfy__15_channel_silver_remote': '',
  'somfy__15_channel_white_remote': '',
};

function getSupplierFromColumnName(columnName: string, tableName?: string): string {
  if (!columnName) return '';

  const colLower = columnName.toLowerCase();

  // Door Screen Components
  if (tableName === 'door_screen_components') {
    if (colLower.includes('invisi_gard')) {
      return 'Alspec';
    }
    // PR Aluminium patterns
    const prAlumPatterns = [
      'standard_door_frame', 'screen_frame', 'track', 'channel', 'mullion',
      'wedges', 'lock', 'handle', 'mesh', 'grill', 'pet', 'colonial', 'misc',
      'corner', 'flywire', 'closer', 'sill', 'mid', 'rail', 'bug', 'brief'
    ];
    if (prAlumPatterns.some(p => colLower.includes(p))) {
      return 'PR Aluminium';
    }
  }

  // Roller Blind Components
  if (tableName === 'roller_blind_components') {
    if (colLower.startsWith('acmeda_')) return 'Rollease Acmeda';
    if (colLower.startsWith('somfy_') || colLower.startsWith('sonesse_')) return 'Somfy';
    if (colLower.startsWith('becker_')) return 'Becker';
    if (colLower.startsWith('automate_')) return 'Rollease Acmeda';

    // Acmeda generic hardware patterns (tubes, rails, brackets, cassettes, chains, etc.)
    const acmedaPatterns = [
      '38mm_tube', '43mm_tube', '60mm_tube', '80mm_tube', 'd30_bottom_rail', 'lath', 'weight_bar',
      'pelmet_95', 'cf90_cassette', 'cassette_', 'aluminium_valance', 'mounting_rail', 'chain_winder',
      '_idle', '_bracket', '_link', 'helper_spring', '_chain', '_spring', '15mm_spline', 'chain_safe',
      'stopper_ball', 'bottom_rail_brush', 'single_extension_bracket'
    ];
    if (acmedaPatterns.some(p => colLower.includes(p))) return 'Rollease Acmeda';

    // Universal / Cross-brand patterns
    const universalPatterns = ['m40_universal_', 'm50_universal_', 'universal_zamack_', '1_channel_dry_contact_', 'usb_repeater', 'pulse_pro_', 'wall_switch', '12v_motor_covers_'];
    if (universalPatterns.some(p => colLower.includes(p))) return 'Universal';
  }

  // Roller Shutter Components
  if (tableName === 'roller_shutter_components') {
    if (colLower.startsWith('acmeda_')) return 'Rollease Acmeda';
    if (colLower.startsWith('somfy_')) return 'Somfy';
    if (colLower.startsWith('becker_')) return 'Becker';
    if (colLower.startsWith('maxim_')) return 'Maxim';
    if (colLower.startsWith('cwp_')) return 'CWP';
    if (colLower.startsWith('12v_')) return 'Oz Roll';

    // CW Products patterns (slats, pelmets, angles, tubes, frames, bars, guides, flashing, caps, etc.)
    const cwProducts = [
      'perforated_slat', 'unperforated_slat', 'pelmet_back_and_cover', 'bay_window_flashing',
      'angle', 'square_tube', 'bottom_bar', 'side_guides', 'side_frames', 'hole_caps',
      'axle', 'manual_override'
    ];
    if (cwProducts.some(p => colLower.includes(p))) return 'CW Products';

    // Oz Roll patterns
    const ozRoll = ['guide_entry_flares', 'telescopic_bracket', 'corner_telescopic', 'bay_telescopic'];
    if (ozRoll.some(p => colLower.includes(p))) return 'Oz Roll';
  }

  // External Blinds Components
  if (tableName === 'external_blinds_components') {
    if (colLower.startsWith('acmeda_')) return 'Rollease Acmeda';
    if (colLower.startsWith('becker_')) return 'Becker';
    if (colLower.startsWith('somfy_')) return 'Somfy';
    if (colLower.startsWith('zipscreen_')) return 'Rollease Acmeda';
    if (colLower.startsWith('verticali_')) return 'ShadeLab Australia';
    if (colLower.startsWith('pivot_arm_')) return 'Uniline';

    // Challenger patterns (colourbond, tubes, drives, brackets, guides, etc.)
    const challenger = [
      'colourbond', 'tubes', 'drives_and_idles', '5_sided_bottom_rail', 'springs', 'auto_guide',
      'auto_arm', 'brackets', 'pull_stick', 'gearboxes', 'crank_handle', 'fixed_guide',
      'l_bracket', 'fixed_guide_pulley', 'gearbox_brackets', 'u_bracket_stand_out',
      'guide_stand_out', 'hood_stand_out', 'spline', 'wire_guide'
    ];
    if (challenger.some(p => colLower.includes(p))) return 'Challenger';

    // Bluescope
    if (colLower.includes('fixed_guide_12mm_ballast') || colLower.includes('verticali_ballast')) return 'Bluescope';

    // Miami Stainless
    if (colLower.includes('flush_mount_deck_plates')) return 'Miami Stainless';

    // ShadeLab Australia
    if (colLower.includes('spline_5mm_spline_hard') || colLower.includes('verticali') ||
        colLower.includes('stainless_steel_double_swivel_dog_clip')) return 'ShadeLab Australia';
  }

  return '';
}

function getGroupFromColumnName(columnName: string, tableName?: string): string {
  if (!columnName) return '';

  const colLower = columnName.toLowerCase().replace(/\s+/g, '_');
  const colorSuffixes = ['_apo_grey', '_birch_white', '_black', '_brown', '_deep_ocean', '_jasper', '_paperbark', '_pale_eucalypt', '_primrose', '_ultra_silver', '_woodland_grey_green_tone', '_white', '_monument', '_surfmist', '_dune', '_woodland_grey_dulux', '_custom_powdercoat', '_grey', '_beige', '_cream', '_barley', '_anodised_silver', '_bone', '_cream', '_barley', '_lhs', '_rhs', '_50cm', '_75cm', '_100cm', '_125cm', '_150cm', '_175cm', '_200cm', '_225cm', '_250cm', '_275cm', '_300cm', '_325cm', '_350cm', '_375cm', '_400cm', '_back_', '_cover_', '_mill_finish', '_clear_beige', '_magnolia_cream', '_shale_grey', '_woodland_grey', '_red', '_green', '_silver', '_bronze', '_jasper', '_deep_ocean'];

  // Door Screen Components
  if (tableName === 'door_screen_components') {
    if (DOOR_SCREEN_GROUPS[colLower]) return DOOR_SCREEN_GROUPS[colLower];
    for (const suffix of colorSuffixes) {
      if (colLower.endsWith(suffix)) {
        let baseCol = colLower.slice(0, -suffix.length);
        baseCol = baseCol.replace(/_+$/, '');
        if (DOOR_SCREEN_GROUPS[baseCol]) return DOOR_SCREEN_GROUPS[baseCol];
      }
    }
  }

  // Roller Blind Components
  if (tableName === 'roller_blind_components') {
    if (ROLLER_BLIND_GROUPS[colLower]) return ROLLER_BLIND_GROUPS[colLower];
    for (const suffix of colorSuffixes) {
      if (colLower.endsWith(suffix)) {
        let baseCol = colLower.slice(0, -suffix.length);
        baseCol = baseCol.replace(/_+$/, '');
        if (ROLLER_BLIND_GROUPS[baseCol]) return ROLLER_BLIND_GROUPS[baseCol];
      }
    }
  }

  // Roller Shutter Components
  if (tableName === 'roller_shutter_components') {
    if (ROLLER_SHUTTER_GROUPS[colLower]) return ROLLER_SHUTTER_GROUPS[colLower];
    for (const suffix of colorSuffixes) {
      if (colLower.endsWith(suffix)) {
        let baseCol = colLower.slice(0, -suffix.length);
        baseCol = baseCol.replace(/_+$/, '');
        if (ROLLER_SHUTTER_GROUPS[baseCol]) return ROLLER_SHUTTER_GROUPS[baseCol];
      }
    }
  }

  // External Blinds Components
  if (tableName === 'external_blinds_components') {
    if (EXTERNAL_BLINDS_GROUPS[colLower]) return EXTERNAL_BLINDS_GROUPS[colLower];
    for (const suffix of colorSuffixes) {
      if (colLower.endsWith(suffix)) {
        let baseCol = colLower.slice(0, -suffix.length);
        baseCol = baseCol.replace(/_+$/, '');
        if (EXTERNAL_BLINDS_GROUPS[baseCol]) return EXTERNAL_BLINDS_GROUPS[baseCol];
      }
    }
  }

  return '';
}

function getPartNumberFromColumnName(columnName: string, tableName?: string): string {
  if (!columnName) return '';

  const colLower = columnName.toLowerCase().replace(/\s+/g, '_');

  // Door Screen Components
  if (tableName === 'door_screen_components') {
    if (DOOR_SCREEN_PART_NUMBERS[colLower]) return DOOR_SCREEN_PART_NUMBERS[colLower];
  }

  // Roller Blind Components
  if (tableName === 'roller_blind_components') {
    if (ROLLER_BLIND_PART_NUMBERS[colLower]) return ROLLER_BLIND_PART_NUMBERS[colLower];
  }

  // Roller Shutter Components
  if (tableName === 'roller_shutter_components') {
    if (ROLLER_SHUTTER_PART_NUMBERS[colLower]) return ROLLER_SHUTTER_PART_NUMBERS[colLower];
  }

  // External Blinds Components
  if (tableName === 'external_blinds_components') {
    if (EXTERNAL_BLINDS_PART_NUMBERS[colLower]) return EXTERNAL_BLINDS_PART_NUMBERS[colLower];
  }

  return '';
}

export default function DataTable({
  data,
  total,
  page,
  pageSize,
  onPageChange,
  isLoading,
  tableName,
  username = '',
  onShowCommentsSummary,
}: DataTableProps) {
  const [commentModal, setCommentModal] = useState<{
    isOpen: boolean;
    columnName: string;
    quoteNo: string;
    lineNo: number;
    rowType?: string; // 'header', 'summary', or 'data'
  } | null>(null);
  const [tableWidth, setTableWidth] = useState(0);
  const [cellsWithComments, setCellsWithComments] = useState<Set<string>>(new Set());

  // Virtualization ref
  const tbodyRef = useRef<HTMLTableSectionElement>(null);

  // Fetch all comments for the table to show indicators
  useEffect(() => {
    const fetchCommentIndicators = async () => {
      try {
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
        const response = await axios.get(`${apiUrl}/comments/summary/${tableName}`);
        const commentSet = new Set<string>();
        response.data.forEach((comment: any) => {
          const key = `${comment.quote_no}_${comment.line_no}_${comment.column_name}`;
          commentSet.add(key);
        });
        setCellsWithComments(commentSet);
      } catch (error) {
        console.error('Error fetching comment indicators:', error);
      }
    };

    if (tableName) {
      fetchCommentIndicators();
    }
  }, [tableName]);

  // Get base columns for the current table
  const BASE_COLUMNS = tableName && TABLE_BASE_COLUMNS[tableName]
    ? TABLE_BASE_COLUMNS[tableName]
    : TABLE_BASE_COLUMNS['door_screen_components'];
  // Calculate sums with SQL formula logic (divisors, confirmation filtering, date ranges)
  const calculateSums = (rows: any[]) => {
    const sums: { [key: string]: any } = {};

    if (rows.length === 0) return sums;

    const firstRow = rows[0];
    // Use date strings for comparison to avoid timezone issues
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0]; // YYYY-MM-DD
    const sevenDaysLater = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    const sevenDaysLaterStr = sevenDaysLater.toISOString().split('T')[0]; // YYYY-MM-DD

    // Skip base columns that shouldn't have sums calculated
    const skipColumns = ['id', 'job_tracking_action', 'dispatch_action', 'dispatch_date',
                        'quote_no', 'line_no', 'order_item_code', 'product', 'business_name',
                        'quote_ref', 'fabric', 'fabric_sqm', 'fabric_width', 'fabric_drop'];

    Object.keys(firstRow).forEach((key) => {
      // Skip non-numeric and base columns
      if (skipColumns.includes(key)) return;

      const numericValues = rows
        .map((row) => {
          const val = row[key];
          if (typeof val === 'string') {
            const num = parseFloat(val);
            return isNaN(num) ? 0 : num;
          }
          return typeof val === 'number' && !isNaN(val) ? val : 0;
        });

      // Only apply divisor if column is a component column (getDivisor returns > 1 or has special logic)
      const divisor = getDivisor(key);

      // Total Required: sum all values / divisor
      const total = numericValues.reduce((a, b) => a + b, 0) / divisor;

      // Install Booked: sum values where dispatch_action === 'Confirmed' / divisor
      const ib_total = rows
        .reduce((sum, row, idx) => {
          const isConfirmed = row.dispatch_action === 'Confirmed';
          return sum + (isConfirmed ? numericValues[idx] : 0);
        }, 0) / divisor;

      // Install Booked next 7 days: sum values where Confirmed AND dispatch_date within 7 days / divisor
      const ib7_total = rows
        .reduce((sum, row, idx) => {
          const isConfirmed = row.dispatch_action === 'Confirmed';
          // Compare dates as strings (YYYY-MM-DD format) to avoid timezone issues
          const dispatchDateStr = row.dispatch_date ? row.dispatch_date.split('T')[0] : null;
          const isWithin7Days = dispatchDateStr && dispatchDateStr >= todayStr && dispatchDateStr < sevenDaysLaterStr;
          return sum + (isConfirmed && isWithin7Days ? numericValues[idx] : 0);
        }, 0) / divisor;

      // Store the main total for backward compatibility
      sums[key] = total;

      // Also store the detailed breakdown for summary rows
      if (!sums._details) sums._details = {};
      sums._details[key] = { total, ib_total, ib7_total, kanban_min: 0 };
    });

    return sums;
  };

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
    }
  };

  const getDivisor = (columnName: string): number => {
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
  };

  // All tables use frontend-calculated sums for real-time updates

  const sums = calculateSums(data);

  // Generate columns dynamically from data, ordered with base columns first
  const columns: ColumnDef<any>[] = data.length
    ? (() => {
        const allKeys = Object.keys(data[0]);
        const orderedKeys = [
          ...allKeys.filter((key) =>
            BASE_COLUMNS.some((base) => base.toLowerCase() === key.toLowerCase())
          ),
          ...allKeys.filter(
            (key) =>
              !BASE_COLUMNS.some((base) => base.toLowerCase() === key.toLowerCase())
          ),
        ];

        return orderedKeys.map((key) => ({
          accessorKey: key,
          header: key,
          cell: (info) => {
            const value = info.getValue();
            if (typeof value === 'number') {
              return <span className="text-right font-medium">{value}</span>;
            }
            // Format dispatch_date to yyyy-mm-dd
            if (key === 'dispatch_date' && value) {
              try {
                const date = new Date(value as string);
                const formatted = date.toISOString().split('T')[0];
                return <span>{formatted}</span>;
              } catch {
                return <span>{String(value)}</span>;
              }
            }
            return <span>{String(value || '')}</span>;
          },
        }));
      })()
    : [];

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const totalPages = Math.ceil(total / pageSize);

  // Setup row virtualization
  const rows = table.getRowModel().rows;
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => document.getElementById('table-scroll-container'),
    estimateSize: () => 28, // Estimate row height
    overscan: 10, // Render 10 rows outside visible area for smoothness
    measureElement:
      typeof window !== 'undefined' &&
      navigator.userAgentData?.mobile === false
        ? (element) => element?.getBoundingClientRect().height
        : undefined,
  });

  useEffect(() => {
    const tableContainer = document.getElementById('table-scroll-container');
    if (tableContainer) {
      setTableWidth(tableContainer.scrollWidth);

      const handleTableScroll = () => {
        const stickyBar = document.getElementById('sticky-horizontal-scrollbar');
        if (stickyBar) {
          stickyBar.scrollLeft = tableContainer.scrollLeft;
        }
      };

      tableContainer.addEventListener('scroll', handleTableScroll);
      return () => tableContainer.removeEventListener('scroll', handleTableScroll);
    }
  }, [data]);

  // Part Number dictionary from Excel macro
  const PART_NUMBER_MAP: { [key: string]: string } = {
    '38mm_tube': 'RB93-6440-000582', '43mm_tube': 'RB93-6444-000580', '43mm_heavy_duty_tube': 'RB93-6449-000580', '60mm_tube': 'RB91-6260-000360', '80mm_tube': 'None',
    'd30_bottom_rail_anodised_silver': 'RB91-1233-020580', 'd30_bottom_rail_white': 'RB91-1233-169580', 'd30_bottom_rail_black': 'RB91-1233-150580', 'd30_bottom_rail_sandstone': 'RB91-1233-269580', 'd30_bottom_rail_bone': 'RB91-1233-280580',
    'd30_bottom_rail_end_caps_anodised_silver': 'RB91-2131-338002', 'd30_bottom_rail_end_caps_white': 'RB91-2131-069002', 'd30_bottom_rail_end_caps_black': 'RB91-2131-050002', 'd30_bottom_rail_end_caps_sandstone': 'RB91-2131-269002', 'd30_bottom_rail_end_caps_bone': 'RB91-2131-280002',
    'lath': 'B0-RB020', 'weight_bar': 'VB05-0301-025300', 'pelmet_95_white': 'RB88-0150-069580', 'pelmet_95_black': 'RB88-0150-050580', 'pelmet_95_anodised': 'RB88-0150-020580', 'pelmet_95_cream': 'RB88-0150-269580',
    'cf90_cassette_back_black': 'RC01-0101-050480', 'cf90_cassette_back_white': 'RC01-0101-069480', 'cf90_cassette_back_anodised_silver': 'None', 'cf90_cassette_square_front_white': 'RC01-0103-069480', 'cf90_cassette_square_front_black': 'RC01-0103-050480', 'cf90_cassette_square_front_anodised_silver': 'None',
    'cf90_cassette_side_guide_white': 'RC91-0101-069580', 'cf90_cassette_side_guide_black': 'RC91-0101-050580', 'cf90_cassette_side_guide_anodised_silver': 'None',
    '38mm_chain_winder_white': 'RB08-4002-069000', '38mm_chain_winder_black': 'RB08-4002-050000', '38mm_chain_winder_birch_white': 'RB08-4002-269000', '38mm_chain_winder_grey': 'RB08-4002-338000', '38mm_chain_winder_barley': 'RB08-4002-283000',
    '43mm_chain_winder_white': 'RB08-4502-069000', '43mm_chain_winder_black': 'RB08-4502-050000', '43mm_chain_winder_birch_white': 'RB08-4502-269000', '43mm_chain_winder_grey': 'RB08-4502-338000', '43mm_chain_winder_beige': 'RB08-4502-283000',
    '40mm_bracket_white': 'RB08-8351-069040', '40mm_bracket_black': 'RB08-8351-050040', '40mm_bracket_birch_white': 'RB08-8351-269040', '40mm_bracket_grey': 'RB08-8351-338040', '40mm_bracket_barley': 'RB08-8351-283040',
    '55mm_motor_bracket_white': 'RB40-8355-069055', '55mm_motor_bracket_black': 'RB40-8355-050055', '40mm_motor_bracket_white': 'RB40-8355-069040', '40mm_motor_bracket_black': 'RB40-8355-050040',
    '50cm_metal_chain': 'VA01-1401-S20050', '75cm_metal_chain': 'VA01-1401-S20075', '100cm_metal_chain': 'VA01-1401-S20100', '125cm_metal_chain': 'VA01-1401-S20125', '150cm_metal_chain': 'VA01-1401-S20150', '175cm_metal_chain': 'VA01-1401-S20175', '200cm_metal_chain': 'VA01-1401-S20200',
    '50cm_white_chain': 'VA01-1406-069050', '75cm_white_chain': 'VA01-1406-069075', '100cm_white_chain': 'VA01-1406-069100', '125cm_white_chain': 'VA01-1406-069125', '150cm_white_chain': 'VA01-1406-069150', '175cm_white_chain': 'VA01-1406-069175', '200cm_white_chain': 'VA01-1406-069200',
    '50cm_black_chain': 'VA01-1406-050050', '75cm_black_chain': 'VA01-1406-050075', '100cm_black_chain': 'VA01-1406-050100', '125cm_black_chain': 'VA01-1406-050125', '150cm_black_chain': 'VA01-1406-050150', '175cm_black_chain': 'VA01-1406-050175', '200cm_black_chain': 'VA01-1406-050200',
    '50cm_cream_chain': 'VA01-1406-412050', '75cm_cream_chain': 'VA01-1406-412075', '100cm_cream_chain': 'VA01-1406-412100', '125cm_cream_chain': 'VA01-1406-412125', '150cm_cream_chain': 'VA01-1406-412150', '175cm_cream_chain': 'VA01-1406-412175', '200cm_cream_chain': 'VA01-1406-412200', '225cm_cream_chain': 'VA01-1406-412225',
    '50cm_grey_chain': 'VA01-1406-338050', '75cm_grey_chain': 'VA01-1406-338075', '100cm_grey_chain': 'VA01-1406-338100', '125cm_grey_chain': 'VA01-1406-338125', '150cm_grey_chain': 'VA01-1406-338150', '175cm_grey_chain': 'VA01-1406-338175', '200cm_grey_chain': 'VA01-1406-338200',
    '50cm_beige_chain': 'VA01-1406-283050', '75cm_beige_chain': 'VA01-1406-283075', '100cm_beige_chain': 'VA01-1406-283100', '125cm_beige_chain': 'VA01-1406-283125', '150cm_beige_chain': 'VA01-1406-283150', '175cm_beige_chain': 'VA01-1406-283175', '200cm_beige_chain': 'VA01-1406-283200', '225cm_beige_chain': 'VA01-1406-283225', '250cm_beige_chain': 'VA01-1406-283250',
    '50cm_stainless_steel_chain': 'VA01-1401-X10050', '75cm_stainless_steel_chain': 'VA01-1401-X10075', '100cm_stainless_steel_chain': 'VA01-1401-X10100', '125cm_stainless_steel_chain': 'VA01-1401-X10125', '150cm_stainless_steel_chain': 'VA01-1401-X10150', '175cm_stainless_steel_chain': 'VA01-1401-X10175', '200cm_stainless_steel_chain': 'VA01-1401-X10200',
    '43mm_heavy_duty_helper_springs_lhs': 'RB04-4392-393001', '43mm_heavy_duty_helper_springs_rhs': 'RB04-4392-338002', '60mm_heavy_duty_helper_springs_lhs': 'RB10-6040-050041', '60mm_heavy_duty_helper_springs_rhs': 'RB10-6040-050042',
    '43mm_female_link_white': 'RB41-1001-069045', '43mm_female_link_black': 'RB41-1001-050045', '43mm_male_link_white': 'RB41-1002-069045', '43mm_male_link_black': 'RB41-1002-050045',
    '38mm_senior_spring': 'RB01-4002-069000', '38mm_junior_spring': 'RB01-4001-069000', '15mm_spline': 'RB92-1502-001075',
    '60mm_idle_white': 'RB56-1001-061060', '60mm_idle_bracket_white': 'RB10-6500-069001', 'chain_safe': 'SS91-1312-001040', 'stopper_balls': 'VA92-1012-001000',
    'acmeda_e6_motor': 'MT01-1135-069001', 'acmeda_0_7nm_12v_motor': 'MT01-1325-069032', 'acmeda_1_1nm_12v_motor': 'MT01-1325-069033', 'acmeda_2nm_12v_motor': 'MT01-1328-069009', 'acmeda_1_1nm_12v_dcrf_motor': 'MT01-1225-069004', 'acmeda_ft_15nm_motor': 'MT01-1145-050001',
    'sonesse_40_rts_3_30_with_inline_connector_motor': '1002091', 'somfy_12v_remote_sonesse_motor': '1240512',
    'becker_p4_30_c12a_motor': '2009 130 124 0', 'becker_r20_17_c12a_motor': '2020 130 156 0',
  };

  // Group Header dictionary - Complete mapping from supplier breakdown
  const GROUP_HEADER_MAP: { [key: string]: string } = {
    // Tubes
    '38mm_tube': 'Tubes', '43mm_tube': 'Tubes', '43mm_heavy_duty_tube': 'Tubes', '60mm_tube': 'Tubes', '80mm_tube': 'Tubes',
    // Base Rails
    'd30_bottom_rail_anodised_silver': 'Base Rails', 'd30_bottom_rail_white': 'Base Rails', 'd30_bottom_rail_black': 'Base Rails', 'd30_bottom_rail_sandstone': 'Base Rails', 'd30_bottom_rail_bone': 'Base Rails',
    // Base Rail End Caps
    'd30_bottom_rail_end_caps_anodised_silver': 'Base Rail End Caps', 'd30_bottom_rail_end_caps_white': 'Base Rail End Caps', 'd30_bottom_rail_end_caps_black': 'Base Rail End Caps', 'd30_bottom_rail_end_caps_sandstone': 'Base Rail End Caps', 'd30_bottom_rail_end_caps_bone': 'Base Rail End Caps',
    'lath': 'Base Rail End Caps', 'weight_bar': 'Base Rail End Caps',
    // Aluminium Pelmets
    'pelmet_95_anodised': 'Aluminium Pelmets', 'pelmet_95_white': 'Aluminium Pelmets', 'pelmet_95_black': 'Aluminium Pelmets', 'pelmet_95_cream': 'Aluminium Pelmets',
    // Cassettes - Back
    'cf90_cassette_back_black': 'Cassettes - Back', 'cf90_cassette_back_white': 'Cassettes - Back', 'cf90_cassette_back_anodised_silver': 'Cassettes - Back',
    // Square Cassettes - Front
    'cf90_cassette_square_front_white': 'Square Cassettes - Front', 'cf90_cassette_square_front_black': 'Square Cassettes - Front', 'cf90_cassette_square_front_anodised_silver': 'Square Cassettes - Front',
    // Round Cassettes - Front
    'cf90_cassette_round_front_white': 'Round Cassettes - Front', 'cf90_cassette_round_front_black': 'Round Cassettes - Front', 'cf90_cassette_round_front_anodised_silver': 'Round Cassettes - Front',
    // Cassettes - Side Guides
    'cf90_cassette_side_guide_white': 'Cassettes - Side Guides', 'cf90_cassette_side_guide_black': 'Cassettes - Side Guides', 'cf90_cassette_side_guide_anodised_silver': 'Cassettes - Side Guides',
    // 38mm Chain Winders
    '38mm_chain_winder_white': '38mm Chain Winders', '38mm_chain_winder_black': '38mm Chain Winders', '38mm_chain_winder_birch_white': '38mm Chain Winders', '38mm_chain_winder_grey': '38mm Chain Winders', '38mm_chain_winder_barley': '38mm Chain Winders',
    // 38mm FG Chain Winders
    '38mm_fixed_guide_chain_winder_white': '38mm FG Chain Winders', '38mm_fixed_guide_chain_winder_black': '38mm FG Chain Winders', '38mm_fixed_guide_chain_winder_birch_white': '38mm FG Chain Winders', '38mm_fixed_guide_chain_winder_grey': '38mm FG Chain Winders',
    // 43mm Chain Winders
    '43mm_chain_winder_white': '43mm Chain Winders', '43mm_chain_winder_black': '43mm Chain Winders', '43mm_chain_winder_birch_white': '43mm Chain Winders', '43mm_chain_winder_grey': '43mm Chain Winders', '43mm_chain_winder_beige': '43mm Chain Winders',
    // 43mm FG Chain Winders
    '43mm_fixed_guide_chain_winder_white': '43mm FG Chain Winders', '43mm_fixed_guide_chain_winder_black': '43mm FG Chain Winders', '43mm_fixed_guide_chain_winder_birch_white': '43mm FG Chain Winders', '43mm_fixed_guide_chain_winder_grey': '43mm FG Chain Winders',
    // 43mm Idles
    '43mm_idles_white': '43mm Idles', '43mm_idles_black': '43mm Idles', '43mm_idles_birch_white': '43mm Idles', '43mm_idles_grey': '43mm Idles', '43mm_idles_barley': '43mm Idles',
    // 40mm Brackets
    '40mm_bracket_white': '40mm Brackets', '40mm_bracket_black': '40mm Brackets', '40mm_bracket_birch_white': '40mm Brackets', '40mm_bracket_grey': '40mm Brackets', '40mm_bracket_barley': '40mm Brackets',
    // Single Extension Brackets
    '55mm_bracket_white': 'Single Extension Brackets', '55mm_bracket_black': 'Single Extension Brackets', '55mm_bracket_birch_white': 'Single Extension Brackets', '55mm_bracket_grey': 'Single Extension Brackets',
    // 40mm Motor Brackets
    '40mm_motor_bracket_white': '40mm Motor Brackets', '40mm_motor_bracket_black': '40mm Motor Brackets',
    // 55mm Motor Brackets
    '55mm_motor_bracket_white': '55mm Motor Brackets', '55mm_motor_bracket_black': '55mm Motor Brackets',
    // 40mm Bracket Covers
    '40mm_bracket_cover_white': '40mm Bracket Covers', '40mm_bracket_cover_black': '40mm Bracket Covers', '40mm_bracket_cover_birch_white': '40mm Bracket Covers', '40mm_bracket_cover_grey': '40mm Bracket Covers', '40mm_bracket_cover_beige': '40mm Bracket Covers',
    // 55mm Bracket Covers
    '55mm_bracket_cover_white': '55mm Bracket Covers', '55mm_bracket_cover_black': '55mm Bracket Covers', '55mm_bracket_cover_birch_white': '55mm Bracket Covers', '55mm_bracket_cover_grey': '55mm Bracket Covers',
    // Metal Chains
    '50cm_metal_chain': 'Metal Chains', '75cm_metal_chain': 'Metal Chains', '100cm_metal_chain': 'Metal Chains', '125cm_metal_chain': 'Metal Chains', '150cm_metal_chain': 'Metal Chains', '175cm_metal_chain': 'Metal Chains', '200cm_metal_chain': 'Metal Chains',
    // Plastic Chains - White
    '50cm_white_chain': 'Plastic Chains - White', '75cm_white_chain': 'Plastic Chains - White', '100cm_white_chain': 'Plastic Chains - White', '125cm_white_chain': 'Plastic Chains - White', '150cm_white_chain': 'Plastic Chains - White', '175cm_white_chain': 'Plastic Chains - White', '200cm_white_chain': 'Plastic Chains - White',
    // Plastic Chains - Black
    '50cm_black_chain': 'Plastic Chains - Black', '75cm_black_chain': 'Plastic Chains - Black', '100cm_black_chain': 'Plastic Chains - Black', '125cm_black_chain': 'Plastic Chains - Black', '150cm_black_chain': 'Plastic Chains - Black', '175cm_black_chain': 'Plastic Chains - Black', '200cm_black_chain': 'Plastic Chains - Black',
    // Plastic Chains - Cream
    '50cm_cream_chain': 'Plastic Chains - Cream', '75cm_cream_chain': 'Plastic Chains - Cream', '100cm_cream_chain': 'Plastic Chains - Cream', '125cm_cream_chain': 'Plastic Chains - Cream', '150cm_cream_chain': 'Plastic Chains - Cream', '175cm_cream_chain': 'Plastic Chains - Cream', '200cm_cream_chain': 'Plastic Chains - Cream', '225cm_cream_chain': 'Plastic Chains - Cream',
    // Plastic Chains - Grey
    '50cm_grey_chain': 'Plastic Chains - Grey', '75cm_grey_chain': 'Plastic Chains - Grey', '100cm_grey_chain': 'Plastic Chains - Grey', '125cm_grey_chain': 'Plastic Chains - Grey', '150cm_grey_chain': 'Plastic Chains - Grey', '175cm_grey_chain': 'Plastic Chains - Grey', '200cm_grey_chain': 'Plastic Chains - Grey',
    // Plastic Chains - Beige
    '50cm_beige_chain': 'Plastic Chains - Beige', '75cm_beige_chain': 'Plastic Chains - Beige', '100cm_beige_chain': 'Plastic Chains - Beige', '125cm_beige_chain': 'Plastic Chains - Beige', '150cm_beige_chain': 'Plastic Chains - Beige', '175cm_beige_chain': 'Plastic Chains - Beige', '200cm_beige_chain': 'Plastic Chains - Beige', '225cm_beige_chain': 'Plastic Chains - Beige', '250cm_beige_chain': 'Plastic Chains - Beige',
    // Stainless Steel Chains
    '50cm_stainless_steel_chain': 'Stainless Steel Chains', '75cm_stainless_steel_chain': 'Stainless Steel Chains', '100cm_stainless_steel_chain': 'Stainless Steel Chains', '125cm_stainless_steel_chain': 'Stainless Steel Chains', '150cm_stainless_steel_chain': 'Stainless Steel Chains', '175cm_stainless_steel_chain': 'Stainless Steel Chains', '200cm_stainless_steel_chain': 'Stainless Steel Chains',
    // Helper Springs
    '43mm_heavy_duty_helper_springs_lhs': 'Helper Springs', '43mm_heavy_duty_helper_springs_rhs': 'Helper Springs', '60mm_heavy_duty_helper_springs_lhs': 'Helper Springs', '60mm_heavy_duty_helper_springs_rhs': 'Helper Springs',
    // 43mm Link
    '43mm_female_link_white': '43mm Link', '43mm_female_link_black': '43mm Link', '43mm_male_link_white': '43mm Link', '43mm_male_link_black': '43mm Link',
    // 38mm Springs
    '38mm_senior_spring': '38mm Springs', '38mm_junior_spring': '38mm Springs',
    // Spline
    '15mm_spline': 'Spline',
    // 60mm Parts
    '60mm_idle_white': '60mm Parts', '60mm_idle_bracket_white': '60mm Parts',
    // Chain Components
    'chain_safe': 'Chain Components', 'stopper_balls': 'Chain Components',
    // Acmeda Motors
    'acmeda_e6_motor': 'Acmeda Motors', 'acmeda_0_7nm_12v_motor': 'Acmeda Motors', 'acmeda_1_1nm_12v_motor': 'Acmeda Motors', 'acmeda_2nm_12v_motor': 'Acmeda Motors', 'acmeda_ft_15nm_motor': 'Acmeda Motors', 'acmeda_1_1nm_12v_dcrf_motor': 'Acmeda Motors',
    // Acmeda Motors - Accessories
    'acmeda_1_1nm_12v_motor_crown_drive_kit_43mm': 'Acmeda Motors - Accessories', 'acmeda_2nm_12v_motor_crown_drive_kit_43mm': 'Acmeda Motors - Accessories', 'acmeda_6nm_12v_motor_crown_drive_kit': 'Acmeda Motors - Accessories', 'acmeda_10nm_12v_motor_crown_60mm_tube': 'Acmeda Motors - Accessories', 'acmeda_10nm_12v_motor_crown_80mm_tube': 'Acmeda Motors - Accessories', 'acmeda_10nm_12v_motor_drive_wheel_60_80mm_tube': 'Acmeda Motors - Accessories',
    // Universal Disc Adaptors
    'm40_universal_disc_adaptor': 'Universal Disc Adaptors', 'm50_universal_disc_adaptor': 'Universal Disc Adaptors',
    // Acmeda 6nm Motor Head
    'acmeda_6nm_motor_head_plate': 'Acmeda 6nm Motor Head', 'automate_motor_head_adaptor': 'Acmeda 6nm Motor Head',
    // Automate 60mm
    'automate_60mm_crown': 'Automate 60mm', 'automate_60mm_drive': 'Automate 60mm',
    // Acmeda motor adaptor
    'acmeda_10nm_12v_motor_adaptor_white': 'Acmeda motor adaptor',
    // Automate FT Motor Adaptor Set
    'automate_ft_motor_adaptor_set_black': 'Automate FT Motor Adaptor Set', 'automate_ft_motor_adaptor_set_white': 'Automate FT Motor Adaptor Set',
    // Somfy Motors
    'sonesse_40_rts_3_30_with_inline_connector_motor': 'Somfy Motors', 'somfy_12v_remote_sonesse_motor': 'Somfy Motors',
    // Somfy 40mm
    'somfy_43mm_12v_crown_drive': 'Somfy 40mm', 'somfy_40_crown': 'Somfy 40mm', 'somfy_40_drive': 'Somfy 40mm',
    // Somfy 50 Crown
    'somfy_50_crown_60mm_tube': 'Somfy 50 Crown', 'somfy50_crown_80mm_tube': 'Somfy 50 Crown',
    // Somfy Accessories
    'somfy_50_drive_60mm_80mm_tube': 'Somfy Accessories', 'm50_somfy_becker_motor_head_adaptor_set': 'Somfy Accessories', 'm50_somfy_motor_head_adaptor_plate': 'Somfy Accessories', 'universal_zamack_bracket': 'Somfy Accessories',
    // Becker Motors
    'becker_p4_30_c12a_motor': 'Becker Motors', 'becker_r20_17_c12a_motor': 'Becker Motors', 'becker_molex_connection': 'Becker Motors',
    // Becker 40
    'becker_40_crown': 'Becker 40', 'becker_40_drive': 'Becker 40',
    // Becker M50 - 60mm Tube
    'becker_m50_drive_wheel_60mm_tube': 'Becker M50 - 60mm Tube', 'becker_m50_crown_60mm_tube': 'Becker M50 - 60mm Tube',
    // Adaptor Set
    'm50_somfy_becker_motor_head_adaptor_set_2': 'Adaptor Set',
    // Acmeda Motor Remote Accessories
    'pulse_pro_automation_hub': 'Acmeda Motor Remote Accessories', 'acmeda_solar_panel': 'Acmeda Motor Remote Accessories', 'acmeda_charging_cable': 'Acmeda Motor Remote Accessories', 'acmeda_3nm_10nm_charging_cable': 'Acmeda Motor Remote Accessories', '210mm_extension_charging_cable': 'Acmeda Motor Remote Accessories', '1200mm_extension_charging_cable': 'Acmeda Motor Remote Accessories', '1_channel_dry_contact_relay_module': 'Acmeda Motor Remote Accessories', 'usb_repeater': 'Acmeda Motor Remote Accessories', 'acmeda_external_battery_for_dcrf_motors': 'Acmeda Motor Remote Accessories', 'acmeda_power_panel_for_dcrf_motors': 'Acmeda Motor Remote Accessories',
    // 12v Motor Covers
    '12v_motor_covers_white': '12v Motor Covers', '12v_motor_covers_black': '12v Motor Covers',
    // Acmeda Channel Remotes
    'acmeda_1_channel_white_remote': 'Acmeda Channel Remotes', 'acmeda_1_channel_black_remote': 'Acmeda Channel Remotes', 'acmeda_5_channel_white_remote': 'Acmeda Channel Remotes', 'acmeda_5_channel_black_remote': 'Acmeda Channel Remotes', 'acmeda_15_channel_white_remote': 'Acmeda Channel Remotes', 'acmeda_15_channel_black_remote': 'Acmeda Channel Remotes',
    // Acmeda Wall Mounted White Remotes
    'acmeda_wall_mounted_single_channel_white_remote': 'Acmeda Wall Mounted White Remotes', 'acmeda_wall_mounted_2_channel_white_remote': 'Acmeda Wall Mounted White Remotes', 'acmeda_wall_mounted_5_channel_white_remote': 'Acmeda Wall Mounted White Remotes', 'acmeda_wall_mounted_15_channel_white_remote': 'Acmeda Wall Mounted White Remotes',
    // Acmeda Push Pro Remotes
    'acmeda_push_pro_white_remote': 'Acmeda Push Pro Remotes', 'acmeda_push_pro_black_remote': 'Acmeda Push Pro Remotes',
    // Charging Cable
    'acmeda_push_pro_charging_cable': 'Charging Cable',
    // Wall Charger
    'acmeda_wall_block': 'Wall Charger',
    // Somfy Remotes
    'somfy_single_channel_white_remote': 'Somfy Remotes', 'somfy_single_channel_silver_remote': 'Somfy Remotes', 'somfy_2_channel_white_remote': 'Somfy Remotes', 'somfy_2_channel_silver_remote': 'Somfy Remotes', 'somfy_5_channel_white_remote': 'Somfy Remotes', 'somfy_5_channel_silver_remote': 'Somfy Remotes', 'somfy_15_channel_white_remote': 'Somfy Remotes', 'somfy_15_channel_black_remote': 'Somfy Remotes',
    // Somfy Wall Mounted Smoove White Remote
    'somfy_single_channel_wall_mounted_smoove_remote_white': 'Somfy Wall Mounted Smoove White Remote', 'somfy_2_channel_wall_mounted_smoove_remote_white': 'Somfy Wall Mounted Smoove White Remote', 'somfy_5_channel_wall_mounted_smoove_remote_white': 'Somfy Wall Mounted Smoove White Remote',
    // Somfy Wall Mounted Remote Cover Plate
    'somfy_wall_mounted_smoove_remote_cover_plate_black': 'Somfy Wall Mounted Remote Cover Plate', 'somfy_wall_mounted_smoove_remote_cover_plate_silver': 'Somfy Wall Mounted Remote Cover Plate',
    // App Connector
    'somfy_connexoon_app_connector': 'App Connector', 'somfy_12v_charger': 'App Connector',
    // Becker Remotes
    'becker_single_channel_white_remote': 'Becker Remotes', 'becker_single_channel_black_remote': 'Becker Remotes', 'becker_5_channel_white_remote': 'Becker Remotes', 'becker_5_channel_black_remote': 'Becker Remotes', 'becker_10_channel_white_remote': 'Becker Remotes', 'becker_10_channel_black_remote': 'Becker Remotes',
    // Becker Wall Mounted White Remote
    'becker_wall_mounted_single_channel_white_remote': 'Becker Wall Mounted White Remote', 'becker_wall_mounted_5_channel_white_remote': 'Becker Wall Mounted White Remote',
    // Cassette Square Cover Set
    'cf90_cassette_sqaure_cover_set_white': 'Cassette Square Cover Set', 'cf90_cassette_sqaure_cover_set_black': 'Cassette Square Cover Set',
    // Cassette Round Cover Set
    'cf90_cassette_round_cover_set_white': 'Cassette Round Cover Set', 'cf90_cassette_round_cover_set_black': 'Cassette Round Cover Set',
    // End Plate Set
    'cf90_cassette_end_plate_set': 'End Plate Set',
    // Square Cassette Chain Guide
    'square_cassette_chain_guide_left': 'Square Cassette Chain Guide', 'square_cassette_chain_guide_right': 'Square Cassette Chain Guide',
    // Round Cassette Chain Guide
    'round_cassette_chain_guide_left': 'Round Cassette Chain Guide', 'round_cassette_chain_guide_right': 'Round Cassette Chain Guide',
    // Cassette Side Guide
    'cf90_cassette_side_guide_ears': 'Cassette Side Guide', 'cf90_cassette_side_guide_locks': 'Cassette Side Guide',
    // Cassette Side Guide Funnel
    'cassette_side_guide_funnel_white': 'Cassette Side Guide Funnel', 'cassette_side_guide_funnel_black': 'Cassette Side Guide Funnel',
    // Cassette Side Guide Bottom Cap
    'cassette_side_guide_bottom_cap_white': 'Cassette Side Guide Bottom Cap',
    // Valance End Caps
    'valance_end_caps_black': 'Valance End Caps', 'valance_end_caps_white': 'Valance End Caps', 'valance_end_caps_cream': 'Valance End Caps', 'valance_end_caps_grey': 'Valance End Caps',
    // Valance Spline
    'valance_round_rubber_spline': 'Valance Spline',
    // Pelmet 95 End Caps
    'pelmet_95_end_caps_grey': 'Pelmet 95 End Caps', 'pelmet_95_end_caps_white': 'Pelmet 95 End Caps', 'pelmet_95_end_caps_black': 'Pelmet 95 End Caps', 'pelmet_95_end_caps_cream': 'Pelmet 95 End Caps',
  };
  // For backward compatibility, keep a map for display names (spaces instead of underscores)
  const SUPPLIER_MAP: { [key: string]: string } = {};

  // Columns that don't get 90° rotation
  const EXCLUDED_ROTATION_COLS = [
    'Order Item Code', 'Product', 'Business Name', 'Quote Ref',
    'Fabric', 'Fabric Sqm', 'Fabric Width', 'Fabric Drop',
    'Job Tracking Action', 'Dispatch Action', 'Dispatch Date',
    'Quote No', 'Quote No.', 'Line No'
  ];

  const renderCommentButton = (columnName: string, quoteNo: string = 'header', lineNo: number = 0, rowType: string = 'data') => (
    <button
      onClick={() =>
        setCommentModal({
          isOpen: true,
          columnName,
          quoteNo,
          lineNo,
          rowType,
        })
      }
      className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 text-red-600 hover:text-red-800 text-sm font-bold ml-1"
      title="Add comment"
    >
      💬
    </button>
  );

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-4">
        <div className="text-sm text-gray-600">
          Showing {page * pageSize + 1} to {Math.min((page + 1) * pageSize, total)} of{' '}
          {total} records
        </div>
        <div className="flex gap-2 items-center">
          <button
            onClick={onShowCommentsSummary}
            className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 font-medium"
          >
            📋 Comments
          </button>
          <ExportButton data={data} fileName="components_report" sums={sums} baseColumns={BASE_COLUMNS} />
        </div>
      </div>

      <div
        className="overflow-x-auto border border-gray-200 rounded-lg"
        id="table-scroll-container"
      >
        <table className="w-full text-sm" style={{ borderCollapse: 'collapse', borderSpacing: 0 }}>
          <thead style={{ borderTop: '2px solid black' }}>
            {/* Part Number Row - Only for Roller Blind Components */}
            {tableName === 'roller_blind_components' && (
              <tr style={{ backgroundColor: '#fff2cc', borderBottom: '1px solid black', height: '60px' }}>
                {table.getHeaderGroups()[0]?.headers.map((header) => {
                  const headerText = String(header.column.columnDef.header || '');
                  const isFirstColumn = header === table.getHeaderGroups()[0].headers[0];
                  const normalizedHeaderText = headerText.replace(/_/g, ' ');
                  const partNumber = PART_NUMBER_MAP[normalizedHeaderText] || PART_NUMBER_MAP[headerText] || '';

                  return (
                    <td key={`pn-${header.id}`} style={{ padding: '2px 2px', backgroundColor: '#fff2cc', border: '1px solid black', textAlign: 'center', verticalAlign: 'middle', color: '#000000', fontSize: isFirstColumn ? '12px' : '8px', fontWeight: 'bold', minWidth: '55px', overflow: 'visible', writingMode: !isFirstColumn ? 'vertical-rl' : 'horizontal-tb', transform: !isFirstColumn ? 'rotate(180deg)' : 'none', height: !isFirstColumn ? '80px' : 'auto' }} className="group relative">
                      <div className="flex items-center justify-center gap-0.5">
                        <span>{isFirstColumn ? 'Part Number' : partNumber}</span>
                        {!isFirstColumn && renderCommentButton(`Part Number - ${headerText}`, 'header', 0, 'header')}
                      </div>
                    </td>
                  );
                })}
              </tr>
            )}

            {/* Group Header Row - Only for Roller Blind Components */}
            {tableName === 'roller_blind_components' && (
              <tr style={{ backgroundColor: '#fff2cc', borderBottom: '1px solid black', height: '60px' }}>
                {(() => {
                  const headers = table.getHeaderGroups()[0]?.headers || [];
                  const result: JSX.Element[] = [];
                  let i = 0;

                  while (i < headers.length) {
                    const currentHeader = headers[i];
                    const headerText = String(currentHeader.column.columnDef.header || '');
                    const isFirstColumn = i === 0;
                    const normalizedHeaderText = headerText.replace(/_/g, ' ');
                    const groupHeader = GROUP_HEADER_MAP[normalizedHeaderText] || GROUP_HEADER_MAP[headerText] || '';

                    if (isFirstColumn) {
                      result.push(
                        <td key={`gh-${currentHeader.id}`} style={{ padding: '4px 2px', backgroundColor: 'white', border: '1px solid black', textAlign: 'center', verticalAlign: 'middle', color: '#000000', fontSize: '11px', fontWeight: 'bold', minWidth: '55px', maxWidth: '55px', overflow: 'visible', whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: '1.2' }} className="group relative">
                          <div className="flex items-center justify-center">Group</div>
                        </td>
                      );
                      i++;
                    } else {
                      let colSpan = 1;
                      while (i + colSpan < headers.length) {
                        const nextHeader = headers[i + colSpan];
                        const nextHeaderText = String(nextHeader.column.columnDef.header || '');
                        const nextNormalizedText = nextHeaderText.replace(/_/g, ' ');
                        const nextGroupHeader = GROUP_HEADER_MAP[nextNormalizedText] || GROUP_HEADER_MAP[nextHeaderText] || '';

                        if (nextGroupHeader === groupHeader) {
                          colSpan++;
                        } else {
                          break;
                        }
                      }

                      result.push(
                        <td key={`gh-${currentHeader.id}`} colSpan={colSpan} style={{ padding: '4px 2px', backgroundColor: '#c0e0f8', border: '1px solid black', textAlign: 'center', verticalAlign: 'middle', color: '#000000', fontSize: '11px', fontWeight: 'bold', minWidth: `${55 * colSpan}px`, maxWidth: `${55 * colSpan}px`, overflow: 'visible', whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: '1.2' }} className="group relative">
                          <div className="flex items-center justify-center gap-0.5">
                            <span>{groupHeader}</span>
                            {renderCommentButton(`Group_${groupHeader}_${i}`, 'header', 0, 'header')}
                          </div>
                        </td>
                      );

                      i += colSpan;
                    }
                  }

                  return result;
                })()}
              </tr>
            )}

            {/* Part Number Row - For Door Screen, Roller Shutter, and External Blinds Components */}
            {(tableName === 'door_screen_components' || tableName === 'roller_shutter_components' || tableName === 'external_blinds_components') && (
              <tr style={{ backgroundColor: '#fff2cc', borderBottom: '1px solid black', height: '60px' }}>
                {table.getHeaderGroups()[0]?.headers.map((header, idx) => {
                  const headerText = String(header.column.columnDef.header || '');
                  const isBaseColumn = BASE_COLUMNS.some(
                    (base) => base.toLowerCase() === headerText.toLowerCase()
                  );
                  const isFirstColumn = idx === 0;
                  const partNumberText = getPartNumberFromColumnName(headerText, tableName);
                  const shouldRotate = !EXCLUDED_ROTATION_COLS.includes(headerText);

                  return (
                    <td
                      key={`partnum-${header.id}`}
                      style={{
                        padding: '2px 2px',
                        backgroundColor: isBaseColumn ? '#f5f5f5' : '#fff2cc',
                        border: '1px solid black',
                        textAlign: 'center',
                        verticalAlign: 'middle',
                        color: '#000000',
                        fontSize: isFirstColumn ? '11px' : '8px',
                        fontWeight: 'bold',
                        width: shouldRotate && !isBaseColumn ? '55px' : 'auto',
                        minWidth: shouldRotate && !isBaseColumn ? '55px' : (isFirstColumn ? '70px' : '55px'),
                        maxWidth: shouldRotate && !isBaseColumn ? '55px' : undefined,
                        height: '60px',
                        lineHeight: '1.2',
                        wordBreak: 'break-word',
                        ...(shouldRotate && !isBaseColumn ? {
                          writingMode: 'vertical-rl',
                          textOrientation: 'mixed',
                          transform: 'rotate(180deg)',
                        } : {})
                      }}
                      className="group relative"
                    >
                      {isFirstColumn ? 'Part No' : (isBaseColumn ? '' : (
                        <div className="flex items-center justify-center gap-0.5">
                          <span>{partNumberText || ''}</span>
                          {!isBaseColumn && renderCommentButton(`PartNum_${headerText}`, 'header', 0, 'header')}
                        </div>
                      ))}
                    </td>
                  );
                })}
              </tr>
            )}

            {/* Group Row - For Door Screen, Roller Shutter, and External Blinds Components */}
            {(tableName === 'door_screen_components' || tableName === 'roller_shutter_components' || tableName === 'external_blinds_components') && (
              <tr style={{ backgroundColor: '#b3e5fc', borderBottom: '1px solid black', height: '60px' }}>
                {(() => {
                  const headers = table.getHeaderGroups()[0]?.headers || [];
                  const result: JSX.Element[] = [];
                  let i = 0;

                  while (i < headers.length) {
                    const currentHeader = headers[i];
                    const headerText = String(currentHeader.column.columnDef.header || '');
                    const isFirstColumn = i === 0;
                    const isBaseColumn = BASE_COLUMNS.some(
                      (base) => base.toLowerCase() === headerText.toLowerCase()
                    );
                    const groupHeader = getGroupFromColumnName(headerText, tableName);

                    if (isFirstColumn) {
                      result.push(
                        <td key={`gh-${currentHeader.id}`} style={{ padding: '4px 2px', backgroundColor: 'white', border: '1px solid black', textAlign: 'center', verticalAlign: 'middle', color: '#000000', fontSize: '11px', fontWeight: 'bold', minWidth: '55px', maxWidth: '55px', overflow: 'visible', whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: '1.2' }} className="group relative">
                          <div className="flex items-center justify-center">Group</div>
                        </td>
                      );
                      i++;
                    } else if (isBaseColumn) {
                      result.push(
                        <td key={`gh-${currentHeader.id}`} style={{ padding: '4px 2px', backgroundColor: '#f5f5f5', border: '1px solid black', textAlign: 'center', verticalAlign: 'middle', color: '#000000', fontSize: '11px', fontWeight: 'bold', minWidth: '55px', maxWidth: '55px', overflow: 'visible' }}>
                        </td>
                      );
                      i++;
                    } else {
                      let colSpan = 1;
                      while (i + colSpan < headers.length) {
                        const nextHeader = headers[i + colSpan];
                        const nextHeaderText = String(nextHeader.column.columnDef.header || '');
                        const nextIsBaseColumn = BASE_COLUMNS.some(
                          (base) => base.toLowerCase() === nextHeaderText.toLowerCase()
                        );
                        const nextGroupHeader = getGroupFromColumnName(nextHeaderText, tableName);

                        if (!nextIsBaseColumn && nextGroupHeader === groupHeader) {
                          colSpan++;
                        } else {
                          break;
                        }
                      }

                      result.push(
                        <td key={`gh-${currentHeader.id}`} colSpan={colSpan} style={{ padding: '4px 2px', backgroundColor: '#b3e5fc', border: '1px solid black', textAlign: 'center', verticalAlign: 'middle', color: '#000000', fontSize: '11px', fontWeight: 'bold', minWidth: `${55 * colSpan}px`, maxWidth: `${55 * colSpan}px`, overflow: 'visible', whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: '1.2' }} className="group relative">
                          <div className="flex items-center justify-center gap-0.5">
                            <span>{groupHeader}</span>
                            {renderCommentButton(`Group_${groupHeader}_${i}`, 'header', 0, 'header')}
                          </div>
                        </td>
                      );

                      i += colSpan;
                    }
                  }

                  return result;
                })()}
              </tr>
            )}

            {/* Supplier Row - For Roller Blind, Door Screen, Roller Shutter, and External Blinds Components */}
            {(tableName === 'roller_blind_components' || tableName === 'door_screen_components' || tableName === 'roller_shutter_components' || tableName === 'external_blinds_components') && (
              <tr style={{ backgroundColor: '#d8bfd8', borderBottom: '1px solid black', height: '95px' }}>
                {table.getHeaderGroups()[0]?.headers.map((header, idx) => {
                  const headerText = String(header.column.columnDef.header || '');
                  const isBaseColumn = BASE_COLUMNS.some(
                    (base) => base.toLowerCase() === headerText.toLowerCase()
                  );
                  const isFirstColumn = idx === 0;
                  const supplierText = getSupplierFromColumnName(headerText, tableName);
                  const shouldRotate = !EXCLUDED_ROTATION_COLS.includes(headerText);

                  return (
                    <td
                      key={`supplier-${header.id}`}
                      style={{
                        padding: '2px 2px',
                        backgroundColor: isBaseColumn ? '#f5f5f5' : '#d8bfd8',
                        border: '1px solid black',
                        textAlign: 'center',
                        verticalAlign: 'bottom',
                        color: '#000000',
                        fontSize: isFirstColumn ? '12px' : '11px',
                        fontWeight: 'bold',
                        width: shouldRotate && !isBaseColumn ? '55px' : 'auto',
                        minWidth: shouldRotate && !isBaseColumn ? '55px' : (isFirstColumn ? '70px' : '55px'),
                        maxWidth: shouldRotate && !isBaseColumn ? '55px' : undefined,
                        height: '95px',
                        lineHeight: '1.2',
                        wordBreak: 'break-word',
                        ...(shouldRotate && !isBaseColumn ? {
                          writingMode: 'vertical-rl',
                          textOrientation: 'mixed',
                          transform: 'rotate(180deg)',
                        } : {})
                      }}
                      className="group relative"
                    >
                      {isFirstColumn ? 'Supplier' : (isBaseColumn ? '' : (
                        <div className="flex items-center justify-center gap-0.5">
                          <span>{supplierText || ''}</span>
                          {!isBaseColumn && renderCommentButton(`Supplier_${headerText}_${supplierText}`, 'header', 0, 'header')}
                        </div>
                      ))}
                    </td>
                  );
                })}
              </tr>
            )}

            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} style={{ height: '320px' }}>
                {headerGroup.headers.map((header) => {
                  const headerText = String(
                    header.column.columnDef.header || ''
                  );
                  const isBaseColumn = BASE_COLUMNS.some(
                    (base) => base.toLowerCase() === headerText.toLowerCase()
                  );

                  return (
                    <th
                      key={header.id}
                      className={clsx(
                        'font-semibold border border-black group relative',
                        isBaseColumn
                          ? 'px-2 py-2 text-left bg-gray-200 text-gray-800 text-xs'
                          : 'bg-gray-100 text-gray-700'
                      )}
                      style={
                        !isBaseColumn
                          ? {
                              width: '55px',
                              minWidth: '55px',
                              maxWidth: '55px',
                              height: '200px',
                              writingMode: 'vertical-rl',
                              textOrientation: 'mixed',
                              transform: 'rotate(180deg)',
                              padding: '4px 2px',
                              fontSize: '10px',
                              overflow: 'visible',
                            }
                          : { minWidth: '70px' }
                      }
                    >
                      <div className="flex items-center justify-between gap-1 relative">
                        <span>{headerText}</span>
                        {cellsWithComments.has(`header_0_${headerText}`) && (
                          <span className="w-3 h-3 bg-red-500 rounded-full flex-shrink-0" title="Has comments"></span>
                        )}
                        {renderCommentButton(headerText, 'header', 0, 'header')}
                      </div>
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody
            ref={tbodyRef}
            style={{
              position: 'relative',
            }}
          >
            {/* Summary Rows at Top */}
            {/* Install Booked next 7 days */}
            <tr className="border-b border-gray-200 font-semibold">
                {table.getHeaderGroups()[0]?.headers
                  .filter((header) => {
                    const key = String(header.column.columnDef.accessorKey || '');
                    return BASE_COLUMNS.some(
                      (base) => base.toLowerCase() === key.toLowerCase()
                    );
                  })
                  .map((header, idx, arr) => (
                    <td
                      key={`next7-base-${idx}`}
                      className="px-3 py-1 text-gray-700 border-r border-gray-200 bg-white group relative text-center"
                      style={{ minWidth: '70px', whiteSpace: 'nowrap', overflow: 'visible' }}
                    >
                      <div className="flex items-center justify-center gap-1">
                        <span>{idx === arr.length - 1 ? 'Install Booked next 7 days' : ''}</span>
                        {renderCommentButton('Install Booked next 7 days', 'summary', 0, 'summary')}
                      </div>
                    </td>
                  ))}
                {table
                  .getHeaderGroups()[0]
                  ?.headers.filter((header) => {
                    const key = String(header.column.columnDef.accessorKey || '');
                    return !BASE_COLUMNS.some(
                      (base) => base.toLowerCase() === key.toLowerCase()
                    );
                  })
                  .map((header) => {
                    const key = header.column.columnDef.accessorKey as string;
                    const value = sums._details?.[key]?.ib7_total || 0;
                    return (
                      <td
                        key={header.id}
                        className="text-gray-900 border-r border-gray-200 last:border-r-0 text-center bg-purple-100 font-semibold group relative"
                        style={{
                          width: '55px',
                          minWidth: '55px',
                          maxWidth: '55px',
                          padding: '2px 1px',
                          fontSize: '11px',
                          overflow: 'visible',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        <div className="flex items-center justify-center gap-0.5">
                          <span>{typeof value === 'number' && value !== 0 ? value.toFixed(1) : typeof value === 'number' ? '0.0' : '-'}</span>
                          {renderCommentButton(header.column.columnDef.accessorKey as string, 'next7', 0, 'summary')}
                        </div>
                      </td>
                    );
                  })}
              </tr>

            <tr className="border-b border-gray-200 font-semibold">
              {table.getHeaderGroups()[0]?.headers
                .filter((header) => {
                  const key = String(header.column.columnDef.accessorKey || '');
                  return BASE_COLUMNS.some(
                    (base) => base.toLowerCase() === key.toLowerCase()
                  );
                })
                .map((header, idx, arr) => (
                  <td
                    key={`install-base-${idx}`}
                    className="px-3 py-1 text-gray-700 border-r border-gray-200 bg-white group relative text-center"
                    style={{ minWidth: '70px', whiteSpace: 'nowrap', overflow: 'visible' }}
                  >
                    <div className="flex items-center justify-center gap-1">
                      <span>{idx === arr.length - 1 ? 'Install Booked' : ''}</span>
                      {renderCommentButton('Install Booked', 'summary', 0, 'summary')}
                    </div>
                  </td>
                ))}
              {table
                .getHeaderGroups()[0]
                ?.headers.filter((header) => {
                  const key = String(header.column.columnDef.accessorKey || '');
                  return !BASE_COLUMNS.some(
                    (base) => base.toLowerCase() === key.toLowerCase()
                  );
                })
                .map((header) => {
                  const key = header.column.columnDef.accessorKey as string;
                  const value = sums._details?.[key]?.ib_total || 0;
                  return (
                    <td
                      key={header.id}
                      className="text-gray-900 border-r border-gray-200 last:border-r-0 text-center bg-blue-100 font-semibold group relative"
                      style={{
                        width: '55px',
                        minWidth: '55px',
                        maxWidth: '55px',
                        padding: '4px 2px',
                        fontSize: '11px',
                        overflow: 'visible',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <div className="flex items-center justify-center gap-0.5">
                        <span>{typeof value === 'number' && value !== 0 ? value.toFixed(1) : typeof value === 'number' ? '0.0' : '-'}</span>
                        {renderCommentButton(key as string, 'install', 0, 'summary')}
                      </div>
                    </td>
                  );
                })}
            </tr>

            {tableName !== 'roller_blind_components' && (
              <tr className="border-b border-gray-200 font-semibold">
                {table.getHeaderGroups()[0]?.headers
                  .filter((header) => {
                    const key = String(header.column.columnDef.accessorKey || '');
                    return BASE_COLUMNS.some(
                      (base) => base.toLowerCase() === key.toLowerCase()
                    );
                  })
                  .map((header, idx, arr) => (
                    <td
                      key={`total-base-${idx}`}
                      className="px-3 py-1 text-gray-700 border-r border-gray-200 bg-white group relative text-center"
                      style={{ minWidth: '70px', whiteSpace: 'nowrap', overflow: 'visible' }}
                    >
                      <div className="flex items-center justify-center gap-1">
                        <span>{idx === arr.length - 1 ? 'Total Required' : ''}</span>
                        {renderCommentButton('Total Required', 'summary', 0, 'summary')}
                      </div>
                    </td>
                  ))}
                {table
                  .getHeaderGroups()[0]
                  ?.headers.filter((header) => {
                    const key = String(header.column.columnDef.accessorKey || '');
                    return !BASE_COLUMNS.some(
                      (base) => base.toLowerCase() === key.toLowerCase()
                    );
                  })
                  .map((header) => {
                    const key = header.column.columnDef.accessorKey as string;
                    const value = sums._details?.[key]?.total || 0;
                    return (
                      <td
                        key={header.id}
                        className="text-gray-900 border-r border-gray-200 last:border-r-0 text-center bg-yellow-100 font-semibold group relative"
                        style={{
                          width: '55px',
                          minWidth: '55px',
                          maxWidth: '55px',
                          padding: '2px 1px',
                          fontSize: '11px',
                          overflow: 'visible',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        <div className="flex items-center justify-center gap-0.5">
                          <span>{typeof value === 'number' && value !== 0 ? value.toFixed(1) : typeof value === 'number' ? '0.0' : '-'}</span>
                          {renderCommentButton(key as string, 'total', 0, 'summary')}
                        </div>
                      </td>
                    );
                  })}
              </tr>
            )}

            <tr className="border-b border-gray-200 font-semibold">
              {table.getHeaderGroups()[0]?.headers
                .filter((header) => {
                  const key = String(header.column.columnDef.accessorKey || '');
                  return BASE_COLUMNS.some(
                    (base) => base.toLowerCase() === key.toLowerCase()
                  );
                })
                .map((header, idx, arr) => (
                  <td
                    key={`kanban-base-${idx}`}
                    className="px-3 py-1 text-gray-700 border-r border-gray-200 bg-white group relative text-center"
                    style={{ minWidth: '70px', whiteSpace: 'nowrap', overflow: 'visible' }}
                  >
                    <div className="flex items-center justify-center gap-1">
                      <span>{idx === arr.length - 1 ? 'Kanban Minimum Stock Level' : ''}</span>
                      {renderCommentButton('Kanban Minimum Stock Level', 'summary', 0, 'summary')}
                    </div>
                  </td>
                ))}
              {table
                .getHeaderGroups()[0]
                ?.headers.filter((header) => {
                  const key = String(header.column.columnDef.accessorKey || '');
                  return !BASE_COLUMNS.some(
                    (base) => base.toLowerCase() === key.toLowerCase()
                  );
                })
                .map((header) => {
                  const key = header.column.columnDef.accessorKey as string;
                  const kanbanValue = sums._details?.[key]?.kanban_min || 0;
                  return (
                    <td
                      key={header.id}
                      className="text-gray-900 border-r border-gray-200 last:border-r-0 text-center bg-gray-50 font-semibold group relative"
                      style={{
                        width: '55px',
                        minWidth: '55px',
                        maxWidth: '55px',
                        padding: '4px 2px',
                        fontSize: '11px',
                        whiteSpace: 'nowrap',
                        overflow: 'visible',
                      }}
                    >
                      <div className="flex items-center justify-center gap-0.5">
                        <span>{typeof kanbanValue === 'number' && kanbanValue !== 0 ? kanbanValue.toFixed(1) : '0'}</span>
                        {renderCommentButton(key as string, 'kanban', 0, 'summary')}
                      </div>
                    </td>
                  );
                })}
            </tr>

            {/* Total Required - Last for Roller Blind Components */}
            {tableName === 'roller_blind_components' && (
              <tr className="border-b border-gray-200 font-semibold">
                {table.getHeaderGroups()[0]?.headers
                  .filter((header) => {
                    const key = String(header.column.columnDef.accessorKey || '');
                    return BASE_COLUMNS.some(
                      (base) => base.toLowerCase() === key.toLowerCase()
                    );
                  })
                  .map((header, idx, arr) => (
                    <td
                      key={`total-base-${idx}`}
                      className="px-3 py-1 text-gray-700 border-r border-gray-200 bg-white group relative text-center"
                      style={{ minWidth: '70px', whiteSpace: 'nowrap', overflow: 'visible' }}
                    >
                      <div className="flex items-center justify-center gap-1">
                        <span>{idx === arr.length - 1 ? 'Total Required' : ''}</span>
                        {renderCommentButton('Total Required', 'summary', 0, 'summary')}
                      </div>
                    </td>
                  ))}
                {table
                  .getHeaderGroups()[0]
                  ?.headers.filter((header) => {
                    const key = String(header.column.columnDef.accessorKey || '');
                    return !BASE_COLUMNS.some(
                      (base) => base.toLowerCase() === key.toLowerCase()
                    );
                  })
                  .map((header) => {
                    const key = header.column.columnDef.accessorKey as string;
                    const value = sums._details?.[key]?.total || 0;
                    return (
                      <td
                        key={header.id}
                        className="text-gray-900 border-r border-gray-200 last:border-r-0 text-center bg-yellow-100 font-semibold group relative"
                        style={{
                          width: '55px',
                          minWidth: '55px',
                          maxWidth: '55px',
                          padding: '2px 1px',
                          fontSize: '11px',
                          overflow: 'visible',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        <div className="flex items-center justify-center gap-0.5">
                          <span>{typeof value === 'number' && value !== 0 ? value.toFixed(1) : typeof value === 'number' ? '0.0' : '-'}</span>
                          {renderCommentButton(key as string, 'total', 0, 'summary')}
                        </div>
                      </td>
                    );
                  })}
              </tr>
            )}

            {/* Data Rows - Virtualized */}
            {rowVirtualizer.getVirtualItems().map((virtualItem) => {
              const row = rows[virtualItem.index];
              if (!row) return null;

              return (
                <tr
                  key={row.id}
                  style={{
                    height: `${virtualItem.size}px`,
                  }}
                  className={clsx(
                    'border-b border-gray-200 hover:bg-gray-50',
                    virtualItem.index % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                  )}
                >
                  {row.getVisibleCells().map((cell) => {
                    const columnKey = String(cell.column.columnDef.header || '');
                    const isBaseColumn = BASE_COLUMNS.some(
                      (base) => base.toLowerCase() === columnKey.toLowerCase()
                    );
                    const quoteNo = row.original.quote_no || '';
                    const lineNo = row.original.line_no || 0;

                    return (
                      <td
                        key={cell.id}
                        className="text-gray-900 border-r border-gray-200 last:border-r-0 text-xs relative group"
                        style={
                          isBaseColumn
                            ? {
                                padding: '4px 6px',
                                minWidth: '80px',
                                fontSize: '12px',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }
                            : {
                                width: '70px',
                                minWidth: '70px',
                                maxWidth: '70px',
                                padding: '2px 1px',
                                textAlign: 'center',
                                fontSize: '10px',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }
                        }
                      >
                        <div className="flex items-center justify-between gap-1 h-full">
                          <span className="flex-1 truncate relative">
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            {cellsWithComments.has(`${quoteNo}_${lineNo}_${columnKey}`) && (
                              <span className="absolute -top-2 -right-2 w-4 h-4 bg-red-500 rounded-full" title="Has comments"></span>
                            )}
                          </span>
                          {renderCommentButton(columnKey, quoteNo, lineNo, 'data')}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Sticky Horizontal Scrollbar */}
      <div
        id="sticky-horizontal-scrollbar"
        className="overflow-x-auto sticky bottom-0 z-40 border-t border-gray-300"
        style={{ height: '16px', backgroundColor: '#f9fafb' }}
        onScroll={(e) => {
          const tableContainer = document.getElementById('table-scroll-container');
          if (tableContainer) {
            tableContainer.scrollLeft = e.currentTarget.scrollLeft;
          }
        }}
      >
        <div style={{ width: tableWidth, height: '16px' }} />
      </div>

      {table.getRowModel().rows.length === 0 && !isLoading && (
        <div className="text-center py-8 text-gray-500">
          No records found
        </div>
      )}

      {/* Pagination */}
      <div className="flex justify-between items-center mt-6">
        <div className="text-sm text-gray-600">
          Page {page + 1} of {totalPages || 1}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={page === 0 || isLoading}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            ← Previous
          </button>
          <button
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages - 1 || isLoading}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next →
          </button>
        </div>
      </div>

      {/* Comments Modal */}
      {commentModal && (
        <CommentsModal
          isOpen={commentModal.isOpen}
          onClose={() => setCommentModal(null)}
          table={tableName || 'door_screen_components'}
          quoteNo={commentModal.quoteNo}
          lineNo={commentModal.lineNo}
          columnName={commentModal.columnName}
          username={username}
        />
      )}
    </div>
  );
}

