import { useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../../services/api';
import { base64ToBlob } from '../../utils/fileData';
import { useModalLayer, isTopModal } from '../common/modalStack';
import './JobPaperworkHub.css';

// Opens ONE stored file of a job straight from a part's file list, in the same
// full-screen look the Files window uses (a photo shows full size, anything else
// in the document frame). `file` is { category, storedName, name }: the file is
// asked for by the name it is stored under, never by the name on screen, because two
// files of a part can share a name. Read-only by nature, so it works on an archived
// job too. It sits on the shared window stack, so Escape closes only this viewer.
export default function PartFileViewer({ jobCardId, file, onClose }) {
  const modalId = useId();
  const layer = useModalLayer(modalId, true);
  const [photo, setPhoto] = useState(null);
  const [docUrl, setDocUrl] = useState(null);

  useEffect(() => {
    let cancelled = false;
    let url = null;
    (async () => {
      try {
        const fileData = await api.getJobcardFile(jobCardId, file.category, file.storedName);
        if (cancelled) return;
        if (!fileData?.data) {
          toast.error('Couldn\'t open this file. Try again in a moment.', { id: 'part-file-open-failed' });
          onClose();
          return;
        }
        if (fileData.mimeType?.startsWith('image/')) {
          setPhoto(`data:${fileData.mimeType};base64,${fileData.data}`);
        } else {
          url = URL.createObjectURL(base64ToBlob(fileData.data, fileData.mimeType || 'application/pdf'));
          setDocUrl(url);
        }
      } catch (err) {
        if (cancelled) return;
        toast.error(err.message || 'Couldn\'t open the file. Check the connection and try again.', { id: 'part-file-open-failed' });
        onClose();
      }
    })();
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
    // The file chosen when the viewer was opened is the one it shows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape' || !isTopModal(modalId)) return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [modalId, onClose]);

  if (!photo && !docUrl) return null;
  return createPortal(
    <div className={photo ? 'hub-lightbox' : 'hub-doc-viewer'} style={{ zIndex: layer }} role="dialog" aria-modal="true" aria-label={file.name}>
      <button type="button" className="hub-lightbox-close" onClick={onClose} autoFocus aria-label="Close file" title="Close"><X size={24} /></button>
      {photo
        ? <img src={photo} alt={file.name} />
        : <iframe src={docUrl} className="hub-doc-frame" title={file.name} />}
    </div>,
    document.body
  );
}
