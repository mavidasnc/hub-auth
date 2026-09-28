/**
 * Input del codice OTP a caselle separate (controllato).
 *
 * - solo cifre, focus automatico alla casella successiva
 * - Backspace su casella vuota e frecce per spostarsi
 * - incolla di un codice intero o parziale da qualsiasi casella
 * - autoComplete="one-time-code" sulla prima casella (compilazione da SMS/email su mobile)
 *
 * Usato da OtpStep e, da solo, dai flussi che non aprono una sessione (signup).
 */

import { useRef, type ClipboardEvent, type KeyboardEvent } from 'react';

export interface OtpInputProps {
  /** Codice corrente (solo cifre, lunghezza ≤ length) */
  value: string;
  /** Nuovo codice dopo una modifica */
  onChange: (value: string) => void;
  /** Numero di cifre (default 6) */
  length?: number;
  disabled?: boolean;
  autoFocus?: boolean;
  /** Etichetta accessibile di ogni casella, riceve l'indice da 1 */
  digitLabel?: (index: number) => string;
  className?: string;
}

export function OtpInput({
  value, onChange, length = 6, disabled = false, autoFocus = false,
  digitLabel = (index) => `Cifra ${index}`, className = '',
}: OtpInputProps) {
  const inputs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = Array.from({ length }, (_, i) => value[i] ?? '');

  /** Porta il focus sulla casella indicata (entro i limiti) */
  const focusAt = (index: number) => {
    inputs.current[Math.max(0, Math.min(index, length - 1))]?.focus();
  };

  /** Ricompone il codice sostituendo le cifre da `start` in poi */
  const writeFrom = (start: number, chars: string) => {
    const next = [...digits];
    for (let i = 0; i < chars.length && start + i < length; i++) next[start + i] = chars[i];
    // Nessun "buco": il codice è la sequenza di cifre fino alla prima casella vuota
    const firstEmpty = next.indexOf('');
    onChange((firstEmpty === -1 ? next : next.slice(0, firstEmpty)).join(''));
  };

  /** Handler: digitazione in una casella (anche più cifre, es. autofill) */
  const handleChange = (index: number, raw: string) => {
    const chars = raw.replace(/\D/g, '');
    if (!chars) {
      // Cancellazione della cifra: il codice si accorcia da questa casella in poi
      onChange(digits.slice(0, index).join(''));
      return;
    }
    // Dal primo slot vuoto: non si possono lasciare caselle vuote in mezzo
    const start = Math.min(index, value.length);
    // Con una cifra già presente il browser concatena: si tiene l'ultima digitata
    const incoming = chars.length > 1 && digits[index] ? chars.slice(-1) : chars;
    writeFrom(start, incoming);
    focusAt(start + incoming.length);
  };

  /** Handler: Backspace e frecce */
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>, index: number) => {
    if (event.key === 'Backspace' && !digits[index] && index > 0) {
      event.preventDefault();
      onChange(digits.slice(0, index - 1).join(''));
      focusAt(index - 1);
    } else if (event.key === 'ArrowLeft') {
      focusAt(index - 1);
    } else if (event.key === 'ArrowRight') {
      focusAt(index + 1);
    }
  };

  /** Handler: incolla di un codice intero o parziale */
  const handlePaste = (event: ClipboardEvent<HTMLInputElement>, index: number) => {
    event.preventDefault();
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '');
    if (!pasted) return;
    // Un codice completo incollato ovunque sostituisce tutto
    const start = pasted.length >= length ? 0 : Math.min(index, value.length);
    writeFrom(start, pasted.slice(0, length - start));
    focusAt(start + pasted.length);
  };

  return (
    <div className={`hub-auth__otp ${className}`.trim()}>
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(el) => {
            inputs.current[index] = el;
          }}
          className="hub-auth__otp-digit"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          value={digit}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(e, index)}
          onPaste={(e) => handlePaste(e, index)}
          onFocus={(e) => e.target.select()}
          disabled={disabled}
          autoFocus={autoFocus && index === 0}
          aria-label={digitLabel(index + 1)}
        />
      ))}
    </div>
  );
}
