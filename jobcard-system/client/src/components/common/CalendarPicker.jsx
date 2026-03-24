import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

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

  useEffect(() => {
    if (!isOpen) return;
    const d = value ? new Date(value + 'T00:00:00') : new Date();
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  }, [isOpen, value]);

  useEffect(() => {
    if (!isOpen) return;

    calendarRef.current?.focus();

    const handleKeyDown = (e) => {
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
  }, [isOpen, onClose]);

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
      >
        {day}
      </button>
    );
  }

  return createPortal(
    <div className="calendar-overlay" onClick={onClose}>
      <div
        className="calendar-modal"
        ref={calendarRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Date picker"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="calendar-header">
          <button type="button" className="calendar-nav" onClick={prevMonth}>&lsaquo;</button>
          <span className="calendar-title">{MONTHS[viewMonth]} {viewYear}</span>
          <button type="button" className="calendar-nav" onClick={nextMonth}>&rsaquo;</button>
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
