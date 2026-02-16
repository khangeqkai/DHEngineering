import { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import BottomSheet from '../common/BottomSheet';
import ConfirmDialog from '../common/ConfirmDialog';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';
import './JobCardModal.css';
import { useCamera } from './useCamera';
import { useCosting } from './useCosting';
import { useSubcontracts } from './useSubcontracts';
import { useTimeEntries } from './useTimeEntries';
import { useContactSearch } from './useContactSearch';
import { useJobCardForm } from './useJobCardForm';
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
  const [suppliers, setSuppliers] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [machines, setMachines] = useState([]);
  const [timeEntries, setTimeEntries] = useState([]);
  const [subcontracts, setSubcontracts] = useState([]);
  const [qaForms, setQaForms] = useState([]);
  const [costing, setCostingData] = useState(null);
  const camera = useCamera();
  const contactHook = useContactSearch();
  const formHook = useJobCardForm();
  const { dialogState, showConfirm, handleCancel, handleConfirm } = useConfirmDialog();

  // Load reference data on mount
  useEffect(() => {
    const loadReferenceData = async () => {
      try {
        const [suppliersRes, usersRes, machinesRes] = await Promise.all([
          api.getSuppliers(),
          api.getEmployees(),
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
  const { setFormDataFromJobCard, resetForm: resetFormHook } = formHook;
  const { setContactFromJobCard, resetContact } = contactHook;
  const { setPhotos, stopCamera } = camera;
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
      setFormDataFromJobCard(jobcardData);
      setContactFromJobCard(jobcardData);
      setPhotos(Array.isArray(jobcardData.photos) ? jobcardData.photos : []);
      setSubcontracts((subcontractsRes || []).map(s => ({
        id: s.id,
        supplierId: s.supplierId,
        supplierName: s.supplierName,
        dateSent: s.dateSent,
        dateExpected: s.dateExpected,
        dateReceived: s.dateReceived,
        notes: s.notes,
        status: s.status
      })));

      setTimeEntries((timeEntriesRes || []).map(t => ({
        id: t.id,
        userId: t.userId,
        userName: t.userName,
        itemNumber: t.itemNumber,
        machineNumber: t.machineNumber,
        qty: t.qty,
        description: t.description,
        startTime: t.startTime,
        endTime: t.endTime,
        equipmentChecksDone: t.equipmentChecksDone,
        measuringVerificationDone: t.measuringVerificationDone,
        firstOffInspection: t.firstOffInspection,
        firstOffInspectionNotes: t.firstOffInspectionNotes,
        inProcessValidation: t.inProcessValidation,
        inProcessValidationNotes: t.inProcessValidationNotes,
        scrapAllGood: t.scrapAllGood,
        scrapRecycleInhouseQty: t.scrapRecycleInhouseQty,
        scrapRecycleBinQty: t.scrapRecycleBinQty
      })));

      setQaForms(qaFormsRes || []);

      if (costingRes) {
        setCostingData({
          labourHours: costingRes.labourHours || 0,
          labourRate: costingRes.labourRate || 0,
          labourSpecialHours: costingRes.labourSpecialHours || 0,
          labourSpecialRate: costingRes.labourSpecialRate || 0,
          materialsCost: costingRes.materialsCost || 0,
          materialsProfitPercent: costingRes.materialsProfitPercent || 100,
          subcontractorCost: costingRes.subcontractorCost || 0,
          subcontractorProfitPercent: costingRes.subcontractorProfitPercent || 0
        });
      }
    } catch (err) {
      console.error('Failed to load job card:', err);
      toast.error('Failed to load job card data');
    } finally {
      setLoading(false);
    }
  }, [isEdit, jobCardId, isAdmin, setFormDataFromJobCard, setContactFromJobCard, setPhotos]);
  useEffect(() => {
    if (isOpen && isEdit) {
      loadJobCard();
    }
  }, [isOpen, isEdit, loadJobCard]);
  const apiCostingOperations = {
    costing: costing,
    updateCosting: async (data) => {
      await api.updateCosting(jobCardId, data);
      const costingRes = await api.getCosting(jobCardId);
      if (costingRes) {
        setCostingData({
          labourHours: costingRes.labourHours || 0,
          labourRate: costingRes.labourRate || 0,
          labourSpecialHours: costingRes.labourSpecialHours || 0,
          labourSpecialRate: costingRes.labourSpecialRate || 0,
          materialsCost: costingRes.materialsCost || 0,
          materialsProfitPercent: costingRes.materialsProfitPercent || 100,
          subcontractorCost: costingRes.subcontractorCost || 0,
          subcontractorProfitPercent: costingRes.subcontractorProfitPercent || 0
        });
      }
    }
  };

  const reloadSubcontracts = async () => {
    const res = await api.getSubcontracts(jobCardId);
    setSubcontracts((res || []).map(s => ({
      id: s.id,
      supplierId: s.supplierId,
      supplierName: s.supplierName,
      dateSent: s.dateSent,
      dateExpected: s.dateExpected,
      dateReceived: s.dateReceived,
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
      userId: t.userId,
      userName: t.userName,
      itemNumber: t.itemNumber,
      machineNumber: t.machineNumber,
      qty: t.qty,
      description: t.description,
      startTime: t.startTime,
      endTime: t.endTime,
      equipmentChecksDone: t.equipmentChecksDone,
      measuringVerificationDone: t.measuringVerificationDone,
      firstOffInspection: t.firstOffInspection,
      firstOffInspectionNotes: t.firstOffInspectionNotes,
      inProcessValidation: t.inProcessValidation,
      inProcessValidationNotes: t.inProcessValidationNotes,
      scrapAllGood: t.scrapAllGood,
      scrapRecycleInhouseQty: t.scrapRecycleInhouseQty,
      scrapRecycleBinQty: t.scrapRecycleBinQty
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
  const subcontract = useSubcontracts(jobCardId, { ...apiSubcontractOperations, showConfirm });
  const timeEntry = useTimeEntries(jobCardId, { ...apiTimeEntryOperations, showConfirm });
  const { resetSubcontracts } = subcontract;
  const { resetTimeEntries } = timeEntry;
  const { resetCosting } = costingHook;
  const resetForm = useCallback(() => {
    resetFormHook();
    resetContact();
    setSubcontracts([]);
    setTimeEntries([]);
    setQaForms([]);
    setCostingData(null);
    resetSubcontracts();
    resetTimeEntries();
    resetCosting();
    setPhotos([]);
    setActiveTab('details');
  }, [resetFormHook, resetContact, resetSubcontracts, resetTimeEntries, resetCosting, setPhotos]);
  useEffect(() => {
    if (isOpen && !isEdit) {
      resetForm();
    }
    if (!isOpen) {
      stopCamera();
    }
  }, [isOpen, isEdit, resetForm, stopCamera]);
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
  const selectContact = (cont) => contactHook.selectContact(cont, formHook.setFormData);
  const clearContact = () => contactHook.clearContact(formHook.setFormData);
  const handleContactFieldChange = (field, value) => contactHook.handleContactFieldChange(field, value, formHook.setFormData);
  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validation
    const errors = [];
    if (!isEdit && !formHook.formData.jobNumber?.trim()) {
      errors.push('Job number is required');
    }
    if (isAdmin && !formHook.formData.contactId && !contactHook.contactFormData.contactName.trim()) {
      errors.push('Contact name is required');
    }
    if (!formHook.formData.jobType) {
      errors.push('Job type is required');
    }
    if (!formHook.formData.dueDate) {
      errors.push('Due date is required');
    }
    const validItems = formHook.lineItems.filter(item => item.description.trim());
    if (validItems.length === 0) {
      errors.push('Add at least one line item');
    }
    if (formHook.formData.isRepeatJob && !formHook.formData.repeatJobReference) {
      errors.push('Previous job reference is required');
    }

    if (errors.length > 0) {
      toast.dismiss();
      errors.forEach(msg => toast.error(msg));
      return;
    }

    setSaving(true);

    try {
      let contactId = formHook.formData.contactId;

      if (isAdmin) {
        // Smart detection: Check if user edited a selected contact and changed the name
        if (contactHook.hasContactNameChanged()) {
          const saveNew = await showConfirm({
            title: 'Save New Contact',
            message: `Save "${contactHook.contactFormData.contactName}" as a new contact?`,
            confirmLabel: 'Save',
            cancelLabel: 'No',
            confirmVariant: 'primary'
          });
          if (saveNew) {
            // Create new contact
            const newContact = await api.createContact({
              contactName: contactHook.contactFormData.contactName.trim(),
              companyName: contactHook.contactFormData.companyName || null,
              phone: contactHook.contactFormData.phone || null,
              email: contactHook.contactFormData.email || null
            });
            contactId = newContact.id;
            toast.success('New contact saved');
          }
          // If not saving as new, keep the original contactId but use override fields
        }

        // Create new contact if no contact selected and contact name provided
        if (!contactId && contactHook.contactFormData.contactName.trim()) {
          const newContact = await api.createContact({
            contactName: contactHook.contactFormData.contactName.trim(),
            companyName: contactHook.contactFormData.companyName || null,
            phone: contactHook.contactFormData.phone || null,
            email: contactHook.contactFormData.email || null
          });
          contactId = newContact.id;
        }
      }

      const jobcardData = {
        jobNumber: formHook.formData.jobNumber,
        status: formHook.formData.status,
        ...(isAdmin && {
          contactId: contactId,
          contactName: contactHook.contactFormData.contactName,
          companyName: contactHook.contactFormData.companyName,
          contactPhone: contactHook.contactFormData.phone,
          contactEmail: contactHook.contactFormData.email,
        }),
        qualityLevel: formHook.formData.qualityLevel,
        jobType: formHook.formData.jobType,
        priority: formHook.formData.priority,
        poNumber: formHook.formData.poNumber,
        quoteReference: formHook.formData.quoteReference,
        drawingsType: formHook.formData.drawingsType,
        customerProperty: formHook.formData.customerProperty,
        description: formHook.formData.description,
        dueDate: formHook.formData.dueDate,
        isRepeatJob: formHook.formData.isRepeatJob,
        repeatJobReference: formHook.formData.repeatJobReference,
        treatmentRequired: formHook.formData.treatmentRequired,
        treatmentOther: formHook.formData.treatmentOther,
        notes: formHook.formData.notes,
        photos: camera.photos,
        assigneeIds: formHook.assignees.map(a => a.userId),
        items: validItems.map((item, idx) => ({
          itemNumber: item.itemNumber || idx + 1,
          qty: item.qty,
          description: item.description
        }))
      };
      if (isEdit) {
        await api.updateJobcard(jobCardId, jobcardData);
      } else {
        const newJobcard = await api.createJobcard(jobcardData);
        // Add subcontracts for new job cards
        for (const sub of formHook.localSubcontracts.filter(s => s.supplierId)) {
          await api.addSubcontract(newJobcard.id, {
            supplierId: sub.supplierId,
            supplierName: sub.supplierName,
            dateSent: sub.dateSent || null,
            dateExpected: sub.dateExpected || null,
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
  if (!isOpen) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isOverdue = formHook.formData.dueDate?.trim() &&
    new Date(formHook.formData.dueDate + 'T00:00:00') < today &&
    !['DONE', 'INVOICED'].includes(formHook.formData.status);
  const buildTitle = () => isEdit ? `Edit: ${formHook.jobNumber}` : 'New Job Card';
  return (
    <>
      <BottomSheet isOpen={isOpen} onClose={onClose} title={buildTitle()} size="large" closeOnOverlayClick={false}>
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
                  isAdmin={isAdmin}
                  jobNumber={formHook.jobNumber}
                  formData={formHook.formData}
                  setFormData={formHook.setFormData}
                  handleChange={formHook.handleChange}
                  contact={contactHook.contact}
                  contactFormData={contactHook.contactFormData}
                  handleContactFieldChange={handleContactFieldChange}
                  selectContact={selectContact}
                  clearContact={clearContact}
                  contacts={contactHook.contacts}
                  showContactDropdown={contactHook.showContactDropdown}
                  setShowContactDropdown={contactHook.setShowContactDropdown}
                  contactSearchRef={contactHook.contactSearchRef}
                  contactSearch={contactHook.contactSearch}
                  setContactSearch={contactHook.setContactSearch}
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
                  treatmentRequired={formHook.formData.treatmentRequired}
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

      <ConfirmDialog
        isOpen={dialogState.isOpen}
        title={dialogState.title}
        message={dialogState.message}
        confirmLabel={dialogState.confirmLabel}
        cancelLabel={dialogState.cancelLabel}
        confirmVariant={dialogState.confirmVariant}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </>
  );
}
