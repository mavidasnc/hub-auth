import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Secondo passo del login: inserimento del codice OTP.
 *
 * - invio con Enter, con il pulsante o automatico alla sesta cifra, senza
 *   doppi invii dello stesso codice
 * - reinvio del codice con cooldown e conto alla rovescia
 * - "cambia email" per tornare al primo passo
 */
import { useEffect, useRef, useState } from 'react';
import { useHubAuth } from '../react/index.js';
import { OtpInput } from './OtpInput.js';
import { errorMessage, format, mergeMessages } from './messages.js';
const CODE_LENGTH = 6;
/** Secondi mancanti al reinvio, aggiornati ogni secondo */
function useCooldown(since, seconds) {
    const compute = () => (since ? Math.max(0, Math.ceil(seconds - (Date.now() - since) / 1000)) : 0);
    const [remaining, setRemaining] = useState(compute);
    useEffect(() => {
        setRemaining(compute());
        if (!since)
            return undefined;
        const timer = setInterval(() => {
            const next = compute();
            setRemaining(next);
            if (next === 0)
                clearInterval(timer);
        }, 1000);
        return () => clearInterval(timer);
        // compute dipende solo da since e seconds
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [since, seconds]);
    return remaining;
}
export function OtpStep({ messages: custom, resendCooldown = 60 }) {
    const messages = mergeMessages(custom);
    const { verifyOtp, requestOtp, resetToEmail, pendingEmail, otpRequestedAt, loading } = useHubAuth();
    const [code, setCode] = useState('');
    const [error, setError] = useState('');
    const [info, setInfo] = useState('');
    // Ultimo codice inviato: evita il doppio invio (auto-submit + pulsante/Enter)
    const lastSubmitted = useRef(null);
    const remaining = useCooldown(otpRequestedAt, resendCooldown);
    /** Invia il codice a hub, una sola volta per valore */
    const submit = async (value) => {
        if (value.length !== CODE_LENGTH) {
            setError(messages.invalidCodeFormat);
            return;
        }
        if (loading || lastSubmitted.current === value)
            return;
        lastSubmitted.current = value;
        setError('');
        setInfo('');
        try {
            await verifyOtp(value);
        }
        catch (err) {
            setError(errorMessage(err, messages, 'otp'));
            setCode('');
            lastSubmitted.current = null;
        }
    };
    /** Handler: modifica del codice, con invio automatico alla sesta cifra */
    const handleChange = (value) => {
        setCode(value);
        if (value.length < CODE_LENGTH)
            lastSubmitted.current = null;
        if (value.length === CODE_LENGTH)
            void submit(value);
    };
    const handleSubmit = (event) => {
        event.preventDefault();
        void submit(code);
    };
    /** Handler: reinvio del codice alla stessa email */
    const handleResend = async () => {
        setError('');
        setInfo('');
        try {
            await requestOtp(pendingEmail);
            setCode('');
            lastSubmitted.current = null;
            setInfo(messages.resent);
        }
        catch (err) {
            setError(errorMessage(err, messages, 'email'));
        }
    };
    return (_jsxs("form", { className: "hub-auth__form", onSubmit: handleSubmit, children: [_jsx("p", { className: "hub-auth__text", children: format(messages.codeSentTo, { email: pendingEmail }) }), _jsx(OtpInput, { value: code, onChange: handleChange, length: CODE_LENGTH, disabled: loading, autoFocus: true, digitLabel: (index) => format(messages.digitLabel, { index }) }), error && _jsx("p", { className: "hub-auth__error", role: "alert", children: error }), info && _jsx("p", { className: "hub-auth__info", role: "status", children: info }), _jsx("button", { className: "hub-auth__button", type: "submit", disabled: loading || code.length !== CODE_LENGTH, children: loading ? messages.verifying : messages.verify }), _jsxs("div", { className: "hub-auth__links", children: [_jsx("button", { className: "hub-auth__link", type: "button", onClick: resetToEmail, disabled: loading, children: messages.changeEmail }), _jsx("button", { className: "hub-auth__link", type: "button", onClick: handleResend, disabled: loading || remaining > 0, children: remaining > 0 ? format(messages.resendIn, { seconds: remaining }) : messages.resend })] })] }));
}
