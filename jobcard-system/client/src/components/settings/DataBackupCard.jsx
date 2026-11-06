export default function DataBackupCard({ s }) {
  return (
    <div className="card full-width">
      <div className="card-header">
        <h2>Data Backup</h2>
      </div>
      <div className="card-body">
        <div className="setting-item backup-export-row">
          <div className="setting-info">
            <div className="setting-label">Save a backup</div>
            <div className="setting-description">
              Saves everything — every job and all their files — into one file. Do this before updating or reinstalling the app. Save it somewhere outside the main job folder, because restoring a backup wipes that folder. Older backups found in there are left out of the new one and listed, so you can move them.
            </div>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={s.handleExportBackup}
            disabled={s.exporting || s.importing || !window.electronAPI}
          >
            {s.exporting ? 'Saving…' : 'Save backup'}
          </button>
        </div>
        <div className="setting-item">
          <div className="setting-info">
            <div className="setting-label">Restore a backup</div>
            <div className="setting-description">
              Puts everything back to how it was when the backup was saved. Anything added since then will be lost. The backup file must be outside the main job folder, and no other backups can be kept in there, or the restore would delete them.
            </div>
          </div>
          <button
            type="button"
            className="btn btn-danger"
            onClick={s.handleImportBackup}
            disabled={s.exporting || s.importing || !window.electronAPI}
          >
            {s.importing ? 'Restoring…' : 'Restore backup'}
          </button>
        </div>
        {!window.electronAPI && (
          <p className="setting-description setting-description--spaced">
            Backups only work in the desktop app, not in a web browser.
          </p>
        )}
      </div>
    </div>
  );
}
