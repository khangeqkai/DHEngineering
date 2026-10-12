import { useState, useEffect, useRef, useId } from 'react';
import { createPortal } from 'react-dom';
import { TriangleAlert } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../../services/api';
import { formatDate, formatTime } from '../../utils/formatters';
import { isoToLocalInput, localInputToIso } from '../jobcard/mappers';
import { useFieldErrors, fieldErrorsFromRefusal, scrollFieldIntoView } from '../../hooks/useFieldErrors';
import FieldError from './FieldError';
import Spinner from './Spinner';
import { infoToastIcon } from './toastIcons';
import { pushModal, removeModal, isTopModal } from './modalStack';
import { handleDialogKey } from './dialogKeys';
import { FINISH_ALREADY_CONFIRMED, RESTART_REFUSED } from '../../../../server/src/shared/runRefusals';
import { checkFinishAnswer } from '../../../../server/src/shared/finishAnswer';
import './FinishQuestionDialog.css';

// A server refusal's field name -> the box on this form.
const BOXES = { finishTime: 'finishTime' };

const clock = (iso) => formatTime(iso, { hour: '2-digit', minute: '2-digit' });
const day = (iso) => formatDate(iso, { weekday: 'long', day: 'numeric', month: 'long' });

// The blocking "your clock stopped by itself" question. One dialog whose two steps swap in
// place (the time box, then "still working?"); nothing is sent until the last step, and that
// one call carries every answer. The time can be earlier or later than the stored finish.
// There is no Escape, no click-outside and no close button: answering is the way out —
// so a refusal this dialog has no answer for is handed to onRecheck, which takes the
// question away when the server no longer lists it (its clock was deleted or changed).
export default function FinishQuestionDialog({ item, onAnswered, onRecheck }) {
  const modalId = useId();
  const dialogRef = useRef(null);
  const [step, setStep] = useState('B');
  const [finishLocal, setFinishLocal] = useState(() => (item.finishKnown ? isoToLocalInput(item.endTime) : ''));
  const [sending, setSending] = useState(false);
  const { setFieldErrors, groupClass, errorFor, fieldProps, errorProps } = useFieldErrors(() => finishLocal);

  useEffect(() => {
    pushModal(modalId);
    return () => removeModal(modalId);
  }, [modalId]);

  // Focus the first control of whichever step is showing.
  useEffect(() => {
    const first = dialogRef.current?.querySelector('input, button:not(:disabled)');
    first?.focus();
  }, [step]);

  // Escape does nothing; Tab stays inside the dialog.
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isTopModal(modalId)) return;
      handleDialogKey(e, {
        container: dialogRef.current,
        holdWhenEmpty: true,
        focusable: () => (dialogRef.current
          ? Array.from(dialogRef.current.querySelectorAll('input, button')).filter(el => !el.disabled)
          : [])
      });
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [modalId]);

  const checkFinish = () => {
    const iso = localInputToIso(finishLocal);
    return checkFinishAnswer({
      finishMs: iso ? new Date(iso).getTime() : NaN,
      startMs: new Date(item.startTime).getTime(),
      // Read at the moment of the check, never a value captured earlier.
      nowMs: Date.now(),
      ceilingMs: item.latestFinish ? new Date(item.latestFinish).getTime() : null
    });
  };

  const handleNext = () => {
    const message = checkFinish();
    if (message) {
      setFieldErrors({ finishTime: message });
      scrollFieldIntoView('finishTime');
      return;
    }
    setStep('C');
  };

  const send = async (stillWorking) => {
    if (sending) return;
    setSending(true);
    const body = { finishTime: localInputToIso(finishLocal), stillWorking };
    let entry;
    try {
      entry = await api.confirmFinish(item.jobcardId, item.id, body);
    } catch (err) {
      if (err?.data?.code === RESTART_REFUSED) {
        // Nothing was saved: stay on this step so the worker can try again or choose otherwise.
        setSending(false);
        toast.error(err.message, { id: 'finish-question-restart-refused' });
        return;
      }
      if (err?.data?.code !== FINISH_ALREADY_CONFIRMED) {
        const { marks } = fieldErrorsFromRefusal(err, BOXES);
        if (marks) {
          setSending(false);
          setStep('B');
          setFieldErrors(marks);
          return;
        }
        // Is there still a question to answer? If not, this dialog is already going away
        // (buttons stay disabled); nothing was saved and no clock is started.
        if (await onRecheck(item, err)) return;
        setSending(false);
        toast.error(err?.message || "Couldn't save your answer", { id: 'finish-question-failed' });
        return;
      }
      // Already settled. By the worker: the first press was saved but its reply was lost.
      // By the office: they saved or reopened the block while this question was showing,
      // so the time typed here was not kept — say so rather than pass it off as saved.
      // A retried "still working" settled by the worker's own first press already had its
      // clock started by the server; one settled by the office never did, so say that too.
      // There is no entry here; the null answer re-reads the questions and offers any stop
      // form still owed.
      if (err.data.settledBy === 'office') {
        const at = err.data.endTime ? ` at ${clock(err.data.endTime)} on ${day(err.data.endTime)}` : '';
        const notStarted = stillWorking ? ' Your clock was not started again — press Start on the job to carry on.' : '';
        toast(`The office has already settled this clock${at}. Your time was not saved — ask them if it needs correcting.${notStarted}`,
          { id: 'finish-question-settled', icon: infoToastIcon, duration: 8000 });
      }
      entry = null;
    }
    // The answer is saved; for "still working" the server has already started the new clock.
    // Buttons stay disabled: the answer is saved and the dialog is about to go away.
    // A stop form is opened only when the server says one is owed.
    onAnswered(!stillWorking && entry?.awaitingDetails ? entry : null, item);
  };

  // A clock whose part has since been removed has no part number to name.
  const where = item.itemNumber ? `job ${item.jobNumber}, part ${item.itemNumber}` : `job ${item.jobNumber}`;
  const min = isoToLocalInput(item.startTime);
  // The ceiling goes in only once it is already past; otherwise "not in the future" is
  // judged when the answer is checked, never from a value captured now.
  const max = item.latestFinish && new Date(item.latestFinish).getTime() <= Date.now()
    ? isoToLocalInput(item.latestFinish)
    : undefined;

  return createPortal(
    <div className="fq-overlay">
      <div
        className="fq-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="fq-title"
        aria-describedby="fq-description"
        ref={dialogRef}
      >
        <div className="fq-icon" aria-hidden="true">
          <TriangleAlert size={32} />
        </div>
        <h2 id="fq-title" className="fq-title">Your clock stopped by itself</h2>

        {step === 'B' && (
          <>
            {!item.finishKnown && (
              <p id="fq-description" className="fq-text">
                Your clock on {where} was started at {clock(item.startTime)} on {day(item.startTime)} and never stopped.
                What time did you finish?
              </p>
            )}
            {item.finishKnown && (
              <p id="fq-description" className="fq-text">
                Your clock on {where} stopped by itself at {clock(item.endTime)} on {day(item.endTime)} — the end of
                normal hours. When did you really finish? Change the time if you stopped earlier or kept working.
              </p>
            )}
            <div className={groupClass('finishTime')}>
              <label htmlFor="finishTime">Time you finished</label>
              <input
                {...fieldProps('finishTime')}
                type="datetime-local"
                className="form-control"
                value={finishLocal}
                min={min}
                max={max}
                onChange={(e) => setFinishLocal(e.target.value)}
              />
              <FieldError message={errorFor('finishTime')} {...errorProps('finishTime')} />
            </div>
            <div className="fq-actions">
              <button type="button" className="btn btn-primary" onClick={handleNext}>Next</button>
            </div>
          </>
        )}

        {step === 'C' && (
          <>
            <p id="fq-description" className="fq-text">Are you still working on this job?</p>
            <div className="fq-actions">
              <button type="button" className="btn btn-secondary" disabled={sending} onClick={() => setStep('B')}>
                Back
              </button>
              <button type="button" className="btn btn-secondary" disabled={sending} onClick={() => send(true)}>
                {sending && <Spinner size={16} />}
                Yes, start my clock again
              </button>
              <button type="button" className="btn btn-primary" disabled={sending} onClick={() => send(false)}>
                {sending && <Spinner size={16} />}
                No, I'm done with it
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
