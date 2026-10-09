/**
 * Test della 1.7.0: informativa privacy in Markdown (PrivacyContent) e formato
 * letto da GET /auth/tool-config.
 */

import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHubAuth, memoryStorageAdapter } from '../src/core/index.js';
import { PrivacyContent } from '../src/ui/index.js';

const BASE = 'https://hub.test/v1/';

const MARKDOWN = [
  '## 1. Titolare del trattamento',
  '',
  'Il titolare è **Mavida s.n.c.** e [il sito](https://www.mavida.com).',
  '',
  '| Dato | Finalità |',
  '| --- | --- |',
  '| Email | Accesso |',
  '',
  '- primo punto',
  '- secondo punto',
].join('\n');

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PrivacyContent', () => {
  it('con format markdown converte titoli, grassetti, tabelle ed elenchi', async () => {
    const { container } = render(<PrivacyContent text={MARKDOWN} format="markdown" />);

    expect((await screen.findByRole('heading', { name: '1. Titolare del trattamento' })).tagName).toBe('H2');
    expect(container.querySelector('strong')?.textContent).toBe('Mavida s.n.c.');
    expect(container.querySelectorAll('table th')).toHaveLength(2);
    expect(container.querySelector('table td')?.textContent).toBe('Email');
    expect(container.querySelectorAll('ul li')).toHaveLength(2);
    // Il Markdown non resta in chiaro
    expect(container.textContent).not.toContain('##');
    expect(container.textContent).not.toContain('**');
  });

  it('i link si aprono in una nuova scheda senza opener', async () => {
    const { container } = render(<PrivacyContent text={MARKDOWN} format="markdown" />);

    await waitFor(() => expect(container.querySelector('a')).not.toBeNull());
    const link = container.querySelector('a')!;
    expect(link.getAttribute('href')).toBe('https://www.mavida.com');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('sanifica l\'HTML: script, gestori di eventi e javascript: vengono rimossi', async () => {
    const ostile = [
      'Testo sicuro.',
      '',
      '<script>window.__hacked = true</script>',
      '',
      '<img src="x" onerror="window.__hacked = true">',
      '',
      '[clic](javascript:alert(1))',
    ].join('\n');

    const { container } = render(<PrivacyContent text={ostile} format="markdown" />);

    await screen.findByText('Testo sicuro.');
    expect(container.querySelector('script')).toBeNull();
    expect(container.innerHTML).not.toContain('onerror');
    expect(container.innerHTML).not.toContain('javascript:');
    expect((window as unknown as { __hacked?: boolean }).__hacked).toBeUndefined();
  });

  it('1.8.0: ammette solo il sottoinsieme Markdown, senza style, form, input, img e iframe', async () => {
    const ostile = [
      'Testo di prova.',
      '',
      '<style>body { display: none }</style>',
      '',
      '<form action="https://x.example"><input name="password"></form>',
      '',
      '<iframe src="https://x.example"></iframe>',
      '',
      '![tracker](https://x.example/p.gif)',
      '',
      '- [x] voce',
    ].join('\n');

    const { container } = render(<PrivacyContent text={ostile} format="markdown" />);

    await screen.findByText('Testo di prova.');
    for (const vietato of ['style', 'form', 'input', 'iframe', 'img']) {
      expect(container.querySelector(vietato)).toBeNull();
    }
    expect(container.innerHTML).not.toContain('x.example');
    // Le voci di elenco restano
    expect(container.querySelectorAll('li')).toHaveLength(1);
  });

  it("1.8.0: l'hook sui link non tocca il DOMPurify condiviso dall'app", async () => {
    const { container } = render(<PrivacyContent text={MARKDOWN} format="markdown" />);
    await waitFor(() => expect(container.querySelector('a')).not.toBeNull());

    const { default: condiviso } = await import('dompurify');
    const html = condiviso.sanitize('<a href="https://www.mavida.com">sito</a>');

    expect(html).not.toContain('target');
    expect(html).not.toContain('noopener');
  });

  it('senza format resta il testo semplice: "Titolo\\ntesto" con titolo in grassetto', () => {
    const { container } = render(<PrivacyContent text={'Titolare\nMavida snc.\n\nSecondo paragrafo.'} />);

    const titolo = screen.getByText('Titolare');
    expect(titolo.tagName).toBe('STRONG');
    expect(titolo.parentElement?.textContent).toBe('TitolareMavida snc.');
    expect(screen.getByText('Secondo paragrafo.')).toBeTruthy();
    expect(container.querySelector('.hub-auth__privacy-md')).toBeNull();
  });

  it('con format text non interpreta il Markdown', () => {
    const { container } = render(<PrivacyContent text="**non grassetto**" format="text" />);

    expect(container.textContent).toBe('**non grassetto**');
    expect(container.querySelector('strong')).toBeNull();
  });
});

describe('formato dell\'informativa in toolConfig', () => {
  /** Client con tool-config finto; restituisce la configurazione caricata nello stato */
  async function caricaConfig(privacy: Record<string, unknown>) {
    const fetch = vi.fn(async () => new Response(
      JSON.stringify({ tool: null, signup_enabled: true, privacy }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ));
    const client = createHubAuth({
      baseUrl: BASE, storageKey: 'privacy-md-test', storage: memoryStorageAdapter(), fetch, magicLink: false,
    });
    await client.loadToolConfig();
    return client.getState().toolConfig;
  }

  it('legge format markdown da hub', async () => {
    const config = await caricaConfig({ text: 'x', version: 'v1', format: 'markdown' });

    expect(config?.privacy?.format).toBe('markdown');
  });

  it('un hub più vecchio senza format lascia il campo assente (testo semplice)', async () => {
    const config = await caricaConfig({ text: 'x', version: 'v1' });

    expect(config?.privacy).toEqual({ text: 'x', version: 'v1' });
  });
});
