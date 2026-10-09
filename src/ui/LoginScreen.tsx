/**
 * Schermata di login completa: card con logo, titolo, avviso di logout
 * forzato e lo step corrente del flusso (email, codice, magic link,
 * registrazione).
 *
 * Layout a due metà (dalla 1.3.0): quando c'è un pannello da mostrare, a
 * sinistra compare il pannello (descrizione, avvisi o altro) e a destra il
 * login; sotto i 900px il login passa sopra e il pannello sotto. Il pannello
 * si personalizza in due modi:
 * - dal database di hub, senza toccare l'app: descrizione e avviso del tool
 *   (GET /auth/tool-config, modificabili dalla tab Tools di admin-dashboard)
 * - dall'app, con la prop `aside` (sostituisce il pannello di default)
 * Senza né l'uno né l'altro la schermata resta la card centrata di sempre.
 */

import { useEffect, type ReactNode } from 'react';
import { useHubAuth } from '../react/index.js';
import { EmailStep } from './EmailStep.js';
import { LinkStep } from './LinkStep.js';
import { OtpStep } from './OtpStep.js';
import { RegisteredStep } from './RegisteredStep.js';
import { RegisterStep } from './RegisterStep.js';
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
  /**
   * Contenuto del pannello laterale: sostituisce quello di default (etichetta,
   * descrizione e avviso del tool letti da hub).
   */
  aside?: ReactNode;
  /**
   * 'auto' (default): due metà solo se c'è un pannello da mostrare; 'split' le
   * forza; 'centered' mantiene sempre la sola card centrata.
   */
  layout?: 'auto' | 'split' | 'centered';
  /** Mostra il link "Registrati" quando hub offre la registrazione (default true) */
  signup?: boolean;
}

/** Pannello di default: etichetta, descrizione e avviso del tool, da hub */
function DefaultAside() {
  const { toolConfig } = useHubAuth();
  const tool = toolConfig?.tool;
  if (!tool) return null;
  return (
    <>
      {tool.label && <h2 className="hub-auth__aside-title">{tool.label}</h2>}
      {tool.description && <p className="hub-auth__aside-text">{tool.description}</p>}
      {tool.login_notice && <p className="hub-auth__aside-notice" role="note">{tool.login_notice}</p>}
    </>
  );
}

export function LoginScreen({
  title, subtitle, logo, footer, messages: custom, resendCooldown, className = '',
  aside, layout = 'auto', signup = true,
}: LoginScreenProps) {
  const messages = mergeMessages(custom);
  const { step, notice, toolConfig, loadToolConfig } = useHubAuth();

  // Pannello e registrazione dipendono dalla configurazione pubblica di hub:
  // si carica solo qui, quando la schermata di login è davvero mostrata
  useEffect(() => {
    void loadToolConfig();
  }, [loadToolConfig]);

  const tool = toolConfig?.tool;
  const hasAside = aside != null || !!(tool?.description || tool?.login_notice);
  const split = layout === 'split' || (layout === 'auto' && hasAside);

  const card = (
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

      {step === 'email' && <EmailStep messages={custom} signup={signup} />}
      {step === 'otp' && <OtpStep messages={custom} resendCooldown={resendCooldown} />}
      {step === 'link' && <LinkStep messages={custom} />}
      {step === 'register' && <RegisterStep messages={custom} />}
      {step === 'registered' && <RegisteredStep messages={custom} />}
    </div>
  );
  const footerNode = footer && <div className="hub-auth__footer">{footer}</div>;

  if (!split) {
    return (
      <div className={`hub-auth ${className}`.trim()}>
        {card}
        {footerNode}
      </div>
    );
  }

  return (
    <div className={`hub-auth hub-auth--split ${className}`.trim()}>
      <aside className="hub-auth__aside">
        <div className="hub-auth__aside-content">
          {aside ?? <DefaultAside />}
        </div>
      </aside>
      <div className="hub-auth__main">
        {card}
        {footerNode}
      </div>
    </div>
  );
}
