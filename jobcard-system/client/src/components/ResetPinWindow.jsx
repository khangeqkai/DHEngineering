import { useState } from 'react';
import './ResetPinWindow.css';
import { KeyRound, Dices } from 'lucide-react';
import { api } from '../services/api';
import { validatePassword } from '../utils/formatters';
import { useFieldErrors, scrollFieldIntoView, showSaveRefusal } from '../hooks/useFieldErrors';
import BottomSheet from './common/BottomSheet';
import FieldError from './common/FieldError';
import { displayName } from '../../../server/src/shared/names';
import { isWeakPin } from '../../../server/src/shared/pin';

const PIN_BOXES = { pin: 'resetPin' };

// A made-up 4-digit PIN, skipping the ones too easy to guess (1111, 1234, ...).
function makePin() {
  for (;;) {
    const pin = String(crypto.getRandomValues(new Uint32Array(1))[0] % 10000).padStart(4, '0');
    if (!isWeakPin(pin)) return pin;
  }
}

const possessive = (name) => `${name}'s`;

/**
 * Management sets a new PIN for a worker. The PIN lives only in this window's own memory:
 * it is never put in a pop-up message, the activity trail or the logs. Once saved, the
 * window shows it once so it can be passed on, and forgets it when it closes.
 */
export default function ResetPinWindow({ user, onClose, onDone }) {
  const [pin, setPin] = useState('');
  const [saving, setSaving] = useState(false);
  // Set after saving: the PIN that was set, kept only to show it.
  const [doneWith, setDoneWith] = useState(null);
  const { setFieldErrors, clearAll, groupClass, errorFor, fieldProps, errorProps } = useFieldErrors(() => pin);
  const name = user ? displayName(user) : '';

  const close = () => {
    setPin('');
    setDoneWith(null);
    clearAll();
    onClose();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const problem = validatePassword(pin);
    if (problem) {
      setFieldErrors({ resetPin: problem });
      scrollFieldIntoView('resetPin');
      return;
    }
    setSaving(true);
    try {
      await api.resetUserPin(user.id, pin);
      clearAll();
      setDoneWith(pin);
      onDone();
    } catch (err) {
      showSaveRefusal(err, { boxFor: PIN_BOXES, setFieldErrors, fallback: 'Couldn\'t reset the PIN. Check the connection and try again.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet
      isOpen={Boolean(user)}
      onClose={close}
      title={doneWith ? 'PIN reset' : `Reset ${possessive(name)} PIN`}
      size="small"
    >
      {doneWith ? (
        <>
          <BottomSheet.Body>
            <p>
              <strong>{possessive(name)} PIN is now {doneWith}.</strong>{' '}
              {name} has been signed out. Tell {name}. They can change it in Settings.
            </p>
          </BottomSheet.Body>
          <BottomSheet.Footer>
            <button type="button" className="btn btn-primary" onClick={close}>Done</button>
          </BottomSheet.Footer>
        </>
      ) : (
        <>
          <BottomSheet.Body>
            <form id="reset-pin-form" onSubmit={handleSubmit} noValidate>
              <div className={groupClass('resetPin')}>
                <label htmlFor="resetPin">New PIN</label>
                <div className="reset-pin-row">
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={4}
                    autoComplete="off"
                    {...fieldProps('resetPin')}
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  />
                  <button type="button" className="btn btn-secondary" onClick={() => setPin(makePin())}>
                    <Dices size={16} /> Make one for me
                  </button>
                </div>
                <p className="field-hint">4 digits, numbers only. {name} is signed out when you save.</p>
                <FieldError {...errorProps('resetPin')} message={errorFor('resetPin')} />
              </div>
            </form>
          </BottomSheet.Body>
          <BottomSheet.Footer>
            <button type="submit" form="reset-pin-form" className="btn btn-primary" disabled={saving}>
              <KeyRound size={14} /> {saving ? 'Saving…' : 'Reset PIN'}
            </button>
          </BottomSheet.Footer>
        </>
      )}
    </BottomSheet>
  );
}
