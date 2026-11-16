// セーブの窓口。ゲームはこの SaveStore だけを使い、保存先（ブラウザ／DB）を知らない。
// 今はブラウザ内（LocalSaveStore）。友人に公開するときは、同じ形の RemoteSaveStore
// （例：Cloudflare Workers + D1）を作って差し替える。設計は docs/DESIGN.md「セーブと将来の DB」。
import { GameState } from '../state.js';

export interface SaveSummary {
  slotId: string;
  playerName: string;
  day: number;
  clock: number;
  updatedAt: string;
}

/** セーブデータ1件。DB に置くときもこの形の JSON を1行に入れる */
export interface SaveFile {
  /** 形式の版。形を変えたら上げて migrate() に変換を足す */
  schema: number;
  slotId: string;
  /** 将来のユーザー（友人）ごとの持ち主。ブラウザ保存では null */
  ownerId: string | null;
  createdAt: string;
  updatedAt: string;
  game: GameState;
}

/** すべてのメソッドを非同期にしておく（DB に替えても呼び出し側を変えずに済む） */
export interface SaveStore {
  list(): Promise<SaveSummary[]>;
  load(slotId: string): Promise<SaveFile | null>;
  save(file: SaveFile): Promise<void>;
  remove(slotId: string): Promise<void>;
}
