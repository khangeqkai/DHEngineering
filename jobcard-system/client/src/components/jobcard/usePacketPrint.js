import { useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { api, bytesToBase64, base64ToBytes } from '../../services/api';

// Builds and prints/saves the combined "packet" PDF (job card + chosen files).
// The desktop app renders the card to a PDF off-screen and welds it in; the
// browser build can't do that, so there the card prints on its own and the packet
// holds only the files.

const isDesktop = () => !!window.electronAPI?.htmlToPdf;

async function renderCardPdfBase64(jobcardId) {
  const { html } = await api.printJobCard(jobcardId);
  if (!html) throw new Error('Failed to build the job card');
  const result = await window.electronAPI.htmlToPdf({ html });
  if (!result || result.success === false) {
    throw new Error(result?.failureReason || 'Failed to render the job card');
  }
  const bytes = result.pdf instanceof Uint8Array ? result.pdf : new Uint8Array(result.pdf);
  return bytesToBase64(bytes);
}

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

// Web-only: print the job card HTML via a hidden iframe.
function printHtmlInIframe(html) {
  const iframe = document.createElement('iframe');
  Object.assign(iframe.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
  iframe.srcdoc = html;
  iframe.onload = () => {
    try { iframe.contentWindow.focus(); iframe.contentWindow.print(); } catch { /* blocked */ }
    setTimeout(() => iframe.remove(), 60000);
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

  // Returns { pdf: base64|null, skipped, cardIncluded, cardWanted }.
  const build = useCallback(async ({ items, includeJobCard }) => {
    let jobCardPdf = null;
    if (includeJobCard && isDesktop()) {
      jobCardPdf = await renderCardPdfBase64(jobcardId);
    }
    if (items.length === 0 && !jobCardPdf) {
      return { pdf: null, skipped: [], cardIncluded: false, cardWanted: includeJobCard };
    }
    const { pdf, skipped } = await api.buildPacket(jobcardId, { items, jobCardPdf });
    return { pdf, skipped, cardIncluded: !!jobCardPdf, cardWanted: includeJobCard };
  }, [jobcardId]);

  const printPacket = useCallback(async ({ items, includeJobCard }) => {
    setBuilding(true);
    try {
      const { pdf, skipped, cardIncluded, cardWanted } = await build({ items, includeJobCard });
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
      // Browser build can't fold the card into the PDF — print it on its own.
      if (cardWanted && !cardIncluded) {
        const { html } = await api.printJobCard(jobcardId);
        if (html) { printHtmlInIframe(html); toast('The job card prints separately in the browser version.'); }
      }
    } catch (err) {
      toast.error(err.message || 'Failed to print the packet');
    } finally {
      setBuilding(false);
    }
  }, [build, jobcardId, jobNumber]);

  const savePacket = useCallback(async ({ items, includeJobCard }) => {
    setBuilding(true);
    try {
      const { pdf, skipped } = await build({ items, includeJobCard });
      if (!pdf) { toast.error('Nothing to save'); return; }
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
