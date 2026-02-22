import { useState, useCallback, useEffect } from 'react';
import toast from 'react-hot-toast';
import { api } from '../../services/api';

export const CATEGORY_LABELS = {
  'qa-forms': 'QA Forms',
  'job-files': 'Job Files',
  'customer-property': 'Customer Property'
};

function base64ToBlob(base64, mimeType = 'application/pdf') {
  const bytes = atob(base64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mimeType });
}

export function useQuickActionFiles(jobCard) {
  const [scannerFiles, setScannerFiles] = useState([]);
  const [scannerLoading, setScannerLoading] = useState(false);
  const [attachingFile, setAttachingFile] = useState(null);
  const [savingPhotos, setSavingPhotos] = useState(false);

  // Document tabs: qa-forms, job-files, customer-property
  const [qaFormFiles, setQaFormFiles] = useState([]);
  const [qaFormFilesLoading, setQaFormFilesLoading] = useState(false);
  const [jobFiles, setJobFiles] = useState([]);
  const [jobFilesLoading, setJobFilesLoading] = useState(false);
  const [customerPropertyFiles, setCustomerPropertyFiles] = useState([]);
  const [customerPropertyLoading, setCustomerPropertyLoading] = useState(false);

  const [loadingFiles, setLoadingFiles] = useState(new Set());
  const [viewerUrl, setViewerUrl] = useState(null);
  const [lightboxPhoto, setLightboxPhoto] = useState(null);

  const loadScannerFiles = useCallback(async () => {
    setScannerLoading(true);
    try {
      const result = await api.getScannerFiles(10);
      setScannerFiles(result.files || []);
    } catch {
      toast.error('Failed to load scanner files');
      setScannerFiles([]);
    } finally {
      setScannerLoading(false);
    }
  }, []);

  const saveScannerFile = useCallback(async (file, category) => {
    if (!jobCard || !file) return;
    setAttachingFile(file.name);
    try {
      if (category === 'job-files') {
        await api.scannerToJobFiles(jobCard.id, file.path);
      } else if (category === 'customer-property') {
        await api.scannerToCustomerPropertyFiles(jobCard.id, file.path);
      } else {
        await api.scannerToQaFormFiles(jobCard.id, file.path);
      }
      toast.success(`Saved to ${CATEGORY_LABELS[category]}: ${file.name}`);
      loadScannerFiles();
      return 'scanner';
    } catch (err) {
      toast.error(err.message || 'Failed to save file');
      return null;
    } finally {
      setAttachingFile(null);
    }
  }, [jobCard, loadScannerFiles]);

  const savePhotos = useCallback(async (photos, category, clearPhotos) => {
    if (!jobCard || !photos || photos.length === 0) return;
    setSavingPhotos(true);
    try {
      const now = new Date();
      const timestamp = now.toISOString().replace(/[-:T]/g, '').slice(0, 15);

      for (let i = 0; i < photos.length; i++) {
        const photo = photos[i];
        const suffix = photos.length > 1 ? `_${i + 1}` : '';
        const filename = `photo_${timestamp}${suffix}.jpg`;
        const raw = photo.data.replace(/^data:image\/\w+;base64,/, '');

        if (category === 'job-files') {
          await api.uploadToJobFiles(jobCard.id, filename, raw);
        } else if (category === 'customer-property') {
          await api.uploadToCustomerPropertyFiles(jobCard.id, filename, raw);
        } else {
          await api.uploadToQaFormFiles(jobCard.id, filename, raw);
        }
      }
      toast.success(`${photos.length} photo(s) saved to ${CATEGORY_LABELS[category]}`);
      if (clearPhotos) clearPhotos();
      return 'camera';
    } catch (err) {
      toast.error(err.message || 'Failed to save photos');
      return null;
    } finally {
      setSavingPhotos(false);
    }
  }, [jobCard]);

  const loadQaFormFiles = useCallback(async () => {
    if (!jobCard) return;
    setQaFormFilesLoading(true);
    try {
      const files = await api.getQaFormFiles(jobCard.id);
      setQaFormFiles(files || []);
    } catch {
      toast.error('Failed to load QA forms');
      setQaFormFiles([]);
    } finally {
      setQaFormFilesLoading(false);
    }
  }, [jobCard]);

  const loadJobFiles = useCallback(async () => {
    if (!jobCard) return;
    setJobFilesLoading(true);
    try {
      const files = await api.getJobFiles(jobCard.id);
      setJobFiles(files || []);
    } catch {
      toast.error('Failed to load job files');
      setJobFiles([]);
    } finally {
      setJobFilesLoading(false);
    }
  }, [jobCard]);

  const loadCustomerPropertyFiles = useCallback(async () => {
    if (!jobCard) return;
    setCustomerPropertyLoading(true);
    try {
      const files = await api.getCustomerPropertyFiles(jobCard.id);
      setCustomerPropertyFiles(files || []);
    } catch {
      toast.error('Failed to load customer property files');
      setCustomerPropertyFiles([]);
    } finally {
      setCustomerPropertyLoading(false);
    }
  }, [jobCard]);

  const fileKey = (file, source) => `${source}:${file.name}`;

  const handleViewFile = useCallback(async (file, source) => {
    const key = fileKey(file, source);
    setLoadingFiles(prev => new Set(prev).add(key));
    try {
      let fileData;
      if (source === 'qa-forms') {
        fileData = await api.getQaFormFileData(jobCard.id, file.name);
      } else if (source === 'customer-property') {
        fileData = await api.getCustomerPropertyFileData(jobCard.id, file.name);
      } else {
        fileData = await api.getJobFileData(jobCard.id, file.name);
      }

      if (!fileData?.data) {
        toast.error('Failed to load file data');
        return;
      }

      if (fileData.mimeType?.startsWith('image/')) {
        setLightboxPhoto(`data:${fileData.mimeType || 'image/jpeg'};base64,${fileData.data}`);
      } else {
        const blob = base64ToBlob(fileData.data, fileData.mimeType || 'application/pdf');
        const url = URL.createObjectURL(blob);
        setViewerUrl(prev => { if (prev) URL.revokeObjectURL(prev); return url; });
      }
    } catch (err) {
      toast.error(err.message || 'Failed to view file');
    } finally {
      setLoadingFiles(prev => { const next = new Set(prev); next.delete(key); return next; });
    }
  }, [jobCard]);

  const closeViewer = useCallback(() => {
    setViewerUrl(prev => { if (prev) URL.revokeObjectURL(prev); return null; });
  }, []);

  const closeLightbox = useCallback(() => {
    setLightboxPhoto(null);
  }, []);

  const reset = useCallback(() => {
    setQaFormFiles([]);
    setJobFiles([]);
    setCustomerPropertyFiles([]);
    setLightboxPhoto(null);
    setViewerUrl(prev => { if (prev) URL.revokeObjectURL(prev); return null; });
  }, []);

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => setViewerUrl(prev => { if (prev) URL.revokeObjectURL(prev); return null; });
  }, []);

  return {
    scannerFiles, scannerLoading, attachingFile, loadScannerFiles,
    saveScannerFile, savingPhotos, savePhotos,
    qaFormFiles, qaFormFilesLoading, loadQaFormFiles,
    jobFiles, jobFilesLoading, loadJobFiles,
    customerPropertyFiles, customerPropertyLoading, loadCustomerPropertyFiles,
    loadingFiles, handleViewFile,
    viewerUrl, closeViewer,
    lightboxPhoto, setLightboxPhoto, closeLightbox,
    reset
  };
}
