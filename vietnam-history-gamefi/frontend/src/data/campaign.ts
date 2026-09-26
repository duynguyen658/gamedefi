import { BattleUnit, CampaignChapter, HexTile, MapLocation } from '../types';

// ---------------------------------------------------------------------------
// Chương chiến dịch — ăn khớp 1-1 với 5 triều đại / faction_id trong useFaction
// ---------------------------------------------------------------------------
export const CAMPAIGN_CHAPTERS: CampaignChapter[] = [
  { chapter_id: 1, faction_id: 1, code: 'nha_ly', title_vi: 'Nhà Lý', title_en: '1009-1225', era: '1009-1225', status: 'available' },
  { chapter_id: 2, faction_id: 2, code: 'nha_tran', title_vi: 'Nhà Trần', title_en: '1225-1400', era: '1225-1400', status: 'active' },
  { chapter_id: 3, faction_id: 3, code: 'nha_le', title_vi: 'Nhà Lê', title_en: '1428-1789', era: '1423-1789', status: 'available' },
  { chapter_id: 4, faction_id: 4, code: 'tay_son', title_vi: 'Tây Sơn', title_en: '1778-1802', era: '1778-1802', status: 'locked' },
  { chapter_id: 5, faction_id: 5, code: 'nha_nguyen', title_vi: 'Nhà Nguyễn', title_en: '1802-1945', era: '1802-1945', status: 'locked' },
];

// Vị trí các trọng điểm trên bản đồ chiến dịch (toạ độ % trong khung bản đồ)
export const MAP_LOCATIONS: MapLocation[] = [
  {
    location_id: 'thang_long',
    chapter_id: 1,
    name: 'Thăng Long',
    sub_label: 'Kinh đô Nhà Lý',
    flag_glyph: '李',
    x: 44,
    y: 34,
    is_capital: true,
  },
  {
    location_id: 'bach_dang',
    chapter_id: 2,
    name: 'Bạch Đằng',
    sub_label: 'Nhà Trần',
    flag_glyph: '陳',
    x: 61,
    y: 24,
    is_target: true,
    tooltip: 'Điểm chiến lược',
  },
  {
    location_id: 'lam_son',
    chapter_id: 3,
    name: 'Lam Sơn',
    sub_label: 'Nhà Lê',
    flag_glyph: '黎',
    x: 49,
    y: 59,
  },
  {
    location_id: 'phu_xuan',
    chapter_id: 5,
    name: 'Phú Xuân',
    sub_label: 'Nhà Nguyễn',
    flag_glyph: '阮',
    x: 70,
    y: 76,
  },
];

// ---------------------------------------------------------------------------
// Trận Bạch Đằng — bàn cờ hex chiến thuật (12 cột x 7 hàng)
// ---------------------------------------------------------------------------
const COLS = 12;
const ROWS = 7;

function buildBachDangHexes(): HexTile[] {
  const tiles: HexTile[] = [];

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      let terrain: HexTile['terrain'] = 'plain';
      let zone: HexTile['zone'] = 'neutral';
      let label: string | undefined;
      let effect: string | undefined;

      if (col <= 2) {
        // Quân ta bố trận trên gò cao phía Tây
        zone = 'ally';
        terrain = row % 3 === 0 ? 'hill' : 'plain';
      } else if (col === 3 || col === 4) {
        zone = 'ally';
        terrain = 'plain';
      } else if (col >= 5 && col <= 6) {
        // Vùng tiếp xúc — bãi lầy & rừng ngập mặn
        zone = row < 4 ? 'ally' : 'enemy';
        terrain = row % 2 === 0 ? 'forest' : 'mud';
      } else if (col >= 7 && col <= 8) {
        zone = 'enemy';
        terrain = 'mud';
      } else {
        // Sông Bạch Đằng phía Đông
        zone = 'neutral';
        terrain = 'river';
      }

      tiles.push({ col, row, terrain, zone, label, effect });
    }
  }

  // Ô đặc biệt: gò cao đặt cung thủ (Terrain Advantage Indicator trong ảnh mẫu)
  const hill = tiles.find(t => t.col === 1 && t.row === 3)!;
  hill.terrain = 'hill';
  hill.zone = 'ally';
  hill.label = 'Gò cao';
  hill.effect = '+20% tầm bắn cung thủ';

  // Ô rừng tre / rừng ngập mặn (ẩn nấp)
  const forest = tiles.find(t => t.col === 6 && t.row === 5)!;
  forest.terrain = 'forest';
  forest.label = 'Rừng ngập mặn';
  forest.effect = 'Ẩn nấp và phục kích';

  // Ô bãi lầy (giảm tốc độ di chuyển)
  const mud = tiles.find(t => t.col === 7 && t.row === 4)!;
  mud.terrain = 'mud';
  mud.label = 'Bãi lầy triều';
  mud.effect = 'Giảm tốc độ di chuyển';

  // Ô cọc ngầm — hiểm hoạ cho thuyền địch
  const stakes = tiles.find(t => t.col === 9 && t.row === 2)!;
  stakes.terrain = 'stakes';
  stakes.zone = 'neutral';
  stakes.label = 'Cọc ngầm Bạch Đằng';
  stakes.effect = 'Cản thuyền địch';

  return tiles;
}

export const BACH_DANG_HEXES: HexTile[] = buildBachDangHexes();

export const BACH_DANG_UNITS: BattleUnit[] = [
  {
    unit_id: 'p1',
    name: 'Thương binh Trần',
    side: 'player',
    icon: 'spear',
    col: 2,
    row: 3,
    stats: { at: 150, atk: 38, def: 39, asTk: 12, atf: 33, reg: 25 },
  },
  {
    unit_id: 'p2',
    name: 'Tượng binh Trần',
    side: 'player',
    icon: 'elephant',
    col: 1,
    row: 4,
    stats: { at: 90, atk: 55, def: 48, asTk: 8, atf: 20, reg: 18 },
  },
  {
    unit_id: 'p3',
    name: 'Cung thủ Trần',
    side: 'player',
    icon: 'archer',
    col: 1,
    row: 2,
    stats: { at: 120, atk: 30, def: 22, asTk: 16, atf: 45, reg: 20 },
  },
  {
    unit_id: 'p4',
    name: 'Thương binh Trần II',
    side: 'player',
    icon: 'spear',
    col: 2,
    row: 5,
    stats: { at: 140, atk: 36, def: 37, asTk: 12, atf: 30, reg: 24 },
  },
  {
    unit_id: 'e1',
    name: 'Kỵ binh Nguyên',
    side: 'enemy',
    icon: 'cavalry',
    col: 6,
    row: 3,
    stats: { at: 130, atk: 44, def: 30, asTk: 18, atf: 28, reg: 15 },
  },
  {
    unit_id: 'e2',
    name: 'Tiền quân Nguyên',
    side: 'enemy',
    icon: 'spear',
    col: 7,
    row: 2,
    stats: { at: 110, atk: 34, def: 28, asTk: 14, atf: 22, reg: 16 },
  },
];

export const BATTLEFIELD_DIMS = { cols: COLS, rows: ROWS };
