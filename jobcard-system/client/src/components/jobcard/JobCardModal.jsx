import { useEffect, useState, useRef, useCallback } from 'react';
import BottomSheet from '../common/BottomSheet';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import './JobCardModal.css';

// Custom hooks
import { useCamera } from './useCamera';
import { useCosting } from './useCosting';
import { useSubcontracts } from './useSubcontracts';
import { useTimeEntries } from './useTimeEntries';

// Tab components
import DetailsTab from './tabs/DetailsTab';
import ItemsTab from './tabs/ItemsTab';
import SubcontractsTab from './tabs/SubcontractsTab';
import TimeEntryTab from './tabs/TimeEntryTab';
import CostingTab from './tabs/CostingTab';
import QAFormsTab from './tabs/QAFormsTab';
import PhotosTab from './tabs/PhotosTab';

// Utilities
import {
  getDefaultFormData,
  getDefaultCustomerFormData
} from './mappers';

export default function JobCardModal({ isOpen, onClose, jobCardId = null, onSuccess }) {
  const { user } = useAuth();
  const isEdit = Boolean(jobCardId);
  const isAdmin = user?.role === 'admin';

  const [activeTab, setActiveTab] = useState('details');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  // Core form data
  const [formData, setFormData] = useState(getDefaultFormData());
  const [jobNumber, setJobNumber] = useState('');

  // Customer state
  const [customer, setCustomer] = useState(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [customerFormData, setCustomerFormData] = useState(getDefaultCustomerFormData());
  const customerSearchRef = useRef(null);

  // Related data (locally managed for create mode, from API for edit mode)
  const [assignees, setAssignees] = useState([]);
  const [lineItems, setLineItems] = useState([{ id: Date.now(), item_number: 1, qty: '', description: '' }]);
  // Local subcontracts state for create mode (in edit mode, uses apiSubcontracts)
  const [localSubcontracts, setLocalSubcontracts] = useState([]);

  // Reference data loaded from API
  const [suppliers, setSuppliers] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [machines, setMachines] = useState([]);

  // Job card related data from API (for edit mode)
  const [timeEntries, setTimeEntries] = useState([]);
  const [subcontracts, setSubcontracts] = useState([]);
  const [qaForms, setQaForms] = useState([]);
  const [costing, setCostingData] = useState(null);

  // Scanner files state
  const [scannerFiles, setScannerFiles] = useState([]);
  const [loadingScannerFiles, setLoadingScannerFiles] = useState(false);
  const [showScannerFiles, setShowScannerFiles] = useState(false);

  // Customer search results
  const [customers, setCustomers] = useState([]);

  // Load reference data on mount
  useEffect(() => {
    const loadReferenceData = async () => {
      try {
        const [suppliersRes, usersRes, machinesRes] = await Promise.all([
          api.getSuppliers(),
          api.getUsers(),
          api.getMachines()
        ]);
        setSuppliers(suppliersRes || []);
        // Filter active employees and sort by name
        const activeEmployees = (usersRes || [])
          .filter(u => u.active === 1 || u.active === true)
          .sort((a, b) => (a.name || a.username || '').localeCompare(b.name || b.username || ''));
        setEmployees(activeEmployees);
        setMachines(machinesRes || []);
      } catch (err) {
        console.error('Failed to load reference data:', err);
      }
    };
    loadReferenceData();
  }, []);

  // Load job card data when editing
  const loadJobCard = useCallback(async () => {
    if (!isEdit || !jobCardId) return;

    setLoading(true);
    try {
      const [jobcardRes, subcontractsRes, timeEntriesRes, qaFormsRes, costingRes] = await Promise.all([
        api.getJobcard(jobCardId),
        api.getSubcontracts(jobCardId),
        api.getTimeEntries(jobCardId),
        api.getQAForms(jobCardId),
        isAdmin ? api.getCosting(jobCardId).catch(() => null) : Promise.resolve(null)
      ]);

      const jobcardData = jobcardRes;

      // Map API data to form state
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

      // Handle customer data
      const custId = jobcardData.customerId || jobcardData.customer_id;
      const custName = jobcardData.customerName || jobcardData.customer_name;
      if (custId && custName) {
        setCustomer({
          id: custId,
          name: custName,
          is_critical_qa: jobcardData.customerIsCritical || jobcardData.customer_is_critical
        });
        setCustomerSearch(custName);
        setCustomerFormData({
          company_name: custName,
          contact_name: jobcardData.contactName || jobcardData.contact_name || '',
          contact_phone: jobcardData.contactPhone || jobcardData.contact_phone || '',
          contact_email: jobcardData.contactEmail || jobcardData.contact_email || '',
          is_critical_qa: jobcardData.customerIsCritical || jobcardData.customer_is_critical || false
        });
      }

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

      // Photos from API data
      camera.setPhotos(Array.isArray(jobcardData.photos) ? jobcardData.photos : []);

      // Set related data
      setSubcontracts((subcontractsRes || []).map(s => ({
        id: s.id,
        supplier_id: s.supplierId || s.supplier_id,
        supplier_name: s.supplierName || s.supplier_name,
        date_sent: s.dateSent || s.date_sent,
        date_expected: s.dateExpected || s.date_expected,
        date_received: s.dateReceived || s.date_received,
        notes: s.notes,
        status: s.status
      })));

      setTimeEntries((timeEntriesRes || []).map(t => ({
        id: t.id,
        item_number: t.itemNumber || t.item_number,
        machine_number: t.machineNumber || t.machine_number,
        qty: t.qty,
        description: t.description,
        start_time: t.startTime || t.start_time,
        end_time: t.endTime || t.end_time,
        equipment_checks_done: t.equipmentChecksDone || t.equipment_checks_done,
        measuring_verification_done: t.measuringVerificationDone || t.measuring_verification_done,
        first_off_inspection: t.firstOffInspection || t.first_off_inspection,
        first_off_inspection_notes: t.firstOffInspectionNotes || t.first_off_inspection_notes,
        in_process_validation: t.inProcessValidation || t.in_process_validation,
        in_process_validation_notes: t.inProcessValidationNotes || t.in_process_validation_notes,
        scrap_all_good: t.scrapAllGood !== undefined ? t.scrapAllGood : t.scrap_all_good,
        scrap_recycle_inhouse_qty: t.scrapRecycleInhouseQty || t.scrap_recycle_inhouse_qty,
        scrap_recycle_bin_qty: t.scrapRecycleBinQty || t.scrap_recycle_bin_qty
      })));

      setQaForms(qaFormsRes || []);

      if (costingRes) {
        setCostingData({
          labour_hours: costingRes.labourHours || costingRes.labour_hours || 0,
          labour_rate: costingRes.labourRate || costingRes.labour_rate || 0,
          labour_special_hours: costingRes.labourSpecialHours || costingRes.labour_special_hours || 0,
          labour_special_rate: costingRes.labourSpecialRate || costingRes.labour_special_rate || 0,
          materials_cost: costingRes.materialsCost || costingRes.materials_cost || 0,
          materials_profit_percent: costingRes.materialsProfitPercent || costingRes.materials_profit_percent || 100,
          subcontractor_cost: costingRes.subcontractorCost || costingRes.subcontractor_cost || 0,
          subcontractor_profit_percent: costingRes.subcontractorProfitPercent || costingRes.subcontractor_profit_percent || 0
        });
      }
    } catch (err) {
      console.error('Failed to load job card:', err);
      alert('Failed to load job card data');
    } finally {
      setLoading(false);
    }
  }, [isEdit, jobCardId, isAdmin]);

  // Load job card data when jobCardId changes
  useEffect(() => {
    if (isOpen && isEdit) {
      loadJobCard();
    }
  }, [isOpen, isEdit, loadJobCard]);

  // Use custom hooks with API operations
  const camera = useCamera();

  // Create API operation wrappers that reload data after mutation
  const apiCostingOperations = {
    costing: costing,
    updateCosting: async (data) => {
      await api.updateCosting(jobCardId, data);
      // Reload costing data
      const costingRes = await api.getCosting(jobCardId);
      if (costingRes) {
        setCostingData({
          labour_hours: costingRes.labourHours || costingRes.labour_hours || 0,
          labour_rate: costingRes.labourRate || costingRes.labour_rate || 0,
          labour_special_hours: costingRes.labourSpecialHours || costingRes.labour_special_hours || 0,
          labour_special_rate: costingRes.labourSpecialRate || costingRes.labour_special_rate || 0,
          materials_cost: costingRes.materialsCost || costingRes.materials_cost || 0,
          materials_profit_percent: costingRes.materialsProfitPercent || costingRes.materials_profit_percent || 100,
          subcontractor_cost: costingRes.subcontractorCost || costingRes.subcontractor_cost || 0,
          subcontractor_profit_percent: costingRes.subcontractorProfitPercent || costingRes.subcontractor_profit_percent || 0
        });
      }
    }
  };

  const reloadSubcontracts = async () => {
    const res = await api.getSubcontracts(jobCardId);
    setSubcontracts((res || []).map(s => ({
      id: s.id,
      supplier_id: s.supplierId || s.supplier_id,
      supplier_name: s.supplierName || s.supplier_name,
      date_sent: s.dateSent || s.date_sent,
      date_expected: s.dateExpected || s.date_expected,
      date_received: s.dateReceived || s.date_received,
      notes: s.notes,
      status: s.status
    })));
  };

  const apiSubcontractOperations = {
    addSubcontract: async (data) => {
      await api.addSubcontract(jobCardId, data);
      await reloadSubcontracts();
    },
    updateSubcontract: async (id, data) => {
      await api.updateSubcontract(jobCardId, id, data);
      await reloadSubcontracts();
    },
    deleteSubcontract: async (id) => {
      await api.deleteSubcontract(jobCardId, id);
      await reloadSubcontracts();
    }
  };

  const reloadTimeEntries = async () => {
    const res = await api.getTimeEntries(jobCardId);
    setTimeEntries((res || []).map(t => ({
      id: t.id,
      item_number: t.itemNumber || t.item_number,
      machine_number: t.machineNumber || t.machine_number,
      qty: t.qty,
      description: t.description,
      start_time: t.startTime || t.start_time,
      end_time: t.endTime || t.end_time,
      equipment_checks_done: t.equipmentChecksDone || t.equipment_checks_done,
      measuring_verification_done: t.measuringVerificationDone || t.measuring_verification_done,
      first_off_inspection: t.firstOffInspection || t.first_off_inspection,
      first_off_inspection_notes: t.firstOffInspectionNotes || t.first_off_inspection_notes,
      in_process_validation: t.inProcessValidation || t.in_process_validation,
      in_process_validation_notes: t.inProcessValidationNotes || t.in_process_validation_notes,
      scrap_all_good: t.scrapAllGood !== undefined ? t.scrapAllGood : t.scrap_all_good,
      scrap_recycle_inhouse_qty: t.scrapRecycleInhouseQty || t.scrap_recycle_inhouse_qty,
      scrap_recycle_bin_qty: t.scrapRecycleBinQty || t.scrap_recycle_bin_qty
    })));
  };

  const apiTimeEntryOperations = {
    addTimeEntry: async (data) => {
      await api.addTimeEntry(jobCardId, data);
      await reloadTimeEntries();
    },
    updateTimeEntry: async (id, data) => {
      await api.updateTimeEntry(jobCardId, id, data);
      await reloadTimeEntries();
    },
    deleteTimeEntry: async (id) => {
      await api.deleteTimeEntry(jobCardId, id);
      await reloadTimeEntries();
    }
  };

  const costingHook = useCosting(jobCardId, apiCostingOperations);
  const subcontract = useSubcontracts(jobCardId, apiSubcontractOperations);
  const timeEntry = useTimeEntries(jobCardId, apiTimeEntryOperations);

  // Customer search effect using API
  useEffect(() => {
    const searchCustomers = async () => {
      if (customerSearch.length >= 2) {
        try {
          const results = await api.searchCustomers(customerSearch);
          setCustomers(results || []);
          setShowCustomerDropdown(true);
        } catch (err) {
          console.error('Failed to search customers:', err);
          setCustomers([]);
        }
      } else {
        setCustomers([]);
      }
    };

    const debounceTimer = setTimeout(searchCustomers, 300);
    return () => clearTimeout(debounceTimer);
  }, [customerSearch]);

  // Reset form when modal opens for create mode
  useEffect(() => {
    if (isOpen && !isEdit) {
      resetForm();
    }
    if (!isOpen) {
      camera.stopCamera();
    }
  }, [isOpen, isEdit]);

  // Click outside to close customer dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (customerSearchRef.current && !customerSearchRef.current.contains(event.target)) {
        setShowCustomerDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadScannerFiles = async () => {
    setLoadingScannerFiles(true);
    try {
      const result = await api.getScannerFiles(10);
      setScannerFiles(result.files || []);
    } catch (err) {
      console.error('Failed to load scanner files:', err);
      setScannerFiles([]);
    } finally {
      setLoadingScannerFiles(false);
    }
  };

  const toggleScannerFiles = () => {
    if (!showScannerFiles) {
      loadScannerFiles();
    }
    setShowScannerFiles(!showScannerFiles);
  };

  const resetForm = () => {
    setFormData(getDefaultFormData());
    setJobNumber('');
    setCustomer(null);
    setCustomerSearch('');
    setCustomerFormData(getDefaultCustomerFormData());
    setAssignees([]);
    setLineItems([{ id: Date.now(), item_number: 1, qty: '', description: '' }]);
    setLocalSubcontracts([]);
    setSubcontracts([]);
    setTimeEntries([]);
    setQaForms([]);
    setCostingData(null);
    subcontract.resetSubcontracts();
    timeEntry.resetTimeEntries();
    costingHook.resetCosting();
    camera.setPhotos([]);
    setActiveTab('details');
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const selectCustomer = (cust) => {
    setCustomer(cust);
    setFormData(prev => ({
      ...prev,
      customer_id: cust.id,
      contact_name: cust.contact_name || cust.contactName || '',
      contact_phone: cust.contact_phone || cust.contactPhone || '',
      contact_email: cust.contact_email || cust.contactEmail || ''
    }));
    setCustomerFormData({
      company_name: cust.name,
      contact_name: cust.contact_name || cust.contactName || '',
      contact_phone: cust.contact_phone || cust.contactPhone || '',
      contact_email: cust.contact_email || cust.contactEmail || '',
      is_critical_qa: cust.is_critical_qa || cust.isCriticalQa || false
    });
    setCustomerSearch(cust.name);
    setShowCustomerDropdown(false);
    if (cust.is_critical_qa || cust.isCriticalQa) {
      setFormData(prev => ({ ...prev, quality_level: 'CRITICAL' }));
    }
  };

  const clearCustomer = () => {
    setCustomer(null);
    setFormData(prev => ({
      ...prev,
      customer_id: '',
      contact_name: '',
      contact_phone: '',
      contact_email: ''
    }));
    setCustomerFormData(getDefaultCustomerFormData());
    setCustomerSearch('');
  };

  const handleCustomerFieldChange = (field, value) => {
    setCustomerFormData(prev => ({ ...prev, [field]: value }));
    if (field === 'company_name') {
      setCustomerSearch(value);
      setShowCustomerDropdown(value.length >= 2);
      if (customer && value !== customer.name) {
        setCustomer(null);
        setFormData(prev => ({ ...prev, customer_id: '' }));
      }
    }
    if (['contact_name', 'contact_phone', 'contact_email'].includes(field)) {
      setFormData(prev => ({ ...prev, [field]: value }));
    }
    if (field === 'is_critical_qa' && value) {
      setFormData(prev => ({ ...prev, quality_level: 'CRITICAL' }));
    }
  };

  // Line Items handlers
  const addLineItem = () => {
    const nextNum = lineItems.length > 0 ? Math.max(...lineItems.map(i => i.item_number)) + 1 : 1;
    setLineItems([...lineItems, { id: Date.now(), item_number: nextNum, qty: '', description: '' }]);
  };

  const updateLineItem = (id, field, value) => {
    setLineItems(lineItems.map(item =>
      item.id === id ? { ...item, [field]: value } : item
    ));
  };

  const removeLineItem = (id) => {
    if (lineItems.length > 1) {
      setLineItems(lineItems.filter(item => item.id !== id));
    }
  };

  // Assignee handlers
  const toggleAssignee = (employee) => {
    const exists = assignees.find(a => a.user_id === employee.id);
    if (exists) {
      setAssignees(assignees.filter(a => a.user_id !== employee.id));
    } else {
      setAssignees([...assignees, { user_id: employee.id, user_name: employee.name || employee.username }]);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validation
    const errors = [];
    if (!formData.customer_id && !customerFormData.company_name.trim()) {
      errors.push('Customer/Company Name is required');
    }
    if (!formData.job_type) {
      errors.push('Job Type is required');
    }
    if (!formData.due_date) {
      errors.push('Due Date is required');
    }
    const validItems = lineItems.filter(item => item.description.trim());
    if (validItems.length === 0) {
      errors.push('At least one line item with description is required');
    }
    if (formData.is_repeat_job && !formData.repeat_job_reference) {
      errors.push('Previous Job Reference is required for repeat jobs');
    }

    if (errors.length > 0) {
      alert('Please fix the following:\n\n' + errors.join('\n'));
      return;
    }

    setSaving(true);

    try {
      let customerId = formData.customer_id;

      // Create new customer if needed (using API)
      if (!customerId && customerFormData.company_name.trim()) {
        const newCustomer = await api.createCustomer({
          name: customerFormData.company_name.trim(),
          contact_name: customerFormData.contact_name || null,
          contact_phone: customerFormData.contact_phone || null,
          contact_email: customerFormData.contact_email || null,
          is_critical_qa: customerFormData.is_critical_qa || false
        });
        customerId = newCustomer.id;
      }

      // Prepare job card data
      const jobcardData = {
        card_type: formData.card_type,
        status: formData.status,
        customer_id: customerId,
        customer_name: customerFormData.company_name || customer?.name,
        contact_name: customerFormData.contact_name,
        contact_phone: customerFormData.contact_phone,
        contact_email: customerFormData.contact_email,
        quality_level: customerFormData.is_critical_qa ? 'CRITICAL' : formData.quality_level,
        job_type: formData.job_type,
        priority: formData.priority,
        po_number: formData.po_number,
        quote_reference: formData.quote_reference,
        drawings_type: formData.drawings_type,
        customer_property: formData.customer_property,
        description: formData.description,
        due_date: formData.due_date,
        is_repeat_job: formData.is_repeat_job,
        repeat_job_reference: formData.repeat_job_reference,
        treatment_required: formData.treatment_required,
        treatment_other: formData.treatment_other,
        notes: formData.notes,
        photos: camera.photos,
        assignees: assignees
      };

      if (isEdit) {
        // Update existing job card using API
        await api.updateJobcard(jobCardId, jobcardData);

        // Get existing items from loaded data
        const existingItemIds = lineItems.filter(i => typeof i.id === 'number' && !String(i.id).startsWith('local_')).map(i => i.id);

        // Update or create items
        for (const item of validItems) {
          if (typeof item.id === 'number' && existingItemIds.includes(item.id)) {
            await api.updateJobItem(jobCardId, item.id, item);
          } else {
            await api.addJobItem(jobCardId, item);
          }
        }

        // Note: Deletion of removed items would require tracking original items
        // For simplicity, we're updating existing and adding new ones
      } else {
        // Create new job card using API
        const newJobcard = await api.createJobcard(jobcardData);

        // Create line items
        for (const item of validItems) {
          await api.addJobItem(newJobcard.id, item);
        }

        // Create subcontracts from local state
        for (const sub of localSubcontracts.filter(s => s.supplier_id)) {
          await api.addSubcontract(newJobcard.id, {
            supplier_id: sub.supplier_id,
            supplier_name: sub.supplier_name,
            date_sent: sub.date_sent || null,
            date_expected: sub.date_expected || null,
            notes: sub.notes || null,
            status: sub.status || 'PENDING'
          });
        }
      }

      onSuccess?.();
      onClose();
    } catch (err) {
      console.error('Failed to save job card:', err);
      alert(err.message || 'Failed to save job card');
    } finally {
      setSaving(false);
    }
  };

  const handleConvertToJobCard = async () => {
    if (!confirm('Convert this quote to a job card?')) return;

    try {
      await api.convertToJobcard(jobCardId);
      await loadJobCard(); // Reload data after conversion
      onSuccess?.();
    } catch (err) {
      console.error('Failed to convert:', err);
      alert(err.message || 'Failed to convert to job card');
    }
  };

  if (!isOpen) return null;

  const isOverdue = formData.due_date && new Date(formData.due_date) < new Date() &&
    !['DONE', 'INVOICED'].includes(formData.status);

  // Build title (no sync status indicator)
  const buildTitle = () => {
    return isEdit ? `Edit: ${jobNumber}` : 'New Job Card';
  };

  return (
    <>
      <BottomSheet
        isOpen={isOpen}
        onClose={onClose}
        title={buildTitle()}
        size="large"
      >
        {loading ? (
          <div className="loading" style={{ padding: '2rem' }}>Loading...</div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'contents' }}>
            <BottomSheet.Body>
              {/* Tabs for edit mode */}
              {isEdit && (
                <div className="modal-tabs">
                  <button type="button" className={`tab ${activeTab === 'details' ? 'active' : ''}`} onClick={() => setActiveTab('details')}>Details</button>
                  <button type="button" className={`tab ${activeTab === 'items' ? 'active' : ''}`} onClick={() => setActiveTab('items')}>Items</button>
                  <button type="button" className={`tab ${activeTab === 'subcontracts' ? 'active' : ''}`} onClick={() => setActiveTab('subcontracts')}>Subcontracts</button>
                  <button type="button" className={`tab ${activeTab === 'time' ? 'active' : ''}`} onClick={() => setActiveTab('time')}>Time</button>
                  <button type="button" className={`tab ${activeTab === 'qa' ? 'active' : ''}`} onClick={() => setActiveTab('qa')}>QA</button>
                  {isAdmin && <button type="button" className={`tab ${activeTab === 'costing' ? 'active' : ''}`} onClick={() => setActiveTab('costing')}>Costing</button>}
                  <button type="button" className={`tab ${activeTab === 'photos' ? 'active' : ''}`} onClick={() => setActiveTab('photos')}>Photos</button>
                </div>
              )}

              {/* Details Tab */}
              {(activeTab === 'details' || !isEdit) && (
                <DetailsTab
                  isEdit={isEdit}
                  jobNumber={jobNumber}
                  formData={formData}
                  setFormData={setFormData}
                  handleChange={handleChange}
                  customer={customer}
                  customerFormData={customerFormData}
                  handleCustomerFieldChange={handleCustomerFieldChange}
                  selectCustomer={selectCustomer}
                  clearCustomer={clearCustomer}
                  customers={customers}
                  showCustomerDropdown={showCustomerDropdown}
                  setShowCustomerDropdown={setShowCustomerDropdown}
                  customerSearchRef={customerSearchRef}
                  employees={employees || []}
                  assignees={assignees}
                  toggleAssignee={toggleAssignee}
                  lineItems={lineItems}
                  addLineItem={addLineItem}
                  updateLineItem={updateLineItem}
                  removeLineItem={removeLineItem}
                  subcontracts={isEdit ? subcontracts : localSubcontracts}
                  setSubcontracts={isEdit ? null : setLocalSubcontracts}
                  suppliers={suppliers || []}
                  showScannerFiles={showScannerFiles}
                  toggleScannerFiles={toggleScannerFiles}
                  scannerFiles={scannerFiles}
                  loadingScannerFiles={loadingScannerFiles}
                  handleConvertToJobCard={handleConvertToJobCard}
                  isOverdue={isOverdue}
                />
              )}

              {/* Items Tab */}
              {activeTab === 'items' && isEdit && (
                <ItemsTab
                  lineItems={lineItems}
                  addLineItem={addLineItem}
                  updateLineItem={updateLineItem}
                  removeLineItem={removeLineItem}
                />
              )}

              {/* Subcontracts Tab */}
              {activeTab === 'subcontracts' && isEdit && (
                <SubcontractsTab
                  subcontracts={subcontracts || []}
                  showSubcontractForm={subcontract.showSubcontractForm}
                  editingSubcontractId={subcontract.editingSubcontractId}
                  subcontractForm={subcontract.subcontractForm}
                  handleSubcontractChange={subcontract.handleSubcontractChange}
                  handleAddSubcontract={subcontract.handleAddSubcontract}
                  handleEditSubcontract={subcontract.handleEditSubcontract}
                  handleSaveSubcontract={subcontract.handleSaveSubcontract}
                  handleDeleteSubcontract={subcontract.handleDeleteSubcontract}
                  resetSubcontractForm={subcontract.resetSubcontractForm}
                  suppliers={suppliers || []}
                />
              )}

              {/* Time Tab */}
              {activeTab === 'time' && isEdit && (
                <TimeEntryTab
                  timeEntries={timeEntries || []}
                  showTimeEntryForm={timeEntry.showTimeEntryForm}
                  editingTimeEntryId={timeEntry.editingTimeEntryId}
                  timeEntryForm={timeEntry.timeEntryForm}
                  handleTimeEntryChange={timeEntry.handleTimeEntryChange}
                  handleAddTimeEntry={timeEntry.handleAddTimeEntry}
                  handleEditTimeEntry={timeEntry.handleEditTimeEntry}
                  handleSaveTimeEntry={timeEntry.handleSaveTimeEntry}
                  handleDeleteTimeEntry={timeEntry.handleDeleteTimeEntry}
                  resetTimeEntryForm={timeEntry.resetTimeEntryForm}
                  lineItems={lineItems}
                  machines={machines || []}
                />
              )}

              {/* Costing Tab (Admin only) */}
              {activeTab === 'costing' && isEdit && isAdmin && (
                <CostingTab
                  costingForm={costingHook.costingForm}
                  handleCostingChange={costingHook.handleCostingChange}
                  calculateCostingTotals={costingHook.calculateCostingTotals}
                  handleSaveCosting={costingHook.handleSaveCosting}
                  savingCosting={costingHook.savingCosting}
                />
              )}

              {/* QA Forms Tab */}
              {activeTab === 'qa' && isEdit && (
                <QAFormsTab formData={formData} qaForms={qaForms || []} />
              )}

              {/* Photos Tab */}
              {activeTab === 'photos' && isEdit && (
                <PhotosTab
                  photos={camera.photos}
                  cameraActive={camera.cameraActive}
                  cameraReady={camera.cameraReady}
                  startCamera={camera.startCamera}
                  stopCamera={camera.stopCamera}
                  capturePhoto={camera.capturePhoto}
                  removePhoto={camera.removePhoto}
                  setSelectedPhoto={camera.setSelectedPhoto}
                  videoRef={camera.videoRef}
                />
              )}
            </BottomSheet.Body>

            <BottomSheet.Footer>
              <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Saving...' : isEdit ? 'Update' : 'Create'}
              </button>
            </BottomSheet.Footer>
          </form>
        )}
      </BottomSheet>

      {/* Photo Preview Modal */}
      {camera.selectedPhoto && (
        <div className="photo-modal" onClick={() => camera.setSelectedPhoto(null)}>
          <div className="photo-modal-content" onClick={e => e.stopPropagation()}>
            <button className="photo-modal-close" onClick={() => camera.setSelectedPhoto(null)}>×</button>
            <img src={camera.selectedPhoto.data} alt="Full size" />
          </div>
        </div>
      )}
    </>
  );
}
