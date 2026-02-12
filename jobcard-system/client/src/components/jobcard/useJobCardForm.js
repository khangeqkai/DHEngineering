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
  const [lineItems, setLineItems] = useState([{ id: Date.now(), item_number: 1, qty: '', description: '' }]);
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
      const nextNum = prev.length > 0 ? Math.max(...prev.map(i => i.item_number)) + 1 : 1;
      return [...prev, { id: Date.now(), item_number: nextNum, qty: '', description: '' }];
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
      const exists = prev.find(a => a.user_id === employee.id);
      if (exists) {
        return prev.filter(a => a.user_id !== employee.id);
      } else {
        return [...prev, { user_id: employee.id, user_name: employee.name || employee.username }];
      }
    });
  }, []);

  // Set form data from loaded job card
  const setFormDataFromJobCard = useCallback((jobcardData) => {
    setJobNumber(jobcardData.jobNumber || jobcardData.job_number || '');
    setFormData({
      card_type: jobcardData.cardType || jobcardData.card_type || 'JOB_CARD',
      status: jobcardData.status || 'OPEN',
      customer_id: jobcardData.customerId || jobcardData.customer_id || '',
      contact_name: jobcardData.contactName || jobcardData.contact_name || '',
      contact_phone: jobcardData.contactPhone || jobcardData.contact_phone || '',
      contact_email: jobcardData.contactEmail || jobcardData.contact_email || '',
      quality_level: jobcardData.qualityLevel || jobcardData.quality_level || 'STANDARD',
      job_type: jobcardData.jobType || jobcardData.job_type || '',
      priority: jobcardData.priority || 'NONE',
      po_number: jobcardData.poNumber || jobcardData.po_number || '',
      quote_reference: jobcardData.quoteReference || jobcardData.quote_reference || '',
      drawings_type: jobcardData.drawingsType || jobcardData.drawings_type || 'NONE',
      customer_property: jobcardData.customerProperty || jobcardData.customer_property || '',
      description: jobcardData.description || '',
      due_date: jobcardData.dueDate || jobcardData.due_date || '',
      is_repeat_job: jobcardData.isRepeatJob || jobcardData.is_repeat_job || false,
      repeat_job_reference: jobcardData.repeatJobReference || jobcardData.repeat_job_reference || '',
      treatment_required: jobcardData.treatmentRequired || jobcardData.treatment_required || 'NONE',
      treatment_other: jobcardData.treatmentOther || jobcardData.treatment_other || '',
      notes: jobcardData.notes || ''
    });

    // Map assignees from API data
    const apiAssignees = jobcardData.assignees || [];
    setAssignees(apiAssignees.map(a => ({
      user_id: a.userId || a.user_id,
      user_name: a.userName || a.user_name || a.username
    })));

    // Map line items from API data
    const apiItems = jobcardData.items || [];
    const mappedItems = apiItems.map(item => ({
      id: item.id,
      item_number: item.itemNumber || item.item_number,
      qty: item.qty || '',
      description: item.description || ''
    }));
    setLineItems(mappedItems.length > 0 ? mappedItems : [{ id: Date.now(), item_number: 1, qty: '', description: '' }]);
  }, []);

  const resetForm = useCallback(() => {
    setFormData(getDefaultFormData());
    setJobNumber('');
    setAssignees([]);
    setLineItems([{ id: Date.now(), item_number: 1, qty: '', description: '' }]);
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
