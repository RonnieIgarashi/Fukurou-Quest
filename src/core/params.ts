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
} as const;

export type CropId = 'bean' | 'wheat';

/** 作物。成長速度の順（豆 ＞ 麦 ＞ リンゴ）は【確定】、日数と収穫量は【仮】 */
export const CROPS: Record<CropId, { name: string; days: number; yield: number }> = {
  bean: { name: '豆', days: 3, yield: 3 },
  wheat: { name: '麦', days: 5, yield: 4 },
};

/** 【確定】畑は地・水・火・風を均等に使って育つ。【仮】1区画が1日に使う量 */
export const FARM_MANA_PER_PLOT_PER_DAY = 1;

/** 【確定】白のマナは村の炉で火のマナに変わる。【仮】変化にかかる時間と炉の容量 */
export const FORGE = {
  CONVERT_MINUTES: 6 * MINUTES_PER_HOUR,
  CAPACITY: 4,
} as const;

/** 【仮】引っ越しの荷物（初期所持品）。プロトタイプでは村の外へ出られないため、畑を試せる量を持たせる */
export const START_INVENTORY = {
  seeds: { bean: 4, wheat: 2 },
  crops: { bean: 0, wheat: 0 },
  mana: { white: 8, earth: 6, water: 6, fire: 0, wind: 6 },
} as const;

/** 【仮】ももっちゅりんが村にやってくる日時 */
export const MOMO_ARRIVAL = { day: 3, minute: 9 * MINUTES_PER_HOUR } as const;

/** 【仮】ももっちゅりんは朝に弱い。この時刻のあいだは眠っている */
export const MOMO_SLEEP = { from: 3 * MINUTES_PER_HOUR, to: 9 * MINUTES_PER_HOUR } as const;

/** 【確定】主人公の名前はカタカナ6文字まで */
export const NAME_MAX = 6;

/** 【仮】セーブスロットの数 */
export const SAVE_SLOTS = 3;
