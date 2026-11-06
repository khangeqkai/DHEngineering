import FieldError from '../common/FieldError';

export default function FoldersCard({ s }) {
  // A path the save refuses (missing, not a folder, a whole drive) marks the box.
  const folderError = s.errorFor('jobFoldersBase');
  return (
    <div className="card full-width">
      <div className="card-header">
        <h2>Job folders</h2>
      </div>
      <div className="card-body">
        <div className="setting-item">
          <div className="setting-info">
            <div className="setting-label">Main job folder</div>
            <div className="setting-description">
              The folder that holds every customer's folder. Adding a customer makes their folder in here by itself. Adding a job card makes a Job Files folder and a Customer Property folder for it inside that customer's folder.
            </div>
          </div>
        </div>
        <p className="settings-current">
          Currently: <strong>{s.settings?.jobFoldersBase || 'not set'}</strong>
        </p>
        <div className={folderError ? 'folder-input-group field-error' : 'folder-input-group'}>
          <input
            type="text"
            className="form-control"
            {...s.fieldProps('jobFoldersBase')}
            aria-label="Main job folder"
            value={s.jobFoldersBase}
            onChange={(e) => s.setJobFoldersBase(e.target.value)}
            placeholder="Choose the main job folder…"
            readOnly={!!window.electronAPI?.selectFolder}
          />
          <button
            type="button"
            className="btn btn-secondary"
            onClick={s.handleSelectJobFolders}
          >
            Browse...
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={s.handleSaveJobFolders}
            disabled={s.savingJobFolders}
          >
            {s.savingJobFolders ? 'Saving…' : 'Save'}
          </button>
        </div>
        <FieldError {...s.errorProps('jobFoldersBase')} message={folderError} />
      </div>
    </div>
  );
}
