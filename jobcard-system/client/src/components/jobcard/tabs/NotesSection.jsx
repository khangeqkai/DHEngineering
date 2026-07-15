import { capitalizeFirst } from '../../../utils/formatters';

export default function NotesSection({
  notes,
  newNote,
  setNewNote,
  onAddNote,
  onDeleteNote,
  loading,
  loadError,
  onRetry,
  isAdmin
}) {
  return (
    <div className="form-section notes-section">
      <h3 className="form-section-title">Job Comments</h3>

      {/* Add note form */}
      <div className="notes-add">
        <textarea
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
          onBlur={(e) => {
            const formatted = capitalizeFirst(e.target.value);
            if (formatted !== e.target.value) setNewNote(formatted);
          }}
          placeholder="Add a comment for the team..."
          rows={2}
          className="notes-textarea"
        />
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={onAddNote}
          disabled={loading || !newNote.trim()}
        >
          Add Comment
        </button>
      </div>

      {/* Notes list */}
      {loadError ? (
        <p className="empty-message">
          Couldn't load comments.{' '}
          {onRetry && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={onRetry}
              disabled={loading}
            >
              Retry
            </button>
          )}
        </p>
      ) : notes.length === 0 ? (
        <p className="empty-message">No comments yet</p>
      ) : (
        <div className="notes-list">
          {notes.map(note => (
            <div key={note.id} className="note-card">
              <div className="note-header">
                <span className="note-author">{note.userName}</span>
                <span className="note-time">
                  {new Date(note.createdAt).toLocaleDateString('en-AU')} {new Date(note.createdAt).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}
                </span>
                {isAdmin && (
                  <button
                    type="button"
                    className="btn btn-danger btn-sm note-delete"
                    onClick={() => onDeleteNote(note.id)}
                    disabled={loading}
                  >
                    Delete
                  </button>
                )}
              </div>
              <div className="note-text">{note.text}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
