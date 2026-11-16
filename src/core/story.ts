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
    { speaker: 'moku', text: 'ホゥ……？ きみも、ここに住むの？' },
    { speaker: 'moku', text: 'ぼくはモクちゃん。むこうの森をこえて、この場所を見つけたんだ。' },
    { speaker: 'moku', text: 'いっしょに暮らそうよ！ 畑もつくれそうだし、小屋には炉もあるみたい。' },
    { speaker: 'narration', text: '矢印キーで歩く。Z で調べる・決定。X でメニュー。' },
  ],
  firstNight: [
    { speaker: 'moku', text: 'ふわぁ……。ねむくなってきちゃった。ぼく、先に寝るね。' },
    { speaker: 'narration', text: '小屋の扉を調べて「寝る」を選ぶと、次の朝まで時間を進められる。' },
  ],
  momoArrives: [
    { speaker: 'momo', text: 'モクちゃーん！ やっと見つけた！' },
    { speaker: 'moku', text: 'ももっちゅりん！？ どうしてここに？' },
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

export function fillName(text: string, name: string): string {
  return text.split('{name}').join(name);
}
