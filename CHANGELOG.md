# Changelog

## 1.16.0 — 2026-10-27

Checkbox «Ricordami» nel passo email del login: sessione di 30 giorni invece di 48 ore. Nessuna modifica che rompa l'API pubblica: `requestOtp(email)` funziona come prima e il corpo di `otp-request` cambia solo se la casella è spuntata. **Richiede hub ≥ 0.271.0 (migration 174): rilasciare prima hub**; con un hub più vecchio il campo `remember` è ignorato e la sessione resta di 48 ore (la casella però si vede lo stesso).

- **Checkbox «Ricordami»** (`EmailStep`, quindi `LoginScreen`): spenta di default, con la nota «Resterai connesso per i prossimi 30 giorni su questo dispositivo.» collegata alla casella con `aria-describedby`. Stile `hub-auth__remember` e `hub-auth__check-hint`, con i token esistenti.
- **`requestOtp(email, { remember })`**: `remember: true` aggiunge `remember` al corpo di `otp-request`. Il reinvio del codice (stessa email, step `otp`) ripete la scelta dell'ultima richiesta; una richiesta nuova, anche dopo «Cambia email», non la eredita.
- **Testi nuovi**: `rememberLabel` e `rememberHint`, sovrascrivibili con `messages`.
- Test: 278 → 287 (`client.test.ts`: corpo con e senza `remember`, reinvio, nuova richiesta, `magicLink: false`; `ui.test.tsx`: casella spenta con la nota, richiesta con e senza spunta, reinvio che mantiene la scelta).

## 1.15.0 — 2026-10-23

Pagina di pagamento in tre colonne, solo con i piani Fleet. Nessuna modifica che rompa l'API pubblica: un listino di hub < 0.269.0 (senza `description` né `apps_included_months`) si vede come prima, solo impaginato in colonne. **Le descrizioni e la riga sulle app incluse richiedono hub ≥ 0.269.0 (migration 172): rilasciare prima hub.**

