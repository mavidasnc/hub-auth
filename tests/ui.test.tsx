/**
 * Test della UI: OtpInput (incolla, cancellazione) e OtpStep (invio automatico
 * senza doppi invii, cooldown del reinvio, errori), AuthGate.
 */

import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHubAuth, memoryStorageAdapter } from '../src/core/index.js';
import { AuthGate, HubAuthProvider } from '../src/react/index.js';
import { LoginScreen, OtpInput } from '../src/ui/index.js';

const BASE = 'https://hub.test/v1/';
const ME = { user_id: 'u1', email: 'mario@esempio.com', role: 'user', tools: [] };

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

afterEach(() => {
  vi.useRealTimers();
});

/** OtpInput controllato, con il valore corrente esposto per i test */
function ControlledOtp() {
  const [value, setValue] = useState('');
  return (
    <>
      <OtpInput value={value} onChange={setValue} />
      <output data-testid="value">{value}</output>
    </>
  );
}

describe('OtpInput', () => {
  it('incolla un codice completo in qualsiasi casella', () => {
    render(<ControlledOtp />);
    const digits = screen.getAllByRole('textbox');
    fireEvent.paste(digits[3], { clipboardData: { getData: () => '12 34-56' } });
    expect(screen.getByTestId('value').textContent).toBe('123456');
  });

  it('incolla un codice parziale dalla prima casella vuota', () => {
    render(<ControlledOtp />);
    const digits = screen.getAllByRole('textbox');
    fireEvent.change(digits[0], { target: { value: '9' } });
    fireEvent.paste(digits[1], { clipboardData: { getData: () => '87' } });
    expect(screen.getByTestId('value').textContent).toBe('987');
  });

  it('ignora i caratteri non numerici', () => {
    render(<ControlledOtp />);
    fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: 'a' } });
    expect(screen.getByTestId('value').textContent).toBe('');
  });

  it('Backspace su casella vuota cancella la cifra precedente', () => {
    render(<ControlledOtp />);
    const digits = screen.getAllByRole('textbox');
    fireEvent.change(digits[0], { target: { value: '1' } });
    fireEvent.change(digits[1], { target: { value: '2' } });
    fireEvent.keyDown(digits[2], { key: 'Backspace' });
    expect(screen.getByTestId('value').textContent).toBe('1');
  });
});

/** Monta LoginScreen con un client e una fetch finta */
function setup(verify: () => Response) {
  const fetch = vi.fn(async (input: RequestInfo | URL) => {
    const path = String(input).replace(BASE, '');
    if (path === 'otp-request') return json(200, { success: true });
    if (path === 'otp-verify') return verify();
    if (path.startsWith('me')) return json(200, ME);
    throw new Error(`rotta non prevista: ${path}`);
  });
  const client = createHubAuth({ baseUrl: BASE, storageKey: 'k', storage: memoryStorageAdapter(), fetch });
  render(
    <HubAuthProvider client={client}>
      <AuthGate fallback={<LoginScreen title="App" />}>
        <p>Area riservata</p>
      </AuthGate>
    </HubAuthProvider>,
  );
  return { client, fetch };
}

/** Inserisce l'email e arriva allo step del codice */
async function goToOtpStep() {
  fireEvent.change(await screen.findByLabelText('Email'), { target: { value: 'mario@esempio.com' } });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Invia codice' }));
  });
}

