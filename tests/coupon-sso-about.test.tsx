/**
 * Test della 1.12.0: coupon di registrazione (campo, link di invito ?coupon=),
 * recupero della sessione via SSO su un 401 e modale "Approfondisci".
 */

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHubAuth, memoryStorageAdapter } from '../src/core/index.js';
import { HubAuthProvider } from '../src/react/index.js';
import { LoginScreen } from '../src/ui/index.js';

const BASE = 'https://hub.test/v1/';
const PRIVACY = { text: 'Informativa di prova.', version: 'v1' };
const TOOL = { key: 'wandly', label: 'Wandly', description: 'Articoli con AI', login_notice: null };
const CONFIG_APERTA = { tool: TOOL, signup_enabled: true, privacy: PRIVACY };
const CONFIG_CHIUSA = { tool: TOOL, signup_enabled: false, privacy: null };
const ME = { user_id: 'u1', email: 'mario@esempio.com', username: 'mario', role: 'user', plan: 'pro',
             status: 'active', expires_at: null, tools: ['wandly'] };
const SSO = { user_id: 'u1', email: 'mario@esempio.com', session_token: 'nuovo', expires_at: 'x' };

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Imposta la query dell'URL come farebbe l'apertura di un link di invito */
const apriLink = (query: string) => window.history.replaceState(null, '', `/${query}`);

