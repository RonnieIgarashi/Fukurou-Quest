# 素材の差し込み口

ここにファイルを置くだけで、ゲームが自動で使います。無いときはドット絵や「未設定」の札で代わりに表示します。

## 背景 `maps/`

| ファイル名 | エリア |
|---|---|
| `village.jpg` | 村（2000×1493。絵の1px＝ゲームの1px）。`tools/prepare_village.py` が修正版の絵 `docs/concept/village_v2.jpg` から作る（ウシと煙突の煙を消し、慰霊碑・立て札・ベンチ・水樽を少し小さくする） |

絵を差し替えるときは、歩ける範囲などを `src/core/map.ts` で測り直します。室内の絵（800×450）ができたら、`map.ts` の各室内の `image` にパスを書きます。

## 動く物 `sprites/`

| ファイル名 | 中身 |
|---|---|
| `moku-{front,back,side}[-flap].png` | モクちゃん（正面・後ろ・横（右向き）、それぞれ羽ばたき） |
| `momo-{front,back,side}[-flap].png` | ももっちゅ（同上） |
| `cow-{white,black}-{front,back,left,right,walk}.png` | 白ウシ・黒ウシ（left は左向き、right と walk は右向き） |
| `leaf-0.png`〜`leaf-16.png` | 木から落ちる葉っぱ |

どれも `tools/extract_sprites.py` が、Ronnie の素材の一覧絵（`docs/concept/sprites_moku_momo_leaves.jpg`・`cows_white_black.jpg`）から切り出す（白い紙を抜いて透明に）。絵が無いときは、仲間はドット絵で代わりに描く。

煙・水しぶき・もや・火の粉は絵を使わず、`src/view/particles.ts` が粒（パーティクル）で描きます。

## 顔画像 `portraits/`

会話のときに左上の枠（正方形）に出ます。PNG、正方形（256×256 程度を推奨。縮小して表示します）。

| ファイル名 | 話し手 |
|---|---|
| `player.png` | 主人公 |
| `moku.png` | モクちゃん（今はイメージ絵から切り出した仮の顔） |
| `momo.png` | ももっちゅ（今はイメージ絵から切り出した仮の顔） |

## ムービー `movies/`

MP4（H.264）、16:9。再生中は Z / Enter / X / Esc で飛ばせます。

| ファイル名 | 流れる場面 |
|---|---|
| `opening.mp4` | はじめから始めたとき（名前を決めた直後） |
| `dragon-arrival.mp4` | 100日目の朝 |

場面を増やすときは `src/core/story.ts` の `STORY_MOVIE` に足します。
