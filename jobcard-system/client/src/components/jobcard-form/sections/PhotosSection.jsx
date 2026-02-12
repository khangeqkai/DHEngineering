export default function PhotosSection({
  photos,
  cameraActive,
  cameraReady,
  cameraDebug,
  videoRef,
  startCamera,
  stopCamera,
  onCapturePhoto,
  onRemovePhoto,
  onPhotoClick
}) {
  return (
    <div className="card full-width">
      <div className="card-header">
        <h2>Photos</h2>
        {!cameraActive ? (
          <button type="button" className="btn btn-secondary btn-sm" onClick={startCamera}>
            Open Camera
          </button>
        ) : (
          <button type="button" className="btn btn-secondary btn-sm" onClick={stopCamera}>
            Close Camera
          </button>
        )}
      </div>
      <div className="card-body">
        {cameraActive && (
          <div className="camera-container">
            <div className="video-wrapper">
              <video ref={videoRef} autoPlay playsInline muted />
              {!cameraReady && (
                <div className="camera-loading">
                  <div className="spinner"></div>
                  <p>Initializing camera...</p>
                  {cameraDebug && (
                    <p style={{ fontSize: '0.75rem', marginTop: '0.5rem', opacity: 0.8 }}>
                      {cameraDebug}
                    </p>
                  )}
                </div>
              )}
              {cameraReady && (
                <div className="camera-ready-indicator">
                  <span className="ready-dot"></span> Camera Ready
                </div>
              )}
            </div>
            <button
              type="button"
              className="btn btn-primary"
              onClick={onCapturePhoto}
              disabled={!cameraReady}
            >
              {cameraReady ? 'Capture Photo' : 'Waiting for camera...'}
            </button>
          </div>
        )}

        {photos.length > 0 && (
          <div className="photos-grid">
            {photos.map((photo) => (
              <div key={photo.id} className="photo-item">
                <img
                  src={photo.data}
                  alt="Captured"
                  onClick={() => onPhotoClick(photo)}
                  style={{ cursor: 'pointer' }}
                />
                <button
                  type="button"
                  className="photo-remove"
                  onClick={() => onRemovePhoto(photo.id)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {!cameraActive && photos.length === 0 && (
          <p style={{ color: 'var(--text-secondary)', textAlign: 'center' }}>
            No photos attached. Click "Open Camera" to add photos.
          </p>
        )}
      </div>
    </div>
  );
}
