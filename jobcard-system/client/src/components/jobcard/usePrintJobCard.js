import { useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { api } from '../../services/api';

// Generate this job's card as a page from its current data and print it. On the
// desktop app the HTML is printed directly; in a plain browser it prints in a
// hidden iframe. Nothing is saved — the on-screen job is the live record.
export function usePrintJobCard(jobCardId) {
  const [printing, setPrinting] = useState(false);

  const printJobCard = useCallback(async () => {
    if (!jobCardId) return;
    setPrinting(true);
    try {
      const { html } = await api.printJobCard(jobCardId);
      if (!html) throw new Error('Failed to build job card');

      // Desktop app: open the card as a web page in the browser's print preview.
      if (window.electronAPI?.printHtml) {
        const result = await window.electronAPI.printHtml({ html });
        if (result && result.success === false) {
          toast.error(result.failureReason || 'Failed to open job card');
        } else {
          toast.success('Opening print preview…');
        }
        return;
      }

      // Web fallback: print in a hidden iframe.
      const iframe = document.createElement('iframe');
      Object.assign(iframe.style, {
        position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0'
      });
      iframe.srcdoc = html;
      iframe.onload = () => {
        try {
          iframe.contentWindow.focus();
          iframe.contentWindow.print();
        } catch {
          // Pop-up/print blocked — nothing more we can do here.
        }
        setTimeout(() => iframe.remove(), 60000);
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
