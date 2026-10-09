/**
 * Test della 1.8.0: blocco "Le altre app Mavida" (EcosystemNav, prop `ecosystem`
 * di LoginScreen), menu EcosystemMenu, immagine del pannello (`asideImage`) e
 * landmark semantici di LoginScreen.
 */

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHubAuth, memoryStorageAdapter } from '../src/core/index.js';
import { HubAuthProvider } from '../src/react/index.js';
import { ECOSYSTEM_APPS, EcosystemMenu, EcosystemNav, LoginScreen, otherApps } from '../src/ui/index.js';

const BASE = 'https://hub.test/v1/';

const CONFIG = {
  tool: { key: 'wandly', label: 'Wandly', description: 'Articoli con AI', login_notice: null },
  signup_enabled: false,
  privacy: null,
};
const CONFIG_SENZA_PANNELLO = {
  tool: { key: 'wandly', label: 'Wandly', description: null, login_notice: null },
  signup_enabled: false,
  privacy: null,
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** Client con tool-config finto */
function creaClient(config: unknown) {
  const fetch = vi.fn(async (input: RequestInfo | URL) => {
    if (String(input).includes('auth/tool-config')) return json(200, config);
    throw new Error(`rotta non prevista: ${String(input)}`);
  });
  return createHubAuth({
    baseUrl: BASE, storageKey: 'eco-test', storage: memoryStorageAdapter(), fetch, tool: 'wandly', magicLink: false,
  });
}

function schermata(config: unknown, props: Parameters<typeof LoginScreen>[0] = {}) {
  return render(
    <HubAuthProvider client={creaClient(config)}>
      <LoginScreen title="Wandly" {...props} />
    </HubAuthProvider>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('catalogo ecosistema', () => {
  it('ha le sei app pubbliche con URL, frase e colore, senza admin e log', () => {
    expect(ECOSYSTEM_APPS.map((a) => a.name)).toEqual(
      ['Wandly', 'Slide-orama', 'Social Planner', 'WooSync', 'VoiceNote', 'Fleet'],
    );
    for (const app of ECOSYSTEM_APPS) {
      expect(app.url).toMatch(/^https:\/\/[a-z]+\.mavida\.com$/);
      expect(app.tagline.length).toBeGreaterThan(10);
      expect(app.color).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('otherApps esclude l\'app corrente per chiave', () => {
    expect(otherApps('fleet').map((a) => a.key)).not.toContain('fleet');
    expect(otherApps('fleet')).toHaveLength(5);
  });

  it('otherApps esclude l\'app corrente anche solo dall\'host della pagina', () => {
    // jsdom: window.location.host = 'localhost:3000' di default; lo imposto sul sito di Wandly
    vi.stubGlobal('location', { ...window.location, host: 'wandly.mavida.com' });

    expect(otherApps().map((a) => a.key)).not.toContain('wandly');
    expect(otherApps()).toHaveLength(5);
    vi.unstubAllGlobals();
  });
});

describe('EcosystemNav', () => {
  it('elenca le altre app come link normali', () => {
    render(<EcosystemNav current="wandly" />);

    const nav = screen.getByRole('navigation', { name: 'Le altre app Mavida' });
    const link = within(nav).getByRole('link', { name: 'Slide-orama' });
    expect(link.getAttribute('href')).toBe('https://slideorama.mavida.com');
    expect(within(nav).queryByRole('link', { name: 'Wandly' })).toBeNull();
    expect(within(nav).getAllByRole('link')).toHaveLength(5);
  });

  it('i testi si sovrascrivono con messages', () => {
    render(<EcosystemNav current="wandly" messages={{ ecosystemTitle: 'Other apps' }} />);

    expect(screen.getByRole('navigation', { name: 'Other apps' })).toBeTruthy();
  });
});

describe('LoginScreen: ecosystem e asideImage', () => {
  it('con ecosystem mostra il blocco in un <footer>, senza l\'app corrente', async () => {
    const { container } = schermata(CONFIG, { ecosystem: true });

    const nav = await screen.findByRole('navigation', { name: 'Le altre app Mavida' });
    expect(nav.closest('footer')?.className).toBe('hub-auth__footer');
    expect(container.querySelector('.hub-auth__ecosystem')).not.toBeNull();
    expect(within(nav).queryByRole('link', { name: 'Wandly' })).toBeNull();
  });

  it('di default non mostra nessun blocco ecosistema (admin e log restano com\'erano)', async () => {
    const { container } = schermata(CONFIG);

    await screen.findByText('Articoli con AI');
    expect(screen.queryByRole('navigation', { name: 'Le altre app Mavida' })).toBeNull();
    expect(container.querySelector('footer')).toBeNull();
  });

  it('il footer dell\'app e l\'ecosistema convivono', async () => {
    schermata(CONFIG, { ecosystem: true, footer: <span>v1.2.3</span> });

    const nav = await screen.findByRole('navigation', { name: 'Le altre app Mavida' });
    expect(within(nav.closest('footer')!).getByText('v1.2.3')).toBeTruthy();
  });

  it('asideImage compare nel pannello con alt e dimensioni', async () => {
    schermata(CONFIG, { asideImage: { src: '/login-hero.jpg', alt: 'Schermata di Wandly', width: 1200, height: 750 } });

    const img = await screen.findByAltText('Schermata di Wandly');
    expect(img.getAttribute('src')).toBe('/login-hero.jpg');
    expect(img.getAttribute('width')).toBe('1200');
    expect(img.getAttribute('height')).toBe('750');
    expect(img.closest('aside')).not.toBeNull();
  });

  it('asideImage da sola fa comparire il pannello anche senza descrizione', async () => {
    const { container } = schermata(CONFIG_SENZA_PANNELLO, { asideImage: { src: '/x.jpg', alt: 'Anteprima' } });

    await screen.findByAltText('Anteprima');
    expect(container.querySelector('.hub-auth--split')).not.toBeNull();
  });

  it('con un aside personalizzato l\'immagine di default non compare', async () => {
    schermata(CONFIG, { aside: <p>Pannello dell'app</p>, asideImage: { src: '/x.jpg', alt: 'Anteprima' } });

    await screen.findByText("Pannello dell'app");
    expect(screen.queryByAltText('Anteprima')).toBeNull();
  });

  it('la card sta in un <main> (landmark), nel layout a due metà e in quello centrato', async () => {
    const diviso = schermata(CONFIG);
    await screen.findByText('Articoli con AI');
    expect(diviso.container.querySelector('main.hub-auth__main')).not.toBeNull();
    diviso.unmount();

    const centrato = schermata(CONFIG_SENZA_PANNELLO);
    await waitFor(() => expect(centrato.container.querySelector('main.hub-auth')).not.toBeNull());
    expect(centrato.container.querySelectorAll('main')).toHaveLength(1);
  });
});

describe('EcosystemMenu', () => {
  it('si apre al clic e mostra le altre app con la loro frase', () => {
    render(<EcosystemMenu current="fleet" />);

    const pulsante = screen.getByRole('button', { name: /App Mavida/ });
    expect(pulsante.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('link', { name: /Wandly/ })).toBeNull();

    fireEvent.click(pulsante);

    expect(pulsante.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('link', { name: /Wandly/ }).getAttribute('href')).toBe('https://wandly.mavida.com');
    expect(screen.getByText(ECOSYSTEM_APPS[0].tagline)).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Fleet/ })).toBeNull();
    expect(screen.getAllByRole('link')).toHaveLength(5);
  });

  it('si chiude con Esc e con un clic fuori', () => {
    render(<div><EcosystemMenu current="fleet" /><p>fuori</p></div>);
    const pulsante = screen.getByRole('button', { name: /App Mavida/ });

    fireEvent.click(pulsante);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryAllByRole('link')).toHaveLength(0);

    fireEvent.click(pulsante);
    fireEvent.mouseDown(screen.getByText('fuori'));
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });

  it('un clic dentro la tendina non la chiude finché non si sceglie un link', () => {
    render(<EcosystemMenu current="fleet" />);
    fireEvent.click(screen.getByRole('button', { name: /App Mavida/ }));

    fireEvent.mouseDown(screen.getByText('Wandly'));
    expect(screen.getAllByRole('link')).toHaveLength(5);

    fireEvent.click(screen.getByRole('link', { name: /Wandly/ }));
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });

  it('variante inline: elenco nel flusso, senza frasi e che resta aperto al clic fuori', () => {
    const { container } = render(<div><EcosystemMenu current="fleet" variant="inline" /><p>fuori</p></div>);
    expect(container.querySelector('.hub-auth-eco--inline')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /App Mavida/ }));
    fireEvent.mouseDown(screen.getByText('fuori'));
    fireEvent.keyDown(document, { key: 'Escape' });

    // Nessuna chiusura automatica: l'elenco sta nella sidebar, non è una tendina
    expect(screen.getAllByRole('link')).toHaveLength(5);
    expect(screen.getByRole('link', { name: /Wandly/ }).getAttribute('title')).toBe(ECOSYSTEM_APPS[0].tagline);
    // Il pulsante lo richiude
    fireEvent.click(screen.getByRole('button', { name: /App Mavida/ }));
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });

  it('tema scuro, allineamento e etichetta si personalizzano', () => {
    const { container } = render(<EcosystemMenu current="fleet" theme="dark" align="end" label="Altre app" />);

    expect(container.firstElementChild?.className).toContain('hub-auth-eco--dark');
    expect(container.firstElementChild?.className).toContain('hub-auth-eco--end');
    expect(screen.getByRole('button', { name: /Altre app/ })).toBeTruthy();
  });
});
