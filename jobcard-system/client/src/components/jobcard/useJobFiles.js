import { useState, useCallback, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { api } from '../../services/api';
import { isJobClosedError } from '../../utils/jobLock';
import { readFileAsBase64, base64ToBlob } from '../../utils/fileData';
import { ALLOWED_FILE_EXTENSIONS, MAX_UPLOAD_BYTES, CATEGORY_FOLDER } from '../../../../server/src/shared/jobFiles';

export const CATEGORIES = Object.keys(CATEGORY_FOLDER);

// The folder map is keyed by on-disk folder name, which doubles as the label
// the screen shows for each category.
export const CATEGORY_LABELS = CATEGORY_FOLDER;

// Mirror the server's upload allowlist so the picker only offers (and only
// accepts) the file types the server will keep.
export const ACCEPTED_EXTENSIONS = ALLOWED_FILE_EXTENSIONS;
export const ACCEPT_ATTR = ACCEPTED_EXTENSIONS.join(',');

// Extract a lower-cased extension only when the name has a real base before
// the dot (so dotfile-style names like ".pdf" count as having no extension,
// matching the server's path.extname check).
function fileExtension(name) {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot).toLowerCase() : '';
}

// True (and handled) when err is the closed-job refusal and there's a handler for it.
function handledAsJobClosed(err, onJobClosed) {
  if (!isJobClosedError(err) || !onJobClosed) return false;
  onJobClosed();
  return true;
}

/**
 * Files hook scoped to a single job card. Lists, uploads, and views files
 * for one category at a time. Files are identified by filename on disk.
 *
 * onJobClosed (optional) is the job screen's shared closed-job handler: an upload,
 * re-tag or delete refused because the job was invoiced and closed from another PC
 * calls it (one message, and a reload that locks the screen) instead of the
 * ordinary failure toast.
 */
