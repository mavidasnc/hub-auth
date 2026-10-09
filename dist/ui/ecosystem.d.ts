/**
 * Catalogo fisso delle app dell'ecosistema Mavida (dalla 1.8.0), usato dal blocco
 * "Le altre app Mavida" del login e dal menu `EcosystemMenu`.
 *
 * Lista volutamente statica, come `signup/src/config/tools.js`: le app pubbliche
 * sono sei e cambiano raramente, e un elenco nel bundle funziona anche prima che
 * hub risponda e per chi non esegue la configurazione pubblica. Admin e log sono
 * di uso interno e non compaiono. Nomi e frasi vengono dal materiale in
 * `__docs/presentazione`.
 */
export interface EcosystemApp {
    /** Chiave del tool in generations_tools (la stessa di `tool` in createHubAuth) */
    key: string;
    /** Nome mostrato */
    name: string;
    /** URL di produzione (senza slash finale) */
    url: string;
    /** Frase breve, usata come tooltip del link */
    tagline: string;
    /** Colore dell'app (favicon e icone PWA) */
    color: string;
}
export declare const ECOSYSTEM_APPS: readonly EcosystemApp[];
/**
 * Le app da mostrare come "altre": tutte tranne quella corrente.
 *
 * La corrente si riconosce dalla chiave (`current`) oppure, se manca, dall'host
 * della pagina: così il blocco funziona anche prima che `GET /auth/tool-config`
 * abbia risposto.
 */
export declare function otherApps(current?: string): EcosystemApp[];
