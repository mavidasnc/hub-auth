/**
 * Test della 1.3.0: configurazione pubblica del login (loadToolConfig),
 * registrazione (startRegister / register, RegisterStep, RegisteredStep) e
 * layout a due metà di LoginScreen.
 */

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHubAuth, HubAuthError, memoryStorageAdapter } from '../src/core/index.js';
import { HubAuthProvider } from '../src/react/index.js';
import { LoginScreen } from '../src/ui/index.js';

const BASE = 'https://hub.test/v1/';

const PRIVACY = { text: 'Primo paragrafo.\n\nSecondo paragrafo.', version: 'v1' };

const CONFIG_APERTA = {
  tool: { key: 'wandly', label: 'Wandly', description: 'Articoli con AI', login_notice: 'Manutenzione domenica' },
  signup_enabled: true,
  privacy: PRIVACY,
};

const CONFIG_CHIUSA = {
  tool: { key: 'wandly', label: 'Wandly', description: null, login_notice: null },
  signup_enabled: false,
  privacy: null,
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

interface Rotte {
  config?: () => Response;
  signup?: (body: Record<string, unknown>) => Response;
}

/** Client con una fetch finta che instrada tool-config e signup */
function creaClient(rotte: Rotte, tool: string | null = 'wandly') {
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input).replace(BASE, '');
    if (path.startsWith('auth/tool-config')) {
      if (!rotte.config) throw new Error('hub non raggiungibile');
      return rotte.config();
    }
    if (path === 'signup') return rotte.signup!(JSON.parse(String(init?.body)));
    if (path === 'otp-request') return json(200, { success: true });
    throw new Error(`rotta non prevista: ${path}`);
  });
  const client = createHubAuth({
    baseUrl: BASE, storageKey: 'register-test', storage: memoryStorageAdapter(), fetch,
    tool: tool ?? undefined, magicLink: false,
  });
  return { client, fetch };
}

const chiamate = (fetch: ReturnType<typeof creaClient>['fetch'], prefisso: string) =>
  fetch.mock.calls.filter(([input]) => String(input).replace(BASE, '').startsWith(prefisso));

afterEach(() => {
  vi.useRealTimers();
});

describe('loadToolConfig', () => {
  it('carica la configurazione passando il tool', async () => {
    const { client, fetch } = creaClient({ config: () => json(200, CONFIG_APERTA) });
    await client.ready;

    await client.loadToolConfig();

    expect(client.getState().toolConfig).toEqual(CONFIG_APERTA);
    expect(String(fetch.mock.calls[0][0])).toBe(`${BASE}auth/tool-config?tool=wandly`);
  });

  it('senza tool non aggiunge la query string', async () => {
    const { client, fetch } = creaClient({ config: () => json(200, { ...CONFIG_APERTA, tool: null }) }, null);

    await client.loadToolConfig();

    expect(String(fetch.mock.calls[0][0])).toBe(`${BASE}auth/tool-config`);
  });

  it('non la ricarica se già presente, a meno di force', async () => {
    const { client, fetch } = creaClient({ config: () => json(200, CONFIG_APERTA) });

    await client.loadToolConfig();
    await client.loadToolConfig();
    expect(chiamate(fetch, 'auth/tool-config')).toHaveLength(1);

    await client.loadToolConfig(true);
    expect(chiamate(fetch, 'auth/tool-config')).toHaveLength(2);
  });

  it('chiamate concorrenti fanno una sola richiesta', async () => {
    const { client, fetch } = creaClient({ config: () => json(200, CONFIG_APERTA) });

    await Promise.all([client.loadToolConfig(), client.loadToolConfig(), client.loadToolConfig()]);

    expect(chiamate(fetch, 'auth/tool-config')).toHaveLength(1);
  });

  it.each([
    ['hub non raggiungibile', undefined],
    ['risposta 500', () => json(500, { error: 'boom' })],
    ['hub vecchio senza la rotta (404)', () => json(404, { error: 'NotFound' })],
    ['forma inattesa', () => json(200, { ciao: 'mondo' })],
    ['JSON non valido', () => new Response('<html>', { status: 200 })],
  ])('%s: nessuna configurazione e nessun errore', async (_nome, config) => {
    const { client } = creaClient({ config });

    await expect(client.loadToolConfig()).resolves.toBeUndefined();

    expect(client.getState().toolConfig).toBeNull();
  });

  it('dopo un errore si può riprovare', async () => {
    let esito: Response | null = null;
    const { client } = creaClient({ config: () => esito ?? json(500, {}) });

    await client.loadToolConfig();
    expect(client.getState().toolConfig).toBeNull();

    esito = json(200, CONFIG_APERTA);
    await client.loadToolConfig();
    expect(client.getState().toolConfig).toEqual(CONFIG_APERTA);
  });
});

