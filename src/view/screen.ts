// 画面への出力。3枚を重ねる。
//  1. フィールド：出力の解像度のキャンバスに、800x450 のワールド単位で描く（背景の絵はなめらかに拡大）
//  2. UI（枠・カーソル）：384x216 の座標で、出力と同じ大きさのキャンバスに描く
//  3. 文字と顔画像：出力の解像度でそのまま描く（くっきり・滑らかに見せるため）
import { toKana } from '../core/kana.js';
import { BASE_H, BASE_W, Ctx, makeCanvas, VIEW_H, VIEW_W } from './gfx.js';

export const FONT = '"DotGothic16", "MS Gothic", "Osaka-Mono", monospace';

export interface TextOpts {
  size?: number;
  color?: string;
  align?: CanvasTextAlign;
  shadow?: string | null;
  alpha?: number;
}

interface TextCmd extends Required<Omit<TextOpts, 'shadow'>> {
  x: number;
  y: number;
  text: string;
  shadow: string | null;
}

interface ImageCmd {
  img: CanvasImageSource;
  x: number;
  y: number;
  w: number;
  h: number;
}

export class Screen {
  /** ひらがなモード（漢字をひらがなにして出す） */
  kana = false;
  /** フィールド（800x450 のワールド単位で描く） */
  world: Ctx;
  private worldCanvas: HTMLCanvasElement;
  /** UI（384x216 の座標） */
  base: Ctx;
  private uiCanvas: HTMLCanvasElement;
  private readonly out: Ctx;
  /** フィールドの拡大率（出力の幅 / 800） */
  private viewScale = 1;
  /** UI の拡大率（出力の幅 / 384） */
  private scale = 1;
  private texts: TextCmd[] = [];
  private images: ImageCmd[] = [];
  private readonly measure: Ctx;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const [wc, w] = makeCanvas(VIEW_W, VIEW_H);
    this.worldCanvas = wc;
    this.world = w;
    [this.uiCanvas, this.base] = makeCanvas(BASE_W, BASE_H);
    this.out = canvas.getContext('2d')!;
    this.measure = makeCanvas(8, 8)[1];
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  /** ウィンドウに収まる 16:9 の最大の大きさにする（実ピクセルで描く。上限 2560 幅） */
  resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const wrap = this.canvas.parentElement!;
    const cssW = Math.max(160, Math.floor(Math.min(wrap.clientWidth, (wrap.clientHeight * 16) / 9)));
    const pxW = Math.min(2560, Math.round(cssW * dpr));
    this.canvas.width = pxW;
    this.canvas.height = Math.round((pxW * 9) / 16);
    this.viewScale = this.canvas.width / VIEW_W;
    this.scale = this.canvas.width / BASE_W;
    [this.worldCanvas, this.world] = makeCanvas(this.canvas.width, this.canvas.height);
    [this.uiCanvas, this.base] = makeCanvas(this.canvas.width, this.canvas.height);
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${(cssW * 9) / 16}px`;
  }

  begin(): Ctx {
    this.texts = [];
    this.images = [];
    for (const c of [this.world, this.base]) {
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.globalAlpha = 1;
      c.globalCompositeOperation = 'source-over';
    }
    this.world.setTransform(this.viewScale, 0, 0, this.viewScale, 0, 0);
    this.world.imageSmoothingEnabled = true;
    this.world.imageSmoothingQuality = 'high';
    this.world.fillStyle = '#0e0c1c';
    this.world.fillRect(0, 0, VIEW_W, VIEW_H);
    this.base.clearRect(0, 0, this.uiCanvas.width, this.uiCanvas.height);
    this.base.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    return this.base;
  }

  /** 文字（座標は内部画面の px。y は文字の上端） */
  text(x: number, y: number, text: string, o: TextOpts = {}): void {
    this.texts.push({
      x,
      y,
      text: this.kana ? toKana(text) : text,
      size: o.size ?? 11,
      color: o.color ?? '#f4f0ff',
      align: o.align ?? 'left',
      shadow: o.shadow === undefined ? '#1a1630' : o.shadow,
      alpha: o.alpha ?? 1,
    });
  }

  /** 高解像度で描く画像（顔画像など） */
  image(img: CanvasImageSource, x: number, y: number, w: number, h: number): void {
    this.images.push({ img, x, y, w, h });
  }

  textWidth(text: string, size = 11): number {
    this.measure.font = `${size * 4}px ${FONT}`;
    return this.measure.measureText(text).width / 4;
  }

  /** 幅に収まるように折り返す（行頭に句読点が来ないようにする） */
  wrap(text: string, maxW: number, size = 11): string[] {
    const lines: string[] = [];
    if (this.kana) text = toKana(text);
    for (const para of text.split('\n')) {
      let line = '';
      for (const ch of [...para]) {
        if (line && this.textWidth(line + ch, size) > maxW && !'、。！？」）…'.includes(ch)) {
          lines.push(line);
          line = ch;
        } else line += ch;
      }
      lines.push(line);
    }
    return lines;
  }

  present(): void {
    const s = this.scale;
    const o = this.out;
    o.imageSmoothingEnabled = false;
    o.drawImage(this.worldCanvas, 0, 0);
    o.drawImage(this.uiCanvas, 0, 0);
    o.imageSmoothingEnabled = true;
    for (const im of this.images) o.drawImage(im.img, im.x * s, im.y * s, im.w * s, im.h * s);
    o.textBaseline = 'top';
    for (const t of this.texts) {
      o.font = `${t.size * s}px ${FONT}`;
      o.textAlign = t.align;
      o.globalAlpha = t.alpha;
      if (t.shadow) {
        o.fillStyle = t.shadow;
        o.fillText(t.text, t.x * s + s, t.y * s + s);
      }
      o.fillStyle = t.color;
      o.fillText(t.text, t.x * s, t.y * s);
    }
    o.globalAlpha = 1;
  }
}

/** ウィンドウ枠（ドット絵）。角を落とした二重線 */
export function drawFrame(ctx: Ctx, x: number, y: number, w: number, h: number, alpha = 0.9): void {
  ctx.fillStyle = `rgba(22, 20, 48, ${alpha})`;
  ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
  ctx.fillStyle = '#e8e2ff';
  ctx.fillRect(x + 2, y, w - 4, 1);
  ctx.fillRect(x + 2, y + h - 1, w - 4, 1);
  ctx.fillRect(x, y + 2, 1, h - 4);
  ctx.fillRect(x + w - 1, y + 2, 1, h - 4);
  ctx.fillRect(x + 1, y + 1, 1, 1);
  ctx.fillRect(x + w - 2, y + 1, 1, 1);
  ctx.fillRect(x + 1, y + h - 2, 1, 1);
  ctx.fillRect(x + w - 2, y + h - 2, 1, 1);
  ctx.fillStyle = '#6f68b0';
  ctx.fillRect(x + 2, y + 2, w - 4, 1);
  ctx.fillRect(x + 2, y + 2, 1, h - 4);
  ctx.fillStyle = '#0c0a1e';
  ctx.fillRect(x + 2, y + h - 3, w - 4, 1);
  ctx.fillRect(x + w - 3, y + 2, 1, h - 4);
}

/** 選択中の項目の左に出す三角 */
export function drawCursor(ctx: Ctx, x: number, y: number, t: number): void {
  const dx = Math.floor(t * 4) % 2;
  ctx.fillStyle = '#ffe066';
  for (let i = 0; i < 4; i++) ctx.fillRect(x + dx + i, y + i, 1, 7 - i * 2);
}
