# @mavida/hub-auth

Login OTP condiviso per i frontend dell'ecosistema hub. Un'unica implementazione del flusso email → codice OTP → sessione, usata dai 9 progetti che parlano con hub (`POST otp-request`, `POST otp-verify`, `GET /me`, `POST logout`).

## Perché

Prima di questa libreria ogni progetto reimplementava lo stesso flusso a modo suo: client HTTP, storage della sessione, guardia sul 401, componenti dello step email/OTP. I bug (token statico invece di quello per utente, logout che non revoca la sessione, logout basato su `expires_at` invece che sulla risposta del server) erano diversi in ogni copia. Con la libreria una correzione fatta una volta arriva a tutti con un aggiornamento del pacchetto.

## Installazione

```bash
npm install github:mavidasnc/hub-auth#semver:^1.0.0
```

`npm update @mavida/hub-auth` prende l'ultimo tag compatibile. La cartella `dist/` è committata nei tag di release: non serve alcuna fase di build al momento dell'installazione da git.

## Struttura

- **`@mavida/hub-auth`** — core headless, nessuna dipendenza da React: `createHubAuth()`.
- **`@mavida/hub-auth/react`** — `<HubAuthProvider>`, `useHubAuth()`, `<AuthGate>`.
- **`@mavida/hub-auth/ui`** + **`@mavida/hub-auth/ui.css`** — `<LoginScreen>`, `<EmailStep>`, `<OtpStep>`, `<OtpInput>`.

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
