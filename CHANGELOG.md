# Changelog

## 1.0.0 — 2026-09-28

Prima versione. Libreria condivisa per il login OTP dei progetti hub, a sostituire le 9 implementazioni indipendenti (admin-dashboard, carousel-generator, log-dashboard, mavida-sheets, signup, social-planner-v2, voicenote, wandly, wp-fleet-manager).

- Core headless (`createHubAuth`): flusso `otp-request` → `otp-verify` → sessione, boot con `GET /me`, guardia sul 401 (un token diverso da quello corrente non slogga), logout con revoca server-side (token catturato prima della pulizia locale), `expires_at` ignorato per il logout (la sessione hub è sliding).
- Migrazione trasparente dalle vecchie chiavi di sessione dei singoli progetti (`legacyKeys`).
- Binding React (`useHubAuth`, `AuthGate` con supporto ai ruoli).
- UI stilizzabile (`LoginScreen`, `EmailStep`, `OtpStep`, `OtpInput`) con paste, auto-submit senza doppi invii, cooldown sul reinvio del codice, testi sovrascrivibili.
- Supporto al campo opzionale `tool` (richiede hub ≥ 0.186.0: `otp-verify` e `GET /me` accettano `tool`/`?tool=`).
