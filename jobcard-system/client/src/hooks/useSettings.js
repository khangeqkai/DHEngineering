import { useEffect, useState, useCallback, createElement, Fragment } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { validatePassword, todayIsoDate, formatDateTime } from '../utils/formatters';
import { isManagement, can } from '../utils/roles';
import { useFieldErrors, scrollFieldIntoView, showSaveRefusal } from './useFieldErrors';
import { useConfirmDialog } from './useConfirmDialog';
import {
  INACTIVITY_MINUTES, isInactivityMinutes, isStartingJobNumber, STARTING_JOB_NUMBER_MESSAGE,
  isJobNumberPrefix, JOB_NUMBER_PREFIX_MESSAGE, homeAccessCodeProblem, homeAddressProblem
} from '../../../server/src/shared/settingsRules';

// Which box on this page a server refusal of a settings field lands on (the
// server names the field it refused — see refuseField in routes/settings.js).
const SETTINGS_BOXES = {
  jobFoldersBase: 'jobFoldersBase',
  inactivityTimeoutMinutes: 'inactivityTimeout',
  jobNumberPrefix: 'jobNumberPrefix',
  jobNumberNext: 'jobNumberNext',
  homeAccessCode: 'homeAccessCode',
  homeAddress: 'homeAddress'
};

// Change PIN's server refusals, by the name they carry → the box they mark.
const PIN_BOXES = {
  currentPassword: 'currentPin',
  newPassword: 'newPin'
};

// The file name at the end of a chosen path, whichever kind of slash it uses.
const baseName = (path) => String(path).split(/[\\/]/).pop();

