# Changelog

## 1.7.0 — 2026-10-09

- **Informativa privacy in Markdown**: hub ≥ 0.219.0 invia il testo con `privacy.format = 'markdown'` (modificabile dalla tab Privacy di admin-dashboard) e la modale lo mostra formattato: titoli, elenchi, tabelle (con scorrimento orizzontale), grassetti e link, che si aprono in una nuova scheda. Il testo è convertito con `marked` e sanificato con `DOMPurify`; le due librerie si caricano solo alla prima apertura della modale (import dinamico), quindi non pesano sul bundle del login. Se il caricamento fallisce la modale ricade sul testo semplice.
- **Retrocompatibile**: con un hub più vecchio il campo `format` manca e resta il rendering a paragrafi della 1.5 ("Titolo" + a capo + testo, titolo in grassetto). Con hub ≥ 0.219.0 e una app ancora ferma a hub-auth < 1.7.0 la modale mostra il Markdown grezzo: aggiornare le app prima del deploy di hub.
- **Nuovo export `PrivacyContent`** (`@mavida/hub-auth/ui`, props `text` e `format`): è il corpo della modale, riusabile per un'anteprima (la usa la tab Privacy di admin-dashboard). `ToolConfig.privacy` ha il campo opzionale `format?: 'markdown' | 'text'`.
- **Modifica visibile**: `PrivacyDialog` (interno, non esportato) riceve `text` e `format` al posto di `paragraphs`. Nuove classi CSS `hub-auth__privacy-md*` per il testo in Markdown. Nuove dipendenze `marked` e `dompurify`.

## 1.6.0 — 2026-10-09

- **Passo del codice più onesto**: `otp-request` risponde 200 anche a email sconosciute (anti-enumerazione), quindi "Abbiamo inviato un codice a …" poteva essere falso. Il testo di default `codeSentTo` diventa "Se {email} è registrato, riceverai un codice via email." (sovrascrivibile con `messages`). **Modifica visibile**: chi confronta quel testo nei test deve aggiornarlo.
- **Link "Registrati" nel passo del codice**: quando hub offre la registrazione, sotto "Cambia email" e "Reinvia codice" compare "Non hai un account? Registrati" (stessa prop `signup={false}` per nasconderlo; `OtpStep` ha ora la prop `signup`). Il form di registrazione parte con l'email già scritta nel passo precedente.
- Richiede hub ≥ 0.218.0 per l'email "hai già un account" a chi si registra con un indirizzo già presente (con un hub più vecchio il client funziona ugualmente).

## 1.5.0 — 2026-10-09

- **Informativa privacy in una modale**: il testo completo non è più stampato sotto il form di registrazione. Si apre con un `<dialog>` nativo (focus trap, Esc, sfondo oscurato) dal link "informativa sulla privacy" nella frase del consenso oppure dal pulsante "Visualizza il testo completo dell'informativa" sotto la casella. La modale ha "Chiudi" e "Accetto l'informativa" (chiude e spunta la casella); un clic sullo sfondo la chiude e il focus torna al pulsante che l'ha aperta. Il consenso resta la casella: aprire la modale non lo dà da solo.
- **Messaggi**: `privacyLabel` ora contiene il segnaposto `{link}` ("Ho letto e accetto l'{link}"), sostituito dal pulsante con il testo `privacyLinkText`. Nuovi `privacyLinkText`, `privacyOpen`, `privacyClose`, `privacyAccept`. Un `privacyLabel` personalizzato senza `{link}` resta testo semplice e vale il solo pulsante sotto la casella.
- **Modifica visibile**: spariscono la `<section class="hub-auth__privacy">` sotto il form, la classe `hub-auth__privacy` e `hub-auth__privacy-title`; restano `hub-auth__privacy-text` e `hub-auth__privacy-heading`, ora dentro la modale. Nuove classi `hub-auth__dialog*`, `hub-auth__button--secondary`, `hub-auth__link--inline` e `hub-auth__link--block`. Nei test dei progetti la casella si trova con `getByRole('checkbox')`: `getByLabelText` ignora il testo del pulsante dentro la label.

## 1.4.1 — 2026-10-09

