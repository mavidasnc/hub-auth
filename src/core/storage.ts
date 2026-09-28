/**
 * Persistenza della sessione.
 *
 * L'adapter lavora con valori già deserializzati: localStorage fa JSON
 * parse/stringify, un adapter IndexedDB (es. idb-keyval) salva l'oggetto così
 * com'è. Tutti i metodi possono essere sincroni o restituire una Promise.
 */

/** Contratto di uno storage per la sessione */
export interface StorageAdapter {
  /** Legge il valore della chiave (null/undefined se assente) */
  get(key: string): unknown | Promise<unknown>;
  /** Scrive il valore della chiave */
  set(key: string, value: unknown): void | Promise<void>;
  /** Rimuove la chiave */
  remove(key: string): void | Promise<void>;
}

/**
 * Adapter su window.localStorage.
 *
 * Ogni accesso è protetto: con localStorage non disponibile (modalità
 * privata, storage bloccato) la sessione resta valida solo in memoria e
 * le letture si comportano come "chiave assente".
 */
export const localStorageAdapter: StorageAdapter = {
  get(key) {
    try {
      const raw = window.localStorage.getItem(key);
      return raw == null ? null : JSON.parse(raw);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (err) {
      console.warn('[hub-auth] localStorage non disponibile, sessione non persistita:', err);
    }
  },
  remove(key) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Niente da fare: se lo storage non è accessibile non c'è nulla da rimuovere
    }
  },
};

/** Adapter solo in memoria (test, SSR, ambienti senza storage) */
export function memoryStorageAdapter(): StorageAdapter {
  const data = new Map<string, unknown>();
  return {
    get: (key) => data.get(key) ?? null,
    set: (key, value) => void data.set(key, value),
    remove: (key) => void data.delete(key),
  };
}
