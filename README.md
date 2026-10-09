# @mavida/hub-auth

Login OTP condiviso per i frontend dell'ecosistema hub. Un'unica implementazione del flusso email → codice OTP → sessione, usata dai 9 progetti che parlano con hub (`POST otp-request`, `POST otp-verify`, `GET /me`, `POST logout`).

## Perché

Prima di questa libreria ogni progetto reimplementava lo stesso flusso a modo suo: client HTTP, storage della sessione, guardia sul 401, componenti dello step email/OTP. I bug (token statico invece di quello per utente, logout che non revoca la sessione, logout basato su `expires_at` invece che sulla risposta del server) erano diversi in ogni copia. Con la libreria una correzione fatta una volta arriva a tutti con un aggiornamento del pacchetto.

## Installazione

```bash
npm install github:mavidasnc/hub-auth#semver:^1.0.0
```

`npm update @mavida/hub-auth` prende l'ultimo tag compatibile. La cartella `dist/` è committata nei tag di release: non serve alcuna fase di build al momento dell'installazione da git.

**CI/deploy:** `npm ci` in un workflow deve poter clonare questo repository. hub-auth è pubblico, ma npm normalizza *sempre* il `resolved` di una dipendenza git GitHub-hosted nel lockfile come `git+ssh://git@github.com/...` — anche dichiarandola con `git+https://` in `package.json` — e un runner CI senza chiave SSH configurata fallisce con `Permission denied (publickey)`. Prima di `npm ci`, ogni workflow di deploy deve avere questo step (una tantum, forza git a usare https, che per un repo pubblico non richiede credenziali):

```yaml
- name: Forza HTTPS per le dipendenze git di GitHub
  run: git config --global url."https://github.com/".insteadOf "ssh://git@github.com/"
```

## Struttura

- **`@mavida/hub-auth`** — core headless, nessuna dipendenza da React: `createHubAuth()`.
- **`@mavida/hub-auth/react`** — `<HubAuthProvider>`, `useHubAuth()`, `<AuthGate>`.
- **`@mavida/hub-auth/ui`** + **`@mavida/hub-auth/ui.css`** — `<LoginScreen>`, `<EmailStep>`, `<OtpStep>`, `<LinkStep>`, `<OtpInput>`.

## Uso rapido

```ts
// src/auth.ts
import { createHubAuth } from '@mavida/hub-auth';

export const hubAuth = createHubAuth({
  baseUrl: import.meta.env.VITE_API_BASE_URL,
  storageKey: 'wandly:hub_session',
  tool: 'wandly',
  // Chiavi della vecchia sessione del progetto: lette una sola volta e poi rimosse,
  // così chi era già loggato prima della migrazione non viene sloggato.
  legacyKeys: ['wandly:user_session'],
});
```

```tsx
// main.tsx
import { HubAuthProvider } from '@mavida/hub-auth/react';
import '@mavida/hub-auth/ui.css';
import { hubAuth } from './auth';

<HubAuthProvider client={hubAuth}>
  <App />
</HubAuthProvider>
```

```tsx
// App.tsx
import { AuthGate } from '@mavida/hub-auth/react';
import { LoginScreen } from '@mavida/hub-auth/ui';

<AuthGate fallback={<LoginScreen title="Wandly" />} loading={<Spinner />}>
  <AppLayout />
</AuthGate>
```

Per gli endpoint del progetto (fuori dal login), due modi di integrare l'header Bearer e la gestione del 401:

```ts
// fetch nativa
const res = await hubAuth.authFetch('blogs/u1');

// axios
import axios from 'axios';
const api = axios.create({ baseURL: hubAuth.url('') });
hubAuth.installAxiosInterceptors(api);
```

## Sessioni da un meccanismo diverso da OTP (es. magic link)

Un progetto può avere, oltre al login OTP, un modo alternativo di ottenere una sessione già emessa da hub (es. lo scambio di un magic link via `/access-links/exchange`). `adoptSession` la adotta con lo stesso trattamento di un login OTP riuscito:

```ts
const { session_token, user_id } = await exchangeAccessLink(linkToken) // endpoint specifico del progetto
await hubAuth.adoptSession({ token: session_token, user: { user_id } })
// hubAuth.getState().user è subito dopo completato da GET /me (email, role, plan, tools)
```

## Magic link nell'email OTP (1.2.0, hub ≥ 0.192.0)

L'email col codice contiene anche il pulsante "Accedi con un clic", per non dover copiare il codice. È **attivo di default**: `requestOtp` chiede il link a hub (`link: true`), e il client gestisce il ritorno senza codice da scrivere.

