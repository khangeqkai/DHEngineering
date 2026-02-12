import { useEffect, useState, useRef } from 'react';
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
  getDefaultCustomerFormData,
  mapTimeEntryFromApi,
  mapSubcontractFromApi,
  mapQaFormFromApi,
  mapAssigneeFromApi,
  mapLineItemFromApi
} from './mappers';

export default function JobCardModal({ isOpen, onClose, jobCardId = null, onSuccess }) {
  const { user } = useAuth();
  const isEdit = Boolean(jobCardId);
  const isAdmin = user?.role === 'admin';

  const [activeTab, setActiveTab] = useState('details');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Core form data
  const [formData, setFormData] = useState(getDefaultFormData());
  const [jobNumber, setJobNumber] = useState('');

  // Customer state
  const [customer, setCustomer] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [customerFormData, setCustomerFormData] = useState(getDefaultCustomerFormData());
  const customerSearchRef = useRef(null);

  // Related data
  const [employees, setEmployees] = useState([]);
  const [assignees, setAssignees] = useState([]);
  const [lineItems, setLineItems] = useState([{ id: Date.now(), item_number: 1, qty: '', description: '' }]);
  const [suppliers, setSuppliers] = useState([]);
  const [machines, setMachines] = useState([]);
  const [qaForms, setQaForms] = useState([]);

  // Scanner files state
  const [scannerFiles, setScannerFiles] = useState([]);
  const [loadingScannerFiles, setLoadingScannerFiles] = useState(false);
  const [showScannerFiles, setShowScannerFiles] = useState(false);

  // Use custom hooks
  const camera = useCamera();
  const costing = useCosting(jobCardId);
  const subcontract = useSubcontracts(jobCardId);
  const timeEntry = useTimeEntries(jobCardId);

  // Load data when modal opens
  useEffect(() => {
    if (isOpen) {
      loadInitialData();
      if (isEdit) {
        loadJobCard();
      } else {
        resetForm();
      }
    } else {
      camera.stopCamera();
    }
  }, [isOpen, jobCardId]);

  // Customer search effect
  useEffect(() => {
    if (customerSearch.length >= 2) {
      searchCustomers(customerSearch);
    } else {
      setCustomers([]);
    }
  }, [customerSearch]);

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

  const loadInitialData = async () => {
    try {
      const [employeesData, suppliersData, machinesData] = await Promise.all([
        api.getUsers(),
        api.getSuppliers(),
        api.getMachines().catch(() => [])
      ]);
      setEmployees(employeesData.filter(u => u.active));
      setSuppliers(suppliersData);
      setMachines(machinesData);
    } catch (err) {
      console.error('Failed to load initial data:', err);
    }
  };

  const searchCustomers = async (query) => {
    try {
      const results = await api.searchCustomers(query);
      setCustomers(results);
      setShowCustomerDropdown(true);
    } catch (err) {
      console.error('Failed to search customers:', err);
    }
  };

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
    subcontract.resetSubcontracts();
    timeEntry.resetTimeEntries();
    costing.resetCosting();
    camera.setPhotos([]);
    setQaForms([]);
    setActiveTab('details');
    setLoading(false);
  };

  const loadJobCard = async () => {
    setLoading(true);
    try {
      const data = await api.getJobcard(jobCardId);

      setJobNumber(data.jobNumber);
      setFormData({
        card_type: data.cardType || 'JOB_CARD',
        status: data.status || 'OPEN',
        customer_id: data.customerId || '',
        contact_name: data.contactName || '',
        contact_phone: data.contactPhone || '',
        contact_email: data.contactEmail || '',
        quality_level: data.qualityLevel || 'STANDARD',
        job_type: data.jobType || '',
        priority: data.priority || 'NONE',
        po_number: data.poNumber || '',
        quote_reference: data.quoteReference || '',
        drawings_type: data.drawingsType || 'NONE',
        customer_property: data.customerProperty || '',
        description: data.description || '',
        due_date: data.dueDate || '',
        is_repeat_job: data.isRepeatJob || false,
        repeat_job_reference: data.repeatJobReference || '',
        treatment_required: data.treatmentRequired || 'NONE',
        treatment_other: data.treatmentOther || '',
        notes: data.notes || ''
      });

      // Handle customer data
      if (data.customerId && data.customerName) {
        setCustomer({ id: data.customerId, name: data.customerName, is_critical_qa: data.customerIsCritical });
        setCustomerSearch(data.customerName);
        setCustomerFormData({
          company_name: data.customerName,
          contact_name: data.contactName || '',
          contact_phone: data.contactPhone || '',
          contact_email: data.contactEmail || '',
          is_critical_qa: data.customerIsCritical || false
        });
      }

      setAssignees((data.assignees || []).map(mapAssigneeFromApi));
      const mappedItems = (data.items || []).map(mapLineItemFromApi);
      setLineItems(mappedItems.length > 0 ? mappedItems : [{ id: Date.now(), item_number: 1, qty: '', description: '' }]);
      subcontract.setSubcontracts((data.subcontracts || []).map(mapSubcontractFromApi));
      camera.setPhotos(Array.isArray(data.photos) ? data.photos : []);

      // Fetch additional data
      const [timeEntriesData, qaFormsData] = await Promise.all([
        api.getTimeEntries(jobCardId).catch(() => []),
        api.getQAForms(jobCardId).catch(() => [])
      ]);

      timeEntry.setTimeEntries(timeEntriesData.map(mapTimeEntryFromApi));
      setQaForms(qaFormsData.map(mapQaFormFromApi));

      // Fetch costing for admin
      if (isAdmin) {
        await costing.loadCosting();
      }
    } catch (err) {
      console.error('Failed to load job card:', err);
      alert('Failed to load job card');
      onClose();
    } finally {
      setLoading(false);
    }
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
      contact_name: cust.contact_name || '',
      contact_phone: cust.contact_phone || '',
      contact_email: cust.contact_email || ''
    }));
    setCustomerFormData({
      company_name: cust.name,
      contact_name: cust.contact_name || '',
      contact_phone: cust.contact_phone || '',
      contact_email: cust.contact_email || '',
      is_critical_qa: cust.is_critical_qa || false
    });
    setCustomerSearch(cust.name);
    setShowCustomerDropdown(false);
    if (cust.is_critical_qa) {
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
    const invalidSubcontracts = subcontract.subcontracts.filter(s => s.isNew && !s.supplier_id);
    if (invalidSubcontracts.length > 0) {
      errors.push('All subcontracts must have a supplier selected');
    }

    if (errors.length > 0) {
      alert('Please fix the following:\n\n' + errors.join('\n'));
      return;
    }

    setSaving(true);

    try {
      let customerId = formData.customer_id;

      // Create new customer if needed
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

      // Prepare subcontracts for submission
      const validSubcontracts = subcontract.subcontracts
        .filter(s => s.supplier_id)
        .map(s => ({
          supplierId: s.supplier_id,
          dateSent: s.date_sent || null,
          dateExpected: s.date_expected || null,
          notes: s.notes || null,
          status: s.status || 'PENDING'
        }));

      const jobcardData = {
        cardType: formData.card_type,
        status: formData.status,
        customerId: customerId,
        contactName: customerFormData.contact_name,
        contactPhone: customerFormData.contact_phone,
        contactEmail: customerFormData.contact_email,
        qualityLevel: customerFormData.is_critical_qa ? 'CRITICAL' : formData.quality_level,
        jobType: formData.job_type,
        priority: formData.priority,
        poNumber: formData.po_number,
        quoteReference: formData.quote_reference,
        drawingsType: formData.drawings_type,
        customerProperty: formData.customer_property,
        description: formData.description,
        dueDate: formData.due_date,
        isRepeatJob: formData.is_repeat_job,
        repeatJobReference: formData.repeat_job_reference,
        treatmentRequired: formData.treatment_required,
        treatmentOther: formData.treatment_other,
        notes: formData.notes,
        photos: camera.photos,
        items: validItems,
        assigneeIds: assignees.map(a => a.user_id),
        subcontracts: validSubcontracts
      };

      if (isEdit) {
        await api.updateJobcard(jobCardId, jobcardData);
      } else {
        await api.createJobcard(jobcardData);
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
      loadJobCard();
      onSuccess?.();
    } catch (err) {
      console.error('Failed to convert:', err);
      alert(err.message || 'Failed to convert to job card');
    }
  };

  if (!isOpen) return null;

  const isOverdue = formData.due_date && new Date(formData.due_date) < new Date() &&
    !['DONE', 'INVOICED'].includes(formData.status);

  return (
    <>
      <BottomSheet
        isOpen={isOpen}
        onClose={onClose}
        title={isEdit ? `Edit: ${jobNumber}` : 'New Job Card'}
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
                  employees={employees}
                  assignees={assignees}
                  toggleAssignee={toggleAssignee}
                  lineItems={lineItems}
                  addLineItem={addLineItem}
                  updateLineItem={updateLineItem}
                  removeLineItem={removeLineItem}
                  subcontracts={subcontract.subcontracts}
                  setSubcontracts={subcontract.setSubcontracts}
                  suppliers={suppliers}
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
                  subcontracts={subcontract.subcontracts}
                  showSubcontractForm={subcontract.showSubcontractForm}
                  editingSubcontractId={subcontract.editingSubcontractId}
                  subcontractForm={subcontract.subcontractForm}
                  handleSubcontractChange={subcontract.handleSubcontractChange}
                  handleAddSubcontract={subcontract.handleAddSubcontract}
                  handleEditSubcontract={subcontract.handleEditSubcontract}
                  handleSaveSubcontract={subcontract.handleSaveSubcontract}
                  handleDeleteSubcontract={subcontract.handleDeleteSubcontract}
                  resetSubcontractForm={subcontract.resetSubcontractForm}
                  suppliers={suppliers}
                />
              )}

              {/* Time Tab */}
              {activeTab === 'time' && isEdit && (
                <TimeEntryTab
                  timeEntries={timeEntry.timeEntries}
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
                  machines={machines}
                />
              )}

              {/* Costing Tab (Admin only) */}
              {activeTab === 'costing' && isEdit && isAdmin && (
                <CostingTab
                  costingForm={costing.costingForm}
                  handleCostingChange={costing.handleCostingChange}
                  calculateCostingTotals={costing.calculateCostingTotals}
                  handleSaveCosting={costing.handleSaveCosting}
                  savingCosting={costing.savingCosting}
                />
              )}

              {/* QA Forms Tab */}
              {activeTab === 'qa' && isEdit && (
                <QAFormsTab formData={formData} qaForms={qaForms} />
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
