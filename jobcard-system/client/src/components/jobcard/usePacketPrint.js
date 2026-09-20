import { useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { api, base64ToBytes } from '../../services/api';
import { warningToastIcon } from '../common/toastIcons';

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
      { icon: warningToastIcon, duration: 8000 });
  }
  const others = skipped.filter(s => s.reason !== 'engine');
  if (others.length) {
    const names = others.map(s => s.name).join(', ');
    toast(`Left out of the packet (couldn't be added): ${names}`, { icon: warningToastIcon, duration: 6000 });
  }
}

// Web-only: show the built PDF in a real browser tab the user can view and print
// from. We point a tab that was opened during the click (see printPacket) at the
// PDF. A hidden zero-size frame is unreliable — browsers often refuse to run their
// PDF viewer (and print()) inside one, failing with nothing shown. If the browser
// blocked the tab anyway, fall back to downloading the file so the user always
// gets the packet rather than a silent no-op.
// Returns whether the packet actually opened in a viewer — a blocked pop-up is a
// download, i.e. a save, and must not be recorded as a print.
function showPdfInBrowser(win, bytes, filename) {
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const opened = !!(win && !win.closed);
  if (opened) {
    win.location = url;
  } else {
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    toast('Pop-up blocked — the packet was downloaded instead, so it isn’t recorded as a print',
      { icon: 'ℹ️', duration: 6000 });
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return opened;
}

// Hands the packet to the browser and reports whether the browser took it. This fires
// after the packet is built, so it is no longer inside the user's click and a strict
// browser can refuse it — and refuses silently. A refusal means no file exists, so it
// must not be recorded as a save.
function downloadBytes(bytes, filename) {
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  let accepted = false;
  try {
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    accepted = a.dispatchEvent(new MouseEvent('click', { bubbles: false, cancelable: true }));
  } catch {
    accepted = false;
  }
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return accepted;
}

export function usePacketPrint(jobcardId, jobNumber, onPrinted) {
  const [building, setBuilding] = useState(false);

  // Returns { pdf: base64, skipped, cardIncluded }. The server renders the card and welds it in.
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
      const { pdf, skipped, cardIncluded } = await build({ items, includeJobCard });
      let opened = false;
      if (pdf) {
        const bytes = base64ToBytes(pdf);
        if (window.electronAPI?.openPdf) {
          const r = await window.electronAPI.openPdf({ buffer: bytes, name: jobNumber });
          if (r && r.success === false) {
            toast.error(r.failureReason || 'Failed to open the packet');
          } else {
            opened = true;
            toast.success('Opening print preview…');
          }
        } else {
          opened = showPdfInBrowser(win, bytes, `${jobNumber || 'Job'} packet.pdf`);
        }
      } else if (win && !win.closed) {
        win.close();
      }
      reportSkipped(skipped);
      // Building a packet isn't printing it. Record the print only once it really
      // reached a viewer — a viewer that failed to open, or a blocked pop-up we
      // downloaded instead, is a save. Only a packet that carried the job card
      // stamps the job, and we let the list update that one row without
      // re-fetching the whole page.
      if (opened) {
        try {
          const { printedAt } = await api.markPacketPrinted(jobcardId, { cardIncluded });
          if (printedAt) onPrinted?.(printedAt);
        } catch {
          // The packet is open in front of the user, so the print itself didn't
          // fail — but nothing was written down either, and no amount of reloading
          // will make it appear. Say so rather than leaving a real print invisible.
          // Only a packet carrying the job card stamps the tick, so promise its
          // absence only then — an attachment-only print never had one coming, and
          // naming it sends the user hunting for a tick that was never due. We
          // deliberately don't re-send: this call stamps the job and writes a trail
          // entry, so a retry would record the same print twice.
          toast(cardIncluded
            ? 'Printed, but it couldn’t be recorded — this job won’t show a print tick'
            : 'Printed, but it couldn’t be recorded in this job’s activity',
            { icon: warningToastIcon, duration: 7000 });
        }
      }
    } catch (err) {
      if (win && !win.closed) win.close();
      toast.error(err.message || 'Failed to print the packet');
    } finally {
      setBuilding(false);
    }
  }, [build, jobcardId, jobNumber, onPrinted]);

  const savePacket = useCallback(async ({ items, includeJobCard }) => {
    if (items.length === 0 && includeJobCard === false) { toast.error('Nothing to save'); return; }
    setBuilding(true);
    try {
      const { pdf, skipped } = await build({ items, includeJobCard });
      const bytes = base64ToBytes(pdf);
      const name = `${jobNumber || 'Job'} packet.pdf`;
      // Building a packet isn't saving it: on the desktop the user still gets a
      // "where do you want to save it?" window and can cancel, in which case no
      // file exists and nothing may be recorded. Record the save only once the
      // file really landed.
      let saved = false;
      if (window.electronAPI?.saveFile) {
        const res = await window.electronAPI.saveFile(name, bytes, [{ name: 'PDF', extensions: ['pdf'] }]);
        if (res && !res.canceled) { saved = true; toast.success('Packet saved'); }
      } else {
        // In the browser there is no save window to cancel, but the download itself can
        // be refused — and the user is told either way, so a refused one isn't invisible.
        saved = downloadBytes(bytes, name);
        if (saved) toast.success('Packet downloaded');
        else toast.error('The browser blocked the download — nothing was saved');
      }
      reportSkipped(skipped);
      if (saved) {
        try {
          await api.markPacketSaved(jobcardId);
        } catch {
          // Same as a print that couldn't be confirmed: the file is on disk, so the
          // save didn't fail, but it left no record — and this write is never
          // re-sent, or the save would be logged twice.
          toast('Saved, but it couldn’t be recorded in the job’s activity',
            { icon: warningToastIcon, duration: 7000 });
        }
      }
    } catch (err) {
      toast.error(err.message || 'Failed to save the packet');
    } finally {
      setBuilding(false);
    }
  }, [build, jobcardId, jobNumber]);

  return { building, printPacket, savePacket };
}
