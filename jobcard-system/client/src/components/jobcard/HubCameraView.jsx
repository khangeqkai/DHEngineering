import { Camera, Check, ArrowLeft, X } from 'lucide-react';
import { CATEGORY_LABELS } from './useJobFiles';

// The camera capture screen shown inside the paperwork hub when a folder's Photo
// button is pressed. Purely presentational — all state lives in the hub and its
// useCamera/useJobFiles hooks; this receives them via props.
export default function HubCameraView({ camera, cameraCategory, savingPhotos, onBack, onSave }) {
  return (
    <div className="hub-body">
      <div className="hub-camera-sub">Adding to {CATEGORY_LABELS[cameraCategory]}</div>
      {camera.cameraError ? (
        <div className="hub-camera-error">
          <Camera size={32} />
          <p>{camera.cameraError}</p>
          <div className="hub-camera-error-actions">
            <button className="btn btn-secondary" onClick={onBack}><ArrowLeft size={16} /> Go back</button>
            <button className="btn btn-primary" onClick={() => camera.startCamera()}>Try again</button>
          </div>
        </div>
      ) : (
        <div className="hub-camera">
          <div className="hub-video-wrap"><video ref={camera.videoRef} autoPlay playsInline className="hub-video" /></div>
          <div className="hub-camera-actions">
            <button className="btn btn-primary" onClick={camera.capturePhoto} disabled={!camera.cameraReady}>
              <Camera size={16} /> Capture
            </button>
            {camera.photos.length > 0 && (
              <button className="btn btn-success" onClick={onSave} disabled={savingPhotos}>
                <Check size={16} /> Save {camera.photos.length} to {CATEGORY_LABELS[cameraCategory]}
              </button>
            )}
          </div>
          {camera.photos.length > 0 && (
            <div className="hub-photo-strip">
              {camera.photos.map(p => (
                <div key={p.id} className="hub-photo-thumb">
                  <img src={p.data} alt="Captured" />
                  <button className="hub-photo-remove" onClick={() => camera.removePhoto(p.id)}><X size={12} /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
