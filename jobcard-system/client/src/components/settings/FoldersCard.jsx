export default function FoldersCard({ s }) {
  return (
    <>
      <div className="card full-width">
        <div className="card-header">
          <h2>Scanner Folder</h2>
        </div>
        <div className="card-body">
          <div className="setting-item">
            <div className="setting-info">
              <div className="setting-label">Scanned Documents Folder</div>
              <div className="setting-description">
                Set the folder where scanned customer drawings are saved. Recent files from this folder will be available when creating job cards.
              </div>
            </div>
          </div>
          <div className="folder-input-group">
            <input
              type="text"
              className="form-control"
              value={s.scannerFolder}
              onChange={(e) => s.setScannerFolder(e.target.value)}
              placeholder="Select or enter scanner folder path..."
              readOnly={!!window.electronAPI?.selectFolder}
            />
            <button
              type="button"
              className="btn btn-secondary"
              onClick={s.handleSelectScannerFolder}
            >
              Browse...
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={s.handleSaveScannerFolder}
              disabled={s.savingSettings}
            >
              {s.savingSettings ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>

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
          <div className="folder-input-group">
            <input
              type="text"
              className="form-control"
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
        </div>
      </div>
    </>
  );
}
