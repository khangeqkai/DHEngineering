// The colour each activity/history action word is tinted with. Kept in one place
// so the search page and the entity-history panel share one complete list and
// can't drift apart (they used to each carry their own, out-of-sync copy).
export const ACTION_COLORS = {
  create: 'var(--accent-ready)', update: 'var(--primary-accent)', delete: 'var(--accent-caution)',
  archive: 'var(--accent-safety)', unarchive: 'var(--primary-accent)',
  start_timer: 'var(--accent-ready)', stop_timer: 'var(--primary-accent)', discard_timer: 'var(--accent-caution)',
  add_time_entry: 'var(--accent-ready)', update_time_entry: 'var(--primary-accent)', delete_time_entry: 'var(--accent-caution)',
  add_note: 'var(--accent-ready)', delete_note: 'var(--accent-caution)',
  update_costing: 'var(--primary-accent)',
  update_qa_form: 'var(--primary-accent)', add_template: 'var(--accent-ready)', remove_template: 'var(--accent-caution)',
  upload_file: 'var(--accent-ready)', add_document: 'var(--accent-ready)',
  delete_file: 'var(--accent-caution)',
  add_photo: 'var(--accent-ready)', remove_photo: 'var(--accent-caution)',
  login: 'var(--accent-info)', login_failed: 'var(--accent-caution)',
  data_export: 'var(--accent-info)', data_import: 'var(--accent-info)',
};

// Resolve an action to its colour, falling back to muted text for anything new.
export const actionColor = (action) => ACTION_COLORS[action] || 'var(--text-secondary)';