- Il token sta nel *fragment* dell'URL (`https://app.mavida.com/#hub_otp=...`): il browser non lo invia a nessun server, quindi non finisce nei log né nel `Referer`.
- All'avvio il client lo legge e lo **rimuove subito** dall'URL; lo stato diventa `step: 'link'` e `<LoginScreen>` mostra una conferma ("Accedi"). Il link **non accede da solo**: serve il clic dell'utente, così gli scanner antiphishing dei client email (che aprono i link ed eseguono il JavaScript) non consumano il token monouso.
- `verifyLink()` conferma l'accesso. Un link sconosciuto, scaduto o già usato non lancia: porta al login con la notice `link_invalid`. Errori di rete, 429 o 5xx vengono lanciati e il link resta riutilizzabile. `cancelLink()` ("Usa il codice invece") lo scarta.
- Usare il link consuma anche il codice della stessa email, e viceversa.
- L'email contiene il link solo se l'origine dell'app è registrata in `generations_tools.url` su hub; altrimenti resta il solo codice.
- Con una UI di login **propria** (senza `<LoginScreen>`) va gestito `step === 'link'` con `verifyLink`/`cancelLink` di `useHubAuth()`, oppure disattivato con `magicLink: false`.

## SSO tra le app (1.2.0, hub ≥ 0.192.0)

Con `sso: true` un utente che ha fatto login su una app entra nelle altre senza rifare l'OTP. Hub imposta un cookie `__Host-mvd_sso` (host-only, `HttpOnly`, `Secure`, `SameSite=Lax`) che ogni app scambia con una propria sessione (`POST /sso/session`, con il `tool` dell'app: un tool non abilitato resta negato).

```ts
export const hubAuth = createHubAuth({
  baseUrl: 'https://hub.mavida.com/api/v1/',   // stesso host per TUTTE le app
  storageKey: 'log-dashboard:hub_session',
  sso: true,
});
```

Prerequisiti, tutti da rispettare prima di attivare `sso`:

1. **Un solo host per hub.** Il cookie è host-only, quindi vale per un host solo: tutte le app devono usare lo stesso `baseUrl` (`https://hub.mavida.com/api/v1/`).
2. **L'origine dell'app va in `SSO_ALLOWED_ORIGINS`** sul server hub (schema+host esatti, es. `https://log.mavida.com`) e va riavviato il servizio. Se manca, il login ripiega da solo sul flusso senza cookie (nessun SSO, ma nessun blocco).
3. hub ≥ 0.192.0 con la migration 134 applicata.

Comportamento:

- All'avvio senza sessione locale lo stato resta `checking` (l'`AuthGate` mostra il loading) finché lo scambio non risponde; se non c'è sessione SSO si passa al login, senza avvisi. Se l'utente è in SSO ma non può usare questo tool, il login mostra la notice `tool_not_enabled`.
- **`logout()` con `sso` è globale di default**: revoca anche la sessione SSO e le sessioni di tutte le altre app, altrimenti all'apertura successiva l'app rientrerebbe da sola. `logout(undefined, { global: false })` fa il solo logout locale. I logout con una notice (`tool_not_enabled`, `trial_expired`) restano sempre locali.
- Le altre app scoprono la revoca alla prima chiamata autenticata (401 → logout già gestito), non istantaneamente.
- Mentre si attende il codice OTP, se il magic link viene aperto in un'altra scheda dello stesso browser, al ritorno sulla scheda originale il client entra da solo.
- La sessione SSO dura al massimo 7 giorni (`SSO_SESSION_TTL_HOURS` su hub, senza rinnovo) ed è legata al browser (se cambia lo User-Agent viene revocata).

## Registrazione (1.3.0, hub ≥ 0.216.0)

Sotto il form di login compare "Non hai un account? Registrati" quando hub offre la registrazione per il tool. Il link apre un form con nome utente, email e accettazione dell'informativa privacy; non serve scrivere altro codice nelle app: basta aggiornare la libreria (`npm update`).

La registrazione si governa **solo da admin.mavida.com**, mai dalle app:

- tab **Tools**: la registrazione si abilita tool per tool (`signup_enabled`); un tool senza il flag non mostra il link;
- tab **Registrazioni**: stato iniziale dell'utente (`pending` da approvare oppure `active`), piano assegnato, giorni di trial dall'attivazione, notifica e destinatario.

Esiti (`client.register()` / `RegisterStep`):