export function useSettings() {
  const confirmDialog = useConfirmDialog();
  const { showConfirm } = confirmDialog;
  const { user, refreshInactivityTimeout } = useAuth();
  // Managers see the management settings cards; the job-folders path, backups
  // and the home-access code stay admin-only (systemData) — a backup carries
  // the whole database, pricing included.
  const canSeeSystemData = can(user, 'systemData');
  const canManage = isManagement(user);

  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  // Set when the last load failed. The cards that edit stored settings are then
  // replaced by a Try again message: their boxes start blank, and saving a blank would
  // write it over the real setting (a blank home access code switches home access off).
  const [loadFailed, setLoadFailed] = useState(false);
  const [appInfo, setAppInfo] = useState(null);
  const [printers, setPrinters] = useState([]);
  const [loadingPrinters, setLoadingPrinters] = useState(canManage);
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem('darkMode') === 'true';
  });

  const [jobFoldersBase, setJobFoldersBase] = useState('');
  // Kept as a string, not a number, so the box can hold "" or a partial digit while
  // the user is typing — clamping every keystroke made 6 unkeyable (it kept
  // snapping back to 1 before the second digit landed). Range is checked on save.
  const [inactivityTimeout, setInactivityTimeoutState] = useState(String(INACTIVITY_MINUTES.defaultValue));
  const [jobNumberPrefix, setJobNumberPrefix] = useState('');
  const [jobNumberNext, setJobNumberNext] = useState('');
  const [homeAccessCode, setHomeAccessCode] = useState('');
  const [homeAddress, setHomeAddress] = useState('');
  const { setFieldErrors, errorFor, fieldProps, errorProps } = useFieldErrors((name) => {
    if (name === 'inactivityTimeout') return inactivityTimeout;
    if (name === 'jobNumberPrefix') return jobNumberPrefix;
    if (name === 'jobNumberNext') return jobNumberNext;
    if (name === 'jobFoldersBase') return jobFoldersBase;
    if (name === 'homeAccessCode') return homeAccessCode;
    if (name === 'homeAddress') return homeAddress;
    return undefined;
  });
  const [savingJobFolders, setSavingJobFolders] = useState(false);
  const [savingTimeout, setSavingTimeout] = useState(false);
  const [savingJobNumber, setSavingJobNumber] = useState(false);
  const [savingHomeAccess, setSavingHomeAccess] = useState(false);
  const [savingHomeAddress, setSavingHomeAddress] = useState(false);

  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  // The Change PIN form keeps its own marks, so opening or resetting it clears
  // only its boxes and never the marks on the page's other cards.
  const pinFieldErrors = useFieldErrors((name) => {
    if (name === 'currentPin') return currentPassword;
    if (name === 'newPin') return newPassword;
    if (name === 'confirmPin') return confirmPassword;
    return undefined;
  });
  const { setFieldErrors: setPinFieldErrors, clearAll: clearPinFieldErrors } = pinFieldErrors;
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  // A finished backup that left something out: { intro, items } shown in a window the
  // admin has to dismiss, never in a toast that fades while there is still work to do.
  const [backupGaps, setBackupGaps] = useState(null);

  const setInactivityTimeout = useCallback((v) => setInactivityTimeoutState(v), []);

  const loadSettings = useCallback(async () => {
    if (!canManage) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const data = await api.getSettings();
      setSettings(data);
      if (data) {
        setJobFoldersBase(data.jobFoldersBase || '');
        setInactivityTimeoutState(String(parseInt(data.inactivityTimeoutMinutes, 10) || INACTIVITY_MINUTES.defaultValue));
        setJobNumberPrefix(data.jobNumberPrefix || '');
        setJobNumberNext(data.jobNumberNext || '');
        setHomeAddress(data.homeAddress || '');
      }
      setLoadFailed(false);
    } catch (err) {
      setLoadFailed(true);
      toast.error('Couldn\'t load the settings. Try again in a moment.', { id: 'settings-load' });
    } finally {
      setLoading(false);
    }
  }, [canManage]);

  useEffect(() => {
    loadSettings();
    if (canManage) {
      if (window.electronAPI) {
        window.electronAPI.getAppInfo().then(setAppInfo);
        window.electronAPI.getPrinters()
          .then(setPrinters)
          .catch(() => toast.error('Couldn\'t load the printer list. Try again in a moment.'))
          .finally(() => setLoadingPrinters(false));
      } else {
        setLoadingPrinters(false);
      }
    }
  }, [canManage, loadSettings]);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark-mode');
    } else {
      document.documentElement.classList.remove('dark-mode');
    }
    localStorage.setItem('darkMode', darkMode);
  }, [darkMode]);

  const handleSelectJobFolders = useCallback(async () => {
    if (window.electronAPI?.selectFolder) {
      const folder = await window.electronAPI.selectFolder();
      if (folder) setJobFoldersBase(folder);
    } else {
      const folder = prompt('Enter job folders base path:', jobFoldersBase);
      if (folder !== null) setJobFoldersBase(folder);
    }
  }, [jobFoldersBase]);

  // Each card saves and updates only its own saved values from what was just sent —
  // never a full loadSettings(), which would refetch every field at once and wipe
  // out unsaved edits sitting in the other cards, and never flips the page-level
  // `loading` flag, which would flash the whole page back to "Loading...".
  const handleSaveJobFolders = useCallback(async () => {
    // Changing the location moves nothing: the server only starts looking in the new
    // folder, so files already in the old one stay put and stop showing on their jobs.
    const oldBase = settings?.jobFoldersBase || '';
    const newBase = jobFoldersBase.trim();
    if (oldBase && newBase !== oldBase) {
      const ok = await showConfirm({
        title: 'Change the job folders location?',
        message: newBase
          ? `From ${oldBase} to ${newBase}. Files already in ${oldBase} stay there and will not show on their jobs until they are moved.`
          : `From ${oldBase} to nothing. Files already in ${oldBase} stay there, and jobs show no files until a location is set again.`,
        confirmLabel: newBase ? `Use ${newBase}` : 'Clear the location',
        cancelLabel: 'Go back',
        confirmVariant: 'warning'
      });
      if (!ok) return;
    }
    setSavingJobFolders(true);
    try {
      await api.updateSettings({ jobFoldersBase });
      setSettings(prev => (prev ? { ...prev, jobFoldersBase: newBase } : prev));
      toast.success('Job folders base path updated');
    } catch (err) {
      showSaveRefusal(err, { boxFor: SETTINGS_BOXES, setFieldErrors, fallback: 'Couldn\'t save the job folders location. Check the connection and try again.' });
    } finally {
      setSavingJobFolders(false);
    }
  }, [jobFoldersBase, settings, showConfirm, setFieldErrors]);

  // Blank = switch home access off (the server refuses tunnel sign-ins with no code).
  const handleSaveHomeAccessCode = useCallback(async () => {
    const problem = homeAccessCodeProblem(homeAccessCode);
    if (problem) {
      setFieldErrors({ homeAccessCode: problem });
      scrollFieldIntoView('homeAccessCode');
      return;
    }
    const wasSet = !!homeAccessCode;
    setSavingHomeAccess(true);
    try {
      await api.updateSettings({ homeAccessCode });
      setHomeAccessCode('');
      setSettings(prev => (prev ? { ...prev, homeAccessCodeSet: wasSet } : prev));
      toast.success(wasSet ? 'Home access code updated' : 'Home access switched off');
    } catch (err) {
      showSaveRefusal(err, { boxFor: SETTINGS_BOXES, setFieldErrors, fallback: 'Couldn\'t save the home access code. Check the connection and try again.' });
    } finally {
      setSavingHomeAccess(false);
    }
  }, [homeAccessCode, setFieldErrors]);

  const handleSaveHomeAddress = useCallback(async () => {
    const problem = homeAddressProblem(homeAddress);
    if (problem) {
      setFieldErrors({ homeAddress: problem });
      scrollFieldIntoView('homeAddress');
      return;
    }
    setSavingHomeAddress(true);
    try {
      await api.updateSettings({ homeAddress });
      setSettings(prev => (prev ? { ...prev, homeAddress } : prev));
      toast.success('Home address updated');
    } catch (err) {
      showSaveRefusal(err, { boxFor: SETTINGS_BOXES, setFieldErrors, fallback: 'Couldn\'t save the home address. Check the connection and try again.' });
    } finally {
      setSavingHomeAddress(false);
    }
  }, [homeAddress, setFieldErrors]);

  const handleSaveInactivityTimeout = useCallback(async () => {
    if (!isInactivityMinutes(inactivityTimeout)) {
      setFieldErrors({
        inactivityTimeout: `Enter a number of minutes between ${INACTIVITY_MINUTES.min} and ${INACTIVITY_MINUTES.max}`
      });
      scrollFieldIntoView('inactivityTimeout');
      return;
    }
    const n = parseInt(inactivityTimeout, 10);
    setSavingTimeout(true);
    try {
      await api.updateSettings({ inactivityTimeoutMinutes: n });
      setInactivityTimeoutState(String(n));
      if (refreshInactivityTimeout) await refreshInactivityTimeout();
      toast.success('Inactivity timeout updated');
    } catch (err) {
      showSaveRefusal(err, { boxFor: SETTINGS_BOXES, setFieldErrors, fallback: 'Couldn\'t save the inactivity time. Check the connection and try again.' });
    } finally {
      setSavingTimeout(false);
    }
  }, [inactivityTimeout, refreshInactivityTimeout, setFieldErrors]);

  const handleSaveJobNumber = useCallback(async () => {
    // A prefix saved before the rule existed passes while left unchanged.
    const prefixChanged = jobNumberPrefix.trim() !== (settings?.jobNumberPrefix || '');
    if (prefixChanged && !isJobNumberPrefix(jobNumberPrefix)) {
      setFieldErrors({ jobNumberPrefix: JOB_NUMBER_PREFIX_MESSAGE });
      scrollFieldIntoView('jobNumberPrefix');
      return;
    }
    if (jobNumberNext && !isStartingJobNumber(jobNumberNext)) {
      setFieldErrors({ jobNumberNext: STARTING_JOB_NUMBER_MESSAGE });
      scrollFieldIntoView('jobNumberNext');
      return;
    }
    setSavingJobNumber(true);
    try {
      await api.updateSettings({ jobNumberPrefix, jobNumberNext });
      // The server stores the prefix trimmed; show what was saved, not what was typed.
      const savedPrefix = jobNumberPrefix.trim();
      setJobNumberPrefix(savedPrefix);
      setSettings(prev => (prev ? { ...prev, jobNumberPrefix: savedPrefix, jobNumberNext } : prev));
      toast.success('Job number settings updated');
    } catch (err) {
      showSaveRefusal(err, { boxFor: SETTINGS_BOXES, setFieldErrors, fallback: 'Couldn\'t save the job number settings. Check the connection and try again.' });
    } finally {
      setSavingJobNumber(false);
    }
  }, [jobNumberPrefix, jobNumberNext, settings, setFieldErrors]);

  const toggleDarkMode = useCallback(() => setDarkMode(prev => !prev), []);

  const openPasswordModal = useCallback(() => {
    clearPinFieldErrors();
    setShowPasswordModal(true);
  }, [clearPinFieldErrors]);

  const resetPasswordForm = useCallback(() => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    clearPinFieldErrors();
    setShowPasswordModal(false);
  }, [clearPinFieldErrors]);

  const handleChangePassword = useCallback(async (e) => {
    e.preventDefault();
    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      setPinFieldErrors({ newPin: passwordError });
      scrollFieldIntoView('newPin');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPinFieldErrors({ confirmPin: 'New PINs do not match' });
      scrollFieldIntoView('confirmPin');
      return;
    }
    setSavingPassword(true);
    try {
      await api.changePassword(currentPassword, newPassword);
      toast.success('PIN updated');
      resetPasswordForm();
    } catch (err) {
      showSaveRefusal(err, { boxFor: PIN_BOXES, setFieldErrors: setPinFieldErrors, fallback: 'Couldn\'t change the PIN. Check the connection and try again.' });
    } finally {
      setSavingPassword(false);
    }
  }, [newPassword, confirmPassword, currentPassword, resetPasswordForm, setPinFieldErrors]);

  const handleExportBackup = useCallback(async () => {
    if (!window.electronAPI?.showSaveDialog) {
      toast.error('Full backup export requires the desktop app');
      return;
    }

    const today = todayIsoDate();
    const outputPath = await window.electronAPI.showSaveDialog(
      `dh-engineering-backup-${today}.zip`,
      [{ name: 'ZIP Archive', extensions: ['zip'] }]
    );
    if (!outputPath) return;

    setExporting(true);
    // A loading toast shows for the length of the export, not just after it finishes.
    const toastId = toast.loading('Exporting backup…');
    try {
      const result = await api.exportBackup(outputPath);
      const sizeMB = result?.size ? (result.size / 1024 / 1024).toFixed(1) : null;
      const backupsLeftOut = result?.backupsLeftOut || [];
      const unreadNote = result?.filesSkipped > 0
        ? `${result.filesSkipped} file(s) couldn't be read and were left out.`
        : '';
      if (result && result.filesIncluded === false) {
        // The job folders were never read, so this backup holds only the records.
        // Checked first: it matters more than any per-file note below.
        const where = result.filesLeftOutReason === 'not-set'
          ? 'no job folders location is set'
          : "the job folders location can't be reached";
        const setNote = result.filesLeftOutReason === 'not-set'
          ? 'Set it in Settings and export again.'
          : 'Reconnect it and export again.';
        toast.dismiss(toastId);
        setBackupGaps({
          intro: `The backup was saved, but it holds only the records, not the job files: ${where}. ${setNote}`,
          items: unreadNote ? [unreadNote] : []
        });
      } else if (backupsLeftOut.length > 0) {
        // Earlier backups kept inside the job folders are not in this backup, and a
        // restore replaces everything in there — the admin has to move them out.
        toast.dismiss(toastId);
        setBackupGaps({
          intro: `The backup was saved, but ${backupsLeftOut.length} earlier backup file(s) kept inside the job folders were left out. Restoring a backup replaces everything in there, so move these somewhere else.${unreadNote ? ` Also, ${unreadNote}` : ''}`,
          items: backupsLeftOut
        });
      } else if (result?.filesSkipped > 0) {
        toast.dismiss(toastId);
        setBackupGaps({
          intro: `The backup was saved, but ${unreadNote} Check those files and back up again.`,
          items: []
        });
      } else {
        toast.success(sizeMB ? `Backup exported (${sizeMB} MB)` : 'Backup exported', { id: toastId });
      }
    } catch (err) {
      toast.error(err.message || 'Couldn\'t save the backup. Try again in a moment.', { id: toastId });
    } finally {
      setExporting(false);
    }
  }, []);

  const handleImportBackup = useCallback(async () => {
    if (!window.electronAPI?.selectFile) {
      toast.error('Backup import requires the desktop app');
      return;
    }

    const inputPath = await window.electronAPI.selectFile(
      'Select Backup File',
      [{ name: 'ZIP Archive', extensions: ['zip'] }]
    );
    if (!inputPath) return;

    // The picker returns only a path; the desktop app can look up the file's date and
    // size. If that lookup is missing or fails, the confirm simply leaves them out.
    let info = null;
    try { info = await window.electronAPI.fileInfo?.(inputPath); } catch { info = null; }
    const madeAt = info?.modifiedAt
      ? formatDateTime(info.modifiedAt, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
      : '';
    const mb = typeof info?.sizeBytes === 'number' ? info.sizeBytes / (1024 * 1024) : null;
    const sizeText = mb === null ? '' : mb < 10 ? `${mb.toFixed(1)} MB` : `${Math.round(mb)} MB`;
    const details = [madeAt && `Made ${madeAt}`, sizeText].filter(Boolean).join(' · ');
    const name = baseName(inputPath);
    const folder = String(inputPath).slice(0, String(inputPath).length - name.length).replace(/[\\/]$/, '');
    const ok = await showConfirm({
      title: 'Restore this backup?',
      // createElement, not JSX: plain .js files cannot hold JSX here.
      message: createElement(
        Fragment, null,
        createElement('strong', null, name),
        folder ? createElement(Fragment, null, createElement('br'), `In ${folder}`) : null,
        details ? createElement(Fragment, null, createElement('br'), details) : null,
        createElement('br'), createElement('br'),
        'Everything entered after this backup was made will be lost: jobs, time, comments and files. Everyone is signed out while it runs.'
      ),
      confirmLabel: 'Restore and replace everything',
      cancelLabel: 'Go back',
      confirmVariant: 'danger'
    });
    if (!ok) return;

    setImporting(true);
    // A loading toast shows for the length of the restore, not just after it finishes.
    const toastId = toast.loading('Restoring backup…');
    try {
      const result = await api.importBackup(inputPath);
      // An older backup that doesn't say it holds the job files leaves the files
      // already on disk as they are — say so rather than implying they were replaced.
      const filesKept = result?.filesReplaced === false;
      toast.success(filesKept
        ? 'Restore complete. This backup does not say it holds the job files, so the files already in the job folders were left as they were. Returning to the sign-in screen…'
        : 'Restore complete. Returning to the sign-in screen…', { id: toastId });
      // No saved login survives a reload, so this lands on the login screen —
      // exactly the intended end state after a full rewind. The longer message
      // gets long enough on screen to be read.
      setTimeout(() => window.location.reload(), filesKept ? 6000 : 1500);
      // Leave the "Restoring..." overlay up until the reload happens.
    } catch (err) {
      toast.error(err.message || 'Couldn\'t restore the backup. Try again in a moment.', { id: toastId });
      setImporting(false);
    }
  }, [showConfirm]);

  const dismissBackupGaps = useCallback(() => setBackupGaps(null), []);

  // Copies the list of left-out items; a browser that refuses simply does nothing.
  const copyBackupGaps = useCallback(async () => {
    if (!backupGaps?.items.length) return;
    try {
      await navigator.clipboard.writeText(backupGaps.items.join('\n'));
      toast.success('List copied', { id: 'backup-gaps-copied' });
    } catch { /* clipboard not available: nothing to do */ }
  }, [backupGaps]);

  return {
    user, canSeeSystemData, canManage,
    settings, loading, loadFailed, loadSettings, appInfo, printers, loadingPrinters,
    darkMode, toggleDarkMode,
    jobFoldersBase, setJobFoldersBase, handleSelectJobFolders, handleSaveJobFolders, savingJobFolders,
    inactivityTimeout, setInactivityTimeout, handleSaveInactivityTimeout, savingTimeout,
    errorFor, fieldProps, errorProps,
    jobNumberPrefix, setJobNumberPrefix, jobNumberNext, setJobNumberNext, handleSaveJobNumber, savingJobNumber,
    homeAccessCode, setHomeAccessCode, handleSaveHomeAccessCode, savingHomeAccess,
    homeAddress, setHomeAddress, handleSaveHomeAddress, savingHomeAddress,
    showPasswordModal, openPasswordModal, pinFieldErrors,
    currentPassword, setCurrentPassword,
    newPassword, setNewPassword,
    confirmPassword, setConfirmPassword,
    savingPassword, handleChangePassword, resetPasswordForm,
    exporting, importing, handleExportBackup, handleImportBackup,
    backupGaps, dismissBackupGaps, copyBackupGaps,
    confirmDialog
  };
}
