import { useState, useCallback, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { api } from '../../services/api';

export const CATEGORIES = ['qa-form-files', 'job-files', 'customer-property-files'];

export const CATEGORY_LABELS = {
  'qa-form-files': 'QA Forms',
  'job-files': 'Job Files',
  'customer-property-files': 'Customer Property'
};

// Mirror the server's upload allowlist so the picker only offers (and only
// accepts) the file types the server will keep.
export const ACCEPTED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png', '.tiff', '.tif', '.bmp', '.gif'];
export const ACCEPT_ATTR = ACCEPTED_EXTENSIONS.join(',');
const MAX_UPLOAD_BYTES = 30 * 1024 * 1024;

function base64ToBlob(base64, mimeType = 'application/pdf') {
  const bytes = atob(base64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mimeType });
}

// Extract a lower-cased extension only when the name has a real base before
// the dot (so dotfile-style names like ".pdf" count as having no extension,
// matching the server's path.extname check).
function fileExtension(name) {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot).toLowerCase() : '';
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result || '';
      resolve(String(result).replace(/^data:[^;]*;base64,/, ''));
    };
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
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

  const [savingPhotos, setSavingPhotos] = useState(false);
  const [uploading, setUploading] = useState(false);

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

  const uploadPickedFiles = useCallback(async (fileList, category, onDone) => {
    if (!jobcardId || !fileList || fileList.length === 0) return;
    const chosen = Array.from(fileList);

    const tooBig = chosen.filter(f => f.size > MAX_UPLOAD_BYTES);
    const badType = chosen.filter(f => !ACCEPTED_EXTENSIONS.includes(fileExtension(f.name)));
    const valid = chosen.filter(f => !tooBig.includes(f) && !badType.includes(f));

    if (badType.length) toast.error(`Skipped (unsupported type): ${badType.map(f => f.name).join(', ')}`);
    if (tooBig.length) toast.error(`Skipped (over 30 MB): ${tooBig.map(f => f.name).join(', ')}`);
    if (valid.length === 0) { if (onDone) onDone(); return; }

    setUploading(true);
    try {
      let saved = 0;
      const failed = [];
      // Upload each file independently so one failure doesn't abandon the rest.
      for (const file of valid) {
        try {
          const raw = await readFileAsBase64(file);
          await api.uploadToJobcardFiles(jobcardId, category, file.name, raw);
          saved++;
        } catch (err) {
          failed.push(file.name);
        }
      }
      if (saved > 0) {
        toast.success(`${saved} file(s) saved to ${CATEGORY_LABELS[category]}`);
        refreshCount(category);
      }
      if (failed.length) toast.error(`Failed to upload: ${failed.join(', ')}`);
    } finally {
      setUploading(false);
      if (onDone) onDone();
    }
  }, [jobcardId, refreshCount]);

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
    uploading, uploadPickedFiles,
    savingPhotos, savePhotos,
    thumbnails, loadingFiles, handleViewFile,
    viewerUrl, closeViewer,
    lightboxPhoto, closeLightbox,
    reset
  };
}
