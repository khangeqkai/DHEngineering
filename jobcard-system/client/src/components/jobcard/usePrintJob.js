import { useCallback, useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '../../services/api';

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function generateJobCardHtml(jobCard) {
  const items = jobCard.items || [];
  const assignees = jobCard.assignees || [];

  const itemsRows = items.map((item, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${escapeHtml(item.qty) || '-'}</td>
      <td>${escapeHtml(item.description) || '-'}</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; padding: 20px; font-size: 12px; }
    h1 { font-size: 18px; margin-bottom: 4px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; border-bottom: 2px solid #333; padding-bottom: 8px; }
    .field { margin-bottom: 6px; }
    .label { font-weight: bold; display: inline-block; width: 130px; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
    th { background: #f0f0f0; font-weight: bold; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; }
    .section { margin-top: 16px; }
    .section-title { font-size: 14px; font-weight: bold; border-bottom: 1px solid #999; padding-bottom: 4px; margin-bottom: 8px; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>DH Engineering - Job Card</h1>
      <div class="field"><span class="label">Job Number:</span> <strong>${escapeHtml(jobCard.jobNumber)}</strong></div>
    </div>
    <div style="text-align: right;">
      <div class="field"><span class="label">Status:</span> ${escapeHtml(jobCard.status)}</div>
      <div class="field"><span class="label">Priority:</span> ${escapeHtml(jobCard.priority) || 'NONE'}</div>
    </div>
  </div>

  <div class="field"><span class="label">Description:</span> ${escapeHtml(jobCard.description) || '-'}</div>
  <div class="field"><span class="label">Due Date:</span> ${jobCard.dueDate ? new Date(jobCard.dueDate).toLocaleDateString() : '-'}</div>
  <div class="field"><span class="label">QA Level:</span> ${escapeHtml(jobCard.qualityLevel) || 'STANDARD'}</div>
  <div class="field"><span class="label">Drawings:</span> ${escapeHtml(jobCard.drawingsType) || '-'}</div>
  <div class="field"><span class="label">Customer Property:</span> ${escapeHtml(jobCard.customerProperty) || '-'}</div>
  ${assignees.length > 0 ? `<div class="field"><span class="label">Assigned To:</span> ${assignees.map(a => escapeHtml(a.userName)).join(', ')}</div>` : ''}

  ${items.length > 0 ? `
  <div class="section">
    <div class="section-title">Items</div>
    <table>
      <thead>
        <tr><th>#</th><th>Qty</th><th>Description</th></tr>
      </thead>
      <tbody>${itemsRows}</tbody>
    </table>
  </div>
  ` : ''}

  <div style="margin-top: 24px; font-size: 10px; color: #999;">
    Printed: ${new Date().toLocaleString()}
  </div>
</body>
</html>`;
}

function generateQaFormHtml(jobCard, formId, formTitle) {
  return `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; padding: 20px; font-size: 12px; }
    h1 { font-size: 16px; }
    h2 { font-size: 14px; margin-top: 16px; }
    .field { margin-bottom: 6px; }
    .label { font-weight: bold; display: inline-block; width: 130px; }
    .checkbox-line { margin: 8px 0; }
    .box { display: inline-block; width: 14px; height: 14px; border: 1px solid #333; margin-right: 8px; vertical-align: middle; }
    .line { border-bottom: 1px solid #ccc; min-height: 24px; margin: 8px 0; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
    th { background: #f0f0f0; }
  </style>
</head>
<body>
  <h1>${escapeHtml(formId)} - ${escapeHtml(formTitle)}</h1>
  <div class="field"><span class="label">Job Number:</span> <strong>${escapeHtml(jobCard.jobNumber)}</strong></div>
  <div class="field"><span class="label">Description:</span> ${escapeHtml(jobCard.description) || '-'}</div>
  <div class="field"><span class="label">Date:</span> ${new Date().toLocaleDateString()}</div>

  <h2>Inspection Record</h2>
  <table>
    <thead>
      <tr><th>Check Item</th><th>Result</th><th>Initials</th><th>Date</th></tr>
    </thead>
    <tbody>
      ${Array(8).fill('').map(() => '<tr><td class="line"></td><td class="line"></td><td class="line"></td><td class="line"></td></tr>').join('')}
    </tbody>
  </table>

  <h2>Sign-off</h2>
  <div class="field"><span class="label">Inspector:</span> <div class="line"></div></div>
  <div class="field"><span class="label">Date:</span> <div class="line"></div></div>
  <div class="field"><span class="label">Comments:</span></div>
  <div class="line"></div>
  <div class="line"></div>

  <div style="margin-top: 24px; font-size: 10px; color: #999;">
    Printed: ${new Date().toLocaleString()}
  </div>
</body>
</html>`;
}

const QA_FORMS = [
  { id: 'DHE-F39', title: 'Inspection & Test Plan' },
  { id: 'DHE-F15', title: 'First Article Inspection' },
  { id: 'DHE-F09', title: 'In-Process Inspection' },
  { id: 'DHE-F43', title: 'Final Inspection' }
];

export function usePrintJob() {
  const [printing, setPrinting] = useState(false);

  const printHtml = useCallback(async (html) => {
    if (window.electronAPI?.printHtml) {
      const result = await window.electronAPI.printHtml({ html });
      return result;
    }
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.print();
    }
    return { success: true };
  }, []);

  const printFile = useCallback(async (filePath) => {
    if (window.electronAPI?.printFile) {
      return await window.electronAPI.printFile({ filePath });
    }
    return { success: false, cancelled: true };
  }, []);

  const handlePrintDocuments = useCallback(async (jobCard) => {
    setPrinting(true);
    try {
      const summaryHtml = generateJobCardHtml(jobCard);
      const summaryResult = await printHtml(summaryHtml);

      if (summaryResult?.cancelled) {
        setPrinting(false);
        return;
      }

      try {
        const files = await api.getDrawingsFiles(jobCard.id);
        for (const file of files) {
          try {
            if (window.electronAPI?.printFile) {
              await printFile(file.path);
            } else {
              const fileData = await api.getDrawingsFileData(jobCard.id, file.name);
              if (fileData.mimeType === 'application/pdf') {
                const pWindow = window.open('', '_blank');
                if (pWindow) {
                  pWindow.document.write(
                    `<embed src="data:application/pdf;base64,${fileData.data}" width="100%" height="100%" type="application/pdf">`
                  );
                  pWindow.document.close();
                }
              } else {
                const imgHtml = `<html><body style="margin:0;display:flex;justify-content:center;align-items:center;min-height:100vh;"><img src="data:${fileData.mimeType};base64,${fileData.data}" style="max-width:100%;max-height:100vh;"></body></html>`;
                await printHtml(imgHtml);
              }
            }
          } catch (err) {
            toast.error(`Failed to print: ${file.name}`);
          }
        }
      } catch {
        // Drawings folder may not exist
      }

      if (jobCard.qualityLevel === 'CRITICAL') {
        for (const form of QA_FORMS) {
          const formHtml = generateQaFormHtml(jobCard, form.id, form.title);
          await printHtml(formHtml);
        }
      }

      toast.success('Documents sent to printer');
    } catch (err) {
      toast.error(err.message || 'Failed to print documents');
    } finally {
      setPrinting(false);
    }
  }, [printHtml, printFile]);

  return { handlePrintDocuments, printing };
}