beforeEach(() => window.history.replaceState(null, '', '/'));
afterEach(() => {
  window.history.replaceState(null, '', '/');
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ── Coupon: client ──────────────────────────────────────────────────────────

describe('coupon: client', () => {
  /** Client con tool-config e signup finti */
  function creaClient(config: unknown, signup: (body: Record<string, unknown>) => Response = () => json(200, { status: 'pending' })) {
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input).replace(BASE, '');
      if (path.startsWith('auth/tool-config')) return json(200, config);
      if (path === 'signup') return signup(JSON.parse(String(init?.body)));
      throw new Error(`rotta non prevista: ${path}`);
    });
    const client = createHubAuth({
      baseUrl: BASE, storageKey: 'coupon-test', storage: memoryStorageAdapter(), fetch, tool: 'wandly', magicLink: false,
    });
    return { client, fetch };
  }

  const dati = { username: 'Mario', email: 'mario@esempio.com', privacyAccepted: true };
  const richiesteSignup = (fetch: ReturnType<typeof creaClient>['fetch']) =>
    fetch.mock.calls.filter(([url]) => String(url).endsWith('/signup'))
      .map(([, init]) => JSON.parse(String(init?.body)));

  it('register invia il coupon ripulito dagli spazi', async () => {
    const { client, fetch } = creaClient(CONFIG_APERTA);
    await client.loadToolConfig();

    await client.register({ ...dati, coupon: '  BENVENUTO ' });

    expect(richiesteSignup(fetch)[0]).toMatchObject({ coupon: 'BENVENUTO' });
  });

  it.each([undefined, '', '   '])('register senza coupon (%j) non invia il campo', async (coupon) => {
    const { client, fetch } = creaClient(CONFIG_APERTA);
    await client.loadToolConfig();

    await client.register({ ...dati, coupon });

    expect(richiesteSignup(fetch)[0]).not.toHaveProperty('coupon');
  });

  it('un coupon non valido fa lanciare InvalidCoupon e non cambia step', async () => {
    const { client } = creaClient(CONFIG_APERTA, () => json(400, { error: 'InvalidCoupon', message: 'Coupon non valido' }));
    await client.loadToolConfig();
    client.startRegister();

    await expect(client.register({ ...dati, coupon: 'SBAGLIATO' })).rejects.toMatchObject({
      code: 'InvalidCoupon', status: 400,
    });

    expect(client.getState().step).toBe('register');
    expect(client.getState().loading).toBe(false);
  });

  describe('link di invito (?coupon=)', () => {
    it('legge il coupon dall\'URL senza toglierlo', () => {
      apriLink('?coupon=BENVENUTO&utm=x');
      const { client } = creaClient(CONFIG_APERTA);

      expect(client.getState().inviteCoupon).toBe('BENVENUTO');
      expect(window.location.search).toBe('?coupon=BENVENUTO&utm=x');
    });

    it.each(['?coupon=', '?coupon=con spazio', '?coupon=a/b', `?coupon=${'x'.repeat(61)}`, '?altro=1'])(
      '%s: ignorato', (query) => {
        apriLink(query);
        expect(creaClient(CONFIG_APERTA).client.getState().inviteCoupon).toBeNull();
      },
    );

    it('il coupon viaggia con tool-config', async () => {
      apriLink('?coupon=BENVENUTO');
      const { client, fetch } = creaClient(CONFIG_APERTA);

      await client.loadToolConfig();

      expect(String(fetch.mock.calls[0][0])).toBe(`${BASE}auth/tool-config?tool=wandly&coupon=BENVENUTO`);
    });

    it('senza coupon la richiesta resta quella di prima', async () => {
      const { client, fetch } = creaClient(CONFIG_APERTA);

      await client.loadToolConfig();

      expect(String(fetch.mock.calls[0][0])).toBe(`${BASE}auth/tool-config?tool=wandly`);
    });

    it('coupon valido: si apre subito la registrazione, anche se era chiusa', async () => {
      apriLink('?coupon=BENVENUTO');
      const { client } = creaClient({ ...CONFIG_APERTA, coupon_valid: true });
      await client.ready;
      await flush();

      await client.loadToolConfig();

      expect(client.getState().step).toBe('register');
      expect(client.getState().toolConfig?.coupon_valid).toBe(true);
    });

    it('coupon non valido: avviso, resta il login', async () => {
      apriLink('?coupon=SBAGLIATO');
      const { client } = creaClient({ ...CONFIG_CHIUSA, coupon_valid: false });
      await client.ready;
      await flush();

      await client.loadToolConfig();

      expect(client.getState().step).toBe('email');
      expect(client.getState().notice).toBe('coupon_invalid');
    });

    it('hub senza il supporto ai coupon (nessun coupon_valid): non succede nulla', async () => {
      apriLink('?coupon=BENVENUTO');
      const { client } = creaClient(CONFIG_APERTA);
      await client.ready;
      await flush();

      await client.loadToolConfig();

      expect(client.getState().step).toBe('email');
      expect(client.getState().notice).toBeNull();
    });

    it('si valuta una volta sola: dopo un ricaricamento della configurazione il form non si riapre', async () => {
      apriLink('?coupon=BENVENUTO');
      const { client } = creaClient({ ...CONFIG_APERTA, coupon_valid: true });
      await client.ready;
      await flush();
      await client.loadToolConfig();
      client.resetToEmail();

      await client.loadToolConfig(true);

      expect(client.getState().step).toBe('email');
    });
  });
});

// ── Coupon: UI ──────────────────────────────────────────────────────────────

