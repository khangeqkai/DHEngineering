import { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import BottomSheet from '../common/BottomSheet';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import './JobCardModal.css';

// Custom hooks
import { useCamera } from './useCamera';
import { useCosting } from './useCosting';
import { useSubcontracts } from './useSubcontracts';
import { useTimeEntries } from './useTimeEntries';
import { useCustomerSearch } from './useCustomerSearch';
import { useJobCardForm } from './useJobCardForm';

// Tab components
import DetailsTab from './tabs/DetailsTab';
import ItemsTab from './tabs/ItemsTab';
import SubcontractsTab from './tabs/SubcontractsTab';
import TimeEntryTab from './tabs/TimeEntryTab';
import CostingTab from './tabs/CostingTab';
import QAFormsTab from './tabs/QAFormsTab';
import PhotosTab from './tabs/PhotosTab';

export default function JobCardModal({ isOpen, onClose, jobCardId = null, onSuccess }) {
  const { user } = useAuth();
  const isEdit = Boolean(jobCardId);
  const isAdmin = user?.role === 'admin';

  const [activeTab, setActiveTab] = useState('details');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  // Reference data loaded from API
  const [suppliers, setSuppliers] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [machines, setMachines] = useState([]);

  // Job card related data from API (for edit mode)
  const [timeEntries, setTimeEntries] = useState([]);
  const [subcontracts, setSubcontracts] = useState([]);
  const [qaForms, setQaForms] = useState([]);
  const [costing, setCostingData] = useState(null);

  // Custom hooks
  const camera = useCamera();
  const customerHook = useCustomerSearch();
  const formHook = useJobCardForm();

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
        const activeEmployees = (usersRes || [])
          .filter(u => u.active === 1 || u.active === true)
          .sort((a, b) => (a.name || a.username || '').localeCompare(b.name || b.username || ''));
        setEmployees(activeEmployees);
        setMachines(machinesRes || []);
      } catch (err) {
        console.error('Failed to load reference data:', err);
        toast.error('Failed to load reference data');
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

      // Set form data using hook
      formHook.setFormDataFromJobCard(jobcardData);

      // Set customer data using hook
      customerHook.setCustomerFromJobCard(jobcardData);

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
      toast.error('Failed to load job card data');
    } finally {
      setLoading(false);
    }
  }, [isEdit, jobCardId, isAdmin, formHook, customerHook, camera]);

  // Load job card data when jobCardId changes
  useEffect(() => {
    if (isOpen && isEdit) {
      loadJobCard();
    }
  }, [isOpen, isEdit, loadJobCard]);

  // Create API operation wrappers that reload data after mutation
  const apiCostingOperations = {
    costing: costing,
    updateCosting: async (data) => {
      await api.updateCosting(jobCardId, data);
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

  // Memoized reset function to satisfy React hooks rules
  const resetForm = useCallback(() => {
    formHook.resetForm();
    customerHook.resetCustomer();
    setSubcontracts([]);
    setTimeEntries([]);
    setQaForms([]);
    setCostingData(null);
    subcontract.resetSubcontracts();
    timeEntry.resetTimeEntries();
    costingHook.resetCosting();
    camera.setPhotos([]);
    setActiveTab('details');
  }, [formHook, customerHook, subcontract, timeEntry, costingHook, camera]);

  // Reset form when modal opens for create mode
  useEffect(() => {
    if (isOpen && !isEdit) {
      resetForm();
    }
    if (!isOpen) {
      camera.stopCamera();
    }
  }, [isOpen, isEdit, resetForm, camera]);

  const loadScannerFiles = async () => {
    formHook.setLoadingScannerFiles(true);
    try {
      const result = await api.getScannerFiles(10);
      formHook.setScannerFiles(result.files || []);
    } catch (err) {
      console.error('Failed to load scanner files:', err);
      toast.error('Failed to load scanner files');
      formHook.setScannerFiles([]);
    } finally {
      formHook.setLoadingScannerFiles(false);
    }
  };

  const toggleScannerFiles = () => {
    if (!formHook.showScannerFiles) {
      loadScannerFiles();
    }
    formHook.setShowScannerFiles(!formHook.showScannerFiles);
  };

  // Wrapper functions that pass setFormData to customer hook
  const selectCustomer = (cust) => customerHook.selectCustomer(cust, formHook.setFormData);
  const clearCustomer = () => customerHook.clearCustomer(formHook.setFormData);
  const handleCustomerFieldChange = (field, value) => customerHook.handleCustomerFieldChange(field, value, formHook.setFormData);

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validation
    const errors = [];
    if (!formHook.formData.customer_id && !customerHook.customerFormData.company_name.trim()) {
      errors.push('Customer/Company Name is required');
    }
    if (!formHook.formData.job_type) {
      errors.push('Job Type is required');
    }
    if (!formHook.formData.due_date) {
      errors.push('Due Date is required');
    }
    const validItems = formHook.lineItems.filter(item => item.description.trim());
    if (validItems.length === 0) {
      errors.push('At least one line item with description is required');
    }
    if (formHook.formData.is_repeat_job && !formHook.formData.repeat_job_reference) {
      errors.push('Previous Job Reference is required for repeat jobs');
    }

    if (errors.length > 0) {
      toast.error('Please fix the following:\n\n' + errors.join('\n'));
      return;
    }

    setSaving(true);

    try {
      let customerId = formHook.formData.customer_id;

      // Create new customer if needed (using API)
      if (!customerId && customerHook.customerFormData.company_name.trim()) {
        const newCustomer = await api.createCustomer({
          name: customerHook.customerFormData.company_name.trim(),
          contact_name: customerHook.customerFormData.contact_name || null,
          contact_phone: customerHook.customerFormData.contact_phone || null,
          contact_email: customerHook.customerFormData.contact_email || null,
          is_critical_qa: customerHook.customerFormData.is_critical_qa || false
        });
        customerId = newCustomer.id;
      }

      // Prepare job card data
      const jobcardData = {
        card_type: formHook.formData.card_type,
        status: formHook.formData.status,
        customer_id: customerId,
        customer_name: customerHook.customerFormData.company_name || customerHook.customer?.name,
        contact_name: customerHook.customerFormData.contact_name,
        contact_phone: customerHook.customerFormData.contact_phone,
        contact_email: customerHook.customerFormData.contact_email,
        quality_level: customerHook.customerFormData.is_critical_qa ? 'CRITICAL' : formHook.formData.quality_level,
        job_type: formHook.formData.job_type,
        priority: formHook.formData.priority,
        po_number: formHook.formData.po_number,
        quote_reference: formHook.formData.quote_reference,
        drawings_type: formHook.formData.drawings_type,
        customer_property: formHook.formData.customer_property,
        description: formHook.formData.description,
        due_date: formHook.formData.due_date,
        is_repeat_job: formHook.formData.is_repeat_job,
        repeat_job_reference: formHook.formData.repeat_job_reference,
        treatment_required: formHook.formData.treatment_required,
        treatment_other: formHook.formData.treatment_other,
        notes: formHook.formData.notes,
        photos: camera.photos,
        assignees: formHook.assignees
      };

      if (isEdit) {
        await api.updateJobcard(jobCardId, jobcardData);
        const existingItemIds = formHook.lineItems.filter(i => typeof i.id === 'number' && !String(i.id).startsWith('local_')).map(i => i.id);
        for (const item of validItems) {
          if (typeof item.id === 'number' && existingItemIds.includes(item.id)) {
            await api.updateJobItem(jobCardId, item.id, item);
          } else {
            await api.addJobItem(jobCardId, item);
          }
        }
      } else {
        const newJobcard = await api.createJobcard(jobcardData);
        for (const item of validItems) {
          await api.addJobItem(newJobcard.id, item);
        }
        for (const sub of formHook.localSubcontracts.filter(s => s.supplier_id)) {
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
      toast.error(err.message || 'Failed to save job card');
    } finally {
      setSaving(false);
    }
  };

  const handleConvertToJobCard = async () => {
    if (!confirm('Convert this quote to a job card?')) return;

    try {
      await api.convertToJobcard(jobCardId);
      await loadJobCard();
      onSuccess?.();
    } catch (err) {
      console.error('Failed to convert:', err);
      toast.error(err.message || 'Failed to convert to job card');
    }
  };

  if (!isOpen) return null;

  const isOverdue = formHook.formData.due_date && new Date(formHook.formData.due_date) < new Date() &&
    !['DONE', 'INVOICED'].includes(formHook.formData.status);

  const buildTitle = () => isEdit ? `Edit: ${formHook.jobNumber}` : 'New Job Card';

  return (
    <>
      <BottomSheet isOpen={isOpen} onClose={onClose} title={buildTitle()} size="large">
        {loading ? (
          <div className="loading" style={{ padding: '2rem' }}>Loading...</div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'contents' }}>
            <BottomSheet.Body>
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

              {(activeTab === 'details' || !isEdit) && (
                <DetailsTab
                  isEdit={isEdit}
                  jobNumber={formHook.jobNumber}
                  formData={formHook.formData}
                  setFormData={formHook.setFormData}
                  handleChange={formHook.handleChange}
                  customer={customerHook.customer}
                  customerFormData={customerHook.customerFormData}
                  handleCustomerFieldChange={handleCustomerFieldChange}
                  selectCustomer={selectCustomer}
                  clearCustomer={clearCustomer}
                  customers={customerHook.customers}
                  showCustomerDropdown={customerHook.showCustomerDropdown}
                  setShowCustomerDropdown={customerHook.setShowCustomerDropdown}
                  customerSearchRef={customerHook.customerSearchRef}
                  employees={employees || []}
                  assignees={formHook.assignees}
                  toggleAssignee={formHook.toggleAssignee}
                  lineItems={formHook.lineItems}
                  addLineItem={formHook.addLineItem}
                  updateLineItem={formHook.updateLineItem}
                  removeLineItem={formHook.removeLineItem}
                  subcontracts={isEdit ? subcontracts : formHook.localSubcontracts}
                  setSubcontracts={isEdit ? null : formHook.setLocalSubcontracts}
                  suppliers={suppliers || []}
                  showScannerFiles={formHook.showScannerFiles}
                  toggleScannerFiles={toggleScannerFiles}
                  scannerFiles={formHook.scannerFiles}
                  loadingScannerFiles={formHook.loadingScannerFiles}
                  handleConvertToJobCard={handleConvertToJobCard}
                  isOverdue={isOverdue}
                />
              )}

              {activeTab === 'items' && isEdit && (
                <ItemsTab
                  lineItems={formHook.lineItems}
                  addLineItem={formHook.addLineItem}
                  updateLineItem={formHook.updateLineItem}
                  removeLineItem={formHook.removeLineItem}
                />
              )}

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
                  lineItems={formHook.lineItems}
                  machines={machines || []}
                />
              )}

              {activeTab === 'costing' && isEdit && isAdmin && (
                <CostingTab
                  costingForm={costingHook.costingForm}
                  handleCostingChange={costingHook.handleCostingChange}
                  calculateCostingTotals={costingHook.calculateCostingTotals}
                  handleSaveCosting={costingHook.handleSaveCosting}
                  savingCosting={costingHook.savingCosting}
                />
              )}

              {activeTab === 'qa' && isEdit && (
                <QAFormsTab formData={formHook.formData} qaForms={qaForms || []} />
              )}

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

      {camera.selectedPhoto && (
        <div className="photo-modal" onClick={() => camera.setSelectedPhoto(null)}>
          <div className="photo-modal-content" onClick={e => e.stopPropagation()}>
            <button className="photo-modal-close" onClick={() => camera.setSelectedPhoto(null)}>x</button>
            <img src={camera.selectedPhoto.data} alt="Full size" />
          </div>
        </div>
      )}
    </>
  );
}
