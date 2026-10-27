/**
 * Test della 1.17.0: pagina di pagamento per aziende e privati (SubscribePicker). Tipo di
 * cliente, prezzi IVA esclusa o inclusa, controlli sui dati fiscali, consensi, pulsante sempre
 * attivo con errori al clic, errori di campo del server, suggerimento dell'indirizzo e anteprima.
 */

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HubAuthError } from '../src/core/index.js';
import type { BillingCatalog, BillingOrder, BillingQuote } from '../src/core/index.js';
import { SubscribePicker } from '../src/ui/index.js';

const CATALOG: BillingCatalog = {
  enabled: true,
  currency: 'EUR',
  vat_rate_pct: 22,
  price_basis: 'launch',
  launch_until: '2026-12-31',
  months: 12,
  plans: [
    { code: 'starter', label: 'Starter', description: 'Per iniziare con calma.', monthly_cents: 1200,
      list_monthly_cents: 1500, launch_monthly_cents: 1200, app_discount_pct: 0, sites_max: 10 },
    { code: 'pro', label: 'Pro', description: 'Per chi lavora ogni giorno.', monthly_cents: 2400,
      list_monthly_cents: 3000, launch_monthly_cents: 2400, app_discount_pct: 20, sites_max: 25 },
    { code: 'agency', label: 'Agency', description: null, monthly_cents: 4020,
      list_monthly_cents: 5025, launch_monthly_cents: 4020, app_discount_pct: 33, sites_max: 50 },
  ],
  apps: [],
  app_tiers: [],
  no_fleet_markup_pct: 120,
  apps_included_months: 3,
  legal: {
    terms_url: 'https://www.mavida.com/termini', privacy_url: 'https://www.mavida.com/privacy',
    withdrawal_url: 'https://hub.test/api/v1/billing/withdrawal', legal_version: '2026-10',
    seller_info: 'Mavida snc\nVia Esempio 1, Milano', withdrawal_days: 14,
  },
  address_autocomplete: true,
};

const QUOTE_PRO: BillingQuote = {
  price_basis: 'launch', fleet_plan: 'pro', apps: [], fleet_monthly_cents: 2400, app_monthly_cents: 0,
  monthly_cents: 2400, net_cents: 28800, vat_cents: 6336, total_cents: 35136, vat_rate_pct: 22, currency: 'EUR',
};

function monta(props: Partial<React.ComponentProps<typeof SubscribePicker>> = {}) {
  const onQuote = vi.fn(async () => QUOTE_PRO);
  const onSubmit = vi.fn(async (_order: BillingOrder) => undefined);
  const view = render(<SubscribePicker catalog={CATALOG} onQuote={onQuote} onSubmit={onSubmit} {...props} />);
  return { onQuote, onSubmit, ...view };
}

const ordina = () => screen.getByRole('button', { name: 'Ordina con obbligo di pagamento' });
const campo = (name: RegExp) => screen.getByLabelText(name) as HTMLInputElement;
const scrivi = (name: RegExp, value: string) => fireEvent.change(campo(name), { target: { value } });

/** Compila indirizzo, CAP, città e provincia (uguali per azienda e privato) */
function compilaIndirizzo() {
  scrivi(/^Indirizzo/, 'Via Roma 1');
  scrivi(/^CAP/, '20121');
  scrivi(/^Città/, 'Milano');
  fireEvent.change(screen.getByLabelText(/^Provincia/), { target: { value: 'MI' } });
}

function compilaAzienda() {
  scrivi(/^Ragione sociale/, ' Rossi   Srl ');
  scrivi(/^Partita IVA/, 'it 123.456.789-03');
  compilaIndirizzo();
  fireEvent.click(screen.getByRole('checkbox', { name: /Ho letto e accetto/ }));
  fireEvent.click(screen.getByRole('checkbox', { name: /scopi connessi alla mia attività/ }));
}

function passaAPrivato() {
  fireEvent.click(screen.getByRole('radio', { name: /Privato/ }));
}

function compilaPrivato() {
  passaAPrivato();
  scrivi(/^Nome/, 'Mario');
  scrivi(/^Cognome/, 'Rossi');
  scrivi(/^Codice fiscale/, 'rssmra85t10a562s');
  compilaIndirizzo();
  fireEvent.click(screen.getByRole('checkbox', { name: /Ho letto e accetto/ }));
  fireEvent.click(screen.getByRole('checkbox', { name: /servizio inizi subito/ }));
}

