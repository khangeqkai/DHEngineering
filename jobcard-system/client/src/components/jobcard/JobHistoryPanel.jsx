import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { History, X, RefreshCw } from 'lucide-react';
import { formatTime, toIsoDate } from '../../utils/formatters';
import { describeEntry, dayHeading, KINDS } from '../../utils/historySentences';
import './JobCommentsPanel.css';
import './JobHistoryPanel.css';

// One sentence: bold bits for names, parts and new values, the old value in small grey.
function Sentence({ line }) {
  return (
    <>
      {line.parts.map((part, i) => (
        part.strong
          ? <strong key={i} className="history-strong">{part.text}</strong>
          : <span key={i}>{part.text}</span>
      ))}
      {line.was && <span className="history-was"> was {line.was}</span>}
    </>
  );
}

function HistoryEntry({ item }) {
  const [expanded, setExpanded] = useState(false);
  const { described, time } = item;
  const { kind, ring, headline, details } = described;
  const lone = details.length === 1;

  return (
    <li className="history-entry">
      <span className={`history-dot history-dot-${kind}${ring ? ' history-dot-ring' : ''}`} aria-hidden="true" />
      <div className="history-entry-body">
        <div className="history-entry-line">
          <p className="history-sentence"><Sentence line={headline} /></p>
          <span className="history-time">{time}</span>
        </div>
        {details.length > 1 && (
          <button
            type="button"
            className="history-toggle"
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? 'Hide' : `Show ${details.length} more`}
          </button>
        )}
        {(lone || (expanded && details.length > 1)) && (
          <ul className="history-details">
            {details.map((line, i) => (
              <li key={i} className="history-detail"><Sentence line={line} /></li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}

// The job's history in a window beside the job, opened from a bubble under the comments
// bubble. Controlled: the job window owns whether it is open.
export default function JobHistoryPanel({
  jobNumber,
  history = [],
  loading,
  loaded = false,
  failed = false,
  onRefresh,
  open,
  onOpenChange,
  // True while the other side window is open: this bubble steps out of the way.
  otherOpen = false
}) {
  // Which kinds are switched off. Plain state: it starts fresh each time the job opens.
  const [hidden, setHidden] = useState(() => new Set());
  const bubbleRef = useRef(null);
  const closeRef = useRef(null);
  // Focus moves only for a press, never when the window is opened or closed from outside.
  const focusOnChangeRef = useRef(false);

  const changeOpen = useCallback((next) => {
    focusOnChangeRef.current = true;
    onOpenChange(next);
  }, [onOpenChange]);

  useEffect(() => {
    if (!focusOnChangeRef.current) return;
    focusOnChangeRef.current = false;
    if (open) closeRef.current?.focus({ preventScroll: true });
    else bubbleRef.current?.focus({ preventScroll: true });
  }, [open]);

  const items = useMemo(() => history.map((entry, idx) => ({
    key: entry.id || idx,
    described: describeEntry(entry),
    time: formatTime(entry.createdAt, { hour: '2-digit', minute: '2-digit' }),
    day: entry.createdAt ? toIsoDate(new Date(entry.createdAt)) : '',
    createdAt: entry.createdAt
  })), [history]);

  const counts = useMemo(() => {
    const out = {};
    for (const it of items) out[it.described.kind] = (out[it.described.kind] || 0) + 1;
    return out;
  }, [items]);

  const days = useMemo(() => {
    const groups = [];
    for (const it of items) {
      if (hidden.has(it.described.kind)) continue;
      const last = groups[groups.length - 1];
      if (last && last.day === it.day) last.items.push(it);
      else groups.push({ day: it.day, heading: dayHeading(it.createdAt), items: [it] });
    }
    return groups;
  }, [items, hidden]);

  const toggleKind = (key) => setHidden((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });

  // Shift+click shows only that kind. Clicking the one kind left showing brings them all
  // back (hiding it would leave nothing at all).
  const presentKinds = KINDS.filter((k) => counts[k.key]);
  const shownKinds = presentKinds.filter((k) => !hidden.has(k.key));
  const handleChip = (e, key) => {
    const loneOn = presentKinds.length > 1 && shownKinds.length === 1 && shownKinds[0].key === key;
    if (loneOn) {
      setHidden(new Set());
    } else if (e.shiftKey) {
      setHidden(new Set(presentKinds.filter((k) => k.key !== key).map((k) => k.key)));
    } else {
      toggleKind(key);
    }
  };

  // Escape closes this window when focus is inside it; the job window behind stays.
  const handlePanelKeyDown = (e) => {
    if (e.key === 'Escape' && !e.defaultPrevented) {
      e.preventDefault();
      changeOpen(false);
    }
  };

  const count = history.length;
  // With any kind switched off, the count says how many of the whole are showing.
  const shownCount = items.filter((it) => !hidden.has(it.described.kind)).length;
  const filtered = hidden.size > 0;

  const renderBody = () => {
    // Only the first load blanks the window. A reload keeps the list on screen and swaps
    // it in place, so opened entries and the scroll position survive Refresh.
    if (count === 0 && (loading || !loaded)) {
      return <div className="loading history-loading">Loading this job&rsquo;s history&hellip;</div>;
    }
    // An empty list and a list that never arrived look the same, so say which.
    // Claiming the job has no history when the fetch simply failed is the more
    // expensive of the two to get wrong.
    if (count === 0) {
      return (
        <div className="empty-state">
          {failed
            ? 'This job’s history couldn’t be loaded. Press Refresh to try again.'
            : 'Nothing has happened on this job yet.'}
        </div>
      );
    }
    if (days.length === 0) {
      return <div className="empty-state">Nothing of that kind has happened on this job.</div>;
    }
    return (
      <div className="history-timeline">
        {days.map((group) => (
          <section key={group.day} className="history-day">
            <h3 className="history-day-heading">{group.heading}</h3>
            <ul className="history-entries">
              {group.items.map((item) => <HistoryEntry key={item.key} item={item} />)}
            </ul>
          </section>
        ))}
      </div>
    );
  };

  return (
    <div className={`jc-aside${open ? ' jc-aside-open' : ''}${otherOpen ? ' jc-aside-other-open' : ''}`}>
      <div className="jc-bubble-gutter">
        <button
          ref={bubbleRef}
          type="button"
          className="jc-bubble jc-bubble--history"
          onClick={() => changeOpen(true)}
          aria-label="Open job history"
          title="Open job history"
          aria-controls="job-history-window"
          inert={open || otherOpen ? '' : undefined}
        >
          <History size={24} />
        </button>
      </div>

      <aside
        id="job-history-window"
        className="jc-chat"
        aria-label="Job history"
        inert={open ? undefined : ''}
        onKeyDown={handlePanelKeyDown}
      >
        <div className="jc-chat-inner">
          <div className="jc-chat-head">
            <div className="jc-chat-titles">
              <h2 className="jc-chat-title">History</h2>
              <div className="jc-chat-sub">
                {jobNumber ? `${jobNumber}, ` : ''}{filtered ? `${shownCount} of ${count} changes` : `${count} ${count === 1 ? 'change' : 'changes'}`}
              </div>
            </div>
            <button
              type="button"
              className="jc-chat-close"
              onClick={onRefresh}
              aria-label="Refresh history"
              title="Refresh history"
            >
              <RefreshCw size={16} />
            </button>
            <button
              ref={closeRef}
              type="button"
              className="jc-chat-close"
              onClick={() => changeOpen(false)}
              aria-label="Close history"
              title="Close"
            >
              <X size={16} />
            </button>
          </div>

          <div className="history-filters">
            {presentKinds.map((k) => (
              <button
                key={k.key}
                type="button"
                className="history-chip"
                aria-pressed={!hidden.has(k.key)}
                title="Click to hide or show · Shift+click to show only this kind"
                onClick={(e) => handleChip(e, k.key)}
              >
                <span className={`history-chip-dot history-dot-${k.key}${k.key === 'alert' ? ' history-dot-ring' : ''}`} aria-hidden="true" />
                {k.label}
                <span className="history-chip-count">{counts[k.key]}</span>
              </button>
            ))}
          </div>

          <div className="jc-chat-thread history-body">
            {renderBody()}
          </div>
        </div>
      </aside>
    </div>
  );
}