describe('coupon: form di registrazione', () => {
  function monta(config: unknown, signup: (body: Record<string, unknown>) => Response = () => json(200, { status: 'pending' })) {
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input).replace(BASE, '');
      if (path.startsWith('auth/tool-config')) return json(200, config);
      if (path === 'signup') return signup(JSON.parse(String(init?.body)));
      throw new Error(`rotta non prevista: ${path}`);
    });
    const client = createHubAuth({
      baseUrl: BASE, storageKey: 'coupon-ui', storage: memoryStorageAdapter(), fetch, tool: 'wandly', magicLink: false,
    });
    render(
      <HubAuthProvider client={client}>
        <LoginScreen title="Wandly" />
      </HubAuthProvider>,
    );
    return { client, fetch };
  }

  const apriForm = async () => {
    fireEvent.click(await screen.findByRole('button', { name: 'Non hai un account? Registrati' }));
    return screen.findByLabelText('Nome utente');
  };

  const compila = () => {
    fireEvent.change(screen.getByLabelText('Nome utente'), { target: { value: 'Mario' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'mario@esempio.com' } });
    fireEvent.click(screen.getByRole('checkbox'));
  };

  it('il campo sta chiuso dietro "Hai un coupon?" e si apre al clic', async () => {
    monta(CONFIG_APERTA);
    await apriForm();
    expect(screen.queryByLabelText('Coupon')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Hai un coupon?' }));

    expect(screen.getByLabelText('Coupon')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Hai un coupon?' })).toBeNull();
  });

  it('il coupon digitato viaggia con la registrazione', async () => {
    const signup = vi.fn(() => json(200, { status: 'pending' }));
    monta(CONFIG_APERTA, signup);
    await apriForm();
    compila();
    fireEvent.click(screen.getByRole('button', { name: 'Hai un coupon?' }));
    fireEvent.change(screen.getByLabelText('Coupon'), { target: { value: 'BENVENUTO' } });

    fireEvent.click(screen.getByRole('button', { name: 'Registrati' }));

    expect(await screen.findByText('Registrazione ricevuta')).toBeTruthy();
    expect(signup).toHaveBeenCalledWith(expect.objectContaining({ coupon: 'BENVENUTO' }));
  });

  it('senza coupon la registrazione parte come prima', async () => {
    const signup = vi.fn(() => json(200, { status: 'pending' }));
    monta(CONFIG_APERTA, signup);
    await apriForm();
    compila();

    fireEvent.click(screen.getByRole('button', { name: 'Registrati' }));

    await screen.findByText('Registrazione ricevuta');
    expect(signup.mock.calls[0] as unknown[]).not.toContainEqual(expect.objectContaining({ coupon: expect.anything() }));
  });

  it('"Coupon non valido" è mostrato nel form e la registrazione si ferma', async () => {
    monta(CONFIG_APERTA, () => json(400, { error: 'InvalidCoupon', message: 'Coupon non valido' }));
    await apriForm();
    compila();
    fireEvent.click(screen.getByRole('button', { name: 'Hai un coupon?' }));
    fireEvent.change(screen.getByLabelText('Coupon'), { target: { value: 'SCADUTO' } });

    fireEvent.click(screen.getByRole('button', { name: 'Registrati' }));

    expect((await screen.findByRole('alert')).textContent).toBe('Coupon non valido');
    expect(screen.queryByText('Registrazione ricevuta')).toBeNull();
  });

  it('con un link di invito valido il form si apre da solo, con il coupon già scritto', async () => {
    apriLink('?coupon=BENVENUTO');
    monta({ ...CONFIG_CHIUSA, signup_enabled: true, privacy: PRIVACY, coupon_valid: true });

    const coupon = (await screen.findByLabelText('Coupon')) as HTMLInputElement;

    expect(coupon.value).toBe('BENVENUTO');
    expect(screen.getByRole('heading', { name: 'Crea il tuo account' })).toBeTruthy();
  });

  it('con un link di invito non valido il login mostra l\'avviso', async () => {
    apriLink('?coupon=SBAGLIATO');
    monta({ ...CONFIG_CHIUSA, coupon_valid: false });

    expect((await screen.findByRole('status')).textContent).toBe('Coupon non valido');
    expect(screen.getByLabelText('Email')).toBeTruthy();
  });
});

// ── SSO: recupero su 401 ────────────────────────────────────────────────────