describe('startRegister e register', () => {
  const dati = { username: 'Mario Rossi', email: 'Mario@Esempio.com', privacyAccepted: true };

  async function pronto(rotte: Partial<Rotte> = {}, config: unknown = CONFIG_APERTA) {
    const ctx = creaClient({ config: () => json(200, config), ...rotte });
    await ctx.client.loadToolConfig();
    return ctx;
  }

  it('startRegister apre il form solo se la registrazione è offerta', async () => {
    const aperta = await pronto();
    aperta.client.startRegister();
    expect(aperta.client.getState().step).toBe('register');

    const chiusa = await pronto({}, CONFIG_CHIUSA);
    chiusa.client.startRegister();
    expect(chiusa.client.getState().step).toBe('email');
  });

  it('registrazione con account da approvare: step "registered"', async () => {
    const { client, fetch } = await pronto({ signup: () => json(200, { success: true, status: 'pending' }) });

    await client.register(dati);

    expect(client.getState().step).toBe('registered');
    expect(client.getState().pendingEmail).toBe('mario@esempio.com');
    expect(client.getState().loading).toBe(false);
    const body = JSON.parse(String(chiamate(fetch, 'signup')[0][1]?.body));
    expect(body).toEqual({
      username: 'Mario Rossi', email: 'mario@esempio.com', tool: 'wandly',
      privacy_accepted: true, privacy_version: 'v1',
    });
  });

  it('registrazione con account attivo: si prosegue con il codice OTP', async () => {
    const { client } = await pronto({ signup: () => json(200, { success: true, status: 'active' }) });

    await client.register(dati);

    const stato = client.getState();
    expect(stato.step).toBe('otp');
    expect(stato.pendingEmail).toBe('mario@esempio.com');
    expect(stato.otpRequestedAt).toBeTypeOf('number');
  });

  it('senza tool configurato non invia il campo tool', async () => {
    const ctx = creaClient({
      config: () => json(200, { ...CONFIG_APERTA, tool: null }),
      signup: () => json(200, { success: true, status: 'pending' }),
    }, null);
    await ctx.client.loadToolConfig();

    await ctx.client.register(dati);

    const body = JSON.parse(String(chiamate(ctx.fetch, 'signup')[0][1]?.body));
    expect(body).not.toHaveProperty('tool');
  });

  it.each([
    ['nome troppo corto', { username: ' a ' }, 'InvalidUsername'],
    ['email non valida', { email: 'non-una-email' }, 'InvalidEmail'],
    ['privacy non accettata', { privacyAccepted: false }, 'PrivacyNotAccepted'],
  ])('%s: errore locale senza chiamare hub', async (_nome, override, codice) => {
    const { client, fetch } = await pronto({ signup: () => json(200, { status: 'pending' }) });

    await expect(client.register({ ...dati, ...override })).rejects.toMatchObject({ code: codice });

    expect(chiamate(fetch, 'signup')).toHaveLength(0);
    expect(client.getState().loading).toBe(false);
  });

  it('senza registrazione offerta lancia SignupDisabled', async () => {
    const { client, fetch } = await pronto({}, CONFIG_CHIUSA);

    await expect(client.register(dati)).rejects.toMatchObject({ code: 'SignupDisabled' });

    expect(chiamate(fetch, 'signup')).toHaveLength(0);
  });

  it('informativa cambiata: ricarica la configurazione e rilancia l\'errore', async () => {
    let versione = 'v1';
    const { client, fetch } = await pronto({
      config: () => json(200, { ...CONFIG_APERTA, privacy: { text: 'Nuovo testo', version: versione } }),
      signup: () => json(400, { error: 'PrivacyVersionMismatch', message: 'Informativa aggiornata' }),
    });
    versione = 'v2';

    await expect(client.register(dati)).rejects.toMatchObject({ code: 'PrivacyVersionMismatch' });

    await waitFor(() => expect(client.getState().toolConfig?.privacy?.version).toBe('v2'));
    expect(chiamate(fetch, 'auth/tool-config')).toHaveLength(2);
    expect(client.getState().step).toBe('email');
  });

  it('registrazione chiusa nel frattempo: ricarica la configurazione', async () => {
    let config: unknown = CONFIG_APERTA;
    const { client } = await pronto({
      config: () => json(200, config),
      signup: () => json(403, { error: 'SignupDisabled', message: 'Non disponibile' }),
    });
    config = CONFIG_CHIUSA;

    await expect(client.register(dati)).rejects.toMatchObject({ code: 'SignupDisabled' });

    await waitFor(() => expect(client.getState().toolConfig?.signup_enabled).toBe(false));
  });

  it('errori di hub (429) rilanciati e loading rilasciato', async () => {
    const { client } = await pronto({ signup: () => json(429, { message: 'Troppi tentativi.' }) });

    const errore = await client.register(dati).catch((e) => e);

    expect(errore).toBeInstanceOf(HubAuthError);
    expect(errore.status).toBe(429);
    expect(client.getState().loading).toBe(false);
  });

  it('resetToEmail riporta al login dal form e dalla conferma', async () => {
    const { client } = await pronto({ signup: () => json(200, { status: 'pending' }) });

    client.startRegister();
    client.resetToEmail();
    expect(client.getState().step).toBe('email');

    await client.register(dati);
    client.resetToEmail();
    expect(client.getState().step).toBe('email');
  });
});

