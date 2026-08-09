import { useState, useCallback } from 'react';
import { getDefaultFormData, mapLineItemFromApi } from './mappers';

const makeEmptyLineItem = (itemNumber = 1) => ({
  id: Date.now() + Math.random(),
  itemNumber,
  qty: '',
  description: '',
  jobType: '',
  material: '',
  treatments: [],
  drawingsType: '',
  customerProperty: ''
});

/**
 * Custom hook for job card form state management
 * Handles form data, line items, and assignees
 */
export function useJobCardForm() {
  // Core form data
  const [formData, setFormData] = useState(getDefaultFormData());
  const [jobNumber, setJobNumber] = useState('');

  // Related data (locally managed for create mode, from API for edit mode)
  const [assignees, setAssignees] = useState([]);
  const [lineItems, setLineItems] = useState([makeEmptyLineItem(1)]);

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
      return [...prev, makeEmptyLineItem(nextNum)];
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
      companyId: jobcardData.companyId || '',
      contactId: jobcardData.contactId || '',
      contactName: jobcardData.contactName || '',
      companyName: jobcardData.companyName || '',
      contactPhone: jobcardData.contactPhone || '',
      contactEmail: jobcardData.contactEmail || '',
      qualityLevel: jobcardData.qualityLevel || 'STANDARD',
      qaLevelId: jobcardData.qaLevelId || null,
      priority: jobcardData.priority || 'NONE',
      poNumber: jobcardData.poNumber || '',
      quoteReference: jobcardData.quoteReference || '',
      description: jobcardData.description || '',
      dueDate: jobcardData.dueDate || '',
      isRepeatJob: jobcardData.isRepeatJob || false,
      repeatJobReference: jobcardData.repeatJobReference || ''
    });

    // Map assignees from API data
    const apiAssignees = jobcardData.assignees || [];
    setAssignees(apiAssignees.map(a => ({
      userId: a.userId,
      userName: a.userName || a.username
    })));

    // Map line items from API data
    const apiItems = jobcardData.items || [];
    const mappedItems = apiItems.map(mapLineItemFromApi);
    setLineItems(mappedItems.length > 0 ? mappedItems : [makeEmptyLineItem(1)]);
  }, []);

  // Adopt the stored line items back after a save that leaves the job open. A part
  // added on screen carries a temporary id until it is saved; work is matched to a
  // part by its stored id, so without this the hours logged from here on would look
  // like work on a part that no longer exists.
  const setLineItemsFromApi = useCallback((apiItems) => {
    const mapped = (apiItems || []).map(mapLineItemFromApi);
    setLineItems(prev => (mapped.length > 0 ? mapped : prev));
  }, []);

  const resetForm = useCallback(() => {
    setFormData(getDefaultFormData());
    setJobNumber('');
    setAssignees([]);
    setLineItems([makeEmptyLineItem(1)]);
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
    // Handlers
    handleChange,
    addLineItem,
    updateLineItem,
    removeLineItem,
    toggleAssignee,
    setFormDataFromJobCard,
    setLineItemsFromApi,
    resetForm
  };
}
