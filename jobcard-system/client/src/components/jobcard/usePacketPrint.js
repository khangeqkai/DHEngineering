import { useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { api, base64ToBytes } from '../../services/api';

// Builds and prints/saves the combined "packet" PDF (job card + chosen files).
// The server builds the whole packet — including rendering the job card to a PDF —
// so the desktop app and the browser build get the identical card-first result.
// The PC only sends the small list of files to include plus "include the card?".

function reportSkipped(skipped) {
  if (skipped && skipped.length) {
    const names = skipped.map(s => s.name).join(', ');
    toast(`Left out of the packet (couldn't be added): ${names}`, { icon: '⚠️', duration: 6000 });
  }
}

// Web-only: print a PDF byte array via a hidden iframe.
function printPdfInIframe(bytes) {
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const iframe = document.createElement('iframe');
  Object.assign(iframe.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
  iframe.src = url;
  iframe.onload = () => {
    try { iframe.contentWindow.focus(); iframe.contentWindow.print(); } catch { /* blocked */ }
    setTimeout(() => { iframe.remove(); URL.revokeObjectURL(url); }, 60000);
  };
  document.body.appendChild(iframe);
}

function downloadBytes(bytes, filename) {
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export function usePacketPrint(jobcardId, jobNumber) {
  const [building, setBuilding] = useState(false);

  // Returns { pdf: base64, skipped }. The server renders the card and welds it in.
  const build = useCallback(({ items, includeJobCard }) => {
    return api.buildPacket(jobcardId, { items, includeJobCard });
  }, [jobcardId]);

  const printPacket = useCallback(async ({ items, includeJobCard }) => {
    if (items.length === 0 && includeJobCard === false) { toast.error('Nothing to print'); return; }
    setBuilding(true);
    try {
      const { pdf, skipped } = await build({ items, includeJobCard });
      if (pdf) {
        const bytes = base64ToBytes(pdf);
        if (window.electronAPI?.openPdf) {
          const r = await window.electronAPI.openPdf({ buffer: bytes, name: jobNumber });
          if (r && r.success === false) { toast.error(r.failureReason || 'Failed to open the packet'); return; }
          toast.success('Opening print preview…');
        } else {
          printPdfInIframe(bytes);
        }
      }
      reportSkipped(skipped);
    } catch (err) {
      toast.error(err.message || 'Failed to print the packet');
    } finally {
      setBuilding(false);
    }
  }, [build, jobNumber]);

  const savePacket = useCallback(async ({ items, includeJobCard }) => {
    if (items.length === 0 && includeJobCard === false) { toast.error('Nothing to save'); return; }
    setBuilding(true);
    try {
      const { pdf, skipped } = await build({ items, includeJobCard });
      const bytes = base64ToBytes(pdf);
      const name = `${jobNumber || 'Job'} packet.pdf`;
      if (window.electronAPI?.saveFile) {
        const res = await window.electronAPI.saveFile(name, bytes, [{ name: 'PDF', extensions: ['pdf'] }]);
        if (res && !res.canceled) toast.success('Packet saved');
      } else {
        downloadBytes(bytes, name);
      }
      reportSkipped(skipped);
    } catch (err) {
      toast.error(err.message || 'Failed to save the packet');
    } finally {
      setBuilding(false);
    }
  }, [build, jobNumber]);

  return { building, printPacket, savePacket };
}
