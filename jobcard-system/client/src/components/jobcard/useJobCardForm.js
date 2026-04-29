import { useState, useCallback } from 'react';
import { getDefaultFormData } from './mappers';

/**
 * Custom hook for job card form state management
 * Handles form data, line items, assignees, and scanner files
 */
export function useJobCardForm() {
  // Core form data
  const [formData, setFormData] = useState(getDefaultFormData());
  const [jobNumber, setJobNumber] = useState('');

  // Related data (locally managed for create mode, from API for edit mode)
  const [assignees, setAssignees] = useState([]);
  const [lineItems, setLineItems] = useState([{ id: Date.now(), itemNumber: 1, qty: '', description: '', material: '', treatment: '', treatmentOther: '' }]);
  // Local subcontracts state for create mode (in edit mode, uses apiSubcontracts)
  const [localSubcontracts, setLocalSubcontracts] = useState([]);

  // Scanner files state
  const [scannerFiles, setScannerFiles] = useState([]);
  const [loadingScannerFiles, setLoadingScannerFiles] = useState(false);
  const [showScannerFiles, setShowScannerFiles] = useState(false);

  const handleChange = useCallback((e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  }, []);

  // Line Items handlers
  const addLineItem = useCallback(() => {
    setLineItems(prev => {
      const nextNum = prev.length > 0 ? Math.max(...prev.map(i => i.itemNumber)) + 1 : 1;
      return [...prev, { id: Date.now(), itemNumber: nextNum, qty: '', description: '', material: '', treatment: '', treatmentOther: '' }];
    });
  }, []);

  const updateLineItem = useCallback((id, field, value) => {
    setLineItems(prev => prev.map(item =>
      item.id === id ? { ...item, [field]: value } : item
    ));
  }, []);

  const removeLineItem = useCallback((id) => {
    setLineItems(prev => {
      if (prev.length > 1) {
        return prev.filter(item => item.id !== id);
      }
      return prev;
    });
  }, []);

  // Assignee handlers
  const toggleAssignee = useCallback((employee) => {
    setAssignees(prev => {
      const exists = prev.find(a => a.userId === employee.id);
      if (exists) {
        return prev.filter(a => a.userId !== employee.id);
      } else {
        return [...prev, { userId: employee.id, userName: employee.name || employee.username }];
      }
    });
  }, []);

  // Set form data from loaded job card
  const setFormDataFromJobCard = useCallback((jobcardData) => {
    const loadedJobNumber = jobcardData.jobNumber || '';
    setJobNumber(loadedJobNumber);
    setFormData({
      jobNumber: loadedJobNumber,
      status: jobcardData.status || 'OPEN',
      contactId: jobcardData.contactId || '',
      contactName: jobcardData.contactName || '',
      companyName: jobcardData.companyName || '',
      contactPhone: jobcardData.contactPhone || '',
      contactEmail: jobcardData.contactEmail || '',
      qualityLevel: jobcardData.qualityLevel || 'STANDARD',
      qaLevelId: jobcardData.qaLevelId || null,
      jobType: jobcardData.jobType || '',
      priority: jobcardData.priority || 'NONE',
      poNumber: jobcardData.poNumber || '',
      quoteReference: jobcardData.quoteReference || '',
      drawingsType: jobcardData.drawingsType || 'NONE',
      customerProperty: jobcardData.customerProperty || '',
      description: jobcardData.description || '',
      dueDate: jobcardData.dueDate || '',
      isRepeatJob: jobcardData.isRepeatJob || false,
      repeatJobReference: jobcardData.repeatJobReference || '',
      notes: jobcardData.notes || ''
    });

    // Map assignees from API data
    const apiAssignees = jobcardData.assignees || [];
    setAssignees(apiAssignees.map(a => ({
      userId: a.userId,
      userName: a.userName || a.username
    })));

    // Map line items from API data
    const apiItems = jobcardData.items || [];
    const mappedItems = apiItems.map(item => ({
      id: item.id,
      itemNumber: item.itemNumber,
      qty: item.qty || '',
      description: item.description || '',
      material: item.material || '',
      treatment: item.treatment || '',
      treatmentOther: item.treatmentOther || ''
    }));
    setLineItems(mappedItems.length > 0 ? mappedItems : [{ id: Date.now(), itemNumber: 1, qty: '', description: '', material: '', treatment: '', treatmentOther: '' }]);
  }, []);

  const resetForm = useCallback(() => {
    setFormData(getDefaultFormData());
    setJobNumber('');
    setAssignees([]);
    setLineItems([{ id: Date.now(), itemNumber: 1, qty: '', description: '', material: '', treatment: '', treatmentOther: '' }]);
    setLocalSubcontracts([]);
    setScannerFiles([]);
    setShowScannerFiles(false);
  }, []);

  return {
    // Form state
    formData,
    setFormData,
    jobNumber,
    setJobNumber,
    // Related data
    assignees,
    setAssignees,
    lineItems,
    setLineItems,
    localSubcontracts,
    setLocalSubcontracts,
    // Scanner files
    scannerFiles,
    setScannerFiles,
    loadingScannerFiles,
    setLoadingScannerFiles,
    showScannerFiles,
    setShowScannerFiles,
    // Handlers
    handleChange,
    addLineItem,
    updateLineItem,
    removeLineItem,
    toggleAssignee,
    setFormDataFromJobCard,
    resetForm
  };
}
