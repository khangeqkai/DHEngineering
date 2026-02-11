import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../services/db';
import PageHeader from './common/PageHeader';

export default function JobCardForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(id);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    status: 'pending',
    customer: {
      name: '',
      phone: '',
      email: ''
    },
    notes: ''
  });
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraDebug, setCameraDebug] = useState('');
  const [photos, setPhotos] = useState([]);
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const checkIntervalRef = useRef(null);

  useEffect(() => {
    if (isEdit) {
      loadJobCard();
    }

    return () => {
      stopCamera();
    };
  }, [id]);

  // Handle camera stream when video element becomes available
  useEffect(() => {
    if (cameraActive && streamRef.current && videoRef.current) {
      setCameraDebug('Assigning stream to video element...');

      videoRef.current.srcObject = streamRef.current;

      // Wait for video to be ready
      const waitForVideo = () => {
        let attempts = 0;
        const maxAttempts = 50;

        if (checkIntervalRef.current) {
          clearInterval(checkIntervalRef.current);
        }

        checkIntervalRef.current = setInterval(() => {
          attempts++;

          if (!videoRef.current) {
            setCameraDebug(`ERROR: Video ref lost (attempt ${attempts})`);
            clearInterval(checkIntervalRef.current);
            return;
          }

          const width = videoRef.current.videoWidth;
          const height = videoRef.current.videoHeight;

          setCameraDebug(`Checking video... ${width}x${height} (attempt ${attempts}/${maxAttempts})`);

          if (width > 0 && height > 0) {
            setCameraDebug(`Camera ready! ${width}x${height}`);
            setCameraReady(true);
            clearInterval(checkIntervalRef.current);
          } else if (attempts >= maxAttempts) {
            setCameraDebug(`ERROR: Timeout - video dimensions still 0x0 after ${maxAttempts} attempts`);
            clearInterval(checkIntervalRef.current);
            alert('Camera failed to initialize. The video has no dimensions. Try using a different camera or reloading.');
          }
        }, 100);
      };

      waitForVideo();
    }
  }, [cameraActive, videoRef.current]);

  const loadJobCard = async () => {
    try {
      const card = await db.getJobCard(id);
      setFormData({
        title: card.title || '',
        description: card.description || '',
        status: card.status || 'pending',
        customer: card.customer || { name: '', phone: '', email: '' },
        notes: card.notes || ''
      });
      setPhotos(card.photos || []);
    } catch (err) {
      console.error('Failed to load job card:', err);
      alert('Job card not found');
      navigate('/jobcards');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name.startsWith('customer.')) {
      const field = name.split('.')[1];
      setFormData((prev) => ({
        ...prev,
        customer: { ...prev.customer, [field]: value }
      }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);

    try {
      const cardData = { ...formData, photos };

      if (isEdit) {
        await db.updateJobCard({ _id: id, ...cardData });
      } else {
        await db.createJobCard(cardData);
      }

      navigate('/jobcards');
    } catch (err) {
      console.error('Failed to save job card:', err);
      alert('Failed to save job card');
    } finally {
      setSaving(false);
    }
  };

  // Camera functions
  const startCamera = async () => {
    setCameraDebug('Requesting camera access...');

    try {
      // Get camera stream
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true
      });

      setCameraDebug('Camera stream obtained, waiting for video element...');
      streamRef.current = stream;
      setCameraActive(true); // This will trigger the video element to render and the useEffect to run

    } catch (err) {
      setCameraDebug(`ERROR: ${err.message}`);
      console.error('Failed to access camera:', err);
      alert('Could not access camera: ' + err.message);
      setCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (checkIntervalRef.current) {
      clearInterval(checkIntervalRef.current);
      checkIntervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
    setCameraReady(false);
    setCameraDebug('');
  };

  const capturePhoto = () => {
    if (!videoRef.current || !cameraReady) {
      console.warn('Camera not ready for capture');
      return;
    }

    // Check if video has valid dimensions (safety check)
    if (videoRef.current.videoWidth === 0 || videoRef.current.videoHeight === 0) {
      alert('Camera is not ready yet. Please wait a moment and try again.');
      setCameraReady(false); // Reset ready state
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoRef.current, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
    setPhotos((prev) => [...prev, { id: Date.now(), data: dataUrl }]);
  };

  const removePhoto = async (photoId) => {
    // Update local state
    const updatedPhotos = photos.filter((p) => p.id !== photoId);
    setPhotos(updatedPhotos);

    // Auto-save to database if editing existing job card
    if (isEdit && id) {
      try {
        await db.updateJobCard({
          _id: id,
          ...formData,
          photos: updatedPhotos
        });
        console.log('Photo deleted and saved to database');
      } catch (err) {
        console.error('Failed to save photo deletion:', err);
        alert('Failed to save photo deletion. Please try saving the job card manually.');
        // Revert the deletion on error
        setPhotos(photos);
      }
    }
  };

  // Print function
  const handlePrint = async () => {
    if (window.electronAPI) {
      try {
        await window.electronAPI.print({ silent: false });
      } catch (err) {
        console.error('Print failed:', err);
        alert('Print failed');
      }
    } else {
      window.print();
    }
  };

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <div className="jobcard-form">
      <PageHeader title={isEdit ? 'Edit Job Card' : 'New Job Card'}>
        {isEdit && (
          <button className="btn btn-secondary" onClick={handlePrint}>
            Print
          </button>
        )}
        <button className="btn btn-secondary" onClick={() => navigate('/jobcards')}>
          Cancel
        </button>
      </PageHeader>

      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="card">
            <div className="card-header">
              <h2>Job Details</h2>
            </div>
            <div className="card-body">
              <div className="form-group">
                <label htmlFor="title">Title *</label>
                <input
                  type="text"
                  id="title"
                  name="title"
                  value={formData.title}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="description">Description</label>
                <textarea
                  id="description"
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  rows={4}
                />
              </div>

              <div className="form-group">
                <label htmlFor="status">Status</label>
                <select id="status" name="status" value={formData.status} onChange={handleChange}>
                  <option value="pending">Pending</option>
                  <option value="in-progress">In Progress</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="notes">Notes</label>
                <textarea
                  id="notes"
                  name="notes"
                  value={formData.notes}
                  onChange={handleChange}
                  rows={3}
                />
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h2>Customer Information</h2>
            </div>
            <div className="card-body">
              <div className="form-group">
                <label htmlFor="customer.name">Name</label>
                <input
                  type="text"
                  id="customer.name"
                  name="customer.name"
                  value={formData.customer.name}
                  onChange={handleChange}
                />
              </div>

              <div className="form-group">
                <label htmlFor="customer.phone">Phone</label>
                <input
                  type="tel"
                  id="customer.phone"
                  name="customer.phone"
                  value={formData.customer.phone}
                  onChange={handleChange}
                />
              </div>

              <div className="form-group">
                <label htmlFor="customer.email">Email</label>
                <input
                  type="email"
                  id="customer.email"
                  name="customer.email"
                  value={formData.customer.email}
                  onChange={handleChange}
                />
              </div>
            </div>
          </div>

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
                    onClick={capturePhoto}
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
                        onClick={() => setSelectedPhoto(photo)}
                        style={{ cursor: 'pointer' }}
                      />
                      <button
                        type="button"
                        className="photo-remove"
                        onClick={() => removePhoto(photo.id)}
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
        </div>

        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving...' : isEdit ? 'Update Job Card' : 'Create Job Card'}
          </button>
        </div>
      </form>

      {/* Photo Quick View Modal */}
      {selectedPhoto && (
        <div className="photo-modal" onClick={() => setSelectedPhoto(null)}>
          <div className="photo-modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="photo-modal-close" onClick={() => setSelectedPhoto(null)}>
              ×
            </button>
            <img src={selectedPhoto.data} alt="Full size preview" />
          </div>
        </div>
      )}

      <style>{`
        .form-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 1.5rem;
        }

        .full-width {
          grid-column: 1 / -1;
        }

        .form-actions {
          margin-top: 1.5rem;
          display: flex;
          justify-content: flex-end;
        }

        .camera-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1rem;
          margin-bottom: 1rem;
        }

        .video-wrapper {
          position: relative;
          width: 100%;
          max-width: 640px;
        }

        .camera-container video {
          width: 100%;
          border-radius: 0.5rem;
          background: black;
          display: block;
        }

        .camera-loading {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background: rgba(0, 0, 0, 0.7);
          border-radius: 0.5rem;
          color: white;
          gap: 1rem;
        }

        .spinner {
          width: 40px;
          height: 40px;
          border: 4px solid rgba(255, 255, 255, 0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .camera-ready-indicator {
          position: absolute;
          top: 0.5rem;
          left: 0.5rem;
          background: rgba(0, 128, 0, 0.9);
          color: white;
          padding: 0.25rem 0.75rem;
          border-radius: 1rem;
          font-size: 0.875rem;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .ready-dot {
          width: 8px;
          height: 8px;
          background: white;
          border-radius: 50%;
          animation: pulse 2s ease-in-out infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        .photos-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
          gap: 1rem;
        }

        .photo-item {
          position: relative;
          aspect-ratio: 4/3;
          border-radius: 0.5rem;
          overflow: hidden;
        }

        .photo-item img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .photo-remove {
          position: absolute;
          top: 0.5rem;
          right: 0.5rem;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          border: none;
          background: var(--danger-color);
          color: white;
          font-size: 1rem;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .photo-modal {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.9);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 9999;
          padding: 2rem;
        }

        .photo-modal-content {
          position: relative;
          max-width: 90vw;
          max-height: 90vh;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .photo-modal-content img {
          max-width: 100%;
          max-height: 90vh;
          object-fit: contain;
          border-radius: 0.5rem;
        }

        .photo-modal-close {
          position: absolute;
          top: -2.5rem;
          right: -2.5rem;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          border: 2px solid white;
          background: rgba(0, 0, 0, 0.7);
          color: white;
          font-size: 1.5rem;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.2s;
        }

        .photo-modal-close:hover {
          background: rgba(255, 255, 255, 0.2);
        }

        @media (max-width: 768px) {
          .form-grid {
            grid-template-columns: 1fr;
          }

          .photo-modal-close {
            top: 0.5rem;
            right: 0.5rem;
          }
        }
      `}</style>
    </div>
  );
}
