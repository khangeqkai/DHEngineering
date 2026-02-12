export default function PhotosTab({
  photos,
  cameraActive,
  cameraReady,
  startCamera,
  stopCamera,
  capturePhoto,
  removePhoto,
  setSelectedPhoto,
  videoRef
}) {
  return (
    <div className="modal-form-grid">
      <div className="form-section">
        <div className="form-section-header">
          <h3 className="form-section-title" data-section="PH">Photos</h3>
          {!cameraActive ? (
            <button type="button" className="btn btn-secondary btn-sm" onClick={startCamera}>Open Camera</button>
          ) : (
            <button type="button" className="btn btn-secondary btn-sm" onClick={stopCamera}>Close Camera</button>
          )}
        </div>

        {cameraActive && (
          <div className="camera-container">
            <video ref={videoRef} autoPlay playsInline muted />
            {cameraReady && (
              <button type="button" className="btn btn-primary" onClick={capturePhoto}>Capture</button>
            )}
          </div>
        )}

        {photos.length > 0 ? (
          <div className="photos-grid">
            {photos.map(photo => (
              <div key={photo.id} className="photo-item">
                <img src={photo.data} alt="Captured" onClick={() => setSelectedPhoto(photo)} />
                <button type="button" className="photo-remove" onClick={() => removePhoto(photo.id)}>×</button>
              </div>
            ))}
          </div>
        ) : (
          <p className="empty-message">No photos attached.</p>
        )}
      </div>
    </div>
  );
}
