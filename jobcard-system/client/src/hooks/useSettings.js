import { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { validatePassword } from '../utils/formatters';

export function useSettings() {
  const { user, refreshInactivityTimeout } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [appInfo, setAppInfo] = useState(null);
  const [printers, setPrinters] = useState([]);
  const [loadingPrinters, setLoadingPrinters] = useState(isAdmin);
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem('darkMode') === 'true';
  });

  const [scannerFolder, setScannerFolder] = useState('');
  const [jobFoldersBase, setJobFoldersBase] = useState('');
  const [inactivityTimeout, setInactivityTimeout] = useState(5);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingJobFolders, setSavingJobFolders] = useState(false);
  const [savingTimeout, setSavingTimeout] = useState(false);

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
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const data = await api.getSettings();
      setSettings(data);
      if (data) {
        setScannerFolder(data.scannerFolder || '');
        setJobFoldersBase(data.jobFoldersBase || '');
        setInactivityTimeout(parseInt(data.inactivityTimeoutMinutes, 10) || 5);
      }
    } catch (err) {
      toast.error('Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    loadSettings();
    if (isAdmin) {
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
  }, [isAdmin, loadSettings]);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark-mode');
    } else {
      document.documentElement.classList.remove('dark-mode');
    }
    localStorage.setItem('darkMode', darkMode);
  }, [darkMode]);

  const handleSelectScannerFolder = useCallback(async () => {
    if (window.electronAPI?.selectFolder) {
      const folder = await window.electronAPI.selectFolder();
      if (folder) setScannerFolder(folder);
    } else {
      const folder = prompt('Enter scanner folder path:', scannerFolder);
      if (folder !== null) setScannerFolder(folder);
    }
  }, [scannerFolder]);

  const handleSaveScannerFolder = useCallback(async () => {
    setSavingSettings(true);
    try {
      await api.updateSettings({ scannerFolder });
      await loadSettings();
      toast.success('Settings saved successfully');
    } catch (err) {
      toast.error(err.message || 'Failed to save settings');
    } finally {
      setSavingSettings(false);
    }
  }, [scannerFolder, loadSettings]);

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
      toast.success(sizeMB ? `Backup exported successfully (${sizeMB} MB)` : 'Backup exported successfully');
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
      toast.success('Backup imported successfully. Reloading...');
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      toast.error(err.message || 'Failed to import backup');
    } finally {
      setImporting(false);
      setPendingImportPath(null);
    }
  }, [pendingImportPath]);

  const handleCancelImport = useCallback(() => {
    setShowImportConfirm(false);
    setPendingImportPath(null);
  }, []);

  return {
    user, isAdmin,
    settings, loading, appInfo, printers, loadingPrinters,
    darkMode, toggleDarkMode,
    scannerFolder, setScannerFolder, handleSelectScannerFolder, handleSaveScannerFolder, savingSettings,
    jobFoldersBase, setJobFoldersBase, handleSelectJobFolders, handleSaveJobFolders, savingJobFolders,
    inactivityTimeout, setInactivityTimeout, handleSaveInactivityTimeout, savingTimeout,
    showPasswordModal, setShowPasswordModal,
    currentPassword, setCurrentPassword,
    newPassword, setNewPassword,
    confirmPassword, setConfirmPassword,
    savingPassword, handleChangePassword, resetPasswordForm,
    exporting, importing, handleExportBackup, handleImportBackup,
    showImportConfirm, handleConfirmImport, handleCancelImport
  };
}
