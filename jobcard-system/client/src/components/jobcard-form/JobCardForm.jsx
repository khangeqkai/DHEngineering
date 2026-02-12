import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import PageHeader from '../common/PageHeader';
import { useJobCardFormState } from './useJobCardFormState';
import { useJobCardFormCamera } from './useJobCardFormCamera';
import JobDetailsSection from './sections/JobDetailsSection';
import CustomerInfoSection from './sections/CustomerInfoSection';
import PhotosSection from './sections/PhotosSection';
import PhotoModal from './PhotoModal';
import './JobCardForm.css';

export default function JobCardForm() {
  const { id } = useParams();
  const navigate = useNavigate();

  // Form state hook
  const {
    isEdit,
    loading,
    saving,
    formData,
    photos,
    handleChange,
    handleSubmit,
    loadJobCard,
    addPhoto,
    removePhoto
  } = useJobCardFormState(id, navigate);

  // Camera hook
  const {
    cameraActive,
    cameraReady,
    cameraDebug,
    videoRef,
    startCamera,
    stopCamera,
    capturePhoto
  } = useJobCardFormCamera();

  // Photo modal state
  const [selectedPhoto, setSelectedPhoto] = useState(null);

  // Load job card data on mount if editing
  useEffect(() => {
    if (isEdit) {
      loadJobCard();
    }
    return () => {
      stopCamera();
    };
  }, [id]);

  // Handle photo capture
  const handleCapturePhoto = () => {
    const photo = capturePhoto();
    if (photo) {
      addPhoto(photo);
    }
  };

  // Handle form submission
  const onSubmit = (e) => {
    handleSubmit(e, photos);
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

      <form onSubmit={onSubmit}>
        <div className="form-grid">
          <JobDetailsSection formData={formData} handleChange={handleChange} />
          <CustomerInfoSection customer={formData.customer} handleChange={handleChange} />
          <PhotosSection
            photos={photos}
            cameraActive={cameraActive}
            cameraReady={cameraReady}
            cameraDebug={cameraDebug}
            videoRef={videoRef}
            startCamera={startCamera}
            stopCamera={stopCamera}
            onCapturePhoto={handleCapturePhoto}
            onRemovePhoto={removePhoto}
            onPhotoClick={setSelectedPhoto}
          />
        </div>

        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving...' : isEdit ? 'Update Job Card' : 'Create Job Card'}
          </button>
        </div>
      </form>

      <PhotoModal photo={selectedPhoto} onClose={() => setSelectedPhoto(null)} />
    </div>
  );
}
