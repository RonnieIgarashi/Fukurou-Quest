// ゲームの調整値をここに集める。
// 【確定】は仕様書（Notion「フクロウクエスト — 開発仕様書」）で Ronnie が決めた値。
// 【仮】はプロトタイプのために置いた値で、仕様は未確定。docs/DESIGN.md「仮の値」と対応させる。

export const MINUTES_PER_HOUR = 60;
export const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;

export const TIME = {
  /** 【確定】ゲーム内1分＝実時間1秒（ゲーム1時間＝実1分） */
  REAL_SECONDS_PER_GAME_MINUTE: 1,
  /** 【確定】起床・活動開始 6:00 */
  MORNING: 6 * MINUTES_PER_HOUR,
  /** 【確定】夜の始まり 22:00。モクちゃんが眠くなる */
  NIGHT: 22 * MINUTES_PER_HOUR,
  /** 【仮】起きたまま深夜2:00を過ぎると、その場で眠ってしまう（翌朝6:00に小屋で目覚める） */
  FORCED_SLEEP: 2 * MINUTES_PER_HOUR,
  /** 【確定】ドラゴンが来訪する日 */
  ARRIVAL_DAY: 100,
  /** 【仮】自動セーブの間隔（ゲーム内分） */
  AUTOSAVE_EVERY: 60,
} as const;

/** 【仮】タスクの所要時間（ゲーム内分）。タスク中は時間をまとめて進める */
export const TASK_MINUTES = {
  till: 60, // 畑を耕す
  plant: 20, // 種をまく
  harvest: 20, // 収穫する
  feedForge: 10, // 炉に白のマナを入れる
  takeFire: 5, // 炉から火のマナを取り出す
  rest: 60, // 小屋で休む
  drawWater: 5, // 水くみ場で水をくむ
  purify: 20, // 樽の水を浄化する
  drink: 5, // 水を飲む
  water: 10, // 畑に水をやる
} as const;

export type CropId = 'bean' | 'wheat';

/** 作物。成長速度の順（豆 ＞ 麦 ＞ リンゴ）は【確定】、日数と収穫量は【仮】 */
export const CROPS: Record<CropId, { name: string; days: number; yield: number }> = {
  bean: { name: '豆', days: 3, yield: 3 },
  wheat: { name: '麦', days: 5, yield: 4 },
};

/** 【確定】畑は地・水・火・風を均等に使って育つ。【仮】1区画が1日に使う量 */
export const FARM_MANA_PER_PLOT_PER_DAY = 1;

/** 【確定】白のマナは村の炉で火のマナに変わり、燃料が要る。【仮】変化にかかる時間・炉の容量・燃料の量 */
export const FORGE = {
  CONVERT_MINUTES: 6 * MINUTES_PER_HOUR,
  CAPACITY: 4,
  FUEL_PER_MANA: 1,
} as const;

/**
 * 水（2026-11-19 Ronnie 指示）。
 * 【確定】水くみ場の樽の川の水を、水のマナで浄化する。樽1杯で水のマナ1。
 * 【確定】作物は水をやらないと育たない。浄化した水だと収量が増える。
 * 【仮】樽1杯の杯数・持ち歩ける量・収量の増え方
 */
export const WATER = {
  /** 樽1杯＝この杯数（飲む・畑にやるのに1杯ずつ使う） */
  BARREL_CUPS: 10,
  /** 持ち歩ける水（桶）の上限（川の水・きれいな水の合計） */
  CARRY_MAX: 10,
  /** 収穫までの毎日をきれいな水で育てたときに増える割合（日数に比例） */
  PURE_YIELD_BONUS: 0.5,
} as const;

/**
 * からだの具合（2026-11-19 Ronnie 指示）。0〜100 で、大きいほど渇いて・空いている。
 * 【確定】水を飲まないとのどが渇いて走れなくなる。空腹は、食べ物ができるまでは数値だけ持つ。
 * 【仮】増える速さ・走れなくなる境目
 */
export const BODY = {
  /** 起きている間、1時間あたりに増える量（6時〜22時の16時間で約96） */
  THIRST_PER_HOUR: 6,
  HUNGER_PER_HOUR: 4,
  /** 眠っている間は、この割合でゆっくり増える */
  SLEEP_RATE: 0.3,
  /** のどの渇きがこれ以上だと走れない */
  THIRST_NO_RUN: 70,
  /** 知らせを出す境目 */
  THIRST_WARN: 50,
} as const;

/** 素材。【確定】ウシを倒すと落ちる（肉・皮・毛・骨）。薪は森で集める想定 */
export type GoodsId = 'wood' | 'meat' | 'hide' | 'hair' | 'bone';
export const GOODS: Record<GoodsId, { name: string }> = {
  wood: { name: '薪' },
  meat: { name: '肉' },
  hide: { name: '皮' },
  hair: { name: '毛' },
  bone: { name: '骨' },
};
/** 【確定】燃料になるもの（薪・毛・皮）。【仮】使う順番 */
export const FUELS: GoodsId[] = ['wood', 'hair', 'hide'];

/** 引っ越しの荷物（初期所持品）。初期のマナがあることは【確定】、量は【仮】 */
export const START_INVENTORY = {
  seeds: { bean: 4, wheat: 2 },
  crops: { bean: 0, wheat: 0 },
  mana: { white: 8, earth: 6, water: 6, fire: 0, wind: 6 },
  goods: { wood: 6, meat: 0, hide: 0, hair: 0, bone: 0 },
} as const;

/** 【仮】ももっちゅが村にやってくる日時 */
export const MOMO_ARRIVAL = { day: 3, minute: 9 * MINUTES_PER_HOUR } as const;

/** 【仮】ももっちゅは朝に弱い。この時刻のあいだは眠っている */
export const MOMO_SLEEP = { from: 3 * MINUTES_PER_HOUR, to: 9 * MINUTES_PER_HOUR } as const;

/** 【確定】主人公の名前はカタカナ6文字まで */
export const NAME_MAX = 6;

/** 【仮】セーブスロットの数 */
export const SAVE_SLOTS = 3;
