import { Check, Minus } from 'lucide-react';
import { MAX_PRINT_FILES } from '../../../../server/src/shared/jobFiles';

// Shared constants and small pure helpers for the paperwork hub, split out to keep
// JobPaperworkHub.jsx focused on the panel itself.

// Order the packet (and the folder sections) follow: job files, then customer
// property.
export const ORDER = ['job-files', 'customer-property-files'];

// Most files that can go in one combined packet. The job card itself rides
// separately and doesn't count toward this.
export const MAX_PACKET_FILES = MAX_PRINT_FILES;

export const keyOf = (category, filename) => `${category}::${filename}`;

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
      {s === 'all' && <Check size={14} strokeWidth={3} />}
      {s === 'some' && <Minus size={14} strokeWidth={3} />}
    </span>
  );
}
