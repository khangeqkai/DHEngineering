import { useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { api } from '../../services/api';

function base64ToBlob(base64, mimeType = 'application/pdf') {
  const binary = atob(base64);
  const arr = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
  return new Blob([arr], { type: mimeType });
}

// Fill the global printout template with this job's data, save it into the job's
// folder, and send it to the printer. On the desktop app the saved file is printed
// directly; in a plain browser we fall back to an in-page print of the returned PDF.
export function usePrintJobCard(jobCardId) {
  const [printing, setPrinting] = useState(false);

  const printJobCard = useCallback(async () => {
    if (!jobCardId) return;
    setPrinting(true);
    try {
      const result = await api.printJobCard(jobCardId);

      if (window.electronAPI?.printFile && result.filePath) {
        await window.electronAPI.printFile({ filePath: result.filePath });
        toast.success('Sent to printer');
        return;
      }

      const blob = base64ToBlob(result.data, result.mimeType || 'application/pdf');
      const url = URL.createObjectURL(blob);
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.src = url;
      iframe.onload = () => {
        try {
          iframe.contentWindow.focus();
          iframe.contentWindow.print();
        } catch {
          window.open(url, '_blank');
        }
        setTimeout(() => {
          URL.revokeObjectURL(url);
          iframe.remove();
        }, 60000);
      };
      document.body.appendChild(iframe);
    } catch (err) {
      toast.error(err.message || 'Failed to print job card');
    } finally {
      setPrinting(false);
    }
  }, [jobCardId]);

  return { printJobCard, printing };
}
