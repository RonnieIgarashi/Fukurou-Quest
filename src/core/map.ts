// エリア（村・小屋の中・鍛冶小屋の中）の地形。座標は各エリアの背景の絵の px（1:1）。
// 歩ける範囲・通れない物・調べられる場所・手前に来る物（前後関係）を、絵に合わせた多角形で持つ。
// 村の配置は Ronnie のイメージ絵（修正版 docs/concept/village_v2.jpg。ゲーム用の加工は tools/prepare_village.py）から測った値。
// 室内の絵は Ronnie が後で用意する。それまでは view/interior.ts が仮の絵を描く（座標はこのまま使える）。

export type Pt = readonly [number, number];
export type Poly = readonly Pt[];

export type AreaId = 'village' | 'hut' | 'smithy' | 'forest';

/**
 * 調べられる場所の種類
 * - enter / exit：建物に入る・出る
 * - look：見るだけ（説明の台詞は story.ts の LOOK）
 * - bed / desk / forge / plot / barrel：タスクを選ぶ（barrel は水くみ場の樽）
 */
export type SpotKind = 'enter' | 'exit' | 'look' | 'bed' | 'desk' | 'forge' | 'plot' | 'barrel' | 'log';

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
  occluders: Occluder[];
  /** 人物を描く大きさの倍率（家の中の絵は村より大きく描いてあるので、人物も大きくする） */
  charScale?: number;
  /**
   * 奥行き（遠近）。y が far の所では farScale、near の所では nearScale の大きさで人物を描き、その間はなめらかに変える。
   * 正面から奥を見た絵（森の道など）で、奥へ行くほど小さく見せる（2026-11-20 Ronnie）。映す倍率は charScale のまま
   */
  depth?: { far: number; farScale: number; near: number; nearScale: number };
}

/** 背景の色の種類（切り抜きから抜いて、後ろが透けて見えるようにする） */
export type Clear = 'grass' | 'sand' | 'water';

