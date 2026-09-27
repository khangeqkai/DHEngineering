import FieldError from '../common/FieldError';

export default function FoldersCard({ s }) {
  // A path the save refuses (missing, not a folder, a whole drive) marks the box.
  const folderError = s.errorFor('jobFoldersBase');
  return (
    <div className="card full-width">
      <div className="card-header">
        <h2>Job Folders</h2>
      </div>
      <div className="card-body">
        <div className="setting-item">
          <div className="setting-info">
            <div className="setting-label">Job Folders Base Path</div>
            <div className="setting-description">
              Set the base folder where company and job card folders are automatically created. When a contact is created, a company folder is created here. When a job card is created, subfolders for Job Files, QA Forms, and Customer Property are created inside the company folder.
            </div>
          </div>
        </div>
        <div className={folderError ? 'folder-input-group field-error' : 'folder-input-group'}>
          <input
            type="text"
            className="form-control"
            {...s.fieldProps('jobFoldersBase')}
            aria-label="Job folders base path"
            value={s.jobFoldersBase}
            onChange={(e) => s.setJobFoldersBase(e.target.value)}
            placeholder="Select or enter job folders base path..."
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
            {s.savingJobFolders ? 'Saving...' : 'Save'}
          </button>
        </div>
        <FieldError {...s.errorProps('jobFoldersBase')} message={folderError} />
      </div>
    </div>
  );
}
