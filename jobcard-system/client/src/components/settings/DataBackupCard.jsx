export default function DataBackupCard({ s }) {
  return (
    <div className="card full-width">
      <div className="card-header">
        <h2>Data Backup</h2>
      </div>
      <div className="card-body">
        <div className="setting-item backup-export-row">
          <div className="setting-info">
            <div className="setting-label">Export Full Backup</div>
            <div className="setting-description">
              Save all data (database + job folder files) to a ZIP file. Use this before updating or reinstalling the application. Save it outside the job folders location — a backup saved in there is refused, because restoring replaces everything in that folder. Older backups already kept in there are left out and listed, so they can be moved.
            </div>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={s.handleExportBackup}
            disabled={s.exporting || s.importing || !window.electronAPI}
          >
            {s.exporting ? 'Exporting...' : 'Export Backup'}
          </button>
        </div>
        <div className="setting-item">
          <div className="setting-info">
            <div className="setting-label">Import Backup</div>
            <div className="setting-description">
              Restore all data from a previously exported backup. This will replace all current data and files. The backup must sit outside the job folders location, and no other backups may be kept in there, or the restore would delete them.
            </div>
          </div>
          <button
            type="button"
            className="btn btn-danger"
            onClick={s.handleImportBackup}
            disabled={s.exporting || s.importing || !window.electronAPI}
          >
            {s.importing ? 'Importing...' : 'Import Backup'}
          </button>
        </div>
        {!window.electronAPI && (
          <p className="setting-description setting-description--spaced">
            Backup features require the desktop application.
          </p>
        )}
      </div>
    </div>
  );
}
