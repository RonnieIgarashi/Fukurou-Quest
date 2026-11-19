// 会話とイベントの台本。台詞はすべてプロトタイプ用の【仮】（正式な台本は今後つくる）。
// {name} は主人公の名前に置き換わる。

export type Speaker = 'narration' | 'player' | 'moku' | 'momo';

export interface Line {
  speaker: Speaker;
  text: string;
}

export type StoryId = 'intro' | 'firstNight' | 'momoArrives' | 'forcedSleep' | 'arrival';

/** イベントの前に流すムービーの差し込み口（assets/movies/<id>.mp4 があれば再生） */
export const STORY_MOVIE: Partial<Record<StoryId, string>> = {
  intro: 'opening',
  arrival: 'dragon-arrival',
};

export const STORY: Record<StoryId, Line[]> = {
  intro: [
    { speaker: 'narration', text: '引っ越し先を探して旅をしてきた{name}は、海の近くの小さな空き地にたどり着いた。' },
    { speaker: 'narration', text: '古い小屋がひとつ、ぽつんと建っている。' },
    { speaker: 'moku', text: 'あれ……？ きみも、ここに住むの？' },
    { speaker: 'moku', text: 'ぼくはモクちゃん。むこうの森をこえて、この場所を見つけたんだ。' },
    { speaker: 'moku', text: 'いっしょに暮らそうよ！ 畑もつくれそうだし、となりの鍛冶小屋には炉もあるみたい。' },
    { speaker: 'narration', text: '矢印キーで歩く（Shift を押しながらで走る）。Z で調べる・決定。X でメニュー。' },
  ],
  firstNight: [
    { speaker: 'moku', text: 'ふわぁ……。ねむくなってきちゃった。ぼく、先に寝るね。' },
    { speaker: 'narration', text: '小屋に入ってベッドを調べ、「寝る」を選ぶと、次の朝まで時間を進められる。' },
  ],
  momoArrives: [
    { speaker: 'momo', text: 'モクちゃーん！ やっと見つけた！' },
    { speaker: 'moku', text: 'ももっちゅ！？ どうしてここに？' },
    { speaker: 'momo', text: '忘れ物を届けにきたの。……って、ここに住んでるの？' },
    { speaker: 'moku', text: 'うん！ {name}といっしょに。' },
    { speaker: 'momo', text: 'じゃあ、わたしもここに住んじゃおう。夜のお仕事なら任せて！ ……朝は、ちょっと苦手だけど。' },
  ],
  forcedSleep: [{ speaker: 'narration', text: '{name}は、いつのまにか眠ってしまった……。' }],
  arrival: [
    { speaker: 'narration', text: '100日目の朝。海の向こうに、大きな影が見える。' },
    { speaker: 'narration', text: '（プロトタイプはここまで。ドラゴン来訪の場面はこれからつくります）' },
  ],
};

/**
 * 調べたときの説明（map.ts の look の id と対応）。
 * 例文は Ronnie の指定（2026-11-16）。それ以外は【仮】。
 */
export const LOOK: Record<string, Line[]> = {
  sea: [{ speaker: 'player', text: '穏やかな海だ。遠くにカモメが飛んでいる。' }],
  memorial: [{ speaker: 'player', text: '慰霊碑、つまり昔のお墓だな。どうやら100年前に、ドラゴンによってこの村は滅びたらしい。' }],
  cart: [{ speaker: 'player', text: '古い荷車だ。特にしばらく使う予定はなさそうだ。' }],
  fountain: [{ speaker: 'moku', text: '噴水があるよ。水のきらめきがきれいだね。' }],
  forestGate: [
    { speaker: 'player', text: 'この先は深い森だ。薪やマナを探しに行ける。' },
    { speaker: 'narration', text: '（森エリアは、マップの絵ができたら行けるようになります）' },
  ],
  wastelandSign: [
    { speaker: 'player', text: '立て札だ。この先は荒野らしい。' },
    { speaker: 'narration', text: '（荒野エリアは、マップの絵ができたら行けるようになります）' },
  ],
  bench: [{ speaker: 'player', text: 'ベンチだ。噴水をながめながら、ひと休みできそうだ。' }],
  cows: [{ speaker: 'player', text: '白ウシがのんびり草を食べている。' }],
  waterBarrel: [
    { speaker: 'player', text: '水くみ場の水樽だ。川の水がたっぷりたまっている。' },
    { speaker: 'player', text: 'ここで飲み水を用意できそうだ。' },
  ],
  cabin: [
    { speaker: 'player', text: '丸太の小屋と、石の塔だ。中はまた今度のぞいてみよう。' },
    { speaker: 'narration', text: '（室内の絵ができたら入れるようになります）' },
  ],
  river: [{ speaker: 'player', text: '澄んだ川だ。水のマナがあれば、飲み水にできるかもしれない。' }],
  hutWindow: [{ speaker: 'player', text: '窓から村の広場が見える。' }],
  perch: [{ speaker: 'moku', text: 'ここ、ぼくの止まり木！ 夜はここで寝るんだ。' }],
  hutStairs: [
    { speaker: 'player', text: '上の見張り小屋へ続く階段だ。' },
    { speaker: 'narration', text: '（上の階の絵ができたら行けるようになります）' },
  ],
  hutTable: [{ speaker: 'moku', text: 'ここでいっしょにごはんを食べようね。上のわらのベッドは、ぼくの寝床なんだ。' }],
  anvil: [{ speaker: 'player', text: '古い金床だ。武器の錬成は、工房ができてからだな。' }],
  woodpile: [{ speaker: 'player', text: '薪が積んである。炉にくべる燃料だ。' }],
};

export function fillName(text: string, name: string): string {
  return text.split('{name}').join(name);
}
