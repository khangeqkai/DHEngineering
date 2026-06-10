import { useState, useCallback, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { api } from '../../services/api';

export const CATEGORIES = ['qa-form-files', 'job-files', 'customer-property-files'];

export const CATEGORY_LABELS = {
  'qa-form-files': 'QA Forms',
  'job-files': 'Job Files',
  'customer-property-files': 'Customer Property'
};

function base64ToBlob(base64, mimeType = 'application/pdf') {
  const bytes = atob(base64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mimeType });
}

/**
 * Files hook scoped to a single job card. Lists, uploads, and views files
 * for one category at a time. Files are identified by filename on disk.
 */
export function useJobFiles(jobcardId) {
  const [counts, setCounts] = useState(
    () => Object.fromEntries(CATEGORIES.map(c => [c, null]))
  );
  const [filesByCategory, setFilesByCategory] = useState({});
  const [loadingByCategory, setLoadingByCategory] = useState({});

  const [scannerFiles, setScannerFiles] = useState([]);
  const [scannerLoading, setScannerLoading] = useState(false);
  const [attachingFile, setAttachingFile] = useState(null);
  const [savingPhotos, setSavingPhotos] = useState(false);

  const [thumbnails, setThumbnails] = useState(new Map());
  const [viewerUrl, setViewerUrl] = useState(null);
  const viewerUrlRef = useRef(null);
  const [lightboxPhoto, setLightboxPhoto] = useState(null);
  const [loadingFiles, setLoadingFiles] = useState(new Set());
  const thumbnailGenRef = useRef({});

  const fetchList = useCallback((category) => {
    if (!jobcardId) return Promise.resolve([]);
    return api.listJobcardFiles(jobcardId, category);
  }, [jobcardId]);

  const refreshCount = useCallback(async (category) => {
    if (!jobcardId) return;
    try {
      const list = await fetchList(category);
      setCounts(prev => ({ ...prev, [category]: (list || []).length }));
    } catch {
      setCounts(prev => ({ ...prev, [category]: 0 }));
    }
  }, [jobcardId, fetchList]);

  const refreshAllCounts = useCallback(async () => {
    if (!jobcardId) return;
    await Promise.all(CATEGORIES.map(refreshCount));
  }, [jobcardId, refreshCount]);

  const loadThumbnails = useCallback(async (fileList, category) => {
    const imageFiles = (fileList || []).filter(f => f.mimeType?.startsWith('image/'));
    if (imageFiles.length === 0) return;
    // Per-category generation so loading one folder doesn't cancel another's previews.
    const gen = (thumbnailGenRef.current[category] || 0) + 1;
    thumbnailGenRef.current[category] = gen;

    const concurrency = 4;
    for (let i = 0; i < imageFiles.length; i += concurrency) {
      if (thumbnailGenRef.current[category] !== gen) return;
      const batch = imageFiles.slice(i, i + concurrency);
      const results = await Promise.all(batch.map(async (file) => {
        try {
          const fileData = await api.getJobcardFile(jobcardId, category, file.name);
          if (fileData?.data) {
            return [`${category}/${file.name}`, `data:${fileData.mimeType || 'image/jpeg'};base64,${fileData.data}`];
          }
        } catch {
          return null;
        }
        return null;
      }));
      if (thumbnailGenRef.current[category] !== gen) return;
      setThumbnails(prev => {
        const next = new Map(prev);
        for (const r of results) if (r) next.set(r[0], r[1]);
        return next;
      });
    }
  }, [jobcardId]);

  const loadFiles = useCallback(async (category) => {
    if (!jobcardId) return;
    setLoadingByCategory(prev => ({ ...prev, [category]: true }));
    try {
      const list = await fetchList(category);
      setFilesByCategory(prev => ({ ...prev, [category]: list || [] }));
      setCounts(prev => ({ ...prev, [category]: (list || []).length }));
      loadThumbnails(list, category);
    } catch (err) {
      toast.error(err.message || 'Failed to load files');
      setFilesByCategory(prev => ({ ...prev, [category]: [] }));
    } finally {
      setLoadingByCategory(prev => ({ ...prev, [category]: false }));
    }
  }, [jobcardId, fetchList, loadThumbnails]);

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
    if (!jobcardId || !file) return;
    setAttachingFile(file.name);
    try {
      await api.scannerToJobcardFiles(jobcardId, category, file.path);
      toast.success(`Saved to ${CATEGORY_LABELS[category]}: ${file.name}`);
      loadScannerFiles();
      refreshCount(category);
    } catch (err) {
      toast.error(err.message || 'Failed to save file');
    } finally {
      setAttachingFile(null);
    }
  }, [jobcardId, loadScannerFiles, refreshCount]);

  const savePhotos = useCallback(async (photos, category, clearPhotos) => {
    if (!jobcardId || !photos || photos.length === 0) return;
    setSavingPhotos(true);
    try {
      const now = new Date();
      const timestamp = now.toISOString().replace(/[-:T]/g, '').slice(0, 15);
      for (let i = 0; i < photos.length; i++) {
        const photo = photos[i];
        const suffix = photos.length > 1 ? `_${i + 1}` : '';
        const filename = `photo_${timestamp}${suffix}.jpg`;
        const raw = photo.data.replace(/^data:image\/\w+;base64,/, '');
        await api.uploadToJobcardFiles(jobcardId, category, filename, raw);
      }
      toast.success(`${photos.length} photo(s) saved to ${CATEGORY_LABELS[category]}`);
      if (clearPhotos) clearPhotos();
      refreshCount(category);
    } catch (err) {
      toast.error(err.message || 'Failed to save photos');
    } finally {
      setSavingPhotos(false);
    }
  }, [jobcardId, refreshCount]);

  const handleViewFile = useCallback(async (file, category) => {
    const cachedThumb = file.mimeType?.startsWith('image/') ? thumbnails.get(`${category}/${file.name}`) : null;
    if (cachedThumb) {
      setLightboxPhoto(cachedThumb);
      return;
    }
    setLoadingFiles(prev => new Set(prev).add(file.name));
    try {
      const fileData = await api.getJobcardFile(jobcardId, category, file.name);
      if (!fileData?.data) {
        toast.error('Failed to load file data');
        return;
      }
      if (fileData.mimeType?.startsWith('image/')) {
        setLightboxPhoto(`data:${fileData.mimeType || 'image/jpeg'};base64,${fileData.data}`);
      } else {
        const blob = base64ToBlob(fileData.data, fileData.mimeType || 'application/pdf');
        const url = URL.createObjectURL(blob);
        if (viewerUrlRef.current) URL.revokeObjectURL(viewerUrlRef.current);
        viewerUrlRef.current = url;
        setViewerUrl(url);
      }
    } catch (err) {
      toast.error(err.message || 'Failed to view file');
    } finally {
      setLoadingFiles(prev => { const next = new Set(prev); next.delete(file.name); return next; });
    }
  }, [jobcardId, thumbnails]);

  const closeViewer = useCallback(() => {
    if (viewerUrlRef.current) URL.revokeObjectURL(viewerUrlRef.current);
    viewerUrlRef.current = null;
    setViewerUrl(null);
  }, []);

  const closeLightbox = useCallback(() => setLightboxPhoto(null), []);

  const reset = useCallback(() => {
    // Bump every category's generation (rather than zeroing) so any in-flight
    // thumbnail load is cancelled and can't collide with a later reload's gen.
    for (const c of CATEGORIES) {
      thumbnailGenRef.current[c] = (thumbnailGenRef.current[c] || 0) + 1;
    }
    setFilesByCategory({});
    setLoadingByCategory({});
    setThumbnails(new Map());
    setLightboxPhoto(null);
    if (viewerUrlRef.current) URL.revokeObjectURL(viewerUrlRef.current);
    viewerUrlRef.current = null;
    setViewerUrl(null);
  }, []);

  useEffect(() => {
    return () => {
      if (viewerUrlRef.current) {
        URL.revokeObjectURL(viewerUrlRef.current);
        viewerUrlRef.current = null;
      }
    };
  }, []);

  return {
    counts,
    refreshAllCounts,
    refreshCount,
    filesByCategory, loadingByCategory, loadFiles,
    scannerFiles, scannerLoading, loadScannerFiles, attachingFile, saveScannerFile,
    savingPhotos, savePhotos,
    thumbnails, loadingFiles, handleViewFile,
    viewerUrl, closeViewer,
    lightboxPhoto, closeLightbox,
    reset
  };
}
