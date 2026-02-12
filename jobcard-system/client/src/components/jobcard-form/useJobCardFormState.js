import { useState, useCallback } from 'react';
import { db } from '../../services/db';

const DEFAULT_FORM_DATA = {
  title: '',
  description: '',
  status: 'pending',
  customer: {
    name: '',
    phone: '',
    email: ''
  },
  notes: ''
};

export function useJobCardFormState(id, navigate) {
  const isEdit = Boolean(id);
  const [formData, setFormData] = useState(DEFAULT_FORM_DATA);
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);

  const loadJobCard = useCallback(async () => {
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
  }, [id, navigate]);

  const handleChange = useCallback((e) => {
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
  }, []);

  const handleSubmit = useCallback(async (e, photosArray) => {
    e.preventDefault();
    setSaving(true);

    try {
      const cardData = { ...formData, photos: photosArray };

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
  }, [formData, isEdit, id, navigate]);

  const addPhoto = useCallback((photo) => {
    setPhotos((prev) => [...prev, photo]);
  }, []);

  const removePhoto = useCallback(async (photoId) => {
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
  }, [photos, isEdit, id, formData]);

  return {
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
  };
}
