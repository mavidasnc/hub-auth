/**
 * Schermata di login completa: card con logo, titolo, avviso di logout
 * forzato e lo step corrente del flusso (email, codice, magic link,
 * registrazione).
 *
 * Layout a due metà (dalla 1.3.0): quando c'è un pannello da mostrare, a
 * sinistra compare il pannello (logo, descrizione, avvisi o altro) e a destra il
 * login, in un contenitore largo al massimo 1200px (`--hub-auth-split-max-width`);
 * sotto i 900px il login passa sopra e il pannello sotto. Il pannello
 * si personalizza in due modi:
 * - dal database di hub, senza toccare l'app: descrizione e avviso del tool
 *   (GET /auth/tool-config, modificabili dalla tab Tools di admin-dashboard)
 * - dall'app, con la prop `aside` (sostituisce il pannello di default)
 * Senza né l'uno né l'altro la schermata resta la card centrata di sempre.
 *
 * Dalla 1.8.0: `asideImage` (immagine nel pannello di default), `ecosystem` (blocco
 * "Le altre app Mavida" sotto la card) e landmark semantici (`<main>`, `<footer>`).
 */

import { useEffect, type ReactNode } from 'react';
import { useHubAuth } from '../react/index.js';
import { EmailStep } from './EmailStep.js';
import { LinkStep } from './LinkStep.js';
import { OtpStep } from './OtpStep.js';
import { RegisteredStep } from './RegisteredStep.js';
import { RegisterStep } from './RegisterStep.js';
import { EcosystemNav } from './EcosystemMenu.js';
import { mergeMessages, type HubAuthMessages } from './messages.js';

/** Immagine del pannello laterale (es. uno screenshot dell'app) */
export interface AsideImage {
  /** URL dell'immagine (es. '/login-hero.jpg') */
  src: string;
  /** Testo alternativo: descrive l'immagine per chi non la vede e per i motori di ricerca */
  alt: string;
  /** Dimensioni intrinseche in pixel: riservano lo spazio ed evitano lo spostamento del layout */
  width?: number;
  height?: number;
}

/** Pulsante sotto l'immagine del pannello (es. "Approfondisci" verso la pagina about) */
export interface AsideLink {
  /** Destinazione del link (es. '/about/') */
  href: string;
  /** Testo del pulsante (es. 'Approfondisci') */
  label: string;
}

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
  /**
   * Immagine nel pannello di default, sotto descrizione e avviso (dalla 1.8.0). Da sola
   * basta a far comparire il pannello; con un `aside` personalizzato è ignorata.
   */
  asideImage?: AsideImage;
  /**
   * Pulsante (CTA) nel pannello di default, sotto l'immagine (dalla 1.10.0): un link
   * normale, visibile e seguibile anche dai motori di ricerca. Da solo basta a far
   * comparire il pannello; con un `aside` personalizzato è ignorato.
   */
  asideLink?: AsideLink;
  /**
   * Mostra sotto la card il blocco "Le altre app Mavida", con i link alle altre app
   * dell'ecosistema (dalla 1.8.0, default false: admin e log non lo vogliono).
   */
  ecosystem?: boolean;
}

/** Pannello di default: logo dell'app, etichetta, descrizione e avviso del tool (da hub) */
function DefaultAside({ logo, image, link }: { logo?: ReactNode; image?: AsideImage; link?: AsideLink }) {
  const { toolConfig } = useHubAuth();
  const tool = toolConfig?.tool;
  return (
    <>
      {logo && <div className="hub-auth__aside-logo">{logo}</div>}
      {tool?.label && <h2 className="hub-auth__aside-title">{tool.label}</h2>}
      {tool?.description && <p className="hub-auth__aside-text">{tool.description}</p>}
      {tool?.login_notice && <p className="hub-auth__aside-notice" role="note">{tool.login_notice}</p>}
      {image && (
        <img
          className="hub-auth__aside-image"
          src={image.src}
          alt={image.alt}
          width={image.width}
          height={image.height}
          decoding="async"
        />
      )}
      {link && (
        <a className="hub-auth__aside-cta" href={link.href}>
          {link.label}
          <span className="hub-auth__aside-cta-arrow" aria-hidden="true">→</span>
        </a>
      )}
    </>
  );
}

export function LoginScreen({
  title, subtitle, logo, footer, messages: custom, resendCooldown, className = '',
  aside, layout = 'auto', signup = true, asideImage, asideLink, ecosystem = false,
}: LoginScreenProps) {
  const messages = mergeMessages(custom);
  const { step, notice, toolConfig, loadToolConfig, client } = useHubAuth();

  // Pannello e registrazione dipendono dalla configurazione pubblica di hub:
  // si carica solo qui, quando la schermata di login è davvero mostrata
  useEffect(() => {
    void loadToolConfig();
  }, [loadToolConfig]);

  const tool = toolConfig?.tool;
  const hasAside = aside != null || !!(tool?.description || tool?.login_notice || asideImage || asideLink);
  const split = layout === 'split' || (layout === 'auto' && hasAside);
  // Con il pannello di default il logo sta nel pannello (e si toglie dalla card sopra i 900px);
  // con un `aside` personalizzato resta nella card, che è l'unico posto dove l'app lo mette.
  const logoInAside = split && aside == null && !!logo;

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
      {step === 'otp' && <OtpStep messages={custom} resendCooldown={resendCooldown} signup={signup} />}
      {step === 'link' && <LinkStep messages={custom} />}
      {step === 'register' && <RegisterStep messages={custom} />}
      {step === 'registered' && <RegisteredStep messages={custom} />}
    </div>
  );
  // Footer sotto la card: testo dell'app e, se richiesto, i link alle altre app dell'ecosistema
  const footerNode = (footer || ecosystem) && (
    <footer className="hub-auth__footer">
      {footer}
      {ecosystem && <EcosystemNav current={client.tool ?? tool?.key} messages={custom} />}
    </footer>
  );

  if (!split) {
    return (
      <main className={`hub-auth ${className}`.trim()}>
        {card}
        {footerNode}
      </main>
    );
  }

  return (
    <div className={`hub-auth hub-auth--split${logoInAside ? ' hub-auth--logo-aside' : ''} ${className}`.trim()}>
      <div className="hub-auth__split">
        <aside className="hub-auth__aside">
          <div className="hub-auth__aside-content">
            {aside ?? <DefaultAside logo={logo} image={asideImage} link={asideLink} />}
          </div>
        </aside>
        <main className="hub-auth__main">
          {card}
          {footerNode}
        </main>
      </div>
    </div>
  );
}
