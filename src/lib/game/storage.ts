import { DEFAULT_CARDS } from "./cards";
import type { CardSet, GameState, PlayerNotes, Secrets } from "./types";
import { SAVE_VERSION } from "./types";

const SETS_KEY = "gmm.cardsets.v1";
const TABLE_KEY = "gmm.table.v1";
const NOTES_KEY = "gmm.notes.v1";
const NAME_KEY = "gmm.player-name.v1";
const CLUE_KEY = "gmm.clue.v1";
const ART_KEY = "gmm.art.v1";
const MIGRATED_KEY = "gmm.migrated";
const DB_NAME = "gmm.vault";
const DB_STORE = "kv";

// Custom decks and the player's own chosen name are kept for good. The match in progress is kept
// only as a "session": the table, this player's seat, and their journal. A refresh (or a phone
// that reloads the tab) puts that player straight back into the game they were in. Leaving the
// table, or the game ending, clears it, and a session more than 12 hours old is ignored, so a
// fresh visit still starts fresh. TABLE_KEY and NOTES_KEY are the keys an older build used; they
// are only ever deleted below.
const SESSION_KEY = "gmm.session.v2";
const SESSION_MAX_AGE = 12 * 60 * 60 * 1000;
const VAULT_KEYS = [SETS_KEY, TABLE_KEY, NOTES_KEY, NAME_KEY, ART_KEY, CLUE_KEY];

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
  /** The "clue" secret code. Once typed it stays on for this device until it is typed again. */
  clue: boolean;
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

interface SessionBlob {
  at: number;
  table: TableSave;
  notes: Record<string, PlayerNotes>;
}

let sessionTable: TableSave | null = null;
let sessionNotes: Record<string, PlayerNotes> = {};
let sessionTimer: ReturnType<typeof setTimeout> | undefined;

function writeSession() {
  if (typeof window !== "undefined") window.clearTimeout(sessionTimer);
  if (!sessionTable) {
    removeLocal(SESSION_KEY);
    return;
  }
  const prefix = `${sessionTable.state.code}:`;
  const notes: Record<string, PlayerNotes> = {};
  for (const [key, sheet] of Object.entries(sessionNotes)) {
    if (key.startsWith(prefix)) notes[key] = sheet;
  }
  writeLocal(SESSION_KEY, { at: Date.now(), table: sessionTable, notes } satisfies SessionBlob);
}

function readSession(): { table: TableSave; notes: Record<string, PlayerNotes> } | null {
  const blob = readLocal<SessionBlob>(SESSION_KEY);
  if (!blob || typeof blob.at !== "number" || Date.now() - blob.at > SESSION_MAX_AGE) {
    if (blob) removeLocal(SESSION_KEY);
    return null;
  }
  const table = validTable(blob.table);
  if (!table || table.state.phase === "gameover") {
    removeLocal(SESSION_KEY);
    return null;
  }
  // Keep what was just loaded, so the next write does not drop the journal.
  sessionTable = table;
  sessionNotes = blob.notes && typeof blob.notes === "object" ? blob.notes : {};
  return { table, notes: sessionNotes };
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
  // Clear out anything an older build saved under the old session keys.
  clearSessionScopedKeys();
  const session = readSession();
  const table = session?.table ?? null;
  const notes = session?.notes ?? {};
  const db = await database();
  if (!db) {
    const sets = validSets(readLocal(SETS_KEY));
    const name = readLocal<string>(NAME_KEY) ?? "";
    const clue = readLocal<boolean>(CLUE_KEY) === true;
    return { sets, table, notes, name, art: collectArt(sets, table, undefined), clue };
  }
  const [setsRaw, name, clue] = await Promise.all([idbGet<CardSet[]>(SETS_KEY), idbGet<string>(NAME_KEY), idbGet<boolean>(CLUE_KEY)]);
  const sets = validSets(setsRaw);
  return { sets, table, notes, name: typeof name === "string" ? name : "", art: collectArt(sets, table, undefined), clue: clue === true };
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
 * Remember the match this device is in, so a refresh can reconnect to it. Pass null to forget it
 * (leaving the table, or no table at all). A finished game is not worth coming back to.
 */
export function saveTable(save: TableSave | null) {
  sessionTable = save && save.state?.phase !== "gameover" ? save : null;
  if (!sessionTable) sessionNotes = {};
  writeSession();
}

export function notesKey(code: string, playerId: string) {
  return `${code}:${playerId}`;
}

export function saveAllNotes(notes: Record<string, PlayerNotes>) {
  sessionNotes = notes;
  if (!sessionTable || typeof window === "undefined") return;
  // Marks come in bursts; write once they settle.
  window.clearTimeout(sessionTimer);
  sessionTimer = window.setTimeout(writeSession, 250) as unknown as ReturnType<typeof setTimeout>;
}

/** Write any pending session right now. Called when the page is about to go away. */
export function flushSession() {
  if (sessionTable) writeSession();
}

export function emptyNotes(): PlayerNotes {
  return { marks: {}, shown: [], lastShown: null, freeText: "" };
}

/** Keep the "clue" code on (or off) for good, across games and visits. */
export function saveClueCode(on: boolean) {
  remember(CLUE_KEY, on);
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
