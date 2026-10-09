/**
 * Corpo dell'informativa privacy (dalla 1.7.0).
 *
 * Hub invia il testo con `format`:
 *  - 'markdown': viene convertito in HTML con marked e sanificato con DOMPurify
 *    (il testo lo scrive un admin, ma l'HTML non è mai considerato fidato);
 *  - assente o 'text' (hub più vecchi): testo semplice a paragrafi, dove un
 *    paragrafo "Titolo\ntesto" mostra il titolo su una riga propria in grassetto.
 *
 * marked e DOMPurify si caricano solo alla prima apertura dell'informativa
 * (import dinamico), così non pesano sul bundle del login.
 */
export interface PrivacyContentProps {
    /** Testo dell'informativa, così come arriva da hub */
    text: string;
    /** Formato del testo: 'markdown' oppure testo semplice (default) */
    format?: 'markdown' | 'text';
}
export declare function PrivacyContent({ text, format }: PrivacyContentProps): import("react").JSX.Element | null;