describe('UI: registrazione', () => {
  function monta(rotte: Rotte, props: Parameters<typeof LoginScreen>[0] = {}) {
    const ctx = creaClient(rotte);
    render(
      <HubAuthProvider client={ctx.client}>
        <LoginScreen title="App" {...props} />
      </HubAuthProvider>,
    );
    return ctx;
  }

  const apriForm = async () => {
    fireEvent.click(await screen.findByRole('button', { name: 'Non hai un account? Registrati' }));
    return screen.findByLabelText('Nome utente');
  };

  it('il link "Registrati" compare solo se hub offre la registrazione', async () => {
    monta({ config: () => json(200, CONFIG_CHIUSA) });

    expect(await screen.findByLabelText('Email')).toBeTruthy();
    await waitFor(() => expect(screen.queryByText('Non hai un account? Registrati')).toBeNull());
  });

  it('senza hub raggiungibile il login resta quello di sempre', async () => {
    monta({});

    expect(await screen.findByLabelText('Email')).toBeTruthy();
    expect(screen.queryByText('Non hai un account? Registrati')).toBeNull();
    expect(document.querySelector('.hub-auth--split')).toBeNull();
  });

  it('signup={false} nasconde il link anche se hub la offre', async () => {
    monta({ config: () => json(200, CONFIG_APERTA) }, { signup: false });

    await screen.findByText('Wandly');
    expect(screen.queryByText('Non hai un account? Registrati')).toBeNull();
  });

  it('il link apre il form: il testo della privacy non è sotto il form ma nella modale', async () => {
    monta({ config: () => json(200, CONFIG_APERTA) });

    await apriForm();

    expect(screen.getByRole('heading', { name: 'Crea il tuo account' })).toBeTruthy();
    expect(screen.queryByText('Primo paragrafo.')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: "Visualizza il testo completo dell'informativa" })).toBeTruthy();
  });

  describe('modale dell\'informativa', () => {
    it('si apre dal link nella frase del consenso, con i paragrafi', async () => {
      monta({ config: () => json(200, CONFIG_APERTA) });
      await apriForm();

      fireEvent.click(screen.getByRole('button', { name: 'informativa sulla privacy' }));

      const modale = screen.getByRole('dialog', { name: 'Informativa sulla privacy' });
      expect(within(modale).getByText('Primo paragrafo.')).toBeTruthy();
      expect(within(modale).getByText('Secondo paragrafo.')).toBeTruthy();
    });

    it('si apre dal pulsante "Visualizza il testo completo"', async () => {
      monta({ config: () => json(200, CONFIG_APERTA) });
      await apriForm();

      fireEvent.click(screen.getByRole('button', { name: "Visualizza il testo completo dell'informativa" }));

      expect(screen.getByRole('dialog', { name: 'Informativa sulla privacy' })).toBeTruthy();
    });

    it('il clic sul link non cambia la spunta', async () => {
      monta({ config: () => json(200, CONFIG_APERTA) });
      await apriForm();

      fireEvent.click(screen.getByRole('button', { name: 'informativa sulla privacy' }));

      const consenso = screen.getByRole('checkbox') as HTMLInputElement;
      expect(consenso.checked).toBe(false);
    });

    it('il titolo di un paragrafo "Titolo\\ntesto" è in grassetto su una riga propria', async () => {
      const config = { ...CONFIG_APERTA, privacy: { text: 'Titolare\nMavida snc.\n\nDiritti\nPuoi chiederci tutto.', version: 'v2' } };
      monta({ config: () => json(200, config) });
      await apriForm();

      fireEvent.click(screen.getByRole('button', { name: 'informativa sulla privacy' }));

      const titolo = screen.getByText('Titolare');
      expect(titolo.tagName).toBe('STRONG');
      expect(titolo.parentElement?.textContent).toBe('TitolareMavida snc.');
    });

    it('"Chiudi" la chiude senza dare il consenso', async () => {
      monta({ config: () => json(200, CONFIG_APERTA) });
      await apriForm();
      fireEvent.click(screen.getByRole('button', { name: "Visualizza il testo completo dell'informativa" }));

      fireEvent.click(screen.getByRole('button', { name: 'Chiudi' }));

      expect(screen.queryByRole('dialog')).toBeNull();
      expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false);
    });

    it('"Accetto l\'informativa" la chiude e spunta la casella', async () => {
      monta({ config: () => json(200, CONFIG_APERTA) });
      await apriForm();
      fireEvent.click(screen.getByRole('button', { name: 'informativa sulla privacy' }));

      fireEvent.click(screen.getByRole('button', { name: "Accetto l'informativa" }));

      expect(screen.queryByRole('dialog')).toBeNull();
      expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(true);
    });

    it('il clic sullo sfondo la chiude, quello sul contenuto no', async () => {
      monta({ config: () => json(200, CONFIG_APERTA) });
      await apriForm();
      fireEvent.click(screen.getByRole('button', { name: 'informativa sulla privacy' }));
      const modale = screen.getByRole('dialog');

      fireEvent.click(within(modale).getByText('Primo paragrafo.'));
      expect(screen.queryByRole('dialog')).toBeTruthy();

      fireEvent.click(modale);
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('alla chiusura il focus torna al pulsante che l\'ha aperta', async () => {
      monta({ config: () => json(200, CONFIG_APERTA) });
      await apriForm();
      const apri = screen.getByRole('button', { name: "Visualizza il testo completo dell'informativa" });
      fireEvent.click(apri);

      fireEvent.click(screen.getByRole('button', { name: 'Chiudi' }));

      expect(document.activeElement).toBe(apri);
    });

    it('con un privacyLabel personalizzato senza {link} resta il solo pulsante', async () => {
      monta({ config: () => json(200, CONFIG_APERTA) }, { messages: { privacyLabel: 'Accetto i termini' } });
      await apriForm();

      expect(screen.getByLabelText('Accetto i termini')).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'informativa sulla privacy' })).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: "Visualizza il testo completo dell'informativa" }));
      expect(screen.getByRole('dialog')).toBeTruthy();
    });
  });

  it('il pulsante si abilita solo con nome, email e consenso', async () => {
    monta({ config: () => json(200, CONFIG_APERTA) });
    await apriForm();
    const invia = screen.getByRole('button', { name: 'Registrati' }) as HTMLButtonElement;
    expect(invia.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('Nome utente'), { target: { value: 'Mario' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'mario@esempio.com' } });
    expect(invia.disabled).toBe(true);

    fireEvent.click(screen.getByRole('checkbox'));
    expect(invia.disabled).toBe(false);
  });

  it('registrazione in attesa: mostra la conferma e torna al login', async () => {
    monta({
      config: () => json(200, CONFIG_APERTA),
      signup: () => json(200, { success: true, status: 'pending' }),
    });
    await apriForm();
    fireEvent.change(screen.getByLabelText('Nome utente'), { target: { value: 'Mario' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'mario@esempio.com' } });
    fireEvent.click(screen.getByRole('checkbox'));

    fireEvent.click(screen.getByRole('button', { name: 'Registrati' }));

    expect(await screen.findByText('Registrazione ricevuta')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('mario@esempio.com');

    fireEvent.click(screen.getByRole('button', { name: "Torna all'accesso" }));
    expect(await screen.findByLabelText('Email')).toBeTruthy();
  });

  it('registrazione con account attivo: passa al codice OTP', async () => {
    monta({
      config: () => json(200, CONFIG_APERTA),
      signup: () => json(200, { success: true, status: 'active' }),
    });
    await apriForm();
    fireEvent.change(screen.getByLabelText('Nome utente'), { target: { value: 'Mario' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'mario@esempio.com' } });
    fireEvent.click(screen.getByRole('checkbox'));

    fireEvent.click(screen.getByRole('button', { name: 'Registrati' }));

    expect(await screen.findByText('Se mario@esempio.com è registrato, riceverai un codice via email.')).toBeTruthy();
  });

  it('informativa aggiornata: messaggio chiaro e consenso da ridare', async () => {
    monta({
      config: () => json(200, CONFIG_APERTA),
      signup: () => json(400, { error: 'PrivacyVersionMismatch', message: 'x' }),
    });
    await apriForm();
    fireEvent.change(screen.getByLabelText('Nome utente'), { target: { value: 'Mario' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'mario@esempio.com' } });
    const consenso = screen.getByRole('checkbox') as HTMLInputElement;
    fireEvent.click(consenso);

    fireEvent.click(screen.getByRole('button', { name: 'Registrati' }));

    expect((await screen.findByRole('alert')).textContent).toContain("L'informativa sulla privacy è stata aggiornata");
    expect(consenso.checked).toBe(false);
  });

  it('errore di hub (429) mostrato nel form', async () => {
    monta({
      config: () => json(200, CONFIG_APERTA),
      signup: () => json(429, { message: 'Troppi tentativi. Attendi qualche minuto.' }),
    });
    await apriForm();
    fireEvent.change(screen.getByLabelText('Nome utente'), { target: { value: 'Mario' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'mario@esempio.com' } });
    fireEvent.click(screen.getByRole('checkbox'));

    fireEvent.click(screen.getByRole('button', { name: 'Registrati' }));

    expect((await screen.findByRole('alert')).textContent).toContain('Troppi tentativi');
  });

  it('"Hai già un account? Accedi" torna al login', async () => {
    monta({ config: () => json(200, CONFIG_APERTA) });
    await apriForm();

    fireEvent.click(screen.getByRole('button', { name: 'Hai già un account? Accedi' }));

    expect(await screen.findByRole('button', { name: 'Invia codice' })).toBeTruthy();
  });

  it('i testi si possono sovrascrivere con messages', async () => {
    monta({ config: () => json(200, CONFIG_APERTA) }, { messages: { signupLink: 'Sign up' } });

    expect(await screen.findByRole('button', { name: 'Sign up' })).toBeTruthy();
  });

  describe('passo del codice (1.6.0)', () => {
    /** Dal login con un'email arriva al passo del codice (otp-request risponde 200 a tutti) */
    const arrivaAlCodice = async (props: Parameters<typeof LoginScreen>[0] = {}, config = CONFIG_APERTA) => {
      monta({ config: () => json(200, config) }, props);
      await screen.findByRole('button', { name: 'Non hai un account? Registrati' });
      fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'sconosciuto@esempio.com' } });
      fireEvent.click(screen.getByRole('button', { name: 'Invia codice' }));
      await screen.findByText('Se sconosciuto@esempio.com è registrato, riceverai un codice via email.');
    };

    it('il testo non afferma che il codice è stato inviato', async () => {
      await arrivaAlCodice();

      expect(screen.queryByText(/Abbiamo inviato/)).toBeNull();
    });

    it('mostra il link "Registrati" e porta al form con l\'email già scritta', async () => {
      await arrivaAlCodice();

      fireEvent.click(screen.getByRole('button', { name: 'Non hai un account? Registrati' }));

      expect(await screen.findByRole('heading', { name: 'Crea il tuo account' })).toBeTruthy();
      expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('sconosciuto@esempio.com');
    });

    it('con signup={false} il link non compare', async () => {
      monta({ config: () => json(200, CONFIG_APERTA) }, { signup: false });
      // Prima la configurazione di hub: il pannello rimonta il form e perderebbe quanto scritto
      await screen.findByText('Wandly');
      fireEvent.change(await screen.findByLabelText('Email'), { target: { value: 'a@esempio.com' } });
      fireEvent.click(screen.getByRole('button', { name: 'Invia codice' }));
      await screen.findByText('Se a@esempio.com è registrato, riceverai un codice via email.');

      expect(screen.queryByRole('button', { name: 'Non hai un account? Registrati' })).toBeNull();
    });

    it('con la registrazione chiusa su hub il link non compare', async () => {
      monta({ config: () => json(200, CONFIG_CHIUSA) });
      fireEvent.change(await screen.findByLabelText('Email'), { target: { value: 'a@esempio.com' } });
      fireEvent.click(screen.getByRole('button', { name: 'Invia codice' }));
      await screen.findByText('Se a@esempio.com è registrato, riceverai un codice via email.');

      expect(screen.queryByRole('button', { name: 'Non hai un account? Registrati' })).toBeNull();
    });
  });
});

