import { useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { api, base64ToBytes } from '../../services/api';

// Builds and prints/saves the combined "packet" PDF (job card + chosen files).
// The server builds the whole packet — including rendering the job card to a PDF —
// so the desktop app and the browser build get the identical card-first result.
// The PC only sends the small list of files to include plus "include the card?".

function reportSkipped(skipped) {
  if (!skipped || !skipped.length) return;
  // The job card being dropped because the PDF engine couldn't start is a real,
  // fixable problem — call it out specifically rather than burying it among files
  // that simply couldn't be read.
  if (skipped.some(s => s.reason === 'engine')) {
    toast('Couldn’t start the PDF engine — the job card was left out of the packet. Ask an admin to set it up.',
      { icon: '⚠️', duration: 8000 });
  }
  const others = skipped.filter(s => s.reason !== 'engine');
  if (others.length) {
    const names = others.map(s => s.name).join(', ');
    toast(`Left out of the packet (couldn't be added): ${names}`, { icon: '⚠️', duration: 6000 });
  }
}

// Web-only: show the built PDF in a real browser tab the user can view and print
// from. We point a tab that was opened during the click (see printPacket) at the
// PDF. A hidden zero-size frame is unreliable — browsers often refuse to run their
// PDF viewer (and print()) inside one, failing with nothing shown. If the browser
// blocked the tab anyway, fall back to downloading the file so the user always
// gets the packet rather than a silent no-op.
function showPdfInBrowser(win, bytes, filename) {
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  if (win && !win.closed) {
    win.location = url;
  } else {
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    toast('Pop-up blocked — the packet was downloaded instead', { icon: 'ℹ️', duration: 6000 });
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
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
    // On the web build, open the viewer tab NOW, during the user's click, so the
    // browser treats it as user-initiated and doesn't block it. We point it at the
    // PDF once the packet is built (the build round-trip would otherwise lose the
    // click's "user gesture" and the tab would be blocked). The desktop app uses
    // its own viewer instead, so it opens no tab.
    const onWeb = !window.electronAPI?.openPdf;
    const win = onWeb ? window.open('', '_blank') : null;
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
          showPdfInBrowser(win, bytes, `${jobNumber || 'Job'} packet.pdf`);
        }
      } else if (win && !win.closed) {
        win.close();
      }
      reportSkipped(skipped);
    } catch (err) {
      if (win && !win.closed) win.close();
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
