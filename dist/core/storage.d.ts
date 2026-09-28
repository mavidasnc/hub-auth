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
export declare const localStorageAdapter: StorageAdapter;
/** Adapter solo in memoria (test, SSR, ambienti senza storage) */
export declare function memoryStorageAdapter(): StorageAdapter;