- **Informativa privacy**: un paragrafo nel formato `Titolo` + a capo + testo mostra il titolo su una riga propria, in grassetto (prima titolo e testo si fondevano in un'unica riga).

## 1.4.0 — 2026-10-09

- **Larghezza massima del layout a due metà**: le due metà stanno in un contenitore centrato largo al massimo 1200px (variabile `--hub-auth-split-max-width`), con bordo, angoli arrotondati e ombra, invece di allargarsi a tutto lo schermo: su un monitor 4K il pannello e il login non sono più lontani. Sotto i 900px non cambia nulla (login sopra, pannello sotto, a tutta larghezza). **Modifica visibile**: il DOM del layout diviso ha un elemento in più (`div.hub-auth__split` fra `.hub-auth` e le due metà).
- **Logo nel pannello**: con il pannello di default compare in alto il `logo` passato a `LoginScreen`, ingrandito a 72px; sopra i 900px la card non lo ripete (classe `hub-auth--logo-aside`). Con un `aside` personalizzato, o senza pannello, il logo resta nella card.
- **Informativa privacy sotto il form di registrazione**: non più in un riquadro scorrevole fra i campi e la spunta, ma per intero sotto il form, con titolo e interlinea da testo da leggere. Classi nuove `hub-auth__privacy-title`; il blocco è una `<section>` con `aria-label`.

## 1.3.1 — 2026-10-09

- **Pannello laterale in tema con l'app**: il pannello del layout a due metà non usa più il colore primario a tinta unita con testo bianco (illeggibile con primari chiari come il verde neon di Slide-orama). Ora lo sfondo è una tinta leggera del primario sopra lo sfondo della card, il testo e il bordo sono quelli del tema, l'avviso ha una barra colorata a sinistra. Funziona con temi chiari e scuri senza configurazione. Nuova variabile `--hub-auth-aside-border`; i default di `--hub-auth-aside-bg` e `--hub-auth-aside-text` cambiano (restano sovrascrivibili).

## 1.3.0 — 2026-10-09

Richiede hub ≥ 0.216.0 per registrazione e pannello (con un hub più vecchio `GET auth/tool-config` non esiste: il client lo ignora e il login resta quello di prima, senza link di registrazione né pannello).

- **Registrazione** nel `LoginScreen`: sotto il form email compare "Non hai un account? Registrati" se hub offre la registrazione per il tool; il form chiede nome utente, email e accettazione dell'informativa privacy (testo e versione da hub). Esito deciso dalle impostazioni di hub: account da approvare (step `registered`) oppure attivo subito (step `otp`, codice già inviato). Se il testo privacy cambia mentre si compila, il client si riallinea e chiede di accettare di nuovo. Nuovi componenti `RegisterStep` e `RegisteredStep`, prop `signup={false}` per nascondere il link.
- **Client**: `loadToolConfig(force?)` (GET `auth/tool-config`, non lancia mai, richiesta unica anche con chiamate concorrenti), `startRegister()`, `register({ username, email, privacyAccepted })`, stato `toolConfig`. `LoginScreen` carica la configurazione solo quando è mostrato.
- **Layout a due metà**: quando c'è un pannello da mostrare (descrizione o avviso del tool da hub, oppure la nuova prop `aside`) la schermata si divide, pannello a sinistra e login a destra; sotto i 900px il login passa sopra. Prop `layout`: `'auto'` (default), `'split'`, `'centered'`. Variabili `--hub-auth-aside-bg`, `--hub-auth-aside-text`, `--hub-auth-aside-padding`.
- **Messaggi** italiani nuovi in `messages` (registrazione, privacy, conferma) e codici errore `InvalidUsername`, `PrivacyNotAccepted`, `SignupDisabled`, `PrivacyVersionMismatch`.
- **Modifica visibile**: `AuthState.step` ammette anche `'register'` e `'registered'` e lo stato ha il campo `toolConfig`. Una UI di login propria che confronta `step` va aggiornata. Senza descrizione, avviso né `aside` il DOM e lo stile del `LoginScreen` sono identici a quelli della 1.2.

## 1.2.0 — 2026-10-02

Richiede hub ≥ 0.192.0 per le funzioni nuove (con hub più vecchi il client si comporta come prima, tranne che `otp-request` riceve il campo `link`, ignorato).

- **Magic link nell'email OTP** (attivo di default, `magicLink: false` per disattivarlo): `requestOtp` invia `link: true`; se l'app è aperta da `#hub_otp=<token>` il token viene letto e rimosso subito dall'URL e lo stato diventa `step: 'link'`. Nuovi `verifyLink()` e `cancelLink()` (anche in `useHubAuth()`), nuovo componente `LinkStep` mostrato da `LoginScreen`: l'accesso richiede un clic di conferma, così gli scanner antiphishing non consumano il token. Un link non valido riporta al login con la notice `link_invalid`.
- **SSO tra le app** (`sso: true`, spento di default): al login hub imposta il cookie host-only `__Host-mvd_sso`; all'avvio senza sessione locale il client lo scambia con una sessione propria (`POST sso/session`); mentre si attende il codice OTP riprova al ritorno sulla scheda. Se la CORS con credenziali non è configurata il login ripiega da solo sul flusso senza cookie.
- **`logout(notice?, { global? })`**: con `sso` il logout dell'utente è globale di default (`POST logout?scope=global`: revoca l'SSO e le sessioni di tutte le app); i logout con notice restano locali. Un evento passato a `logout` (`onClick={logout}`) non viene più scambiato per una notice.
- **Modifica visibile**: `AuthState.step` ora ammette anche `'link'` e `AuthNotice` anche `'link_invalid'` (nuova voce in `messages.notice`). Una UI di login propria che confronta `step` con `'email'`/`'otp'` va aggiornata, o deve usare `magicLink: false`.

## 1.1.0 — 2026-09-28

- `adoptSession({token, user})`: adotta una sessione ottenuta da un meccanismo diverso da otp-verify (es. lo scambio di un magic link via `/access-links/exchange`), con lo stesso trattamento di un login OTP riuscito, incluso il refresh da `GET /me`. Aggiunto per carousel-generator, che ha sia login OTP sia accesso via link condiviso da un admin.

## 1.0.0 — 2026-09-28

Prima versione. Libreria condivisa per il login OTP dei progetti hub, a sostituire le 9 implementazioni indipendenti (admin-dashboard, carousel-generator, log-dashboard, mavida-sheets, signup, social-planner-v2, voicenote, wandly, wp-fleet-manager).

- Core headless (`createHubAuth`): flusso `otp-request` → `otp-verify` → sessione, boot con `GET /me`, guardia sul 401 (un token diverso da quello corrente non slogga), logout con revoca server-side (token catturato prima della pulizia locale), `expires_at` ignorato per il logout (la sessione hub è sliding).
- Migrazione trasparente dalle vecchie chiavi di sessione dei singoli progetti (`legacyKeys`).
- Binding React (`useHubAuth`, `AuthGate` con supporto ai ruoli).
- UI stilizzabile (`LoginScreen`, `EmailStep`, `OtpStep`, `OtpInput`) con paste, auto-submit senza doppi invii, cooldown sul reinvio del codice, testi sovrascrivibili.
- Supporto al campo opzionale `tool` (richiede hub ≥ 0.186.0: `otp-verify` e `GET /me` accettano `tool`/`?tool=`).
