// The colour each activity/history action word is tinted with. Kept in one place
// so the search page and the entity-history panel share one complete list and
// can't drift apart (they used to each carry their own, out-of-sync copy).
//
// This is also the list of actions the search page offers as filter chips, so it
// must stay in step with what the server actually records — every action name
// passed to recordHistory belongs here, and nothing else does. Insertion order
// is the order those chips appear in.
//
// The convention: green for something added, red for something taken away,
// blue for something changed.
export const ACTION_COLORS = {
  create: 'var(--accent-ready)', update: 'var(--primary-accent)', delete: 'var(--accent-caution)',
  archive: 'var(--accent-safety)', unarchive: 'var(--primary-accent)',
  assign: 'var(--accent-ready)', self_assign: 'var(--accent-ready)', self_unassign: 'var(--accent-caution)',
  start_timer: 'var(--accent-ready)', stop_timer: 'var(--primary-accent)', discard_timer: 'var(--accent-caution)',
  add_time_entry: 'var(--accent-ready)', update_time_entry: 'var(--primary-accent)', delete_time_entry: 'var(--accent-caution)',
  add_note: 'var(--accent-ready)', delete_note: 'var(--accent-caution)',
  update_costing: 'var(--primary-accent)',
  add_template: 'var(--accent-ready)', remove_template: 'var(--accent-caution)',
  upload_file: 'var(--accent-ready)', reassign_file: 'var(--primary-accent)', delete_file: 'var(--accent-caution)',
  login: 'var(--accent-info)', logout: 'var(--accent-info)', login_failed: 'var(--accent-caution)',
  data_export: 'var(--accent-info)', data_import: 'var(--accent-info)',
};

// Every action name the app knows about, in display order.
export const ACTION_NAMES = Object.keys(ACTION_COLORS);

// Resolve an action to its colour, falling back to muted text for anything new.
export const actionColor = (action) => ACTION_COLORS[action] || 'var(--text-secondary)';