describe('SubscribePicker: piani e prezzi', () => {
  it('tre piani in colonne, il Pro è consigliato e preselezionato, il prezzo lo chiede a hub', async () => {
    const { onQuote } = monta();

    expect(screen.getAllByRole('radio', { name: /Starter|Pro|Agency/ })).toHaveLength(3);
    expect(screen.getByText('Consigliato')).toBeTruthy();
    expect((screen.getByRole('radio', { name: /Pro/ }) as HTMLInputElement).checked).toBe(true);
    // Nella card del piano e nel riepilogo
    expect(screen.getAllByText('fino a 25 siti')).toHaveLength(2);
    await waitFor(() => expect(onQuote).toHaveBeenCalledWith({ fleet_plan: 'pro', apps: [] }));
    expect(await screen.findByText('IVA 22%')).toBeTruthy();
  });

  it('azienda: prezzi IVA esclusa e riepilogo con imponibile, IVA e totale', async () => {
    monta();
    await screen.findByText('IVA 22%');

    expect(screen.getByText(/Prezzi al mese, IVA esclusa/)).toBeTruthy();
    expect(screen.getAllByText(/IVA esclusa/).length).toBeGreaterThan(1);
    expect(screen.getByText('Imponibile annuale')).toBeTruthy();
    expect(screen.getAllByText(/288,00/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/351,36/).length).toBeGreaterThan(0);
  });

  it('privato: prezzi IVA inclusa (art. 49), nessun imponibile, «di cui IVA»', async () => {
    monta();
    await screen.findByText('IVA 22%');

    passaAPrivato();

    expect(screen.getByText(/Prezzi al mese, IVA inclusa/)).toBeTruthy();
    expect(screen.getAllByText(/29,28/).length).toBeGreaterThan(0);          // 24,00 + 22%
    expect(screen.getAllByText(/IVA inclusa/).length).toBeGreaterThan(1);
    expect(screen.queryByText('Imponibile annuale')).toBeNull();
    expect(screen.getByText('di cui IVA 22%')).toBeTruthy();
    expect(screen.getAllByText(/351,36/).length).toBeGreaterThan(0);
  });

  it('cambiando piano chiede un nuovo prezzo', async () => {
    const { onQuote } = monta();
    await waitFor(() => expect(onQuote).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('radio', { name: /Agency/ }));

    await waitFor(() => expect(onQuote).toHaveBeenLastCalledWith({ fleet_plan: 'agency', apps: [] }));
  });

  it('senza preventivo il riepilogo usa gli importi di vetrina e il pulsante resta attivo', async () => {
    const onQuote = vi.fn(async () => { throw new HubAuthError('x', 400, 'InvalidSelection'); });
    monta({ onQuote });
    await waitFor(() => expect(onQuote).toHaveBeenCalled());

    expect(screen.getAllByText(/351,36/).length).toBeGreaterThan(0);
    expect((ordina() as HTMLButtonElement).disabled).toBe(false);
  });

  it('dice per quanti mesi sono incluse le app e fino a quando vale il lancio', () => {
    monta();
    expect(screen.getByText('Con un piano Fleet le app Mavida sono incluse per 3 mesi.')).toBeTruthy();
    expect(screen.getByText(/Prezzo di lancio valido fino al 31\/12\/2026/)).toBeTruthy();
  });

  it('senza piani il messaggio chiede un piano', () => {
    monta({ catalog: { ...CATALOG, plans: [] } });
    expect(screen.getByText('Scegli un piano.')).toBeTruthy();
  });

  it('landing=false: niente presentazione né domande frequenti, restano piani e ordine', () => {
    monta({ landing: false });
    expect(screen.queryByText('Domande frequenti')).toBeNull();
    expect(screen.queryByText(/da un unico cruscotto/)).toBeNull();
    expect(screen.getByText('Scegli il tuo piano')).toBeTruthy();
    expect(ordina()).toBeTruthy();
  });

  it('landing: domande frequenti con il recesso e dati del venditore con i link legali', () => {
    const { container } = monta();
    expect(screen.getByText('Posso recedere dal contratto?')).toBeTruthy();
    const footer = container.querySelector('footer') as HTMLElement;
    expect(footer.textContent).toContain('Mavida snc');
    expect(within(footer).getByRole('link', { name: 'Termini di vendita' }).getAttribute('href'))
      .toBe('https://www.mavida.com/termini');
    expect(within(footer).getByRole('link', { name: 'Recedi dal contratto' }).getAttribute('href'))
      .toContain('/billing/withdrawal');
  });
});

