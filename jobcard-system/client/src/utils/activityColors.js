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
// blue for something changed. These colour words, so they are the ink tokens
// (dark enough to read on every surface in both themes), never the bright
// signal fills — a bright green word on white reads at about 2:1.
export const ACTION_COLORS = {
  create: 'var(--success-ink)', update: 'var(--accent-text)', delete: 'var(--danger-ink)',
  archive: 'var(--accent-text)', unarchive: 'var(--accent-text)',
  assign: 'var(--success-ink)', unassign: 'var(--danger-ink)', self_assign: 'var(--success-ink)', self_unassign: 'var(--danger-ink)',
  start_timer: 'var(--success-ink)', stop_timer: 'var(--accent-text)', discard_timer: 'var(--danger-ink)',
  auto_stop_timer: 'var(--danger-ink)', confirm_finish: 'var(--accent-text)',
  add_time_entry: 'var(--success-ink)', update_time_entry: 'var(--accent-text)', delete_time_entry: 'var(--danger-ink)',
  add_note: 'var(--success-ink)', delete_note: 'var(--danger-ink)',
  update_costing: 'var(--accent-text)',
  add_template: 'var(--success-ink)', remove_template: 'var(--danger-ink)',
  upload_file: 'var(--success-ink)', reassign_file: 'var(--accent-text)', delete_file: 'var(--danger-ink)',
  login: 'var(--accent-text)', logout: 'var(--accent-text)', login_failed: 'var(--danger-ink)', pin_change_failed: 'var(--danger-ink)',
  data_export: 'var(--accent-text)', data_import: 'var(--accent-text)',
};

// Every action name the app knows about, in display order.
export const ACTION_NAMES = Object.keys(ACTION_COLORS);
