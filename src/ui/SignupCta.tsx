/**
 * CTA di registrazione sotto il form di accesso (dalla 1.13.0).
 *
 * Un pulsante in evidenza al posto del vecchio link di testo: se hub comunica i
 * giorni di prova (`toolConfig.trial_days`, hub >= 0.261.0) il testo li promette
 * ("Registrati e prova gratis per 14 giorni"), altrimenti resta `signupLink`.
 * Lo usano il passo dell'email e quello del codice, che mostrano la stessa strada.
 */

import { useHubAuth } from '../react/index.js';
import { format, type HubAuthMessages } from './messages.js';

export interface SignupCtaProps {
  messages: HubAuthMessages;
}

export function SignupCta({ messages }: SignupCtaProps) {
  const { startRegister, toolConfig, loading } = useHubAuth();
  const days = toolConfig?.trial_days;

  // Testo con i giorni di prova (singolare per 1), se hub li comunica
  let label = messages.signupLink;
  if (days) {
    label = days === 1 ? messages.signupTrialLinkOne : format(messages.signupTrialLink, { days });
  }

  return (
    <div className="hub-auth__signup">
      <button
        className="hub-auth__button hub-auth__button--cta"
        type="button"
        onClick={startRegister}
        disabled={loading}
      >
        {label}
      </button>
    </div>
  );
}
