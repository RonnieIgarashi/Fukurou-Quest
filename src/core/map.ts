// エリア（村・小屋の中・鍛冶小屋の中）の地形。座標は各エリアの背景の絵の px（1:1）。
// 歩ける範囲・通れない物・調べられる場所・手前に来る物（前後関係）を、絵に合わせた多角形で持つ。
// 村の配置は Ronnie のイメージ絵（docs/concept/village.jpg）から測った値。
// 室内の絵は Ronnie が後で用意する。それまでは view/interior.ts が仮の絵を描く（座標はこのまま使える）。

export type Pt = readonly [number, number];
export type Poly = readonly Pt[];

export type AreaId = 'village' | 'hut' | 'smithy';

/**
 * 調べられる場所の種類
 * - enter / exit：建物に入る・出る
 * - look：見るだけ（説明の台詞は story.ts の LOOK）
 * - bed / desk / forge / plot：タスクを選ぶ
 */
export type SpotKind = 'enter' | 'exit' | 'look' | 'bed' | 'desk' | 'forge' | 'plot';

export interface Spot {
  kind: SpotKind;
  /** look の台詞の ID、enter の行き先など */
  id?: string;
  /** plot のときの畑の番号 */
  plot?: number;
}

export interface Area {
  w: number;
  h: number;
  /** 背景の絵（無ければ仮の絵を描く） */
  image: string | null;
  walkable: Poly[];
  blocked: Poly[];
  /** 通れない物の中でも通れる所 */
  open: Poly[];
  spots: { spot: Spot; poly: Poly }[];
  /** 足元が baseY より奥の人物は、この形の部分の絵で上書きして隠す */
  occluders: { poly: Poly; baseY: number }[];
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

// ================================================================ 村

/** 畑は3つの畝を上下に分けた6区画（左上から順） */
export const PLOTS: readonly { x0: number; y0: number; x1: number; y1: number }[] = [
  { x0: 1150, y0: 650, x1: 1205, y1: 706 },
  { x0: 1214, y0: 650, x1: 1266, y1: 706 },
  { x0: 1275, y0: 650, x1: 1322, y1: 706 },
  { x0: 1150, y0: 708, x1: 1205, y1: 764 },
  { x0: 1214, y0: 708, x1: 1266, y1: 764 },
  { x0: 1275, y0: 708, x1: 1322, y1: 762 },
];

/** 牧場の内側（ウシが歩き回る範囲） */
export const PEN: Poly = [
  [560, 770],
  [672, 772],
  [640, 872],
  [492, 872],
  [500, 800],
];

/** 夜に灯る窓 */
export const WINDOWS = {
  hut: [
    { x: 1052, y: 602 },
    { x: 1086, y: 612 },
  ],
  forge: { x: 1586, y: 1086 },
} as const;

const VILLAGE: Area = {
  w: 2000,
  h: 1493,
  image: 'assets/maps/village.jpg',
  walkable: [
    // 村の広場（北は小屋・畑・慰霊碑、西は牧場の柵と川、南は石垣、東は石垣と荒野の手前）
    [
      [770, 650],
      [1100, 650],
      [1100, 600],
      [1385, 600],
      [1385, 632],
      [1520, 632],
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
    // 西の橋と、その先の小道（今は行き止まり）
    rect(130, 1028, 380, 1078),
    rect(20, 1010, 140, 1095),
  ],
  blocked: [
    ellipse(905, 838, 54, 22), // 噴水
    rect(1012, 815, 1050, 852), // ベンチ
    rect(1095, 600, 1390, 805), // 畑（柵の内側は open で通れる）
    rect(1495, 735, 1585, 775), // 古い荷車
    rect(1668, 772, 1692, 800), // 荒野の立て札
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
  ],
  open: [
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
  ],
  spots: [
    { spot: { kind: 'enter', id: 'hut' }, poly: rect(992, 622, 1040, 662) },
    { spot: { kind: 'enter', id: 'smithy' }, poly: rect(1530, 1112, 1626, 1150) },
    { spot: { kind: 'look', id: 'memorial' }, poly: rect(1446, 556, 1512, 646) },
    { spot: { kind: 'look', id: 'forestGate' }, poly: rect(1378, 556, 1424, 646) },
    { spot: { kind: 'look', id: 'wastelandSign' }, poly: rect(1650, 760, 1712, 815) },
    { spot: { kind: 'look', id: 'cart' }, poly: rect(1488, 722, 1594, 788) },
    { spot: { kind: 'look', id: 'fountain' }, poly: ellipse(905, 838, 64, 32) },
    { spot: { kind: 'look', id: 'bench' }, poly: rect(1004, 805, 1058, 862) },
    { spot: { kind: 'look', id: 'cows' }, poly: PEN },
    { spot: { kind: 'look', id: 'cows' }, poly: rect(430, 860, 700, 950) },
    { spot: { kind: 'look', id: 'cabin' }, poly: rect(556, 640, 770, 728) },
    { spot: { kind: 'look', id: 'river' }, poly: rect(320, 940, 386, 1100) },
    {
      spot: { kind: 'look', id: 'sea' },
      poly: [
        [395, 1428],
        [1300, 1428],
        [1700, 1398],
        [1880, 1342],
        [1910, 1490],
        [380, 1490],
      ],
    },
  ],
  occluders: [
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
  ],
};

// ================================================================ 室内（仮の間取り。絵は後で差し替え）

/** 室内の部屋の床（歩ける範囲）。仮の絵もこれに合わせて描く */
export const ROOM = { x0: 220, y0: 190, x1: 580, y1: 392 } as const;

const HUT: Area = {
  w: 800,
  h: 450,
  image: null,
  walkable: [rect(ROOM.x0, ROOM.y0, ROOM.x1, ROOM.y1), rect(378, 380, 422, 412)],
  blocked: [
    rect(226, 180, 330, 262), // ベッド
    rect(436, 238, 530, 280), // 机
    rect(540, 180, 580, 236), // モクちゃんの止まり木
  ],
  open: [],
  spots: [
    { spot: { kind: 'exit', id: 'village' }, poly: rect(372, 396, 428, 430) },
    { spot: { kind: 'bed' }, poly: rect(220, 170, 336, 272) },
    { spot: { kind: 'desk' }, poly: rect(430, 226, 536, 290) },
    { spot: { kind: 'look', id: 'hutWindow' }, poly: rect(360, 120, 440, 200) },
    { spot: { kind: 'look', id: 'perch' }, poly: rect(534, 170, 584, 246) },
  ],
  occluders: [],
};

const SMITHY: Area = {
  w: 800,
  h: 450,
  image: null,
  walkable: [rect(ROOM.x0, ROOM.y0, ROOM.x1, ROOM.y1), rect(378, 380, 422, 412)],
  blocked: [
    rect(340, 150, 460, 232), // 炉
    rect(486, 262, 540, 296), // 金床
    rect(226, 196, 296, 252), // 薪の山
  ],
  open: [],
  spots: [
    { spot: { kind: 'exit', id: 'village' }, poly: rect(372, 396, 428, 430) },
    { spot: { kind: 'forge' }, poly: rect(330, 140, 470, 248) },
    { spot: { kind: 'look', id: 'anvil' }, poly: rect(478, 252, 548, 306) },
    { spot: { kind: 'look', id: 'woodpile' }, poly: rect(220, 186, 304, 262) },
  ],
  occluders: [],
};

export const AREAS: Record<AreaId, Area> = { village: VILLAGE, hut: HUT, smithy: SMITHY };

// ================================================================ 出入りと寝床

/** 主人公の小屋の扉の前 */
export const HOME = { x: 1015, y: 668 } as const;

/** 各エリアに入ったときの位置（village はどの建物から出たかで決まる） */
export const ENTRANCES: Record<AreaId, { x: number; y: number }> = {
  village: HOME,
  hut: { x: 400, y: 378 },
  smithy: { x: 400, y: 378 },
};
export const EXIT_TO_VILLAGE: Record<Exclude<AreaId, 'village'>, { x: number; y: number }> = {
  hut: HOME,
  smithy: { x: 1578, y: 1160 },
};

/** 朝に目覚める場所（小屋の中、ベッドの横） */
export const WAKE = { area: 'hut' as AreaId, x: 300, y: 300 };

/** 仲間の寝床（小屋の中） */
export const BEDS = {
  moku: { area: 'hut' as AreaId, x: 560, y: 238 },
  momo: { area: 'hut' as AreaId, x: 250, y: 360 },
} as const;

// ================================================================ 問い合わせ

export function isBlockedAt(area: AreaId, x: number, y: number): boolean {
  const a = AREAS[area];
  if (!a.walkable.some((p) => inPoly(x, y, p))) return true;
  return a.blocked.some((p) => inPoly(x, y, p)) && !a.open.some((p) => inPoly(x, y, p));
}

/** その位置で調べられるもの */
export function spotAt(area: AreaId, x: number, y: number): Spot | null {
  if (area === 'village') {
    const plot = PLOTS.findIndex((p) => x >= p.x0 && x < p.x1 && y >= p.y0 && y < p.y1);
    if (plot >= 0) return { kind: 'plot', plot };
  }
  return AREAS[area].spots.find((s) => inPoly(x, y, s.poly))?.spot ?? null;
}