describe('SSO: recupero della sessione su un 401', () => {
  /**
   * Hub finto: GET /me risponde 200 solo ai token in `validi`, 401 agli altri;
   * POST sso/session risponde con `sso()`.
   */
  function creaHub(opts: { validi: string[]; sso?: () => Response; ssoAttivo?: boolean; onLogout?: (i: unknown) => void }) {
    const sso = opts.sso ?? (() => json(200, SSO));
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input).replace(BASE, '');
      if (path.startsWith('me')) {
        const token = String((init?.headers as Record<string, string>)?.Authorization ?? '').replace('Bearer ', '');
        return opts.validi.includes(token) ? json(200, ME) : json(401, { error: 'InvalidSession' });
      }
      if (path === 'sso/session') return sso();
      if (path.startsWith('logout')) return json(200, { success: true });
      throw new Error(`rotta non prevista: ${path}`);
    });
    const storage = memoryStorageAdapter();
    return { fetch, storage, opts };
  }

  const salvata = (utente: string | null = 'u1') => ({
    v: 1, token: 'vecchio', user: utente ? { user_id: utente, email: null, username: null, role: null, plan: null, status: null, expires_at: null, tools: [] } : null,
  });

  const chiamate = (fetch: ReturnType<typeof creaHub>['fetch'], path: string) =>
    fetch.mock.calls.filter(([url]) => String(url).replace(BASE, '') === path);

  it('al boot: token salvato rifiutato ma cookie SSO valido → rientra da solo, senza login', async () => {
    const hub = creaHub({ validi: ['nuovo'] });
    await hub.storage.set('k', salvata());
    const onLogout = vi.fn();

    const auth = createHubAuth({ baseUrl: BASE, storageKey: 'k', sso: true, storage: hub.storage, fetch: hub.fetch, onLogout });
    await flush();
    await flush();

    expect(auth.getState().status).toBe('authenticated');
    expect(auth.getState().token).toBe('nuovo');
    expect(auth.getState().notice).toBeNull();
    // Lo stesso utente: nessuna pulizia dei dati locali
    expect(onLogout).not.toHaveBeenCalled();
    // La sessione nuova sostituisce quella salvata
    expect(await hub.storage.get('k')).toMatchObject({ token: 'nuovo' });
  });

  it('il cookie SSO viaggia con le credenziali', async () => {
    const hub = creaHub({ validi: ['nuovo'] });
    await hub.storage.set('k', salvata());

    createHubAuth({ baseUrl: BASE, storageKey: 'k', sso: true, storage: hub.storage, fetch: hub.fetch });
    await flush();
    await flush();

    expect(chiamate(hub.fetch, 'sso/session')[0][1]?.credentials).toBe('include');
  });

  it('cookie SSO assente: logout con l\'avviso di sessione scaduta, come prima', async () => {
    const hub = creaHub({ validi: [], sso: () => json(401, { error: 'NoSession' }) });
    await hub.storage.set('k', salvata());
    const onLogout = vi.fn();

    const auth = createHubAuth({ baseUrl: BASE, storageKey: 'k', sso: true, storage: hub.storage, fetch: hub.fetch, onLogout });
    await flush();
    await flush();

    expect(auth.getState().status).toBe('anonymous');
    expect(auth.getState().notice).toBe('session_expired');
    expect(onLogout).toHaveBeenCalledWith({ userId: 'u1', notice: 'session_expired' });
    expect(await hub.storage.get('k')).toBeNull();
  });

  it('hub non raggiungibile durante il recupero: logout con l\'avviso', async () => {
    const hub = creaHub({ validi: [], sso: () => { throw new TypeError('Failed to fetch'); } });
    await hub.storage.set('k', salvata());

    const auth = createHubAuth({ baseUrl: BASE, storageKey: 'k', sso: true, storage: hub.storage, fetch: hub.fetch });
    await flush();
    await flush();

    expect(auth.getState().status).toBe('anonymous');
    expect(auth.getState().notice).toBe('session_expired');
  });

  it('senza sso un 401 porta subito al login e non tocca il cookie', async () => {
    const hub = creaHub({ validi: [] });
    await hub.storage.set('k', salvata());

    const auth = createHubAuth({ baseUrl: BASE, storageKey: 'k', storage: hub.storage, fetch: hub.fetch });
    await flush();

    expect(auth.getState().status).toBe('anonymous');
    expect(auth.getState().notice).toBe('session_expired');
    expect(chiamate(hub.fetch, 'sso/session')).toHaveLength(0);
  });

  it('niente cicli: se anche la sessione appena ottenuta riceve 401 si va al login', async () => {
    const hub = creaHub({ validi: [] });   // nessun token è valido, nemmeno quello nuovo
    await hub.storage.set('k', salvata());

    const auth = createHubAuth({ baseUrl: BASE, storageKey: 'k', sso: true, storage: hub.storage, fetch: hub.fetch });
    await flush();
    await flush();
    await flush();

    expect(auth.getState().status).toBe('anonymous');
    expect(auth.getState().notice).toBe('session_expired');
    expect(chiamate(hub.fetch, 'sso/session')).toHaveLength(1);
  });

  it('il cookie è di un altro utente: i dati locali del precedente vengono puliti', async () => {
    const hub = creaHub({ validi: ['nuovo'], sso: () => json(200, { ...SSO, user_id: 'u2' }) });
    await hub.storage.set('k', salvata('u1'));
    const onLogout = vi.fn();

    const auth = createHubAuth({ baseUrl: BASE, storageKey: 'k', sso: true, storage: hub.storage, fetch: hub.fetch, onLogout });
    await flush();
    await flush();

    expect(auth.getState().status).toBe('authenticated');
    expect(onLogout).toHaveBeenCalledWith({ userId: 'u1', notice: null });
  });

  it('a sessione aperta: un 401 su una richiesta dell\'app recupera la sessione dal cookie', async () => {
    const hub = creaHub({ validi: ['vecchio', 'nuovo'] });
    await hub.storage.set('k', salvata());
    const auth = createHubAuth({ baseUrl: BASE, storageKey: 'k', sso: true, storage: hub.storage, fetch: hub.fetch });
    await flush();
    expect(auth.getState().token).toBe('vecchio');

    auth.handleUnauthorized('vecchio');
    await flush();
    await flush();

    expect(auth.getState().status).toBe('authenticated');
    expect(auth.getState().token).toBe('nuovo');
  });

  it('più 401 in parallelo avviano un solo recupero', async () => {
    const hub = creaHub({ validi: ['vecchio', 'nuovo'] });
    await hub.storage.set('k', salvata());
    const auth = createHubAuth({ baseUrl: BASE, storageKey: 'k', sso: true, storage: hub.storage, fetch: hub.fetch });
    await flush();

    auth.handleUnauthorized('vecchio');
    auth.handleUnauthorized('vecchio');
    auth.handleUnauthorized('vecchio');
    await flush();
    await flush();

    expect(chiamate(hub.fetch, 'sso/session')).toHaveLength(1);
    expect(auth.getState().token).toBe('nuovo');
  });

  it('un 401 di una richiesta fatta con un token già sostituito è ignorato', async () => {
    const hub = creaHub({ validi: ['vecchio'] });
    await hub.storage.set('k', salvata());
    const auth = createHubAuth({ baseUrl: BASE, storageKey: 'k', sso: true, storage: hub.storage, fetch: hub.fetch });
    await flush();

    auth.handleUnauthorized('un-altro-token');
    await flush();

    expect(auth.getState().token).toBe('vecchio');
    expect(chiamate(hub.fetch, 'sso/session')).toHaveLength(0);
  });
});