export interface Occluder {
  poly: Poly;
  baseY: number;
  /** 風で揺れる木の名前（world.ts の SWAYS） */
  sway?: string;
  /** 形の中で抜く所（欄干のすき間など。後ろの人物が透けて見える） */
  holes?: Poly[];
  /** 形の中の、この色の所を抜く（grass・sand は透明に、water は半透明に）。ふだんは外側から続く所だけ抜く */
  clear?: Clear[];
  /** 囲まれた内側のすき間も抜く（噴水の水の弧と台座の間など） */
  clearInside?: boolean;
  /**
   * 前後を、横の位置ごとの物の下端で決める（岩・ベンチなど、地面に接する所が斜め・でこぼこの物）。
   * 無いときは baseY の1本の線で決める（看板・建物など、根元が1か所の物）
   */
  outline?: boolean;
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

/** 曲線 y = f(x) を x0〜x1 で点の列にする */
function curve(x0: number, x1: number, f: (x: number) => number, step = 8): Pt[] {
  const pts: Pt[] = [];
  for (let x = x0; x < x1; x += step) pts.push([x, f(x)]);
  pts.push([x1, f(x1)]);
  return pts;
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

/** 荒野の手前（黒ウシが歩き回る範囲。石垣の向こうなので主人公は入れない） */
export const WASTE: Poly = [
  [1786, 1002],
  [1938, 1004],
  [1944, 1090],
  [1792, 1096],
];

// 西の反り橋（真ん中 x=255 がいちばん高い）。絵から測った曲線
const arch = (top: number, k: number) => (x: number) => top + k * (x - 255) ** 2;
/** 主人公が歩く床の線（手前の欄干のすぐ後ろ） */
export const bridgeDeck = arch(1040, 0.0022);
const bridgeRailTop = arch(1019, 0.0023);
const bridgeGapTop = arch(1033, 0.0023);
const bridgeGapBottom = arch(1059, 0.0019);
const bridgeRailBottom = arch(1086, 0.0016);
/** 手前の欄干の、柱と柱のすき間（x の範囲） */
const BRIDGE_GAPS: [number, number][] = [
  [157, 172],
  [182, 199],
  [211, 225],
  [238, 253],
  [266, 287],
  [298, 314],
  [326, 339],
];

/** 夜に灯る窓 */
export const WINDOWS = {
  // 木の家の入口と、上の小さな見張り小屋
  hut: [
    { x: 1018, y: 582 },
    { x: 963, y: 470 },
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
      [1385, 640],
      [1462, 640],
      // 森の入り口の小道（上の端で森に入る）
      [1478, 594],
      [1572, 594],
      // 荒野の立て札の上の針葉樹・広葉樹の根元より手前だけ歩ける
      [1572, 742],
      [1730, 746],
      [1850, 792],
      [1850, 862],
      [1765, 880],
      [1665, 890],
      // 南は石垣の上の縁まで（石垣の奥側を歩くと、石垣に足元が隠れる）
      [1655, 1190],
      [1050, 1190],
      [1050, 1300],
      [960, 1300],
      [960, 1198],
      [436, 1198],
      [420, 1180],
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
    // 西の橋（反り橋の床に沿って歩く。手前の欄干の後ろ）と、その先の小道（今は行き止まり）
    [...curve(128, 382, (x) => bridgeDeck(x) - 11), ...curve(128, 382, (x) => bridgeDeck(x) + 11).reverse()],
    rect(20, 1010, 140, 1095),
  ],
  blocked: [
    ellipse(905, 838, 54, 22), // 噴水
    // ベンチ（斜めの座面の下の地面）
    [
      [998, 858],
      [1026, 808],
      [1050, 816],
      [1054, 832],
      [1036, 876],
      [1004, 876],
    ],
    rect(392, 1184, 536, 1200), // 石垣の左端の奥の草むらの根元
    rect(1095, 600, 1390, 805), // 畑（柵の内側は open で通れる）
    rect(1495, 735, 1585, 775), // 古い荷車
    rect(1620, 786, 1684, 803), // 荒野の立て札（矢印の下も通れない）
    rect(1393, 640, 1445, 658), // 森の立て札
    rect(1732, 750, 1838, 780), // 慰霊碑
    // 水くみ場の水樽（樽ごとの根元。樽と樽の後ろは通れる）
    rect(434, 986, 480, 1005),
    rect(489, 972, 535, 990),
    rect(524, 990, 571, 1007),
    // 岩は根元だけ通れない（奥側に回り込むと、岩に隠れる）
    rect(1192, 1034, 1298, 1058), // 広場の南東の木の左の岩
    rect(1404, 996, 1504, 1011), // 鍛冶小屋の左上の岩
    rect(1336, 1108, 1458, 1138), // 鍛冶小屋の左下の岩と茂み
    rect(674, 1138, 742, 1161), // 石垣の手前の岩
    rect(1296, 1052, 1334, 1078), // 木の幹
    rect(1640, 970, 1662, 988), // 鍛冶小屋の横の木の幹
    rect(640, 1425, 770, 1450), // 流木
    // 鍛冶小屋（床の形。棟が奥へのびているので、右奥へずれた平行四辺形）
    [
      [1497, 1124],
      [1590, 1124],
      [1620, 1004],
      [1532, 1004],
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
    { spot: { kind: 'look', id: 'memorial' }, poly: rect(1716, 700, 1852, 800) },
    // 森の入り口（2026-11-20）：立て札の右の道を上へ歩くと森へ入る。立て札は調べられる
    { spot: { kind: 'enter', id: 'forest' }, poly: rect(1478, 586, 1575, 606) },
    { spot: { kind: 'look', id: 'forestGate' }, poly: rect(1380, 600, 1462, 668) },
    { spot: { kind: 'look', id: 'wastelandSign' }, poly: rect(1612, 735, 1700, 815) },
    { spot: { kind: 'look', id: 'cart' }, poly: rect(1488, 722, 1594, 788) },
    { spot: { kind: 'look', id: 'fountain' }, poly: ellipse(905, 838, 64, 32) },
    { spot: { kind: 'look', id: 'bench' }, poly: rect(990, 800, 1066, 890) },
    { spot: { kind: 'barrel' }, poly: rect(410, 948, 604, 1030) },
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
      // 鍛冶小屋（屋根と壁の輪郭。まわりの草は抜く）
      baseY: 1126,
      clear: ['grass', 'sand'],
      poly: [
        [1548, 874],
        [1594, 874],
        [1632, 944],
        [1628, 1012],
        [1602, 1076],
        [1594, 1128],
        [1494, 1128],
        [1492, 1076],
        [1482, 1062],
        [1520, 958],
      ],
    },
    {
      // 西の橋の手前の欄干（柱の間のすき間は抜いて、後ろを歩く人が見えるように）
      baseY: 1090,
      poly: [
        [139, 1043],
        [156, 1043],
        ...curve(156, 341, bridgeRailTop),
        [341, 1043],
        [357, 1043],
        [357, 1106],
        ...curve(139, 357, bridgeRailBottom).reverse(),
        [139, 1106],
      ],
      holes: BRIDGE_GAPS.map(([x0, x1]) => [...curve(x0, x1, bridgeGapTop, 4), ...curve(x0, x1, bridgeGapBottom, 4).reverse()]),
    },
    {
      // 石垣（西）。上の草と下の砂は抜く
      baseY: 1292,
      clear: ['grass', 'sand'],
      poly: [
        [430, 1184],
        [968, 1180],
        [968, 1304],
        [430, 1304],
      ],
    },
    {
      // 石垣（東）
      baseY: 1292,
      clear: ['grass', 'sand'],
      poly: [
        [1042, 1172],
        [1655, 1172],
        [1700, 1150],
        [1722, 1300],
        [1042, 1304],
      ],
    },
    // 岩（まわりの草・砂は抜く。前後は岩の下端の形で決める）
    { baseY: 1058, outline: true, clear: ['grass', 'sand'], poly: [[1184, 1032], [1198, 1002], [1240, 992], [1292, 998], [1304, 1030], [1302, 1062], [1184, 1062]] },
    {
      // 鍛冶小屋の左上の岩（3つ重なった岩の輪郭どおり）
      baseY: 1012,
      outline: true,
      poly: [
        [1400, 995], [1402, 985], [1405, 977], [1415, 970], [1427, 968], [1440, 971], [1447, 965], [1455, 955], [1467, 948], [1482, 943],
        [1497, 945], [1505, 953], [1508, 975], [1506, 1000], [1495, 1010], [1470, 1013], [1450, 1013], [1430, 1009], [1420, 1008], [1410, 1003],
      ],
    },
    {
      // 鍛冶小屋の左下の岩と茂み（茂みは緑なので色では抜かず、輪郭どおりに切り抜く）
      baseY: 1140,
      outline: true,
      poly: [
        [1330, 1102], [1340, 1080], [1350, 1062], [1360, 1050], [1372, 1042], [1380, 1043], [1387, 1053], [1400, 1057], [1417, 1063], [1433, 1068], [1442, 1077],
        [1447, 1087], [1457, 1093], [1462, 1108], [1457, 1118], [1443, 1130], [1420, 1137], [1400, 1141], [1377, 1138], [1360, 1124], [1340, 1121], [1330, 1113],
      ],
    },
    { baseY: 1161, outline: true, clear: ['grass', 'sand'], poly: [[664, 1110], [676, 1068], [704, 1052], [738, 1070], [750, 1164], [664, 1164]] },
    // 荒野の入口の茶色い岩（土と同じような色なので、岩の輪郭どおりに切り抜く）
    {
      baseY: 902,
      outline: true,
      poly: [[1702, 880], [1707, 867], [1720, 857], [1735, 852], [1747, 857], [1760, 870], [1757, 885], [1752, 897], [1735, 900], [1715, 902], [1705, 895]],
    },
    {
      baseY: 925,
      outline: true,
      poly: [[1757, 910], [1762, 880], [1777, 855], [1797, 842], [1815, 850], [1832, 862], [1842, 875], [1850, 905], [1845, 917], [1827, 925], [1800, 925], [1775, 920], [1760, 917]],
    },
    {
      // 西の石垣の左端の奥の草むら
      baseY: 1200,
      poly: [[385, 1150], [410, 1135], [440, 1128], [470, 1138], [500, 1148], [525, 1168], [540, 1188], [540, 1204], [385, 1204]],
    },
    {
      // ベンチ（斜めに置いてあるので、前後はベンチの下端の形で決める）
      baseY: 878,
      outline: true,
      clear: ['sand'],
      poly: [[994, 856], [1024, 800], [1050, 784], [1062, 790], [1060, 840], [1040, 880], [994, 880]],
    },
    {
      // 荒野の立て札（矢印の形どおり。根元は1か所なので、前後は柱の根元で決める）
      baseY: 802,
      poly: [
        [1622, 756],
        [1626, 752],
        [1639, 752],
        [1639, 737],
        [1648, 737],
        [1648, 752],
        [1662, 752],
        [1663, 744],
        [1668, 744],
        [1681, 757],
        [1666, 772],
        [1661, 772],
        [1661, 767],
        [1648, 767],
        [1648, 803],
        [1639, 803],
        [1639, 767],
        [1624, 767],
      ],
    },
    {
      // 広場の南東の木（揺れる。world.ts の SWAYS と同じ揺れ方で描く）
      baseY: 1076,
      sway: 'plazaTree',
      poly: [
        [1253, 962],
        [1262, 940],
        [1280, 924],
        [1300, 919],
        [1332, 921],
        [1346, 944],
        [1363, 958],
        [1370, 990],
        [1360, 1012],
        [1332, 1017],
        [1331, 1080],
        [1291, 1080],
        [1299, 1016],
        [1268, 1006],
        [1254, 990],
      ],
    },
    {
      // 鍛冶小屋の横の木（揺れる）
      baseY: 984,
      sway: 'smithyTree',
      poly: [
        [1612, 880],
        [1622, 850],
        [1645, 825],
        [1666, 825],
        [1690, 850],
        [1701, 880],
        [1696, 912],
        [1662, 920],
        [1661, 986],
        [1640, 986],
        [1642, 920],
        [1614, 905],
      ],
    },
    {
      // 慰霊碑
      baseY: 778,
      poly: [
        [1752, 702],
        [1758, 678],
        [1774, 666],
        [1800, 666],
        [1816, 682],
        [1822, 742],
        [1840, 750],
        [1840, 780],
        [1730, 780],
        [1730, 752],
        [1750, 746],
      ],
    },
    {
      // 森の立て札
      baseY: 656,
      poly: [
        [1386, 578],
        [1450, 578],
        [1450, 616],
        [1440, 616],
        [1440, 658],
        [1396, 658],
        [1396, 616],
        [1386, 616],
      ],
    },
    {
      // 水くみ場の水樽（左）。樽ごとに輪郭どおり切り抜く（まわりの地面まで重ねると、人が地面の下にもぐって見える）
      baseY: 1005,
      poly: [[432, 950], [440, 942], [474, 942], [482, 950], [484, 995], [472, 1006], [442, 1006], [430, 995]],
    },
    {
      // 水くみ場の水樽（奥）
      baseY: 990,
      poly: [[487, 932], [495, 925], [530, 925], [538, 932], [538, 985], [526, 992], [498, 992], [487, 985]],
    },
    {
      // 水くみ場の水樽（右）
      baseY: 1007,
      poly: [[522, 962], [530, 955], [565, 955], [574, 962], [575, 1000], [562, 1008], [534, 1008], [522, 1000]],
    },
    {
      // 噴水（水の弧と台座のすき間の砂は抜き、水は半透明に）
      baseY: 840,
      clear: ['sand', 'water'],
      clearInside: true,
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

/**
 * 木の家の中（Ronnie の絵 docs/concept/hut_interior.jpg を tools/prepare_interior.py で 1000x747 にしたもの）。
 * 床：階段の右から、ベッド・机の手前まで。手前は敷物（出口）まで
 */
const HUT: Area = {
  w: 1000,
  h: 747,
  image: 'assets/maps/hut.jpg',
  walkable: [
    [
      [330, 500],
      [460, 466],
      [640, 460],
      [730, 472],
      [785, 480],
      [785, 600],
      [760, 640],
      [640, 680],
      [560, 705],
      [420, 705],
      [330, 662],
      [300, 600],
      [300, 520],
    ],
  ],
  blocked: [
    // 家具は脚の床の所だけ通れない（奥に回り込むと、家具に隠れる）
    rect(520, 590, 668, 616), // 丸いテーブル
    rect(466, 572, 530, 596), // いす
    rect(655, 602, 712, 627), // 丸いす
  ],
  open: [],
  spots: [
    { spot: { kind: 'exit', id: 'village' }, poly: rect(380, 668, 545, 720) },
    { spot: { kind: 'bed' }, poly: rect(470, 420, 640, 492) },
    { spot: { kind: 'desk' }, poly: rect(728, 420, 830, 502) },
    { spot: { kind: 'look', id: 'hutStairs' }, poly: rect(270, 420, 330, 600) },
    { spot: { kind: 'look', id: 'hutTable' }, poly: rect(510, 540, 690, 640) },
  ],
  // 家具の輪郭どおりに切り抜いて、奥にいる人物の上に重ねる（前後は下端の形で決める）
  occluders: [
    {
      // 丸いテーブル（かご・皿ごと）
      baseY: 612,
      outline: true,
      poly: [
        [512, 522], [528, 498], [552, 486], [552, 470], [575, 462], [598, 466], [606, 484], [640, 484], [660, 490],
        [684, 508], [686, 532], [668, 553], [650, 560], [647, 612], [636, 615], [632, 566], [560, 567], [548, 607],
        [533, 607], [528, 560], [512, 545],
      ],
    },
    {
      // いす
      baseY: 594,
      outline: true,
      poly: [[462, 472], [500, 462], [506, 530], [534, 538], [536, 556], [522, 596], [512, 596], [506, 576], [482, 576], [476, 596], [467, 596], [464, 540]],
    },
    {
      // 丸いす
      baseY: 626,
      outline: true,
      poly: [[651, 571], [664, 560], [700, 559], [713, 571], [712, 586], [706, 626], [695, 626], [690, 602], [671, 602], [666, 626], [656, 626], [655, 588]],
    },
    {
      // 右の棚とかばん
      baseY: 600,
      outline: true,
      poly: [[792, 470], [806, 456], [842, 452], [880, 466], [882, 600], [792, 600]],
    },
    {
      // 棚に立てかけた箒（2026-11-20 Ronnie「箒も回り込みするように」）。穂先の下端より奥にいると隠れる
      baseY: 676,
      outline: true,
      poly: [
        [821, 519], [830, 522], [776, 614], [776, 622], [763, 650], [755, 673], [733, 679], [710, 664], [700, 650],
        [722, 639], [746, 620], [759, 607],
      ],
    },
  ],
  charScale: 1.6,
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

/**
 * 森の入り口（Ronnie の絵 docs/concept/forest_entrance.jpg。tools/prepare_forest.py で 1000x615 に）。
 * 奥へ続く道を正面から見た絵なので、手前の道だけを歩ける。左の倒木で薪が取れる（2026-11-20 Ronnie）。
 * 拾える薪・マナの絵は、あとで Ronnie が用意する
 */
const FOREST: Area = {
  w: 1000,
  h: 615,
  image: 'assets/maps/forest.jpg',
  walkable: [
    [
      [365, 615], [372, 595], [402, 540], [425, 500], [400, 450], [390, 425], [396, 408], [432, 400], [445, 355],
      [455, 300], [468, 250], [474, 222], [500, 222], [512, 250], [535, 300], [540, 380], [555, 445], [600, 500],
      [625, 560], [635, 615],
    ],
  ],
  blocked: [],
  open: [],
  spots: [
    { spot: { kind: 'exit', id: 'village' }, poly: rect(355, 598, 645, 640) },
    { spot: { kind: 'log' }, poly: rect(335, 260, 445, 420) },
    { spot: { kind: 'look', id: 'forestPath' }, poly: rect(462, 190, 515, 226) },
  ],
  occluders: [],
  charScale: 1.25,
  // 道の幅の細くなり方に合わせて、手前は大きく、奥ほど小さく
  depth: { far: 222, farScale: 0.45, near: 615, nearScale: 1.3 },
};

export const AREAS: Record<AreaId, Area> = { village: VILLAGE, hut: HUT, smithy: SMITHY, forest: FOREST };

// ================================================================ 出入りと寝床

/** 主人公の小屋の扉の前 */
export const HOME = { x: 1015, y: 668 } as const;

/** 各エリアに入ったときの位置（village はどの建物から出たかで決まる） */
export const ENTRANCES: Record<AreaId, { x: number; y: number }> = {
  village: HOME,
  hut: { x: 462, y: 652 },
  smithy: { x: 400, y: 378 },
  forest: { x: 500, y: 575 },
};
export const EXIT_TO_VILLAGE: Record<Exclude<AreaId, 'village'>, { x: number; y: number }> = {
  hut: HOME,
  smithy: { x: 1578, y: 1160 },
  forest: { x: 1525, y: 628 },
};

/** 朝に目覚める場所（小屋の中、ベッドの横） */
export const WAKE = { area: 'hut' as AreaId, x: 560, y: 505 };

/** 仲間の寝床（小屋の中） */
export const BEDS = {
  moku: { area: 'hut' as AreaId, x: 600, y: 206 }, // ロフトのわらの寝床
  momo: { area: 'hut' as AreaId, x: 712, y: 340 }, // 樽の上
} as const;

// ================================================================ 問い合わせ

export function isBlockedAt(area: AreaId, x: number, y: number): boolean {
  const a = AREAS[area];
  if (!a.walkable.some((p) => inPoly(x, y, p))) return true;
  return a.blocked.some((p) => inPoly(x, y, p)) && !a.open.some((p) => inPoly(x, y, p));
}

/** そのエリアを映す倍率（人物の手前での大きさ。村は 1） */
export function charScale(area: AreaId): number {
  return AREAS[area].charScale ?? 1;
}

/** その高さ（足元の y）で人物を描く大きさ。奥行きのあるエリアでは、奥ほど小さい */
export function charScaleAt(area: AreaId, y: number): number {
  const d = AREAS[area].depth;
  if (!d) return charScale(area);
  const k = Math.max(0, Math.min(1, (y - d.far) / (d.near - d.far)));
  return d.farScale + (d.nearScale - d.farScale) * k;
}

/** 足元の小さな四角（幅16・高さ6。人物の大きさに合わせて広がる）がどこもふさがっていないか（主人公の当たりと同じ） */
export function footFree(area: AreaId, x: number, y: number): boolean {
  const k = charScaleAt(area, y);
  return [
    [x - 8 * k, y - 6 * k],
    [x + 8 * k, y - 6 * k],
    [x - 8 * k, y],
    [x + 8 * k, y],
  ].every(([px, py]) => !isBlockedAt(area, px, py));
}

/**
 * 立てる場所に直す。地形を直したせいで、セーブした位置が通れない所の中になったときに使う
 * （2026-11-18：荒野の看板の当たりを変えて、その場所で保存していた日記帳が動けなくなった）。
 * 近い所から順に探し、見つからなければ小屋の前（村）・部屋の真ん中（室内）へ
 */
export function nearestFree(area: AreaId, x: number, y: number): { x: number; y: number } {
  if (footFree(area, x, y)) return { x, y };
  for (let r = 4; r <= 240; r += 4)
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      const px = x + Math.cos(a) * r;
      const py = y + Math.sin(a) * r;
      if (footFree(area, px, py)) return { x: px, y: py };
    }
  return area === 'village' ? { ...HOME } : { x: 400, y: 330 };
}

/** その位置で調べられるもの */
export function spotAt(area: AreaId, x: number, y: number): Spot | null {
  if (area === 'village') {
    const plot = PLOTS.findIndex((p) => x >= p.x0 && x < p.x1 && y >= p.y0 && y < p.y1);
    if (plot >= 0) return { kind: 'plot', plot };
  }
  return AREAS[area].spots.find((s) => inPoly(x, y, s.poly))?.spot ?? null;
}
