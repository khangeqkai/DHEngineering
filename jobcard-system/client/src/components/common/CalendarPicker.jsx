import { useState, useEffect, useRef, useId } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { pushModal, removeModal, isTopModal } from './modalStack';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

function toDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export default function CalendarPicker({ isOpen, value, onSelect, onClose }) {
  const initial = value ? new Date(value + 'T00:00:00') : new Date();
  const [viewYear, setViewYear] = useState(initial.getFullYear());
  const [viewMonth, setViewMonth] = useState(initial.getMonth());
  const calendarRef = useRef(null);
  const modalId = useId();

  useEffect(() => {
    if (!isOpen) return;
    const d = value ? new Date(value + 'T00:00:00') : new Date();
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  }, [isOpen, value]);

  // Join the shared modal stack while open. This calendar opens on top of the job
  // card dialog; registering makes it the top-most layer so the card behind stops
  // trapping Tab and stops closing on Escape meant for the calendar.
  useEffect(() => {
    if (!isOpen) return undefined;
    pushModal(modalId);
    return () => removeModal(modalId);
  }, [isOpen, modalId]);

  useEffect(() => {
    if (!isOpen) return;

    calendarRef.current?.focus();

    const handleKeyDown = (e) => {
      if (!isTopModal(modalId)) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
      if (e.key === 'Tab' && calendarRef.current) {
        const focusable = calendarRef.current.querySelectorAll('button:not([disabled]), [tabindex]:not([tabindex="-1"])');
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, modalId]);

  if (!isOpen) return null;

  const today = toDateString(new Date());
  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(viewYear - 1);
    } else {
      setViewMonth(viewMonth - 1);
    }
  };

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(viewYear + 1);
    } else {
      setViewMonth(viewMonth + 1);
    }
  };

  const handleSelect = (day) => {
    const dateStr = toDateString(new Date(viewYear, viewMonth, day));
    onSelect(dateStr);
    onClose();
  };

  // Target months for the nav buttons' accessible names, so the label says which
  // month pressing the button moves to rather than just "previous"/"next".
  const prevTargetMonth = viewMonth === 0 ? 11 : viewMonth - 1;
  const nextTargetMonth = viewMonth === 11 ? 0 : viewMonth + 1;

  const cells = [];
  for (let i = 0; i < firstDay; i++) {
    cells.push(<div key={`empty-${i}`} className="calendar-cell empty" />);
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = toDateString(new Date(viewYear, viewMonth, day));
    const isToday = dateStr === today;
    const isSelected = dateStr === value;
    cells.push(
      <button
        key={day}
        type="button"
        className={`calendar-cell${isToday ? ' today' : ''}${isSelected ? ' selected' : ''}`}
        onClick={() => handleSelect(day)}
        aria-label={`${day} ${MONTHS[viewMonth]} ${viewYear}`}
        aria-current={isToday ? 'date' : undefined}
        aria-pressed={isSelected}
      >
        {day}
      </button>
    );
  }

  return createPortal(
    <div className="calendar-overlay">
      <div
        className="calendar-modal"
        ref={calendarRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Date picker"
      >
        <div className="calendar-header">
          <button
            type="button"
            className="calendar-nav"
            onClick={prevMonth}
            aria-label={`Previous month, ${MONTHS[prevTargetMonth]}`}
          >
            <ChevronLeft size={16} />
          </button>
          <span className="calendar-title">{MONTHS[viewMonth]} {viewYear}</span>
          <button
            type="button"
            className="calendar-nav"
            onClick={nextMonth}
            aria-label={`Next month, ${MONTHS[nextTargetMonth]}`}
          >
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="calendar-grid">
          {DAYS.map(d => (
            <div key={d} className="calendar-day-label">{d}</div>
          ))}
          {cells}
        </div>
      </div>
    </div>,
    document.body
  );
}