- **Piani in tre colonne** (`SubscribePicker`): una card per piano con titolo, descrizione (`BillingPlan.description`, nuova e opzionale), siti inclusi, listino barrato (solo con il prezzo di lancio in vigore), prezzo mensile e **prezzo annuale** (mensile × `months`). Sotto i ~190px per card si impilano. La card larga del login passa da 560 a 760px.
- **Niente opzione «solo app» né elenco app quando il listino non ne offre** (`catalog.apps` vuoto, com'è dalla prima fase dei pagamenti di hub 0.269.0): restano la scelta del piano e il riepilogo. Con `apps` non vuoto il comportamento è quello della 1.14.0 (radio «Solo le app, senza Fleet», checkbox delle app).
- **App incluse**: con `BillingCatalog.apps_included_months > 0` compare «Con un piano Fleet le app Mavida sono incluse per N mesi.» (singolare «1 mese»).
- **Testi nuovi**: `subscribePerYearPrice`, `subscribeListPrice`, `subscribeAppsIncluded` (segnaposto `{period}`) e `subscribeNeedPlan` («Scegli un piano.», usato al posto di `subscribeNeedSelection` quando non ci sono app).
- Nuovi campi opzionali nei tipi: `BillingPlan.description`, `BillingCatalog.apps_included_months`.
- Test: 268 → 278 (`SubscribePicker: solo piani Fleet`: tre colonne, descrizione, listino barrato, annuale, niente app, mesi inclusi al singolare e a zero, preventivo senza app, invio).

## 1.14.0 — 2026-10-22

Pagamento dell'abbonamento con PayPal dentro il login. Nessuna modifica che rompa l'API pubblica: con hub che non ha i pagamenti accesi (default) nulla cambia. **Richiede hub ≥ 0.267.0 (migration 171)**: rilasciare prima hub, poi le app. Le app ricevono il nuovo step aggiornando `@mavida/hub-auth` a `^1.14.0`.

- **Step `subscribe`** (`AuthStep`): quando hub risponde `403 SubscriptionRequired` a `otp-verify`, `otp-verify-link` o `sso/session` (accesso valido ma nessun abbonamento) il client non lancia e non apre la sessione: salva il `billing_token` ricevuto (solo in memoria) e passa allo step `subscribe`, che `LoginScreen` mostra con `SubscribeStep`. La card si allarga (`.hub-auth__card--wide`).
- **`SubscribeStep` e `SubscribePicker`** (`@mavida/hub-auth/ui`): `SubscribePicker` è di sola presentazione (listino, funzione di preventivo e di invio come props, nessun Provider) e si può montare anche altrove; con `preview` il pagamento è disattivato (l'anteprima della dashboard admin). Piano Fleet con siti inclusi e prezzo mensile, app a scelta, riepilogo con imponibile, IVA e totale **calcolati sempre da hub** (`POST /billing/quote`), dati di fatturazione (ragione sociale, partita IVA o codice fiscale, SDI, PEC, paese) e pulsante "Paga con PayPal".
- **Nuovi metodi del client** (anche in `useHubAuth()`): `loadBillingCatalog()`, `billingQuote(selection)` e `startCheckout(order)`. Con il token di pagamento usano l'header `X-Billing-Token`; senza (anteprima admin) la sessione aperta. `startCheckout` crea l'ordine, salva il token in `sessionStorage` (`<storageKey>:billing`) e porta l'utente su PayPal (solo indirizzi `https`); nuova opzione `redirect` di `createHubAuth` per sostituire `window.location.assign`.
- **Ritorno da PayPal** (`?billing=paid|pending|cancelled|error`, letto e tolto dall'URL all'avvio): `paid` con il token salvato apre la sessione con `POST /billing/complete` senza un nuovo codice; senza token compare la notice `payment_received`; `cancelled` riapre la scelta; `pending` e `error` mostrano `payment_pending` e `payment_failed`.
- **Abbonamento scaduto a sessione aperta**: `GET /me` con `403 SubscriptionRequired`, `authFetch` e gli interceptor axios (403 con quel codice, solo se il token è ancora quello corrente) fanno uscire con la notice `subscription_required`; il prossimo accesso porta al pagamento.
- **Nuove notice**: `subscription_required`, `payment_received`, `payment_pending`, `payment_failed` (`AuthNotice`, testi in `messages.notice`); nuovi testi `subscribe*`, `billing*Label` e gli errori `BillingDisabled`, `BillingNotConfigured`, `PlanNotMapped`, `PayPalUnavailable`, `InvalidSelection`, `InvalidPlan` in `errorMessage`.
- Nuovi tipi esportati: `BillingCatalog`, `BillingPlan`, `BillingApp`, `BillingSelection`, `BillingQuote`, `BillingOrder`.
- Test: 230 → 268 (`tests/billing.test.tsx`: 403 nel login, sessione senza abbonamento, rotte `/billing` con token e con sessione, ritorno da PayPal, `SubscribePicker`, `LoginScreen` allo step `subscribe`).

## 1.13.0 — 2026-10-21

CTA di registrazione in evidenza con i giorni di prova e modale "Approfondisci" più larga. Nessuna modifica che rompa l'API pubblica. **I giorni di prova richiedono hub ≥ 0.261.0 (`trial_days` in `GET /auth/tool-config`): rilasciare prima hub e poi le app**; con un hub più vecchio la CTA resta senza giorni.

- **CTA "Registrati" in evidenza** (`SignupCta`, usata dal passo dell'email e da quello del codice): pulsante con la tinta del primario del tema al posto del link di testo, separato dal form da una riga. Se hub invia `trial_days` (`ToolConfig.trial_days`: i giorni delle impostazioni o del coupon valido) il testo li promette ("Registrati e prova gratis per 14 giorni", singolare per 1); senza (trial senza scadenza, valore non valido, hub più vecchio) resta `signupLink`. Nuovi testi `signupTrialLink` (con `{days}`) e `signupTrialLinkOne`; nuove classi `.hub-auth__signup` e `.hub-auth__button--cta`.
- **Modale "Approfondisci" all'80%**: `.hub-auth__dialog--wide` ha `width: 80%` e `max-width: var(--hub-auth-split-max-width)` (era fissa a 760px), quindi segue la larghezza massima del layout a due metà e si regola con la stessa variabile.
- Test: 221 → 230 (CTA con i giorni, singolare, passo del codice, valori non validi, testi sovrascritti).

## 1.12.0 — 2026-10-21

Coupon di registrazione, recupero della sessione via SSO e modale "Approfondisci". Nessuna modifica che rompa l'API pubblica. **I coupon richiedono hub ≥ 0.260.0 (migration 168): rilasciare prima hub e poi le app**; con un hub più vecchio il campo `coupon` viene ignorato in silenzio.

- **Coupon di registrazione**: `RegisterData.coupon` e campo "Coupon" nel form (`RegisterStep`), chiuso dietro "Hai un coupon?". Un coupon non valido fa lanciare `InvalidCoupon` ("Coupon non valido") e ferma la registrazione.
- **Link di invito `?coupon=CODICE`**: il client legge il codice dall'URL (`AuthState.inviteCoupon`, non viene rimosso dall'URL) e lo passa a `GET /auth/tool-config?coupon=`. Se hub lo trova valido (`ToolConfig.coupon_valid`) il login si apre sul form di registrazione, già compilato, anche con la registrazione chiusa; se non lo è compare la notice `coupon_invalid`. Nuovi testi `couponToggle`, `couponLabel`, `couponPlaceholder`, `invalidCoupon`, `notice.coupon_invalid`.
- **Recupero della sessione via SSO su un 401** (con `sso: true`): una sessione salvata rifiutata da `/me` (o da una richiesta dell'app) prova una volta lo scambio del cookie prima del logout. Prima l'utente vedeva "sessione scaduta" anche con un cookie valido, per esempio dopo un nuovo accesso in un'altra app. Un solo tentativo per volta, pausa di 10 secondi dopo un recupero riuscito (niente cicli), `onLogout` per il vecchio utente se il cookie è di un altro. Il test "con una sessione salvata non tenta l'SSO" resta valido: lo scambio parte solo dopo un 401.
- **Modale "Approfondisci"**: `asideLink` verso un percorso della stessa origine apre la pagina in una modale (`AboutDialog`, interna): `fetch` + `<main>` + DOMPurify, indirizzi relativi risolti, link in nuova scheda, caricamento una sola volta; ripiego sull'indirizzo diretto se il caricamento fallisce. Clic con modificatori e tasto centrale seguono il link; `modal: false` la disattiva. `/about/` aperto direttamente non cambia.
- Test: 169 → 221 (coupon nel client e nel form, link di invito, recupero SSO, modale).

## 1.11.0 — 2026-10-13

Fase 5 della review del 2026-10-11 (M-6, B-3, B-22). Nessuna modifica all'API pubblica e nessun requisito nuovo su hub; **modifica di comportamento**: il Bearer non viene più allegato alle richieste verso altre origini.

- **Bearer solo verso hub (M-6)**: `authFetch` e gli interceptor axios allegano `Authorization` soltanto se l'URL finale ha la stessa origine di `baseUrl`. Prima un URL assoluto verso qualunque host riceveva il token di sessione (valido 30 giorni). Per axios l'URL è `baseURL` + `url` risolti come fa axios (un `url` assoluto o `//host` ignora `baseURL`); se l'origine non si determina il token non viene allegato. `url()` e `authHeaders()` non cambiano. Un `Authorization` già impostato dal chiamante resta com'è. Il vecchio test "authFetch accetta URL assoluti" verificava solo `url()`: ora ci sono test su `authFetch` e sull'interceptor.
- **Schede sincronizzate (B-3)**: `BroadcastChannel('hub-auth:<storageKey>')` (nessun token nel messaggio, funziona anche con IndexedDB e storage in memoria). Il logout voluto dall'utente in una scheda fa uscire le altre (`onLogout` compreso, revoca del loro token); un login in una scheda viene ripreso dalle schede senza sessione (dallo storage condiviso o dal cookie SSO). Il logout per sessione scaduta o tool non abilitato resta locale. Senza `BroadcastChannel` nulla cambia.
- **Token solo in memoria (M-6)**: documentato l'uso di `storage: memoryStorageAdapter()` con `sso: true` (il boot riprende la sessione dal cookie `__Host-`); nessuna nuova opzione. Lo adottano le sole dashboard online.
- **Logout globale più robusto (B-22)**: se la richiesta con credenziali (`logout?scope=global`) fallisce (origine non in `SSO_ALLOWED_ORIGINS`: il browser la blocca al preflight) si ripete senza credenziali, così almeno il token viene revocato, e si scrive un avviso in console. Prima l'errore era ingoiato e la sessione restava valida.
- **Igiene (B-22)**: `license` e `repository` in `package.json`; ESLint 9 con `typescript-eslint` e `react-hooks` (`npm run lint`, ora anche in CI: l'`eslint-disable` di `OtpStep.tsx` ora è una regola che esiste davvero); la CI gira anche sui tag `v*` e verifica che `dist/` committato coincida con la build (`git diff --exit-code dist/`).
- Test: 158 → 169 (origine del Bearer, schede, logout globale).

## 1.10.0 — 2026-10-09

- **`asideLink`** (`{ href, label }`) in `LoginScreen`: pulsante (CTA) nel pannello di default, sotto l'immagine, ad es. "Approfondisci" verso la pagina `/about/` dell'app. È un link normale (`<a class="hub-auth__aside-cta">`, con freccia che si sposta al passaggio del mouse), quindi visibile e seguibile anche dai motori di ricerca. Colori dal tema (`--hub-auth-primary`). Da solo fa comparire il pannello; con un `aside` personalizzato è ignorato. Ordine nel pannello: logo, titolo, descrizione, avviso, immagine, pulsante.

## 1.9.0 — 2026-10-09

- **`EcosystemMenu` con `variant="inline"`**: elenco nel flusso sotto il pulsante a tutta larghezza, senza frasi (restano nel tooltip) e senza chiusura al clic fuori, che eredita colori e font del contenitore. Serve alle sidebar con `overflow: hidden` (Wandly, WooSync, Fleet), dove la tendina assoluta della 1.8.0 verrebbe tagliata. Il default resta `dropdown`. I link dell'elenco hanno ora `title` con la frase dell'app.

## 1.8.0 — 2026-10-09

Nessun requisito nuovo su hub: tutto è retrocompatibile e le novità sono opt-in. Con hub ≥ 0.221.0 l'informativa ha anche un URL pubblico (`GET /privacy`), da linkare dalle app.

- **`asideImage`** (`{ src, alt, width?, height? }`) in `LoginScreen`: immagine nel pannello di default, sotto descrizione e avviso (screenshot dell'app, alt descrittivo). Da sola fa comparire il pannello; con un `aside` personalizzato è ignorata. Classe `hub-auth__aside-image` (altezza massima 18rem, ritaglio in alto a sinistra).
- **Blocco ecosistema nel login**: prop `ecosystem` (default `false`, così admin e log non cambiano) che mostra sotto la card "Le altre app Mavida", cioè i link alle altre cinque app. La corrente si riconosce da `tool` di `createHubAuth` (nuovo campo di sola lettura `client.tool`) o, in mancanza, dall'host della pagina.
- **Nuovi export `EcosystemMenu`, `EcosystemNav`, `ECOSYSTEM_APPS`, `otherApps`** (`@mavida/hub-auth/ui`): `EcosystemMenu` è un pulsante con tendina "App Mavida" per l'header o la sidebar delle app dopo il login (Esc e clic fuori la chiudono; `theme="dark"`, `align`, `label`, `current`; variabili `--hub-auth-eco-*`); `EcosystemNav` è l'elenco di link per footer e pagine pubbliche. Il catalogo è fisso (Wandly, Slide-orama, Social Planner, WooSync, VoiceNote, Fleet) con nomi e frasi da `__docs/presentazione`. Nuovi testi `ecosystemTitle` ed `ecosystemMenu` in `messages`.
- **Landmark semantici (modifica visibile)**: l'area della card è un `<main>` (nel layout a due metà `main.hub-auth__main`; in quello centrato il contenitore `.hub-auth` diventa `<main>`) e il footer è un `<footer class="hub-auth__footer">` invece di un `<div>`. Le classi non cambiano; un'app che avvolge già `LoginScreen` in un `<main>` avrà due landmark main.
- **Sanificazione dell'informativa più stretta** (`PrivacyContent`): DOMPurify ammette solo il sottoinsieme che produce il Markdown (titoli, elenchi, tabelle, enfasi, link, citazioni, codice); niente `style`, `form`, `input`, `img` o `iframe`, nemmeno come HTML grezzo, e le caselle dei task list non si mostrano. L'hook che apre i link in una nuova scheda sta su un'**istanza propria** di DOMPurify e non tocca più quella condivisa dall'app.

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