// ── Modale "Approfondisci" ──────────────────────────────────────────────────

describe('LoginScreen: "Approfondisci" in una modale', () => {
  const ABOUT = `<!doctype html><html><head><title>Wandly</title><style>body{color:red}</style></head><body>
    <header class="site"><a href="/">Wandly</a><a class="cta" href="/">Accedi a Wandly</a></header>
    <main>
      <nav aria-label="Percorso"><small><a href="/">Wandly</a> / Come funziona</small></nav>
      <h1>Wandly: dall'idea all'articolo</h1>
      <p class="lead" onclick="alert(1)">Testo introduttivo.<script>window.hacked = true</script></p>
      <figure><img src="/login-hero.jpg" width="1200" height="750" alt="Schermata di Wandly" onerror="alert(1)"><figcaption>Una schermata.</figcaption></figure>
      <figure><img src="relativa.png" alt="Immagine relativa"></figure>
      <div class="faq"><details><summary>Come si accede?</summary><p>Con un codice via email.</p></details></div>
      <ul class="apps"><li><a href="https://slideorama.mavida.com/about/">Slide-orama</a></li><li><a href="javascript:alert(1)">Cattivo</a></li></ul>
      <iframe src="https://example.com"></iframe>
    </main>
    <footer class="site"><a href="/">Accedi</a></footer></body></html>`;

  function monta(href = '/about/', props: Record<string, unknown> = {}) {
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('auth/tool-config')) return json(200, CONFIG_CHIUSA);
      throw new Error(`rotta non prevista: ${String(input)}`);
    });
    const client = createHubAuth({
      baseUrl: BASE, storageKey: 'about', storage: memoryStorageAdapter(), fetch, tool: 'wandly', magicLink: false,
    });
    render(
      <HubAuthProvider client={client}>
        <LoginScreen title="Wandly" asideLink={{ href, label: 'Approfondisci', ...props }} />
      </HubAuthProvider>,
    );
  }

  /** fetch globale dell'about (la libreria usa quella del browser per una pagina statica) */
  const stubAbout = (risposta: () => Response | Promise<Response>) => {
    const aboutFetch = vi.fn(async () => risposta());
    vi.stubGlobal('fetch', aboutFetch);
    return aboutFetch;
  };

  const link = () => screen.findByRole('link', { name: /Approfondisci/ });

  it('il clic apre la modale con il contenuto della pagina, senza lasciare il login', async () => {
    const aboutFetch = stubAbout(() => new Response(ABOUT, { status: 200 }));
    monta('/about-uno/');

    fireEvent.click(await link());

    const modale = await screen.findByRole('dialog', { name: 'Approfondisci' });
    expect(await within(modale).findByText("Wandly: dall'idea all'articolo")).toBeTruthy();
    expect(within(modale).getByText('Testo introduttivo.')).toBeTruthy();
    expect(aboutFetch).toHaveBeenCalledWith('/about-uno/', expect.objectContaining({ credentials: 'same-origin' }));
    // Il login resta al suo posto
    expect(screen.getByLabelText('Email')).toBeTruthy();
  });

  it('prende solo il <main>: niente header, footer, percorso di navigazione né stili della pagina', async () => {
    stubAbout(() => new Response(ABOUT, { status: 200 }));
    monta('/about-due/');

    fireEvent.click(await link());
    const modale = await screen.findByRole('dialog');
    await within(modale).findByText('Testo introduttivo.');

    expect(within(modale).queryByText('Accedi a Wandly')).toBeNull();
    expect(within(modale).queryByText('Accedi')).toBeNull();
    expect(within(modale).queryByText(/Come funziona/)).toBeNull();
    expect(modale.querySelector('style, nav, header, footer')).toBeNull();
  });

  it('sanifica: niente script, gestori di eventi, iframe né javascript:', async () => {
    stubAbout(() => new Response(ABOUT, { status: 200 }));
    monta('/about-tre/');

    fireEvent.click(await link());
    const modale = await screen.findByRole('dialog');
    await within(modale).findByText('Testo introduttivo.');

    expect(modale.querySelector('script, iframe')).toBeNull();
    expect(modale.querySelector('[onclick], [onerror]')).toBeNull();
    expect((window as unknown as { hacked?: boolean }).hacked).toBeUndefined();
    const cattivo = within(modale).getByText('Cattivo');
    expect(cattivo.getAttribute('href') ?? '').not.toContain('javascript');
  });

  it('immagini e link relativi sono risolti rispetto alla pagina about; i link escono in una nuova scheda', async () => {
    stubAbout(() => new Response(ABOUT, { status: 200 }));
    monta('/about-quattro/');

    fireEvent.click(await link());
    const modale = await screen.findByRole('dialog');
    await within(modale).findByText('Testo introduttivo.');

    expect(within(modale).getByAltText('Schermata di Wandly').getAttribute('src')).toBe(`${window.location.origin}/login-hero.jpg`);
    expect(within(modale).getByAltText('Immagine relativa').getAttribute('src')).toBe(`${window.location.origin}/about-quattro/relativa.png`);
    const esterno = within(modale).getByRole('link', { name: 'Slide-orama' });
    expect(esterno.getAttribute('href')).toBe('https://slideorama.mavida.com/about/');
    expect(esterno.getAttribute('target')).toBe('_blank');
    expect(esterno.getAttribute('rel')).toContain('noopener');
  });

  it('mantiene il link reale (href) per motori di ricerca e apertura in nuova scheda', async () => {
    stubAbout(() => new Response(ABOUT, { status: 200 }));
    monta('/about-cinque/');

    expect((await link()).getAttribute('href')).toBe('/about-cinque/');
  });

  it.each([
    ['Ctrl + clic', { ctrlKey: true }],
    ['Cmd + clic', { metaKey: true }],
    ['Maiusc + clic', { shiftKey: true }],
    ['Alt + clic', { altKey: true }],
    ['tasto centrale', { button: 1 }],
  ])('%s non apre la modale: il link segue il suo corso', async (_nome, evento) => {
    const aboutFetch = stubAbout(() => new Response(ABOUT, { status: 200 }));
    monta('/about-sei/');
    const cta = await link();

    // dispatchEvent restituisce false se qualcuno ha chiamato preventDefault
    const seguito = fireEvent.click(cta, evento);

    expect(seguito).toBe(true);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(aboutFetch).not.toHaveBeenCalled();
  });

  it('modal: false lascia un link normale', async () => {
    const aboutFetch = stubAbout(() => new Response(ABOUT, { status: 200 }));
    monta('/about-sette/', { modal: false });

    expect(fireEvent.click(await link())).toBe(true);

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(aboutFetch).not.toHaveBeenCalled();
  });

  it.each(['https://altro.example.com/about/', '//altro.example.com/about/'])(
    'un indirizzo di un\'altra origine (%s) resta un link normale', async (href) => {
      const aboutFetch = stubAbout(() => new Response(ABOUT, { status: 200 }));
      monta(href);

      expect(fireEvent.click(await link())).toBe(true);

      expect(screen.queryByRole('dialog')).toBeNull();
      expect(aboutFetch).not.toHaveBeenCalled();
    },
  );

  it('"Chiudi" la chiude e il focus torna al link', async () => {
    stubAbout(() => new Response(ABOUT, { status: 200 }));
    monta('/about-otto/');
    const cta = await link();
    fireEvent.click(cta);
    const modale = await screen.findByRole('dialog');
    await within(modale).findByText('Testo introduttivo.');

    fireEvent.click(within(modale).getByRole('button', { name: 'Chiudi' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(cta);
  });

  it('il clic sullo sfondo la chiude, quello sul contenuto no', async () => {
    stubAbout(() => new Response(ABOUT, { status: 200 }));
    monta('/about-nove/');
    fireEvent.click(await link());
    const modale = await screen.findByRole('dialog');
    await within(modale).findByText('Testo introduttivo.');

    fireEvent.click(within(modale).getByText('Testo introduttivo.'));
    expect(screen.queryByRole('dialog')).not.toBeNull();

    fireEvent.click(modale);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('riaprendola non riscarica la pagina', async () => {
    const aboutFetch = stubAbout(() => new Response(ABOUT, { status: 200 }));
    monta('/about-dieci/');
    fireEvent.click(await link());
    await within(await screen.findByRole('dialog')).findByText('Testo introduttivo.');
    fireEvent.click(screen.getByRole('button', { name: 'Chiudi' }));

    fireEvent.click(await link());
    await within(await screen.findByRole('dialog')).findByText('Testo introduttivo.');

    expect(aboutFetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['risposta 404', () => new Response('non trovata', { status: 404 })],
    ['pagina senza <main>', () => new Response('<html><body><p>niente</p></body></html>', { status: 200 })],
    ['rete assente', () => { throw new TypeError('Failed to fetch'); }],
  ])('%s: si va alla pagina intera, come un link normale', async (_nome, risposta) => {
    stubAbout(risposta);
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, href: window.location.href, assign });
    monta('/about-errore-' + _nome.length + '/');

    fireEvent.click(await link());

    await waitFor(() => expect(assign).toHaveBeenCalledWith(expect.stringContaining('/about-errore-')));
  });
});