describe('LoginScreen', () => {
  it('login completo con invio automatico alla sesta cifra, una sola volta', async () => {
    const { fetch } = setup(() => json(200, { user_id: 'u1', email: 'mario@esempio.com', session_token: 'tok' }));
    await goToOtpStep();

    const digits = screen.getAllByRole('textbox');
    await act(async () => {
      fireEvent.paste(digits[0], { clipboardData: { getData: () => '123456' } });
    });
    // Enter dopo l'invio automatico: nessun secondo otp-verify
    await act(async () => {
      fireEvent.submit(digits[0].closest('form')!);
    });

    expect(await screen.findByText('Area riservata')).toBeTruthy();
    const verifyCalls = fetch.mock.calls.filter(([u]) => String(u).endsWith('otp-verify'));
    expect(verifyCalls).toHaveLength(1);
  });

  it('codice errato: messaggio dedicato e caselle svuotate', async () => {
    setup(() => json(401, { error: 'Codice non valido o scaduto.' }));
    await goToOtpStep();
    await act(async () => {
      fireEvent.paste(screen.getAllByRole('textbox')[0], { clipboardData: { getData: () => '000000' } });
    });
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Codice non valido o scaduto.');
    expect(screen.getAllByRole('textbox').map((i) => (i as HTMLInputElement).value).join('')).toBe('');
  });

  it('tool non abilitato: messaggio della notice', async () => {
    setup(() => json(403, { error: 'ToolNotEnabled', message: "Il tool 'x' non è abilitato" }));
    await goToOtpStep();
    await act(async () => {
      fireEvent.paste(screen.getAllByRole('textbox')[0], { clipboardData: { getData: () => '123456' } });
    });
    expect((await screen.findByRole('alert')).textContent).toBe('Questo strumento non è abilitato per il tuo account.');
  });

  it('reinvio disabilitato durante il cooldown', async () => {
    setup(() => json(200, {}));
    await goToOtpStep();
    const resend = screen.getByRole('button', { name: /Reinvia tra \d+s/ });
    expect((resend as HTMLButtonElement).disabled).toBe(true);
  });

  it('cambia email riporta al primo step', async () => {
    setup(() => json(200, {}));
    await goToOtpStep();
    fireEvent.click(screen.getByRole('button', { name: 'Cambia email' }));
    expect(screen.getByLabelText('Email')).toBeTruthy();
  });
});

describe('AuthGate', () => {
  it('ruolo insufficiente: mostra denied', async () => {
    const storage = memoryStorageAdapter();
    storage.set('k', { v: 1, token: 'tok', user: ME });
    const fetch = vi.fn(async () => json(200, ME));
    const client = createHubAuth({ baseUrl: BASE, storageKey: 'k', storage, fetch });
    render(
      <HubAuthProvider client={client}>
        <AuthGate fallback={<p>login</p>} loading={<p>caricamento</p>} requireRole="admin" denied={<p>negato</p>}>
          <p>admin</p>
        </AuthGate>
      </HubAuthProvider>,
    );
    expect(screen.getByText('caricamento')).toBeTruthy();
    expect(await screen.findByText('negato')).toBeTruthy();
  });
});

describe('LinkStep (magic link)', () => {
  const TOKEN = 'B'.repeat(43);

  /** Apre l'app dal link dell'email: il token è nel fragment */
  function setupLink(verify: () => Response) {
    window.history.replaceState(null, '', `/#hub_otp=${TOKEN}`);
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input).replace(BASE, '');
      if (path === 'otp-verify-link') return verify();
      if (path.startsWith('me')) return json(200, ME);
      throw new Error(`rotta non prevista: ${path}`);
    });
    const client = createHubAuth({ baseUrl: BASE, storageKey: 'ui-link', storage: memoryStorageAdapter(), fetch });
    render(
      <HubAuthProvider client={client}>
        <AuthGate fallback={<LoginScreen title="App" />}><p>contenuto protetto</p></AuthGate>
      </HubAuthProvider>,
    );
    return { fetch, client };
  }

  afterEach(() => window.history.replaceState(null, '', '/'));

  it('mostra la conferma e non accede finché l\'utente non preme il pulsante', async () => {
    const { fetch } = setupLink(() => json(200, { user_id: 'u1', session_token: 'tok' }));

    expect(await screen.findByRole('button', { name: 'Accedi' })).toBeTruthy();
    expect(screen.queryByText('contenuto protetto')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('al clic apre la sessione e mostra il contenuto', async () => {
    setupLink(() => json(200, { user_id: 'u1', email: 'mario@esempio.com', session_token: 'tok' }));

    fireEvent.click(await screen.findByRole('button', { name: 'Accedi' }));

    expect(await screen.findByText('contenuto protetto')).toBeTruthy();
  });

  it('un link scaduto riporta al login con l\'avviso', async () => {
    setupLink(() => json(401, { error: 'Link non valido o scaduto.' }));

    fireEvent.click(await screen.findByRole('button', { name: 'Accedi' }));

    expect((await screen.findByRole('status')).textContent).toContain('link di accesso non è valido');
    expect(screen.getByLabelText('Email')).toBeTruthy();
  });

  it('"Usa il codice invece" torna al form email', async () => {
    setupLink(() => json(200, { user_id: 'u1', session_token: 'tok' }));

    fireEvent.click(await screen.findByRole('button', { name: 'Usa il codice invece' }));

    expect(screen.getByLabelText('Email')).toBeTruthy();
  });
});