describe('SubscribePicker: dati e controlli', () => {
  it('il pulsante è sempre attivo: a campi vuoti mostra gli errori al clic e non invia', async () => {
    const { onSubmit } = monta();
    await screen.findByText('IVA 22%');
    expect((ordina() as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(ordina());

    const alert = await screen.findByText(/Controlla \d+ punti prima di ordinare/);
    const lista = alert.closest('[role="alert"]') as HTMLElement;
    expect(lista.textContent).toContain('Ragione sociale');
    expect(lista.textContent).toContain('Partita IVA');
    expect(lista.textContent).toContain('Per ordinare devi accettare i termini di vendita');
    expect(lista.textContent).toContain('Conferma che l’acquisto è per scopi professionali');
    expect(onSubmit).not.toHaveBeenCalled();
    // Il primo campo errato ha il fuoco
    await waitFor(() => expect(document.activeElement).toBe(campo(/^Ragione sociale/)));
  });

  it('azienda: partita IVA con checksum e messaggio sotto il campo', async () => {
    monta();
    const vat = campo(/^Partita IVA/);

    fireEvent.change(vat, { target: { value: '01234567890' } });
    fireEvent.blur(vat);
    expect(await screen.findByText(/Partita IVA non valida/)).toBeTruthy();
    expect(vat.getAttribute('aria-invalid')).toBe('true');

    fireEvent.change(vat, { target: { value: '12345678903' } });
    expect(await screen.findByText('Partita IVA valida')).toBeTruthy();
  });

  it('privato: il codice fiscale deve essere personale (11 cifre = società, rifiutato)', async () => {
    monta();
    passaAPrivato();
    const cf = campo(/^Codice fiscale/);

    fireEvent.change(cf, { target: { value: '12345678903' } });
    fireEvent.blur(cf);
    expect(await screen.findByText('Per un privato serve il codice fiscale personale di 16 caratteri')).toBeTruthy();

    fireEvent.change(cf, { target: { value: 'RSSMRA85T10A562S' } });
    expect(await screen.findByText('Codice fiscale valido')).toBeTruthy();
  });

  it('i campi cambiano col tipo: azienda ha ragione sociale e SDI, privato nome e cognome', () => {
    monta();
    expect(screen.queryByLabelText(/^Ragione sociale/)).toBeTruthy();
    expect(screen.queryByLabelText(/^Codice SDI/)).toBeTruthy();
    expect(screen.queryByLabelText(/^Nome/)).toBeNull();

    passaAPrivato();

    expect(screen.queryByLabelText(/^Ragione sociale/)).toBeNull();
    expect(screen.queryByLabelText(/^Codice SDI/)).toBeNull();
    expect(screen.queryByLabelText(/^Nome/)).toBeTruthy();
    expect(screen.queryByLabelText(/^Cognome/)).toBeTruthy();
  });

  it('senza SDI né PEC avvisa del cassetto fiscale (non bloccante)', () => {
    monta();
    expect(screen.getByText(/codice 0000000/)).toBeTruthy();

    fireEvent.change(campo(/^PEC/), { target: { value: 'azienda@pec.it' } });

    expect(screen.queryByText(/codice 0000000/)).toBeNull();
  });

  it('CAP: solo cifre, al massimo cinque; provincia dall\'elenco delle sigle', () => {
    monta();
    scrivi(/^CAP/, '20a1b2c3d4e5');
    expect(campo(/^CAP/).value).toBe('20123');
    expect(screen.getByLabelText(/^Provincia/).querySelectorAll('option')).toHaveLength(108);   // 107 + «Seleziona»
  });

  it('il consenso dell\'azienda è la dichiarazione, quello del privato la richiesta di avvio immediato', () => {
    monta();
    expect(screen.queryByRole('checkbox', { name: /scopi connessi alla mia attività/ })).toBeTruthy();
    expect(screen.queryByRole('checkbox', { name: /servizio inizi subito/ })).toBeNull();
    expect(screen.getByText(/non si applica il diritto di recesso/)).toBeTruthy();

    passaAPrivato();

    expect(screen.queryByRole('checkbox', { name: /scopi connessi alla mia attività/ })).toBeNull();
    expect(screen.getByRole('checkbox', { name: /servizio inizi subito.*14 giorni/ })).toBeTruthy();
    // Nella nota e nel piè di pagina
    const link = screen.getAllByRole('link', { name: 'Recedi dal contratto' });
    expect(link.length).toBeGreaterThan(0);
    expect(link[0].getAttribute('href')).toContain('/withdrawal');
  });
});

describe('SubscribePicker: ordine', () => {
  it('azienda: invia piano, dati normalizzati e consensi', async () => {
    const { onSubmit } = monta();
    await screen.findByText('IVA 22%');
    compilaAzienda();

    fireEvent.click(ordina());

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      fleet_plan: 'pro', apps: [], billing_type: 'company', billing_name: 'Rossi Srl', vat_number: '12345678903',
      billing_address: 'Via Roma 1', billing_zip: '20121', billing_city: 'Milano', billing_province: 'MI',
      billing_country: 'IT', terms_accepted: true, business_declaration: true,
    });
  });

  it('azienda con SDI, PEC e codice fiscale facoltativi', async () => {
    const { onSubmit } = monta();
    await screen.findByText('IVA 22%');
    compilaAzienda();
    scrivi(/^Codice SDI/, 'abc1234');
    scrivi(/^PEC/, 'Azienda@Pec.it');
    scrivi(/^Codice fiscale/, '12345678903');

    fireEvent.click(ordina());

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      sdi_code: 'ABC1234', pec_email: 'azienda@pec.it', tax_code: '12345678903',
    });
  });

  it('privato: nome e cognome insieme, codice fiscale, avvio immediato; niente partita IVA né SDI', async () => {
    const { onSubmit } = monta();
    await screen.findByText('IVA 22%');
    compilaPrivato();

    fireEvent.click(ordina());

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const order = onSubmit.mock.calls[0][0];
    expect(order).toMatchObject({
      billing_type: 'private', billing_name: 'Mario Rossi', tax_code: 'RSSMRA85T10A562S',
      immediate_start_requested: true, terms_accepted: true,
    });
    expect(order).not.toHaveProperty('vat_number');
    expect(order).not.toHaveProperty('sdi_code');
    expect(order).not.toHaveProperty('business_declaration');
  });

  it('senza il consenso dei termini non invia, anche con tutto il resto giusto', async () => {
    const { onSubmit } = monta();
    await screen.findByText('IVA 22%');
    compilaAzienda();
    fireEvent.click(screen.getByRole('checkbox', { name: /Ho letto e accetto/ }));   // lo toglie

    fireEvent.click(ordina());

    expect(await screen.findByText(/Controlla 1 punto prima di ordinare/)).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('errori di campo del server: sotto il campo giusto, senza messaggio generico', async () => {
    const onSubmit = vi.fn(async () => {
      throw new HubAuthError('x', 400, 'ValidationError', null,
        [{ field: 'vat_number', message: 'Partita IVA non valida' }]);
    });
    monta({ onSubmit });
    await screen.findByText('IVA 22%');
    compilaAzienda();

    fireEvent.click(ordina());

    expect(await screen.findAllByText('Partita IVA non valida')).not.toHaveLength(0);
    expect(campo(/^Partita IVA/).getAttribute('aria-invalid')).toBe('true');
    // Correggere il campo toglie l'errore del server
    scrivi(/^Partita IVA/, '12345678903');
    await waitFor(() => expect(campo(/^Partita IVA/).getAttribute('aria-invalid')).toBeNull());
  });

  it('altri errori di hub in italiano', async () => {
    const onSubmit = vi.fn(async () => { throw new HubAuthError('x', 409, 'BillingDisabled'); });
    monta({ onSubmit });
    await screen.findByText('IVA 22%');
    compilaAzienda();

    fireEvent.click(ordina());

    expect(await screen.findByText('I pagamenti non sono attivi.')).toBeTruthy();
  });

  it('anteprima: controlla i dati ma non invia, e lo dice', async () => {
    const { onSubmit } = monta({ preview: true });
    await screen.findByText('IVA 22%');

    fireEvent.click(ordina());                       // a campi vuoti: errori, nessun avviso
    expect(await screen.findByText(/Controlla \d+ punti/)).toBeTruthy();
    expect(screen.queryByText('Anteprima: il pagamento è disattivato.')).toBeNull();

    compilaAzienda();
    fireEvent.click(ordina());

    expect(await screen.findByText('Anteprima: il pagamento è disattivato.')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('senza onSubmit si comporta come l\'anteprima', async () => {
    monta({ onSubmit: undefined });
    await screen.findByText('IVA 22%');
    compilaAzienda();

    fireEvent.click(ordina());

    expect(await screen.findByText('Anteprima: il pagamento è disattivato.')).toBeTruthy();
  });

  it('funziona senza Provider (serve all\'anteprima della dashboard admin)', () => {
    expect(() => monta()).not.toThrow();
  });
});

describe('SubscribePicker: indirizzo', () => {
  const DETTAGLI = { address: 'Via Roma 1', zip: '20024', city: 'Garbagnate Milanese', province: 'MI', country: 'IT' };

  it('suggerimenti dopo una pausa, da tre caratteri, con la stessa sessione per ricerca e dettagli', async () => {
    const onSuggestAddress = vi.fn(async () => [
      { place_id: 'p1', text: 'Via Roma, 1, Garbagnate Milanese, Milano, Italia' },
      { place_id: 'p2', text: 'Via Roma, 1, Milano, Italia' },
    ]);
    const onAddressDetails = vi.fn(async () => DETTAGLI);
    monta({ onSuggestAddress, onAddressDetails });
    const input = campo(/^Indirizzo/);

    fireEvent.change(input, { target: { value: 'vi' } });                    // troppo corto
    await new Promise((r) => setTimeout(r, 300));
    expect(onSuggestAddress).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: 'via roma 1' } });
    const opzione = await screen.findByRole('option', { name: /Garbagnate Milanese/ });
    expect(onSuggestAddress).toHaveBeenCalledTimes(1);
    const sessione = (onSuggestAddress.mock.calls[0] as unknown as [string, string])[1];
    expect(sessione).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    expect(screen.getByText('powered by Google')).toBeTruthy();

    fireEvent.mouseDown(opzione);

    await waitFor(() => expect(campo(/^CAP/).value).toBe('20024'));
    expect(campo(/^Città/).value).toBe('Garbagnate Milanese');
    expect((screen.getByLabelText(/^Provincia/) as HTMLSelectElement).value).toBe('MI');
    expect(input.value).toBe('Via Roma 1');
    expect(onAddressDetails).toHaveBeenCalledWith('p1', sessione);
    expect(screen.getByText('Indirizzo compilato: controlla CAP e città')).toBeTruthy();
  });

  it('da tastiera: frecce e Invio scelgono, Esc chiude', async () => {
    const onSuggestAddress = vi.fn(async () => [{ place_id: 'p1', text: 'Via Roma, 1, Milano' }]);
    const onAddressDetails = vi.fn(async () => DETTAGLI);
    monta({ onSuggestAddress, onAddressDetails });
    const input = campo(/^Indirizzo/);

    fireEvent.change(input, { target: { value: 'via roma' } });
    await screen.findByRole('listbox');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(onAddressDetails).toHaveBeenCalledTimes(1));

    fireEvent.change(input, { target: { value: 'via roma 2' } });
    await screen.findByRole('listbox');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input.getAttribute('aria-expanded')).toBe('false');
  });

  it('servizio che non risponde: nessun elenco, l\'indirizzo si scrive a mano', async () => {
    const onSuggestAddress = vi.fn(async () => { throw new HubAuthError('x', 500); });
    monta({ onSuggestAddress, onAddressDetails: vi.fn(async () => null) });

    fireEvent.change(campo(/^Indirizzo/), { target: { value: 'via roma 1' } });
    await waitFor(() => expect(onSuggestAddress).toHaveBeenCalled());

    // Nessun elenco dei suggerimenti (le «option» della provincia sono un'altra cosa)
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(campo(/^Indirizzo/).value).toBe('via roma 1');
  });

  it('senza funzioni di suggerimento o con address_autocomplete=false è un campo semplice', () => {
    monta({ onSuggestAddress: vi.fn(), onAddressDetails: vi.fn(),
      catalog: { ...CATALOG, address_autocomplete: false } });
    expect(campo(/^Indirizzo/).getAttribute('role')).toBeNull();
    expect(screen.getByText('Per ora la fatturazione è solo per l’Italia.')).toBeTruthy();
  });
});