export function useJobFiles(jobcardId, { onJobClosed } = {}) {
  const onJobClosedRef = useRef(onJobClosed);
  onJobClosedRef.current = onJobClosed;

  const [counts, setCounts] = useState(
    () => Object.fromEntries(CATEGORIES.map(c => [c, null]))
  );
  const [filesByCategory, setFilesByCategory] = useState({});
  const [loadingByCategory, setLoadingByCategory] = useState({});

  const [savingPhotos, setSavingPhotos] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [assigningKeys, setAssigningKeys] = useState(new Set());
  const [deletingKeys, setDeletingKeys] = useState(new Set());

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
      // Leave the count as unknown (null) rather than claiming "0 files" — a
      // failed listing isn't proof the folder is empty.
      setCounts(prev => ({ ...prev, [category]: null }));
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
      // All three folders load at once when the Files panel opens, and they fail
      // together for the same reason (storage not set up, drive offline) — one
      // id per job so the three messages replace each other instead of stacking.
      toast.error(err.message || 'Failed to load files', { id: `files-load-${jobcardId}` });
      setFilesByCategory(prev => ({ ...prev, [category]: [] }));
    } finally {
      setLoadingByCategory(prev => ({ ...prev, [category]: false }));
    }
  }, [jobcardId, fetchList, loadThumbnails]);

  // Returns { saved, failed }: how many files were actually saved, and how many
  // were skipped or refused, so the caller can tell a clean try from one that
  // left something to retry.
  const uploadPickedFiles = useCallback(async (fileList, category, onDone, itemId = null) => {
    if (!jobcardId || !fileList || fileList.length === 0) return { saved: 0, failed: 0 };
    const chosen = Array.from(fileList);

    const tooBig = chosen.filter(f => f.size > MAX_UPLOAD_BYTES);
    const badType = chosen.filter(f => !ACCEPTED_EXTENSIONS.includes(fileExtension(f.name)));
    const valid = chosen.filter(f => !tooBig.includes(f) && !badType.includes(f));

    if (badType.length) toast.error(`Skipped (unsupported type): ${badType.map(f => f.name).join(', ')}`);
    if (tooBig.length) toast.error(`Skipped (over 30 MB): ${tooBig.map(f => f.name).join(', ')}`);
    const skipped = tooBig.length + badType.length;
    if (valid.length === 0) { if (onDone) onDone(); return { saved: 0, failed: skipped }; }

    setUploading(true);
    // A loading toast shows for the length of the upload, not just after it finishes.
    const toastId = toast.loading(valid.length > 1 ? `Uploading ${valid.length} files…` : 'Uploading…');
    try {
      let saved = 0;
      const failed = [];
      // Upload each file independently so one failure doesn't abandon the rest —
      // except the job being closed, which every remaining file would meet too.
      for (const file of valid) {
        try {
          const raw = await readFileAsBase64(file);
          await api.uploadToJobcardFiles(jobcardId, category, file.name, raw, itemId);
          saved++;
        } catch (err) {
          if (handledAsJobClosed(err, onJobClosedRef.current)) {
            toast.dismiss(toastId);
            if (saved > 0) refreshCount(category);
            return { saved: 0, failed: 0 };
          }
          failed.push({ name: file.name, message: err.message });
        }
      }
      if (saved > 0) {
        toast.success(`${saved} file(s) saved to ${CATEGORY_LABELS[category]}`, { id: toastId });
        refreshCount(category);
      } else {
        toast.dismiss(toastId);
      }
      // Name each failed file with the server's reason ("doesn't look like a
      // PDF", "that part was removed…") — the same as saving photos does — so
      // the user isn't left retrying something that can never work.
      if (failed.length) {
        const lines = failed.map(f => `${f.name}: ${f.message || "couldn't be uploaded, try again in a moment."}`);
        toast.error(`Failed to upload — ${lines.join('; ')}`);
      }
      return { saved, failed: failed.length + skipped };
    } finally {
      setUploading(false);
      if (onDone) onDone();
    }
  }, [jobcardId, refreshCount]);

  // `removePhoto(id)` is called right after each individual photo finishes
  // uploading — never a single "clear the whole strip" at the end. That's what
  // keeps this safe against two things happening at once: a photo captured while
  // this save is still running gets a new id and is never targeted, so it survives
  // (instead of being wiped by a blanket clear); and if an upload partway through
  // fails, everything before it is already gone from the strip, so a retry only
  // re-sends what didn't go up the first time.
  // Returns { saved, failed }, the same as uploadPickedFiles.
  const savePhotos = useCallback(async (photos, category, removePhoto, itemId = null) => {
    if (!jobcardId || !photos || photos.length === 0) return { saved: 0, failed: 0 };
    setSavingPhotos(true);
    // Photos go up one at a time and can take a while on a phone. Say so while it
    // runs, the same as picking files from disk already does.
    const toastId = toast.loading(photos.length > 1 ? `Saving ${photos.length} photos…` : 'Saving the photo…');
    let saved = 0;
    const failed = [];
    try {
      const now = new Date();
      // Local date/time, not UTC — a name built from midnight UTC can land on the
      // wrong calendar day everywhere west of it.
      const pad = (n) => String(n).padStart(2, '0');
      const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
      for (let i = 0; i < photos.length; i++) {
        const photo = photos[i];
        const suffix = photos.length > 1 ? `_${i + 1}` : '';
        const filename = `photo_${timestamp}${suffix}.jpg`;
        const raw = photo.data.replace(/^data:image\/\w+;base64,/, '');
        try {
          await api.uploadToJobcardFiles(jobcardId, category, filename, raw, itemId);
          saved++;
          if (removePhoto) removePhoto(photo.id);
        } catch (err) {
          if (handledAsJobClosed(err, onJobClosedRef.current)) {
            toast.dismiss(toastId);
            if (saved > 0) refreshCount(category);
            return { saved: 0, failed: 0 };
          }
          failed.push({ photo, message: err.message });
        }
      }
      if (saved > 0) refreshCount(category);
      if (failed.length === 0) {
        toast.success(`${saved} photo(s) saved to ${CATEGORY_LABELS[category]}`, { id: toastId });
      } else if (saved > 0) {
        toast.error(`${saved} photo(s) saved, but ${failed.length} didn't save — ${failed[0].message || 'try again for those.'}`, { id: toastId });
      } else {
        // Keep the server's reason (e.g. "This file is too large") — a fixed
        // "try again" would send the user retrying something that can never work.
        toast.error(failed[0].message || 'Could not save the photos — try again in a moment.', { id: toastId });
      }
      return { saved, failed: failed.length };
    } finally {
      setSavingPhotos(false);
    }
  }, [jobcardId, refreshCount]);

  // Re-tag a stored file so it belongs to a part (itemId) or to the whole job
  // (null), then reload that folder so the row shows its new owner/name. Re-tagging
  // renames the file on disk, so this returns the file's NEW name on success (or
  // the unchanged name) — the caller uses it to keep any per-file UI state (e.g. a
  // packet tick) attached across the rename. Returns null on failure.
  const assignFile = useCallback(async (category, filename, itemId) => {
    if (!jobcardId) return null;
    const key = `${category}/${filename}`;
    setAssigningKeys(prev => new Set(prev).add(key));
    try {
      const updated = await api.assignJobcardFile(jobcardId, category, filename, itemId);
      await loadFiles(category);
      return updated?.name || filename;
    } catch (err) {
      if (!handledAsJobClosed(err, onJobClosedRef.current)) toast.error(err.message || 'Could not change which part this file is for');
      return null;
    } finally {
      setAssigningKeys(prev => { const next = new Set(prev); next.delete(key); return next; });
    }
  }, [jobcardId, loadFiles]);

  // Remove a stored file from its folder, then reload that folder so the row
  // disappears. Returns true on success so the caller can drop any per-file UI
  // state (e.g. a packet tick) that was keyed on the now-gone name.
  const deleteFile = useCallback(async (category, filename) => {
    if (!jobcardId) return false;
    const key = `${category}/${filename}`;
    setDeletingKeys(prev => new Set(prev).add(key));
    try {
      await api.deleteJobcardFile(jobcardId, category, filename);
      await loadFiles(category);
      toast.success('File deleted');
      return true;
    } catch (err) {
      if (!handledAsJobClosed(err, onJobClosedRef.current)) toast.error(err.message || 'Could not delete the file');
      return false;
    } finally {
      setDeletingKeys(prev => { const next = new Set(prev); next.delete(key); return next; });
    }
  }, [jobcardId, loadFiles]);

  const handleViewFile = useCallback(async (file, category) => {
    const cachedThumb = file.mimeType?.startsWith('image/') ? thumbnails.get(`${category}/${file.name}`) : null;
    if (cachedThumb) {
      setLightboxPhoto(cachedThumb);
      return;
    }
    const loadingKey = `${category}/${file.name}`;
    setLoadingFiles(prev => new Set(prev).add(loadingKey));
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
      setLoadingFiles(prev => { const next = new Set(prev); next.delete(loadingKey); return next; });
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
    assigningKeys, assignFile,
    deletingKeys, deleteFile,
    thumbnails, loadingFiles, handleViewFile,
    viewerUrl, closeViewer,
    lightboxPhoto, closeLightbox,
    reset
  };
}
