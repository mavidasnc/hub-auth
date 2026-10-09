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

export const ECOSYSTEM_APPS: readonly EcosystemApp[] = [
  { key: 'wandly', name: 'Wandly', url: 'https://wandly.mavida.com',
    tagline: "Dall'idea all'articolo pubblicato su WordPress, in una conversazione.", color: '#6366f1' },
  { key: 'carousel-generator', name: 'Slide-orama', url: 'https://slideorama.mavida.com',
    tagline: 'Caroselli per Instagram e LinkedIn coerenti con il tuo brand, senza software di grafica.', color: '#10b981' },
  { key: 'social-planner', name: 'Social Planner', url: 'https://social.mavida.com',
    tagline: 'Il calendario editoriale di tutti i tuoi clienti, in un solo posto.', color: '#3b82f6' },
  { key: 'mavida-sheets', name: 'WooSync', url: 'https://datagrid.mavida.com',
    tagline: 'Fogli di calcolo nel browser e il negozio WooCommerce gestito come in Excel.', color: '#a855f7' },
  { key: 'voicenote', name: 'VoiceNote', url: 'https://voicenotes.mavida.com',
    tagline: 'Parli, e le tue idee si organizzano da sole.', color: '#0ea5e9' },
  { key: 'fleet', name: 'Fleet', url: 'https://fleet.mavida.com',
    tagline: 'Tutti i siti WordPress dei tuoi clienti sotto controllo, da un unico cruscotto.', color: '#ea580c' },
];

/**
 * Le app da mostrare come "altre": tutte tranne quella corrente.
 *
 * La corrente si riconosce dalla chiave (`current`) oppure, se manca, dall'host
 * della pagina: così il blocco funziona anche prima che `GET /auth/tool-config`
 * abbia risposto.
 */
export function otherApps(current?: string): EcosystemApp[] {
  const host = typeof window !== 'undefined' ? window.location.host : '';
  return ECOSYSTEM_APPS.filter((app) => {
    if (current && app.key === current) return false;
    return new URL(app.url).host !== host;
  });
}
