/**
 * Conferma dell'accesso con il magic link dell'email OTP.
 *
 * Il link NON accede da solo: l'utente deve premere il pulsante. Così uno
 * scanner antiphishing del client email, che apre il link ed esegue il
 * JavaScript senza cliccare nulla, non consuma il token monouso.
 */

import { useState } from 'react';
import { useHubAuth } from '../react/index.js';
import { errorMessage, mergeMessages, type HubAuthMessages } from './messages.js';

export interface LinkStepProps {
  messages?: Partial<HubAuthMessages>;
}

export function LinkStep({ messages: custom }: LinkStepProps) {
  const messages = mergeMessages(custom);
  const { verifyLink, cancelLink, loading } = useHubAuth();
  const [error, setError] = useState('');

  /** Handler: conferma dell'utente; i link non più validi li gestisce il client (notice) */
  const handleConfirm = async () => {
    setError('');
    try {
      await verifyLink();
    } catch (err) {
      setError(errorMessage(err, messages, 'link'));
    }
  };

  return (
    <div className="hub-auth__form">
      <p className="hub-auth__text">{messages.linkIntro}</p>

      {error && <p className="hub-auth__error" role="alert">{error}</p>}

      <button className="hub-auth__button" type="button" onClick={handleConfirm} disabled={loading} autoFocus>
        {loading ? messages.linkSigning : messages.linkConfirm}
      </button>

      <div className="hub-auth__links">
        <button className="hub-auth__link" type="button" onClick={cancelLink} disabled={loading}>
          {messages.linkUseCode}
        </button>
      </div>
    </div>
  );
}
