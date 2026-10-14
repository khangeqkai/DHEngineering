import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import { MessageCircle, ChevronLeft, Send, Trash2, Lock } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import Spinner from '../common/Spinner';
import { capitalizeFirst, formatDate, formatTime, toIsoDate } from '../../utils/formatters';
import { getInitials, getAvatarColor } from '../../utils/initials';
import './JobCommentsPanel.css';

// Comments by the same person this close together read as one run.
const GROUP_WINDOW_MS = 5 * 60 * 1000;

// The local calendar day a stored moment falls on (see dates-and-timezones.md).
function dayKeyOf(createdAt) {
  return toIsoDate(new Date(createdAt));
}

function dayLabel(createdAt) {
  const key = dayKeyOf(createdAt);
  const now = new Date();
  if (key === toIsoDate(now)) return 'Today';
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (key === toIsoDate(yesterday)) return 'Yesterday';
  return formatDate(createdAt, { weekday: 'short', day: 'numeric', month: 'short' });
}

// Same person, same local day, within the grouping window.
function sameRun(a, b) {
  if (!a || !b) return false;
  return a.userId === b.userId
    && dayKeyOf(a.createdAt) === dayKeyOf(b.createdAt)
    && Math.abs(new Date(b.createdAt) - new Date(a.createdAt)) < GROUP_WINDOW_MS;
}