describe('UI: layout a due metà', () => {
  function monta(rotte: Rotte, props: Parameters<typeof LoginScreen>[0] = {}) {
    const ctx = creaClient(rotte);
    render(
      <HubAuthProvider client={ctx.client}>
        <LoginScreen title="App" {...props} />
      </HubAuthProvider>,
    );
    return ctx;
  }

  it('con descrizione e avviso dal database compare il pannello', async () => {
    monta({ config: () => json(200, CONFIG_APERTA) });

    expect(await screen.findByText('Articoli con AI')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Wandly' })).toBeTruthy();
    expect(screen.getByRole('note').textContent).toBe('Manutenzione domenica');
    expect(document.querySelector('.hub-auth--split')).not.toBeNull();
    // Il login sta nella metà "main", il pannello in una <aside>
    expect(document.querySelector('aside.hub-auth__aside')).not.toBeNull();
    expect(document.querySelector('.hub-auth__main .hub-auth__card')).not.toBeNull();
  });

  it('con la sola etichetta il tool non apre il pannello', async () => {
    monta({ config: () => json(200, CONFIG_CHIUSA) });

    await waitFor(() => expect(document.querySelector('.hub-auth')).not.toBeNull());
    await screen.findByLabelText('Email');
    expect(document.querySelector('.hub-auth--split')).toBeNull();
    expect(document.querySelector('.hub-auth > .hub-auth__card')).not.toBeNull();
  });

  it('la prop aside sostituisce il pannello di default', async () => {
    monta({ config: () => json(200, CONFIG_APERTA) }, { aside: <p>Pannello dell&apos;app</p> });

    expect(await screen.findByText("Pannello dell'app")).toBeTruthy();
    expect(screen.queryByText('Articoli con AI')).toBeNull();
  });

  it('la prop aside apre il pannello anche senza hub raggiungibile', async () => {
    monta({}, { aside: <p>Solo codice</p> });

    expect(await screen.findByText('Solo codice')).toBeTruthy();
    expect(document.querySelector('.hub-auth--split')).not.toBeNull();
  });

  it('layout="centered" mantiene la card centrata', async () => {
    monta({ config: () => json(200, CONFIG_APERTA) }, { layout: 'centered', aside: <p>Pannello</p> });

    await screen.findByLabelText('Email');
    await waitFor(() => expect(screen.queryByText('Articoli con AI')).toBeNull());
    expect(document.querySelector('.hub-auth--split')).toBeNull();
    expect(screen.queryByText('Pannello')).toBeNull();
  });

  it('layout="split" forza le due metà anche senza contenuto', async () => {
    monta({}, { layout: 'split' });

    await screen.findByLabelText('Email');
    expect(document.querySelector('.hub-auth--split')).not.toBeNull();
  });

  it('footer e className restano sul contenitore giusto', async () => {
    monta({ config: () => json(200, CONFIG_APERTA) }, { className: 'mio-tema', footer: <span>Piè di pagina</span> });

    await screen.findByText('Articoli con AI');
    expect(document.querySelector('.hub-auth.mio-tema')).not.toBeNull();
    expect(document.querySelector('.hub-auth__main .hub-auth__footer')).not.toBeNull();
  });

  it('senza pannello la struttura DOM è quella della 1.2 (card e footer figli diretti)', async () => {
    monta({ config: () => json(200, CONFIG_CHIUSA) }, { footer: <span>Piè di pagina</span> });

    await screen.findByLabelText('Email');
    expect(document.querySelector('.hub-auth > .hub-auth__card')).not.toBeNull();
    expect(document.querySelector('.hub-auth > .hub-auth__footer')).not.toBeNull();
  });
});

describe('UI: logo nel pannello, contenitore e informativa (1.4.0, in modale dalla 1.5.0)', () => {
  const LOGO = <img src="/favicon.svg" alt="" width={48} height={48} data-testid="logo-app" />;

  function monta(rotte: Rotte, props: Parameters<typeof LoginScreen>[0] = {}) {
    const ctx = creaClient(rotte);
    render(
      <HubAuthProvider client={ctx.client}>
        <LoginScreen title="App" {...props} />
      </HubAuthProvider>,
    );
    return ctx;
  }

  it('le due metà stanno in un contenitore dedicato (larghezza massima da CSS)', async () => {
    monta({ config: () => json(200, CONFIG_APERTA) });

    await screen.findByText('Articoli con AI');
    const contenitore = document.querySelector('.hub-auth--split > .hub-auth__split');
    expect(contenitore).not.toBeNull();
    expect(contenitore!.querySelector(':scope > aside.hub-auth__aside')).not.toBeNull();
    expect(contenitore!.querySelector(':scope > .hub-auth__main .hub-auth__card')).not.toBeNull();
  });

  it('il logo dell\'app compare nel pannello e la card lo nasconde da CSS (classe sul contenitore)', async () => {
    monta({ config: () => json(200, CONFIG_APERTA) }, { logo: LOGO });

    await screen.findByText('Articoli con AI');
    expect(document.querySelector('aside .hub-auth__aside-logo [data-testid="logo-app"]')).not.toBeNull();
    expect(document.querySelector('.hub-auth--logo-aside')).not.toBeNull();
  });

  it('senza logo non c\'è né blocco logo nel pannello né la classe', async () => {
    monta({ config: () => json(200, CONFIG_APERTA) });

    await screen.findByText('Articoli con AI');
    expect(document.querySelector('.hub-auth__aside-logo')).toBeNull();
    expect(document.querySelector('.hub-auth--logo-aside')).toBeNull();
  });

  it('con un aside personalizzato il logo resta nella card', async () => {
    monta({ config: () => json(200, CONFIG_APERTA) }, { logo: LOGO, aside: <p>Pannello</p> });

    await screen.findByText('Pannello');
    expect(document.querySelector('aside [data-testid="logo-app"]')).toBeNull();
    expect(document.querySelector('.hub-auth__card [data-testid="logo-app"]')).not.toBeNull();
    expect(document.querySelector('.hub-auth--logo-aside')).toBeNull();
  });

  it('senza pannello (centrata) il logo resta nella card', async () => {
    monta({ config: () => json(200, CONFIG_CHIUSA) }, { logo: LOGO });

    await screen.findByLabelText('Email');
    expect(document.querySelector('.hub-auth__card [data-testid="logo-app"]')).not.toBeNull();
    expect(document.querySelector('.hub-auth__aside')).toBeNull();
  });

  it('l\'informativa privacy non è più sotto il form: sta in una modale, per intero', async () => {
    monta({ config: () => json(200, CONFIG_APERTA) });
    fireEvent.click(await screen.findByRole('button', { name: 'Non hai un account? Registrati' }));
    await screen.findByLabelText('Nome utente');

    // Nessun blocco di testo sotto il form
    expect(document.querySelector('.hub-auth__privacy')).toBeNull();
    expect(screen.queryByRole('region', { name: 'Informativa sulla privacy' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: "Visualizza il testo completo dell'informativa" }));
    const modale = screen.getByRole('dialog', { name: 'Informativa sulla privacy' });
    expect(document.querySelector('form.hub-auth__form')!.contains(modale)).toBe(false);
    expect(modale.querySelector('h3')!.textContent).toBe('Informativa sulla privacy');
    expect(modale.querySelectorAll('p')).toHaveLength(2);
    // la zona scorrevole è raggiungibile da tastiera
    expect(modale.querySelector('.hub-auth__dialog-body')!.getAttribute('tabindex')).toBe('0');
  });

  it('un paragrafo con titolo mostra il titolo in grassetto su una riga propria', async () => {
    const conTitoli = { ...CONFIG_APERTA, privacy: { text: 'Titolare\nIl titolare è Mavida.\n\nAccettando dichiari di aver letto.', version: 'v9' } };
    monta({ config: () => json(200, conTitoli) });
    fireEvent.click(await screen.findByRole('button', { name: 'Non hai un account? Registrati' }));
    await screen.findByLabelText('Nome utente');

    fireEvent.click(screen.getByRole('button', { name: 'informativa sulla privacy' }));
    const informativa = screen.getByRole('dialog', { name: 'Informativa sulla privacy' });
    const titolo = informativa.querySelector('strong.hub-auth__privacy-heading');
    expect(titolo!.textContent).toBe('Titolare');
    expect(titolo!.parentElement!.textContent).toBe('TitolareIl titolare è Mavida.');
    // il paragrafo senza titolo resta un semplice paragrafo
    expect(informativa.querySelectorAll('strong')).toHaveLength(1);
  });
});
