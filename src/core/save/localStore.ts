// ブラウザ内（localStorage）に保存する SaveStore。
// localStorage を直接触らず KeyValue を受け取るので、テストでは Map で代用できる。
import { SAVE_SLOTS } from '../params.js';
import { migrate, summarize } from './schema.js';
import { SaveFile, SaveStore, SaveSummary } from './store.js';

export interface KeyValue {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const PREFIX = 'fukurou-quest.save.';

export function slotIds(): string[] {
  return Array.from({ length: SAVE_SLOTS }, (_, i) => `slot${i + 1}`);
}

export class LocalSaveStore implements SaveStore {
  constructor(private readonly kv: KeyValue) {}

  async list(): Promise<SaveSummary[]> {
    const out: SaveSummary[] = [];
    for (const id of slotIds()) {
      const f = await this.load(id);
      if (f) out.push(summarize(f));
    }
    return out;
  }

  async load(slotId: string): Promise<SaveFile | null> {
    let text: string | null;
    try {
      text = this.kv.getItem(PREFIX + slotId);
    } catch {
      return null;
    }
    if (!text) return null;
    try {
      const f = migrate(JSON.parse(text));
      return f ? { ...f, slotId } : null;
    } catch {
      return null;
    }
  }

  async save(file: SaveFile): Promise<void> {
    this.kv.setItem(PREFIX + file.slotId, JSON.stringify(file));
  }

  async remove(slotId: string): Promise<void> {
    this.kv.removeItem(PREFIX + slotId);
  }
}

/** テストやストレージが使えない環境向けの代用品 */
export class MemoryKeyValue implements KeyValue {
  private readonly m = new Map<string, string>();
  getItem(key: string): string | null {
    return this.m.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.m.set(key, value);
  }
  removeItem(key: string): void {
    this.m.delete(key);
  }
}