export default function JobCommentsPanel({
  jobNumber,
  // Newest first, as the comments hook keeps them; shown oldest first here.
  notes,
  newNote,
  setNewNote,
  onAddNote,
  onDeleteNote,
  loading,
  loadError,
  onRetry,
  // True once this opening's first read of the thread has come back.
  notesLoaded,
  // Newest comment this person has read (UTC ISO), or null until the job itself has loaded.
  seenUpTo,
  // Tells the server the thread has been read up to this moment; resolves quietly either way.
  onMarkRead,
  canManage,
  // An invoiced (closed) job: comments can be read but not added or deleted until it
  // is unarchived (the server refuses both).
  locked = false
}) {
  const { user } = useAuth();
  // Closed until the one decision below is made.
  const [open, setOpen] = useState(false);
  // The first comment that was unread when this opening began; the "New" line sits above it.
  const [dividerNoteId, setDividerNoteId] = useState(null);
  const decidedRef = useRef(false);
  // True once the person has pressed the bubble or the close button themselves.
  const touchedRef = useRef(false);
  // Focus moves only for a press, never for the automatic opening.
  const focusOnChangeRef = useRef(false);
  const readAttemptRef = useRef(null);
  const bubbleRef = useRef(null);
  const draftRef = useRef(null);
  const threadRef = useRef(null);
  const lastSeenNewestRef = useRef(null);

  const thread = useMemo(() => [...(notes || [])].reverse(), [notes]);
  const count = thread.length;
  const newestId = count ? thread[count - 1].id : null;

  const myId = user?.id;
  const isUnread = useCallback(
    (note, since) => note.userId !== myId && note.createdAt > since,
    [myId]
  );
  const unreadCount = seenUpTo ? thread.filter(n => isUnread(n, seenUpTo)).length : 0;

  const changeOpen = useCallback((next) => {
    touchedRef.current = true;
    focusOnChangeRef.current = true;
    setOpen(next);
  }, []);

  // Decided once per opening of the job, as soon as both the job (how far this person has
  // read) and the first read of the thread are here: unread comments open the window,
  // otherwise it stays closed. Never decided again, so the window is not yanked open or
  // shut while they work; and if they already pressed the bubble, theirs stands.
  useEffect(() => {
    if (decidedRef.current || seenUpTo === null || !notesLoaded) return;
    decidedRef.current = true;
    const firstUnread = thread.find(n => isUnread(n, seenUpTo));
    setDividerNoteId(firstUnread ? firstUnread.id : null);
    if (firstUnread && !touchedRef.current) setOpen(true);
  }, [seenUpTo, notesLoaded, thread, isUnread]);

  // Focus follows a press: the typing box on open, the bubble on close. The automatic
  // opening takes no focus from the job.
  useEffect(() => {
    if (!focusOnChangeRef.current) return;
    focusOnChangeRef.current = false;
    if (open) draftRef.current?.focus({ preventScroll: true });
    else bubbleRef.current?.focus({ preventScroll: true });
  }, [open]);

  // Reading clears: whenever the window is open, the thread is loaded and its newest comment
  // is newer than what this person has read (their own post included), say so. One try per
  // newest comment; a failed try is retried the next time the window is opened.
  const newestAt = count ? thread[count - 1].createdAt : null;
  useEffect(() => {
    if (!open) {
      readAttemptRef.current = null;
      return;
    }
    if (!notesLoaded || loadError || seenUpTo === null || !newestAt) return;
    if (newestAt <= seenUpTo || readAttemptRef.current === newestAt) return;
    readAttemptRef.current = newestAt;
    onMarkRead?.(newestAt);
  }, [open, notesLoaded, loadError, seenUpTo, newestAt, onMarkRead]);

  // Pressing the bubble also re-reads the thread, so a comment posted from another PC while
  // this job sat open is there (and then counts as read, by the effect above).
  const handleBubble = () => {
    changeOpen(true);
    onRetry?.();
  };

  // Land on the newest comment when the window opens and when a new one arrives.
  useLayoutEffect(() => {
    if (!open) return;
    const el = threadRef.current;
    if (el && lastSeenNewestRef.current !== newestId) el.scrollTop = el.scrollHeight;
    lastSeenNewestRef.current = newestId;
  }, [open, newestId, loading, loadError]);
  useEffect(() => {
    if (!open) lastSeenNewestRef.current = null;
  }, [open]);

  // The typing box grows with its text, up to the height set in the stylesheet.
  useLayoutEffect(() => {
    const el = draftRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + (el.offsetHeight - el.clientHeight)}px`;
  }, [newNote, open, locked]);

  const canSend = !loading && newNote.trim().length > 0;

  // Pressing Send moves focus to the button, which then disables itself; keep the
  // cursor in the typing box so the next comment can follow straight away.
  const handleSend = () => {
    onAddNote();
    draftRef.current?.focus({ preventScroll: true });
  };

  const handleDraftKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (canSend) onAddNote();
    }
  };

  // Escape closes this window when focus is inside it; the job window behind stays.
  const handlePanelKeyDown = (e) => {
    if (e.key === 'Escape' && !e.defaultPrevented) {
      e.preventDefault();
      changeOpen(false);
    }
  };

  const renderThread = () => {
    if (loadError) {
      return (
        <div className="jc-chat-empty">
          <p>Couldn't load comments.</p>
          {onRetry && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={onRetry} disabled={loading}>
              Retry
            </button>
          )}
        </div>
      );
    }
    if (loading && count === 0) {
      return (
        <div className="jc-chat-empty" role="status">
          <Spinner size={24} />
        </div>
      );
    }
    if (count === 0) {
      return (
        <div className="jc-chat-empty">
          <MessageCircle size={40} strokeWidth={1.5} />
          <p>
            {locked
              ? 'No comments on this job.'
              : 'No comments on this job yet. Leave one for the team below.'}
          </p>
        </div>
      );
    }
    let lastDay = '';
    return thread.map((note, i) => {
      const prev = thread[i - 1];
      const next = thread[i + 1];
      const mine = user && note.userId === user.id;
      const follows = sameRun(prev, note);
      const continues = sameRun(note, next);
      const day = dayKeyOf(note.createdAt);
      const showDay = day !== lastDay;
      lastDay = day;
      const colour = getAvatarColor(note.userName || note.userId);
      return (
        <div key={note.id} className="jc-chat-item">
          {showDay && <div className="jc-chat-day">{dayLabel(note.createdAt)}</div>}
          {note.id === dividerNoteId && <div className="jc-chat-new">New</div>}
          <div className={`jc-msg ${mine ? 'jc-msg-mine' : 'jc-msg-theirs'}${follows ? ' jc-msg-follow' : ''}`}>
            {!mine && (
              <span
                className="jc-msg-avatar"
                style={follows ? undefined : { background: colour.bg, color: colour.fg }}
                aria-hidden="true"
              >
                {follows ? '' : getInitials(note.userName)}
              </span>
            )}
            <div className="jc-msg-body">
              {!mine && !follows && <div className="jc-msg-who">{note.userName}</div>}
              <div className="jc-msg-bubble">{note.text}</div>
              {!continues && (
                <div className="jc-msg-time">
                  {formatTime(note.createdAt, { hour: '2-digit', minute: '2-digit' })}
                </div>
              )}
            </div>
            {canManage && !locked && (
              <button
                type="button"
                className="jc-msg-delete"
                onClick={() => onDeleteNote(note.id)}
                disabled={loading}
                aria-label="Delete comment"
                title="Delete comment"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </div>
      );
    });
  };

  return (
    <div className={`jc-aside${open ? ' jc-aside-open' : ''}`}>
      <div className="jc-bubble-gutter">
        <button
          ref={bubbleRef}
          type="button"
          className="jc-bubble"
          onClick={handleBubble}
          aria-label={unreadCount > 0 ? `Open comments (${unreadCount} new)` : 'Open comments'}
          aria-controls="job-comments-window"
          inert={open ? '' : undefined}
        >
          <MessageCircle size={24} />
          {unreadCount > 0 && <span className="jc-bubble-count">{unreadCount}</span>}
        </button>
      </div>

      <aside
        id="job-comments-window"
        className="jc-chat"
        aria-label="Job comments"
        inert={open ? undefined : ''}
        onKeyDown={handlePanelKeyDown}
      >
        <div className="jc-chat-inner">
          <div className="jc-chat-head">
            <div className="jc-chat-titles">
              <h2 className="jc-chat-title">Comments</h2>
              <div className="jc-chat-sub">
                {jobNumber ? `${jobNumber}, ` : ''}{count} {count === 1 ? 'comment' : 'comments'}{unreadCount > 0 ? `, ${unreadCount} new` : ''}
              </div>
            </div>
            <button
              type="button"
              className="jc-chat-close"
              onClick={() => changeOpen(false)}
              aria-label="Close comments"
              title="Close comments"
            >
              <ChevronLeft size={18} />
            </button>
          </div>

          <div ref={threadRef} className="jc-chat-thread">
            {renderThread()}
          </div>

          {locked ? (
            <div className="jc-chat-locked">
              <Lock size={14} />
              <span>This job is invoiced. Unarchive it to add comments.</span>
            </div>
          ) : (
            <>
              <div className="jc-chat-composer">
                <textarea
                  ref={draftRef}
                  aria-label="Write a comment"
                  value={newNote}
                  rows={1}
                  placeholder="Write a comment…"
                  className="jc-chat-input"
                  onChange={(e) => setNewNote(e.target.value)}
                  onKeyDown={handleDraftKeyDown}
                  onBlur={(e) => {
                    const formatted = capitalizeFirst(e.target.value);
                    if (formatted !== e.target.value) setNewNote(formatted);
                  }}
                />
                <button
                  type="button"
                  className="jc-chat-send"
                  onClick={handleSend}
                  disabled={!canSend}
                  aria-label="Send comment"
                >
                  <Send size={16} />
                </button>
              </div>
              <div className="jc-chat-hint">Enter to send, Shift+Enter for a new line</div>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
