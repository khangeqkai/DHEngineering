import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import { MessageCircle, ChevronLeft, Send, Trash2, Lock } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import Spinner from '../common/Spinner';
import { useComboboxNav } from './useComboboxNav';
import { findMentionSpans, displayNameOf, buildNameLookup, mentionedPeople, storedMentionsByName } from './mentionNames';
import FieldError from '../common/FieldError';
import { capitalizeFirst, formatDate, formatTime, isToday, toIsoDate } from '../../utils/formatters';
import { getInitials, getAvatarColor } from '../../utils/initials';
import './JobCommentsPanel.css';

// Comments by the same person this close together read as one run.
const GROUP_WINDOW_MS = 5 * 60 * 1000;

// The local calendar day a stored moment falls on (see dates-and-timezones.md).
function dayKeyOf(createdAt) {
  return toIsoDate(new Date(createdAt));
}

function dayLabel(createdAt) {
  if (isToday(createdAt)) return 'Today';
  const key = dayKeyOf(createdAt);
  const now = new Date();
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

// How many people the @ list shows at once, and the longest text after the @ it will
// still treat as a name being typed.
const MAX_MENTION_ROWS = 8;
const MAX_MENTION_QUERY = 30;

// Is the caret sitting in an @name being typed? Looks back from the caret for an @ that
// opens the text or follows whitespace; the text between is the query. Returns
// { start, query } or null.
function findMention(text, caret) {
  for (let i = caret - 1; i >= 0; i--) {
    const ch = text[i];
    if (ch === '\n' || caret - i - 1 > MAX_MENTION_QUERY) return null;
    if (ch === '@') {
      if (i > 0 && !/\s/.test(text[i - 1])) return null;
      const query = text.slice(i + 1, caret);
      if (query.startsWith(' ')) return null;
      return { start: i, query };
    }
  }
  return null;
}

// The text of one comment with each @name it mentions picked out. `lookup` is built from
// everyone on the staff list plus everyone the thread's comments mention (the same full set
// that decides who is asked at send time, plus anyone since archived), so a longer name is
// taken whole: "@Sam Jones" is the name Sam Jones, not "@Sam" followed by a surname. Only a
// name that is one of this comment's stored mentions is picked out; mentionNames.js decides
// which names those are (a first word only when sending would have read it as that person).
function renderCommentText(note, myId, lookup) {
  const mentions = (note.mentions || []).filter(m => m.name);
  if (mentions.length === 0) return note.text;
  const byName = storedMentionsByName(lookup, mentions, note.userName);
  const spans = findMentionSpans(note.text, lookup.names);
  const pieces = [];
  let at = 0;
  spans.forEach((span, i) => {
    const m = byName.get(span.name.toLowerCase());
    if (!m) return;
    if (span.start > at) pieces.push(note.text.slice(at, span.start));
    pieces.push(
      <span key={i} className={`jc-msg-mention${m.userId === myId ? ' is-me' : ''}`}>{note.text.slice(span.start, span.end)}</span>
    );
    at = span.end;
  });
  if (pieces.length === 0) return note.text;
  if (at < note.text.length) pieces.push(note.text.slice(at));
  return pieces;
}

export default function JobCommentsPanel({
  jobNumber,
  // Newest first, as the comments hook keeps them; shown oldest first here.
  notes,
  newNote,
  setNewNote,
  // Records a person picked from the @ list into the draft: ({ userId, name }).
  onPickMention,
  // True while the comment is being checked before sending (the box is read-only), and the
  // live "who will be asked" text for the draft ('' when it mentions nobody).
  checking = false,
  willAsk = '',
  // The refusal message for the comment box (or null) and the wiring that ties it to the box.
  commentError = null,
  commentFieldProps = {},
  commentErrorProps = {},
  // A comment to land on when the window opens for this opening of the job, or null.
  initialCommentNoteId = null,
  onAddNote,
  onDeleteNote,
  // True while the thread is being read; sending is true while a post or delete is saving.
  loading,
  sending = false,
  loadError,
  onRetry,
  // True once this opening's first read of the thread has come back.
  notesLoaded,
  // Newest comment this person has read (UTC ISO), or null until the job itself has loaded.
  seenUpTo,
  // Tells the server the thread has been read up to this moment; resolves quietly either way.
  onMarkRead,
  canManage,
  // Everyone who could be mentioned (the job window's cached, active-only staff list).
  employees = [],
  // An invoiced (closed) job: comments can be read but not added or deleted until it
  // is unarchived (the server refuses both).
  locked = false,
  // Controlled by the job window, which owns which side window is open: `open` says whether
  // this one is, onOpenChange(next) asks for it to open or close.
  open,
  onOpenChange,
  // True while the History window is open: this bubble steps out of the way, and the
  // automatic opening below waits.
  otherOpen = false
}) {
  const { user } = useAuth();
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
  const closeRef = useRef(null);
  const threadRef = useRef(null);
  const lastSeenNewestRef = useRef(null);
  // The comment this opening was asked to land on (set once, when it is found in the thread).
  const [targetNoteId, setTargetNoteId] = useState(null);
  const targetDoneRef = useRef(false);
  // The @name being typed right now.
  const [mention, setMention] = useState(null);
  const dismissedRef = useRef(null);
  const pendingCaretRef = useRef(null);

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
    onOpenChange(next);
  }, [onOpenChange]);

  // Decided once per opening of the job, as soon as both the job (how far this person has
  // read) and the first read of the thread are here: unread comments open the window,
  // otherwise it stays closed. Never decided again, so the window is not yanked open or
  // shut while they work; and if they already pressed the bubble, theirs stands.
  // A "yes" made while the other side window is up waits for it to close, then opens.
  const [autoOpenWanted, setAutoOpenWanted] = useState(false);
  useEffect(() => {
    if (decidedRef.current || seenUpTo === null || !notesLoaded) return;
    decidedRef.current = true;
    const firstUnread = thread.find(n => isUnread(n, seenUpTo));
    setDividerNoteId(firstUnread ? firstUnread.id : null);
    const target = initialCommentNoteId && thread.some(n => n.id === initialCommentNoteId)
      ? initialCommentNoteId
      : null;
    setTargetNoteId(target);
    if (firstUnread || target) setAutoOpenWanted(true);
  }, [seenUpTo, notesLoaded, thread, isUnread, initialCommentNoteId]);
  // When the wait was for the other window and its own close button (or Escape) has just
  // handed the keys back, focus is on that window's bubble or has dropped to the page; the
  // bubble is about to go inert behind this window, so focus is taken into this one, where
  // a normal opening puts it. Focus anywhere else (the person is working in the job) is left.
  const waitedForHistoryRef = useRef(false);
  useEffect(() => {
    if (!autoOpenWanted) return;
    if (otherOpen) { waitedForHistoryRef.current = true; return; }
    setAutoOpenWanted(false);
    if (touchedRef.current) return;
    const active = document.activeElement;
    const adrift = !active || active === document.body || !!active.closest?.('.jc-aside');
    if (waitedForHistoryRef.current && adrift) focusOnChangeRef.current = true;
    waitedForHistoryRef.current = false;
    onOpenChange(true);
  }, [autoOpenWanted, otherOpen, onOpenChange]);

  // Who answers to which @name: the staff list plus everyone the thread's comments mention
  // (someone since archived still reads whole), built once per thread or staff list. Sending
  // uses the staff list alone; this one is only for reading.
  const nameLookup = useMemo(
    () => buildNameLookup([...(employees || []), ...mentionedPeople(thread, employees)]),
    [employees, thread]
  );
  // Each comment's highlighted text, worked out once per change of thread or staff list
  // rather than on every keystroke in the typing box.
  const highlighted = useMemo(() => {
    const map = new Map();
    for (const note of thread) map.set(note.id, renderCommentText(note, myId, nameLookup));
    return map;
  }, [thread, myId, nameLookup]);

  const candidates = useMemo(() => {
    if (!mention) return [];
    const q = mention.query.toLowerCase();
    return employees
      .filter(u => u.id !== myId)
      .filter((u) => {
        if (!q) return true;
        const display = displayNameOf(u).toLowerCase();
        return display.startsWith(q)
          || display.split(/\s+/).some(w => w.startsWith(q))
          || (u.username || '').toLowerCase().startsWith(q);
      })
      .slice(0, MAX_MENTION_ROWS);
  }, [employees, mention, myId]);
  // A staff list re-read from elsewhere hands back the same people in a new array, which
  // would reset the list's highlight; keep the previous array while the ordered people are
  // unchanged. A different set of people is a new array and resets it, as it should.
  const matchesRef = useRef({ key: '', list: [] });
  const candidatesKey = candidates.map(u => u.id).join('\n');
  if (matchesRef.current.key !== candidatesKey) matchesRef.current = { key: candidatesKey, list: candidates };
  const matches = matchesRef.current.list;

  const pickMention = useCallback((index) => {
    const person = matches[index];
    if (checking || !person || !mention) return;
    const name = displayNameOf(person);
    const end = mention.start + 1 + mention.query.length;
    const inserted = `@${name} `;
    pendingCaretRef.current = mention.start + inserted.length;
    onPickMention?.({ userId: person.id, name });
    setNewNote(newNote.slice(0, mention.start) + inserted + newNote.slice(end));
    setMention(null);
    // The caret now sits after "@name ", which would find that same text as a query and
    // bring the list straight back; keep it shut until the person types on.
    dismissedRef.current = `${mention.start}:${name} `;
  }, [checking, matches, mention, newNote, onPickMention, setNewNote]);

  // The box is read-only while a comment is being checked, so the list stays shut then.
  const pickerOpen = !checking && matches.length > 0;
  const nav = useComboboxNav({ items: matches, isOpen: pickerOpen, onChoose: pickMention });

  // Look at where the caret is and open, update or close the @ list.
  const detectMention = (el) => {
    if (checking) return;
    let found = null;
    if (el.selectionStart === el.selectionEnd) found = findMention(el.value, el.selectionStart);
    // A dismissed list stays shut while the caret is still on the same text; moving off
    // it or typing on forgets the dismissal.
    if (found && dismissedRef.current === `${found.start}:${found.query}`) found = null;
    else dismissedRef.current = null;
    setMention(prev => (
      (prev === null && found === null) || (prev && found && prev.start === found.start && prev.query === found.query)
        ? prev
        : found
    ));
  };

  // A check that starts with the list open closes it.
  useEffect(() => { if (checking) setMention(null); }, [checking]);

  // After a pick the caret goes just past the inserted name.
  useLayoutEffect(() => {
    const pos = pendingCaretRef.current;
    const el = draftRef.current;
    if (pos === null || !el) return;
    pendingCaretRef.current = null;
    el.setSelectionRange(pos, pos);
  }, [newNote]);

  // Focus follows a press: the typing box on open (the close button when the job is
  // locked and there is no typing box, or focus would drop to the page behind the
  // now-inert bubble), the bubble on close. The automatic opening takes no focus from
  // the job.
  useEffect(() => {
    if (!focusOnChangeRef.current) return;
    focusOnChangeRef.current = false;
    if (open) (draftRef.current || closeRef.current)?.focus({ preventScroll: true });
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
    const landingOnTarget = targetNoteId && !targetDoneRef.current;
    if (el && !landingOnTarget && lastSeenNewestRef.current !== newestId) el.scrollTop = el.scrollHeight;
    lastSeenNewestRef.current = newestId;
  }, [open, newestId, loading, loadError, targetNoteId]);

  // Once per opening: bring the asked-for comment to the middle of the thread and put the
  // cursor in the typing box, since the person came to reply.
  useLayoutEffect(() => {
    if (!open || !targetNoteId || targetDoneRef.current) return;
    const box = threadRef.current;
    const el = box?.querySelector(`[data-note-id="${CSS.escape(targetNoteId)}"]`);
    if (!box || !el) return;
    targetDoneRef.current = true;
    const boxRect = box.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    box.scrollTop += (elRect.top - boxRect.top) - (box.clientHeight - elRect.height) / 2;
    draftRef.current?.focus({ preventScroll: true });
  }, [open, targetNoteId, thread, loading, loadError]);
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

  const canSend = !sending && newNote.trim().length > 0;

  // Pressing Send moves focus to the button, which then disables itself; keep the
  // cursor in the typing box so the next comment can follow straight away.
  const handleSend = () => {
    onAddNote();
    draftRef.current?.focus({ preventScroll: true });
  };

  const handleDraftKeyDown = (e) => {
    if (pickerOpen && !e.nativeEvent.isComposing) {
      if (e.key === 'Escape') {
        // Closes the list only; the comments window's own Escape sees defaultPrevented.
        e.preventDefault();
        if (mention) dismissedRef.current = `${mention.start}:${mention.query}`;
        setMention(null);
        return;
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        nav.handleKeyDown(e);
        return;
      }
      if ((e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) && nav.activeIndex >= 0) {
        e.preventDefault();
        nav.choose(nav.activeIndex);
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        // Nothing highlighted: Enter must not send a half-typed @name. It closes the list
        // as Escape does; the next Enter sends.
        e.preventDefault();
        if (mention) dismissedRef.current = `${mention.start}:${mention.query}`;
        setMention(null);
        return;
      }
    }
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
          <div data-note-id={note.id} className={`jc-msg${note.id === targetNoteId ? ' jc-msg--target' : ''} ${mine ? 'jc-msg-mine' : 'jc-msg-theirs'}${follows ? ' jc-msg-follow' : ''}${continues ? ' jc-msg-continues' : ''}`}>
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
              <div className="jc-msg-bubble">{highlighted.get(note.id) ?? note.text}</div>
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
                disabled={sending}
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
    <div className={`jc-aside${open ? ' jc-aside-open' : ''}${otherOpen ? ' jc-aside-other-open' : ''}`}>
      <div className="jc-bubble-gutter">
        <button
          ref={bubbleRef}
          type="button"
          className="jc-bubble"
          onClick={handleBubble}
          aria-label={unreadCount > 0 ? `Open comments (${unreadCount} new)` : 'Open comments'}
          aria-controls="job-comments-window"
          inert={open || otherOpen ? '' : undefined}
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
              ref={closeRef}
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
                {pickerOpen && (
                  <ul id={nav.listId} className="jc-mention-list" role="listbox" aria-label="People to mention">
                    {matches.map((u, i) => {
                      const name = displayNameOf(u);
                      const colour = getAvatarColor(name || u.id);
                      return (
                        <li
                          key={u.id}
                          id={`${nav.listId}-opt-${i}`}
                          role="option"
                          aria-selected={i === nav.activeIndex}
                          className={`jc-mention-row${i === nav.activeIndex ? ' is-active' : ''}`}
                          // mousedown, not click: the box must keep focus so its blur does not close the list
                          onMouseDown={(e) => { e.preventDefault(); nav.choose(i); }}
                        >
                          <span className="jc-mention-avatar" style={{ background: colour.bg, color: colour.fg }} aria-hidden="true">
                            {getInitials(name)}
                          </span>
                          <span className="jc-mention-name">{name}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <textarea
                  ref={draftRef}
                  {...commentFieldProps}
                  aria-label="Write a comment"
                  value={newNote}
                  readOnly={checking}
                  rows={1}
                  placeholder="Write a comment…"
                  className="jc-chat-input"
                  role="combobox"
                  aria-autocomplete="list"
                  aria-expanded={pickerOpen}
                  aria-controls={pickerOpen ? nav.listId : undefined}
                  aria-activedescendant={pickerOpen && nav.activeIndex >= 0 ? `${nav.listId}-opt-${nav.activeIndex}` : undefined}
                  onChange={(e) => { setNewNote(e.target.value); detectMention(e.target); }}
                  onKeyDown={handleDraftKeyDown}
                  onSelect={(e) => detectMention(e.target)}
                  onBlur={(e) => {
                    setMention(null);
                    const formatted = capitalizeFirst(e.target.value);
                    if (!checking && formatted !== e.target.value) setNewNote(formatted);
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
              <FieldError message={commentError} {...commentErrorProps} />
              <div className="jc-chat-hint">{willAsk ? `Will ask: ${willAsk}` : 'Type @ to ask someone · Enter to send · Shift+Enter for a new line'}</div>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
