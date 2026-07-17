import { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { validatePassword } from '../utils/formatters';
import { isManagement } from '../utils/roles';

export function useSettings() {
  const { user, refreshInactivityTimeout } = useAuth();
  // Managers see the management settings cards; backups stay admin-only
  // (a backup carries the whole database, pricing included).
  const isAdmin = user?.role === 'admin';
  const canManage = isManagement(user);

  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [appInfo, setAppInfo] = useState(null);
  const [printers, setPrinters] = useState([]);
  const [loadingPrinters, setLoadingPrinters] = useState(canManage);
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem('darkMode') === 'true';
  });

  const [jobFoldersBase, setJobFoldersBase] = useState('');
  const [inactivityTimeout, setInactivityTimeout] = useState(5);
  const [jobNumberPrefix, setJobNumberPrefix] = useState('');
  const [jobNumberNext, setJobNumberNext] = useState('');
  const [savingJobFolders, setSavingJobFolders] = useState(false);
  const [savingTimeout, setSavingTimeout] = useState(false);
  const [savingJobNumber, setSavingJobNumber] = useState(false);

  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [showImportConfirm, setShowImportConfirm] = useState(false);
  const [pendingImportPath, setPendingImportPath] = useState(null);

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
        setInactivityTimeout(parseInt(data.inactivityTimeoutMinutes, 10) || 5);
        setJobNumberPrefix(data.jobNumberPrefix || '');
        setJobNumberNext(data.jobNumberNext || '');
      }
    } catch (err) {
      toast.error('Failed to load settings');
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
          .catch(() => toast.error('Failed to load printers'))
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

  const handleSaveJobFolders = useCallback(async () => {
    setSavingJobFolders(true);
    try {
      await api.updateSettings({ jobFoldersBase });
      await loadSettings();
      toast.success('Job folders base path saved successfully');
    } catch (err) {
      toast.error(err.message || 'Failed to save job folders base path');
    } finally {
      setSavingJobFolders(false);
    }
  }, [jobFoldersBase, loadSettings]);

  const handleSaveInactivityTimeout = useCallback(async () => {
    setSavingTimeout(true);
    try {
      await api.updateSettings({ inactivityTimeoutMinutes: inactivityTimeout });
      await loadSettings();
      if (refreshInactivityTimeout) await refreshInactivityTimeout();
      toast.success('Inactivity timeout saved successfully');
    } catch (err) {
      toast.error(err.message || 'Failed to save inactivity timeout');
    } finally {
      setSavingTimeout(false);
    }
  }, [inactivityTimeout, loadSettings, refreshInactivityTimeout]);

  const handleSaveJobNumber = useCallback(async () => {
    if (jobNumberNext && !/^\d+$/.test(jobNumberNext)) {
      toast.error('Starting number must contain only digits (e.g. 00001)');
      return;
    }
    setSavingJobNumber(true);
    try {
      await api.updateSettings({ jobNumberPrefix, jobNumberNext });
      await loadSettings();
      toast.success('Job number settings saved successfully');
    } catch (err) {
      toast.error(err.message || 'Failed to save job number settings');
    } finally {
      setSavingJobNumber(false);
    }
  }, [jobNumberPrefix, jobNumberNext, loadSettings]);

  const toggleDarkMode = useCallback(() => setDarkMode(prev => !prev), []);

  const resetPasswordForm = useCallback(() => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setShowPasswordModal(false);
  }, []);

  const handleChangePassword = useCallback(async (e) => {
    e.preventDefault();
    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      toast.error(passwordError);
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }
    setSavingPassword(true);
    try {
      await api.changePassword(currentPassword, newPassword);
      toast.success('Password changed successfully');
      resetPasswordForm();
    } catch (err) {
      toast.error(err.message || 'Failed to change password');
    } finally {
      setSavingPassword(false);
    }
  }, [newPassword, confirmPassword, currentPassword, resetPasswordForm]);

  const handleExportBackup = useCallback(async () => {
    if (!window.electronAPI?.showSaveDialog) {
      toast.error('Full backup export requires the desktop app');
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const outputPath = await window.electronAPI.showSaveDialog(
      `dh-engineering-backup-${today}.zip`,
      [{ name: 'ZIP Archive', extensions: ['zip'] }]
    );
    if (!outputPath) return;

    setExporting(true);
    try {
      const result = await api.exportBackup(outputPath);
      const sizeMB = result?.size ? (result.size / 1024 / 1024).toFixed(1) : null;
      if (result?.filesSkipped > 0) {
        toast.error(`Backup saved, but ${result.filesSkipped} file(s) couldn't be read and were left out. Check those files and back up again.`);
      } else {
        toast.success(sizeMB ? `Backup exported successfully (${sizeMB} MB)` : 'Backup exported successfully');
      }
    } catch (err) {
      toast.error(err.message || 'Failed to export backup');
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

    setPendingImportPath(inputPath);
    setShowImportConfirm(true);
  }, []);

  const handleConfirmImport = useCallback(async () => {
    if (!pendingImportPath) return;

    setShowImportConfirm(false);
    setImporting(true);
    try {
      await api.importBackup(pendingImportPath);
      toast.success('Restore complete. Returning to the login screen...');
      // No saved login survives a reload, so this lands on the login screen —
      // exactly the intended end state after a full rewind.
      setTimeout(() => window.location.reload(), 1500);
      // Leave the "Restoring..." overlay up until the reload happens.
    } catch (err) {
      toast.error(err.message || 'Failed to import backup');
      setImporting(false);
      setPendingImportPath(null);
    }
  }, [pendingImportPath]);

  const handleCancelImport = useCallback(() => {
    setShowImportConfirm(false);
    setPendingImportPath(null);
  }, []);

  return {
    user, isAdmin, canManage,
    settings, loading, appInfo, printers, loadingPrinters,
    darkMode, toggleDarkMode,
    jobFoldersBase, setJobFoldersBase, handleSelectJobFolders, handleSaveJobFolders, savingJobFolders,
    inactivityTimeout, setInactivityTimeout, handleSaveInactivityTimeout, savingTimeout,
    jobNumberPrefix, setJobNumberPrefix, jobNumberNext, setJobNumberNext, handleSaveJobNumber, savingJobNumber,
    showPasswordModal, setShowPasswordModal,
    currentPassword, setCurrentPassword,
    newPassword, setNewPassword,
    confirmPassword, setConfirmPassword,
    savingPassword, handleChangePassword, resetPasswordForm,
    exporting, importing, handleExportBackup, handleImportBackup,
    showImportConfirm, handleConfirmImport, handleCancelImport
  };
}
