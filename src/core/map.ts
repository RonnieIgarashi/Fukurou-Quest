// 村エリアの地形。背景の一枚絵（public/assets/maps/village.jpg、2000x1493）の座標をそのまま使う。
// 歩ける範囲・通れない物・調べられる場所・手前に来る物（前後関係）を、絵に合わせた多角形で持つ。
// 配置は絵から測った値。エリア間の接続（西の橋の先＝森、東の立て札の先＝荒野）はプロトタイプでは通れない。

export const WORLD_W = 2000;
export const WORLD_H = 1493;

export type Pt = readonly [number, number];
export type Poly = readonly Pt[];

export type SpotKind = 'door' | 'forge' | 'plot' | 'sign';

export interface Spot {
  kind: SpotKind;
  /** plot のときの畑の番号 */
  plot?: number;
}

const rect = (x0: number, y0: number, x1: number, y1: number): Poly => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];

function ellipse(cx: number, cy: number, rx: number, ry: number, n = 12): Poly {
  return Array.from({ length: n }, (_, i): Pt => [cx + Math.cos((i / n) * Math.PI * 2) * rx, cy + Math.sin((i / n) * Math.PI * 2) * ry]);
}

/** 点が多角形の中にあるか（偶奇判定） */
export function inPoly(x: number, y: number, poly: Poly): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// ---------------------------------------------------------------- 場所

/** 主人公の小屋の扉の前（朝はここで目覚める） */
export const HOME = { x: 1015, y: 668 } as const;
/** 仲間の寝床（小屋の左右） */
export const BEDS = { moku: { x: 965, y: 664 }, momo: { x: 1068, y: 664 } } as const;

/** 畑は3つの畝を上下に分けた6区画（左上から順） */
export const PLOTS: readonly { x0: number; y0: number; x1: number; y1: number }[] = [
  { x0: 1150, y0: 650, x1: 1205, y1: 706 },
  { x0: 1214, y0: 650, x1: 1266, y1: 706 },
  { x0: 1275, y0: 650, x1: 1322, y1: 706 },
  { x0: 1150, y0: 708, x1: 1205, y1: 764 },
  { x0: 1214, y0: 708, x1: 1266, y1: 764 },
  { x0: 1275, y0: 708, x1: 1322, y1: 762 },
];

/** 調べられる場所（足元か、向いている先がこの中なら反応する） */
const SPOT_AREAS: { kind: SpotKind; poly: Poly }[] = [
  { kind: 'door', poly: rect(992, 622, 1040, 662) },
  // 東の家を鍛冶小屋（炉）にする
  { kind: 'forge', poly: rect(1530, 1112, 1626, 1150) },
  { kind: 'sign', poly: rect(1650, 760, 1712, 815) },
];

/** 夜に灯る窓（小屋2つ・鍛冶小屋1つ） */
export const WINDOWS = {
  hut: [
    { x: 1052, y: 602 },
    { x: 1086, y: 612 },
  ],
  forge: { x: 1586, y: 1086 },
} as const;

// ---------------------------------------------------------------- 歩ける範囲

const WALKABLE: Poly[] = [
  // 村の広場（北は小屋と畑、西は牧場の柵と川、南は石垣、東は石垣と荒野の手前）
  [
    [770, 650],
    [1100, 650],
    [1100, 600],
    [1385, 600],
    [1385, 640],
    [1690, 640],
    [1765, 720],
    [1765, 880],
    [1665, 890],
    [1655, 1180],
    [1050, 1180],
    [1050, 1300],
    [960, 1300],
    [960, 1180],
    [430, 1180],
    [390, 1100],
    [372, 1075],
    [372, 1030],
    [400, 950],
    [640, 945],
    [700, 745],
    [770, 725],
  ],
  // 浜辺
  [
    [395, 1298],
    [1880, 1298],
    [1880, 1350],
    [1700, 1410],
    [1300, 1440],
    [400, 1445],
  ],
  // 西の橋と、その先の小道（森へ続く。今は行き止まり）
  rect(130, 1028, 380, 1078),
  rect(20, 1010, 140, 1095),
];

/** 歩ける範囲の中にある、通れない物 */
const BLOCKED: Poly[] = [
  ellipse(905, 838, 54, 22), // 噴水
  rect(1012, 815, 1050, 852), // 犬
  rect(1095, 600, 1390, 805), // 畑（柵の内側は OPEN で通れる）
  rect(1495, 735, 1585, 775), // 荷車
  rect(1668, 772, 1692, 800), // 立て札
  rect(1180, 1005, 1300, 1050), // 岩
  rect(1450, 962, 1540, 1000), // 岩
  rect(1380, 1070, 1500, 1135), // 岩と茂み
  rect(690, 1110, 752, 1160), // 岩
  rect(1342, 1055, 1380, 1080), // 木の幹
  rect(640, 1425, 770, 1450), // 流木
  // 鍛冶小屋
  [
    [1495, 1060],
    [1560, 1000],
    [1625, 1040],
    [1625, 1130],
    [1495, 1130],
  ],
];

/** 通れない物の中でも通れる所（畑の内側と入口） */
const OPEN: Poly[] = [
  [
    [1140, 645],
    [1330, 645],
    [1342, 768],
    [1195, 768],
    [1195, 808],
    [1125, 808],
    [1125, 768],
    [1135, 700],
  ],
];

export function isBlockedAt(x: number, y: number): boolean {
  if (!WALKABLE.some((p) => inPoly(x, y, p))) return true;
  return BLOCKED.some((p) => inPoly(x, y, p)) && !OPEN.some((p) => inPoly(x, y, p));
}

/** その位置で調べられるもの */
export function spotAt(x: number, y: number): Spot | null {
  const plot = PLOTS.findIndex((p) => x >= p.x0 && x < p.x1 && y >= p.y0 && y < p.y1);
  if (plot >= 0) return { kind: 'plot', plot };
  const a = SPOT_AREAS.find((s) => inPoly(x, y, s.poly));
  return a ? { kind: a.kind } : null;
}

// ---------------------------------------------------------------- 手前に来る物

/**
 * 足元が baseY より上（奥）にいる人物は、この形の部分の絵で上書きして隠す。
 * 絵の物の輪郭にぴったり沿わせる（外側の地面まで含めると、そばを歩く人物が消えてしまう）。
 */
export const OCCLUDERS: { poly: Poly; baseY: number }[] = [
  {
    // 鍛冶小屋
    baseY: 1130,
    poly: [
      [1540, 878],
      [1565, 878],
      [1645, 1010],
      [1625, 1015],
      [1625, 1132],
      [1545, 1132],
      [1545, 1100],
      [1488, 1100],
      [1520, 960],
    ],
  },
  {
    // 広場の南東の木
    baseY: 1076,
    poly: [
      [1300, 960],
      [1320, 920],
      [1360, 905],
      [1405, 920],
      [1415, 970],
      [1395, 1005],
      [1380, 1010],
      [1378, 1078],
      [1345, 1078],
      [1345, 1010],
      [1310, 1000],
    ],
  },
  {
    // 噴水
    baseY: 840,
    poly: [
      [855, 815],
      [880, 795],
      [884, 748],
      [928, 745],
      [932, 795],
      [956, 815],
      [956, 842],
      [855, 842],
    ],
  },
];
