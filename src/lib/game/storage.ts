import { DEFAULT_CARDS } from "./cards";
import type { CardSet, GameState, PlayerNotes, Secrets } from "./types";
import { SAVE_VERSION } from "./types";

const SETS_KEY = "gmm.cardsets.v1";
const TABLE_KEY = "gmm.table.v1";
const NOTES_KEY = "gmm.notes.v1";
const NAME_KEY = "gmm.player-name.v1";
const ART_KEY = "gmm.art.v1";
const MIGRATED_KEY = "gmm.migrated";
const DB_NAME = "gmm.vault";
const DB_STORE = "kv";

// Every match starts fresh, like a physical board sitting back down in its
// box: nobody's journal or in-progress table should survive past the
// session that made them. Custom decks — and now the player's own chosen
// name — are worth keeping: work a player put in on purpose, on their own
// device. TABLE_KEY and NOTES_KEY are only ever read/deleted below (to
// clear out anything an older build left behind); they're never written.
const VAULT_KEYS = [SETS_KEY, TABLE_KEY, NOTES_KEY, NAME_KEY, ART_KEY];

export interface TableSave {
  version: number;
  state: GameState;
  secrets: Secrets;
  localPlayerId: string;
  viewingPlayerId: string;
}

export interface VaultData {
  sets: CardSet[];
  table: TableSave | null;
  notes: Record<string, PlayerNotes>;
  name: string;
  art: Record<string, string>;
}

function readLocal<T>(key: string): T | undefined {
  if (typeof localStorage === "undefined") return undefined;
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return undefined;
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

function writeLocal(key: string, value: unknown) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode, or the old 5 MB cap. IndexedDB is the real store.
  }
}

function removeLocal(key: string) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function database(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      const open = indexedDB.open(DB_NAME, 1);
      open.onupgradeneeded = () => {
        const db = open.result;
        if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE);
      };
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => resolve(null);
    });
  }
  return dbPromise;
}

function requestDone<T>(request: IDBRequest<T>): Promise<T | undefined> {
  return new Promise((resolve) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(undefined);
  });
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await database();
  if (!db) return undefined;
  const tx = db.transaction(DB_STORE, "readonly");
  return requestDone(tx.objectStore(DB_STORE).get(key) as IDBRequest<T | undefined>);
}

async function idbPut(key: string, value: unknown): Promise<boolean> {
  const db = await database();
  if (!db) return false;
  return new Promise((resolve) => {
    const tx = db.transaction(DB_STORE, "readwrite");
    tx.objectStore(DB_STORE).put(value, key);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => resolve(false);
    tx.onabort = () => resolve(false);
  });
}

async function idbDelete(key: string): Promise<void> {
  const db = await database();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(DB_STORE, "readwrite");
    tx.objectStore(DB_STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
    tx.onabort = () => resolve();
  });
}

let migrated: Promise<void> | null = null;

/** Copy anything still in localStorage once, then leave it behind. */
function migrateLocal(): Promise<void> {
  if (!migrated) {
    migrated = (async () => {
      const db = await database();
      if (!db) return;
      if (await idbGet(MIGRATED_KEY)) return;
      for (const key of VAULT_KEYS) {
        const already = await idbGet(key);
        if (already !== undefined) {
          removeLocal(key);
          continue;
        }
        const stored = readLocal(key);
        if (stored === undefined) continue;
        const wrote = await idbPut(key, stored);
        if (wrote) removeLocal(key);
      }
      await idbPut(MIGRATED_KEY, 1);
    })();
  }
  return migrated;
}

function validSets(value: unknown): CardSet[] {
  if (!Array.isArray(value)) return [];
  return value.filter((set): set is CardSet => Boolean(set) && Array.isArray((set as CardSet).cards));
}

function validTable(value: unknown): TableSave | null {
  const save = value as TableSave | null;
  if (!save || save.version !== SAVE_VERSION) return null;
  if (!save.state?.players?.length) return null;
  return save;
}

function collectArt(sets: CardSet[], table: TableSave | null, stored: Record<string, string> | undefined): Record<string, string> {
  const art: Record<string, string> = { ...(stored ?? {}) };
  for (const set of sets) {
    for (const card of set.cards ?? []) {
      if (card.imageDataUrl) art[card.id] = card.imageDataUrl;
    }
  }
  for (const card of table?.state?.cards ?? []) {
    if (card.imageDataUrl) art[card.id] = card.imageDataUrl;
  }
  return art;
}

export async function loadVault(): Promise<VaultData> {
  await migrateLocal();
  // Clear out anything an older build saved under the session-scoped keys —
  // a table or notes left over from before decks and the player's name were
  // the only things meant to survive a reload.
  clearSessionScopedKeys();
  const db = await database();
  if (!db) {
    const sets = validSets(readLocal(SETS_KEY));
    const name = readLocal<string>(NAME_KEY) ?? "";
    return { sets, table: null, notes: {}, name, art: collectArt(sets, null, undefined) };
  }
  const [setsRaw, name] = await Promise.all([idbGet<CardSet[]>(SETS_KEY), idbGet<string>(NAME_KEY)]);
  const sets = validSets(setsRaw);
  return { sets, table: null, notes: {}, name: typeof name === "string" ? name : "", art: collectArt(sets, null, undefined) };
}

function clearSessionScopedKeys() {
  void (async () => {
    removeLocal(TABLE_KEY);
    removeLocal(NOTES_KEY);
    removeLocal(ART_KEY);
    const db = await database();
    if (!db) return;
    await idbDelete(TABLE_KEY);
    await idbDelete(NOTES_KEY);
    await idbDelete(ART_KEY);
  })();
}

/** Card photos live and die with the deck that carries them, same as any other custom-deck data. */
export function saveCardArt(_cards: { id: string; imageDataUrl?: string }[]) {
  // no-op: art is derived from saved deck cards (collectArt), never stored on its own.
}

function remember(key: string, value: unknown) {
  void (async () => {
    await migrateLocal();
    const wrote = await idbPut(key, value);
    if (!wrote) writeLocal(key, value);
  })();
}

export function saveCardSets(sets: CardSet[]) {
  remember(SETS_KEY, sets);
}

export function defaultSet(): CardSet {
  return {
    id: "default",
    name: "Harrington House",
    cards: DEFAULT_CARDS,
    createdAt: 0,
  };
}

/**
 * A match plays out like a physical board sitting on the table: once the
 * session ends (tab closed, game over), it's put back in the box. Only the
 * deck itself — saveCardSets, below — is worth keeping between visits.
 */
export function saveTable(_save: TableSave | null) {
  // no-op by design — see the comment above VAULT_KEYS.
}

export function notesKey(code: string, playerId: string) {
  return `${code}:${playerId}`;
}

export function saveAllNotes(_notes: Record<string, PlayerNotes>) {
  // no-op by design — a fresh session gets a fresh journal, like a real game of Clue.
}

export function emptyNotes(): PlayerNotes {
  return { marks: {}, shown: [], lastShown: null, freeText: "" };
}

export function savePlayerName(name: string) {
  remember(NAME_KEY, name);
}

export function resizeImage(file: File, max = 320): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error("canvas"));
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image"));
    };
    img.crossOrigin = "anonymous";
    img.src = url;
  });
}
