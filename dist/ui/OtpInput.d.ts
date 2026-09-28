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
export declare function OtpInput({ value, onChange, length, disabled, autoFocus, digitLabel, className, }: OtpInputProps): import("react").JSX.Element;