- **`pending`**: lo step diventa `registered` ("registrazione ricevuta"); l'admin riceve una email con il link di attivazione (oppure imposta lo stato su `active` dalla dashboard) e l'utente una email quando l'account è attivo. Prima dell'attivazione l'utente non riceve codici di accesso.
- **`active`**: hub ha già inviato il codice OTP e lo step diventa `otp`, come in un login normale.

Il testo dell'informativa privacy sta su hub (`content/privacy_registrazione.txt`) e arriva da `GET /auth/tool-config`: modificarlo non richiede di toccare né di rilasciare le app. La versione del testo (un hash) viaggia con la registrazione; se cambia mentre l'utente compila, il form si riallinea e gli chiede di accettare di nuovo.

Dal codice:

```tsx
<LoginScreen signup={false} />            {/* nasconde il link anche se hub la offre */}
const { client } = useHubAuth();
await client.loadToolConfig();            // GET /auth/tool-config (lo fa già LoginScreen)
client.startRegister();                   // step 'register'
await client.register({ username, email, privacyAccepted: true });
```

Con un hub più vecchio (senza `/auth/tool-config`) o non raggiungibile la configurazione resta `null`: nessun link di registrazione e nessun pannello, il login funziona come prima.

## Layout a due metà (1.3.0)

Quando c'è qualcosa da mostrare, la schermata si divide: **pannello a sinistra** (descrizione, avvisi o altro), **login a destra**. Sotto i 900px il login passa sopra e il pannello sotto. Il contenuto del pannello arriva in due modi:

1. **Da hub, senza toccare l'app**: descrizione e avviso del tool, modificabili dalla tab Tools di admin.mavida.com (`description`, `login_notice`). Il pannello compare solo se almeno uno dei due è valorizzato.
2. **Dall'app**, con la prop `aside`, che sostituisce il pannello di default:

```tsx
<LoginScreen
  title="Wandly"
  aside={<><h2>Novità</h2><p>Ora puoi generare anche le immagini.</p></>}
/>
```

Sopra i 900px le due metà stanno in un contenitore centrato largo al massimo `--hub-auth-split-max-width` (default 1200px). Il `logo` passato a `LoginScreen` compare in alto nel pannello di default (e non nella card); con un `aside` personalizzato resta nella card.

`layout` controlla la scelta: `'auto'` (default, due metà solo se c'è un pannello), `'split'` (sempre) o `'centered'` (sempre la sola card centrata, come nella 1.2). Senza pannello il DOM è identico a quello della 1.2: nessuna app esistente cambia aspetto finché non ha una descrizione, un avviso o una `aside`.

Tema del pannello: di default segue il tema dell'app (tinta leggera del primario sopra lo sfondo della card, testo e bordo del tema). Variabili `--hub-auth-aside-bg`, `--hub-auth-aside-text`, `--hub-auth-aside-border` e `--hub-auth-aside-padding`; classi `hub-auth--split`, `hub-auth__aside`, `hub-auth__aside-title`, `hub-auth__aside-text`, `hub-auth__aside-notice`. Il pannello definito dal database compare dopo la risposta di `/auth/tool-config` (con una breve dissolvenza); per averlo dal primo istante usare la prop `aside`.

## Personalizzazione

- **Testi**: `<LoginScreen messages={{ sendCode: 'Invia', ... }} />` (o alle singole `EmailStep`/`OtpStep`). VoiceNote passa le stringhe di i18next.
- **Stile**: variabili CSS su `.hub-auth` o su una classe passata con `className`. Vedi i commenti in `src/ui/hub-auth.css`.
- **Storage**: passare un `StorageAdapter` diverso da `localStorageAdapter` (es. IndexedDB per wp-fleet-manager).
- **Ruoli**: `<AuthGate requireRole="admin" denied={<AccessDenied />}>`.
- **Tool**: passando `tool` alla creazione, `otp-verify` e `GET /me` lo dichiarano a hub, che risponde `403 ToolNotEnabled` se l'utente non può usarlo.

## Sviluppo

```bash
npm install
npm test        # vitest
npm run build   # compila src/ in dist/
npm run typecheck
```

## Rilasci

1. Aggiornare `CHANGELOG.md` e la `version` in `package.json` (semver).
2. `npm run build` e committare `dist/` insieme al codice sorgente.
3. Taggare (`git tag vX.Y.Z && git push --tags`).
4. Nei progetti: `npm install github:mavidasnc/hub-auth#semver:^X.Y.Z` (o `npm update`).
