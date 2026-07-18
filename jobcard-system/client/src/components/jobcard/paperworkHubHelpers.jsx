import { Check, Minus } from 'lucide-react';

// Shared constants and small pure helpers for the paperwork hub, split out to keep
// JobPaperworkHub.jsx focused on the panel itself.

// Order the packet (and the folder sections) follow: job files, customer
// property, then QA forms last.
export const ORDER = ['job-files', 'customer-property-files', 'qa-form-files'];

// Most files that can go in one combined packet (matches the server's cap). The
// job card itself rides separately and doesn't count toward this.
export const MAX_PACKET_FILES = 20;

export const keyOf = (category, filename) => `${category}::${filename}`;

// Returned quality forms are stored with a hidden tag on the end of the name
// (e.g. "Completed Form 1 [20260614153027].pdf") so the system can tell a
// completed form apart from a blank template. Strip that trailing tag for
// display so the list reads cleanly as "Completed Form 1.pdf". The real name is
// still used everywhere else (selection, view, print).
export function cleanQaName(name) {
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 ? name.slice(dot) : '';
  const base = dot > 0 ? name.slice(0, dot) : name;
  return `${base.replace(/ \[[^\]]+\](?: \(\d+\))?$/, '')}${ext}`;
}

// A friendly one-word "what kind of file" line shown under each name.
export function fileKindLabel(f) {
  if ((f.mimeType || '').startsWith('image/')) return 'Image';
  const dot = f.name.lastIndexOf('.');
  const ext = dot > 0 ? f.name.slice(dot + 1).toUpperCase() : '';
  if (ext === 'PDF') return 'PDF document';
  return ext ? `${ext} file` : 'File';
}

// The one selection control used everywhere (rows, groups, the job card and the
// master switch) so the whole panel reads consistently. `state` is a tri-state:
// 'all' shows a tick, 'some' shows a dash (a group only partly picked), 'none' is
// empty. A plain boolean works too for single items.
export function PickCircle({ state }) {
  const s = state === true ? 'all' : state === false ? 'none' : state;
  return (
    <span className={`hub-check hub-check--${s}`} aria-hidden="true">
      {s === 'all' && <Check size={13} strokeWidth={3} />}
      {s === 'some' && <Minus size={13} strokeWidth={3} />}
    </span>
  );
}
