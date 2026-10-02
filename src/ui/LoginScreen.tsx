/**
 * Schermata di login completa: card con logo, titolo, avviso di logout
 * forzato ed EmailStep / OtpStep in base allo step del client.
 */

import type { ReactNode } from 'react';
import { useHubAuth } from '../react/index.js';
import { EmailStep } from './EmailStep.js';
import { LinkStep } from './LinkStep.js';
import { OtpStep } from './OtpStep.js';
import { mergeMessages, type HubAuthMessages } from './messages.js';

export interface LoginScreenProps {
  /** Titolo della card (es. nome dell'app) */
  title?: ReactNode;
  /** Sottotitolo sotto il titolo */
  subtitle?: ReactNode;
  /** Logo sopra il titolo */
  logo?: ReactNode;
  /** Contenuto sotto la card (es. link di registrazione) */
  footer?: ReactNode;
  /** Testi da sovrascrivere */
  messages?: Partial<HubAuthMessages>;
  /** Secondi di attesa prima del reinvio del codice (default 60) */
  resendCooldown?: number;
  /** Classe aggiuntiva sul contenitore (per temi e override) */
  className?: string;
}

export function LoginScreen({
  title, subtitle, logo, footer, messages: custom, resendCooldown, className = '',
}: LoginScreenProps) {
  const messages = mergeMessages(custom);
  const { step, notice } = useHubAuth();

  return (
    <div className={`hub-auth ${className}`.trim()}>
      <div className="hub-auth__card">
        {(logo || title || subtitle) && (
          <header className="hub-auth__header">
            {logo && <div className="hub-auth__logo">{logo}</div>}
            {title && <h1 className="hub-auth__title">{title}</h1>}
            {subtitle && <p className="hub-auth__subtitle">{subtitle}</p>}
          </header>
        )}

        {notice && step === 'email' && (
          <p className="hub-auth__notice" role="status">{messages.notice[notice]}</p>
        )}

        {step === 'email' && <EmailStep messages={custom} />}
        {step === 'otp' && <OtpStep messages={custom} resendCooldown={resendCooldown} />}
        {step === 'link' && <LinkStep messages={custom} />}
      </div>
      {footer && <div className="hub-auth__footer">{footer}</div>}
    </div>
  );
}
