import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../services/db';

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
  const [photos, setPhotos] = useState([]);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => {
    if (isEdit) {
      loadJobCard();
    }

    return () => {
      stopCamera();
    };
  }, [id]);

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
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setCameraActive(true);
    } catch (err) {
      console.error('Failed to access camera:', err);
      alert('Could not access camera');
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;

    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    canvas.getContext('2d').drawImage(videoRef.current, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
    setPhotos((prev) => [...prev, { id: Date.now(), data: dataUrl }]);
  };

  const removePhoto = (photoId) => {
    setPhotos((prev) => prev.filter((p) => p.id !== photoId));
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
      <div className="page-header">
        <h1>{isEdit ? 'Edit Job Card' : 'New Job Card'}</h1>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {isEdit && (
            <button className="btn btn-secondary" onClick={handlePrint}>
              Print
            </button>
          )}
          <button className="btn btn-secondary" onClick={() => navigate('/jobcards')}>
            Cancel
          </button>
        </div>
      </div>

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
                  <video ref={videoRef} autoPlay playsInline />
                  <button type="button" className="btn btn-primary" onClick={capturePhoto}>
                    Capture Photo
                  </button>
                </div>
              )}

              {photos.length > 0 && (
                <div className="photos-grid">
                  {photos.map((photo) => (
                    <div key={photo.id} className="photo-item">
                      <img src={photo.data} alt="Captured" />
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

      <style>{`
        .page-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.5rem;
        }

        .page-header h1 {
          font-size: 1.5rem;
          font-weight: 600;
        }

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

        .camera-container video {
          width: 100%;
          max-width: 640px;
          border-radius: 0.5rem;
          background: black;
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

        @media (max-width: 768px) {
          .form-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
