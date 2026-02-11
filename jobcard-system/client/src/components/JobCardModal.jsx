import { useEffect, useState, useRef } from 'react';
import BottomSheet from './common/BottomSheet';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';

const JOB_TYPES = [
  'QUOTE', 'MANUFACTURE', 'REPAIR', 'MODIFY', 'FABRICATE',
  'SUPPLY', 'REVERSE ENGINEER', 'INSPECTION', 'CAD DRAWINGS',
  'CONSULTATION', 'ON-SITE'
];

const PRIORITY_OPTIONS = ['NONE', 'LOW', 'MEDIUM', 'HIGH'];

const DRAWINGS_TYPES = [
  { value: 'NONE', label: 'None' },
  { value: 'CUSTOMER_CAD', label: 'Customer CAD' },
  { value: 'CUSTOMER_SKETCH', label: 'Customer Sketch' },
  { value: 'DH_CAD', label: 'DH CAD' },
  { value: 'DH_SKETCH', label: 'DH Sketch' },
  { value: 'PREPARE_SKETCH', label: 'Prepare Sketch' },
  { value: 'PREPARE_CAD', label: 'Prepare CAD' }
];

const TREATMENT_OPTIONS = [
  { value: 'NONE', label: 'None' },
  { value: 'HEAT_TREATMENT', label: 'Heat Treatment' },
  { value: 'PRECISION_GRINDING', label: 'Precision Grinding' },
  { value: 'ANODISE', label: 'Anodise' },
  { value: 'ELECTROPLATE', label: 'Electroplate' },
  { value: 'BLASTING', label: 'Blasting' },
  { value: 'POWDERCOAT', label: 'Powdercoat' },
  { value: 'SPRAYPAINT', label: 'Spraypaint' },
  { value: 'GALVANISE', label: 'Galvanise' },
  { value: 'SPECIALISED_COATING', label: 'Specialised Coating' },
  { value: 'OTHER', label: 'Other' }
];

const CUSTOMER_PROPERTY_OPTIONS = [
  { value: 'NONE', label: 'None' },
  { value: 'MATERIAL_SUPPLIED', label: 'Material Supplied' },
  { value: 'DAMAGED_WORN_SAMPLE', label: 'Damaged or Worn Sample' },
  { value: 'GOOD_SAMPLE', label: 'Good Sample' },
  { value: 'PART_FOR_REPAIR', label: 'Part for Repair' },
  { value: 'PART_FOR_MODIFICATION', label: 'Part for Modification' }
];

const STATUS_OPTIONS = [
  { value: 'QUOTE', label: 'Quote' },
  { value: 'OPEN', label: 'Open' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'ON_HOLD', label: 'On Hold' },
  { value: 'DONE', label: 'Done' },
  { value: 'INVOICED', label: 'Invoiced' }
];

const QA_FORM_OPTIONS = [
  { code: 'DHE-F39', name: 'Critical QA Inspection Form' },
  { code: 'DHE-F15', name: 'First Article Inspection' },
  { code: 'DHE-F09', name: 'Material Test Certificate' },
  { code: 'DHE-F43', name: 'Non-Conformance Report' }
];

export default function JobCardModal({ isOpen, onClose, jobCardId = null, onSuccess }) {
  const { user } = useAuth();
  const isEdit = Boolean(jobCardId);
  const isAdmin = user?.role === 'admin';

  const [activeTab, setActiveTab] = useState('details');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Core form data
  const [formData, setFormData] = useState({
    card_type: 'JOB_CARD',
    status: 'OPEN',
    customer_id: '',
    contact_name: '',
    contact_phone: '',
    contact_email: '',
    quality_level: 'STANDARD',
    job_type: '',
    priority: 'NONE',
    po_number: '',
    quote_reference: '',
    drawings_type: 'NONE',
    customer_property: '',
    description: '',
    due_date: '',
    is_repeat_job: false,
    repeat_job_reference: '',
    treatment_required: 'NONE',
    treatment_other: '',
    notes: ''
  });

  // Related data
  const [jobNumber, setJobNumber] = useState('');
  const [customer, setCustomer] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);

  // Customer form data (shown inline, supports both existing and new customers)
  const [customerFormData, setCustomerFormData] = useState({
    company_name: '',
    contact_name: '',
    contact_phone: '',
    contact_email: '',
    is_critical_qa: false
  });
  const [employees, setEmployees] = useState([]);
  const [assignees, setAssignees] = useState([]);
  const [lineItems, setLineItems] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [subcontracts, setSubcontracts] = useState([]);
  const [timeEntries, setTimeEntries] = useState([]);
  const [costing, setCosting] = useState(null);
  const [qaForms, setQaForms] = useState([]);
  const [photos, setPhotos] = useState([]);

  // Camera state
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const customerSearchRef = useRef(null);

  // Scanner files state
  const [scannerFiles, setScannerFiles] = useState([]);
  const [loadingScannerFiles, setLoadingScannerFiles] = useState(false);
  const [showScannerFiles, setShowScannerFiles] = useState(false);

  // Time tracking state
  const [machines, setMachines] = useState([]);
  const [showTimeEntryForm, setShowTimeEntryForm] = useState(false);
  const [editingTimeEntryId, setEditingTimeEntryId] = useState(null);
  const [timeEntryForm, setTimeEntryForm] = useState({
    item_number: '',
    machine_number: '',
    qty: '',
    description: '',
    start_time: '',
    end_time: '',
    // Special Ops
    equipment_checks_done: false,
    measuring_verification_done: false,
    first_off_inspection: 'NOT_APPLICABLE',
    first_off_inspection_notes: '',
    in_process_validation: 'NOT_APPLICABLE',
    in_process_validation_notes: '',
    // Scrap Rate
    scrap_all_good: true,
    scrap_recycle_inhouse_qty: 0,
    scrap_recycle_bin_qty: 0
  });

  // Subcontract state
  const [showSubcontractForm, setShowSubcontractForm] = useState(false);
  const [editingSubcontractId, setEditingSubcontractId] = useState(null);
  const [subcontractForm, setSubcontractForm] = useState({
    supplier_id: '',
    date_sent: '',
    date_expected: '',
    date_received: '',
    notes: '',
    status: 'PENDING'
  });

  // Costing state (admin only)
  const [costingForm, setCostingForm] = useState({
    labour_hours: 0,
    labour_rate: 0,
    labour_special_hours: 0,
    labour_special_rate: 0,
    materials_cost: 0,
    materials_profit_percent: 100,
    subcontractor_cost: 0,
    subcontractor_profit_percent: 0
  });
  const [savingCosting, setSavingCosting] = useState(false);

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
      stopCamera();
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

  // Camera stream handling
  useEffect(() => {
    if (cameraActive && streamRef.current && videoRef.current) {
      videoRef.current.srcObject = streamRef.current;
      const checkVideo = setInterval(() => {
        if (videoRef.current?.videoWidth > 0) {
          setCameraReady(true);
          clearInterval(checkVideo);
        }
      }, 100);
      return () => clearInterval(checkVideo);
    }
  }, [cameraActive]);

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
        api.getMachines().catch(() => []) // Machines may not exist yet
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

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const formatFileDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const resetForm = () => {
    setFormData({
      card_type: 'JOB_CARD',
      status: 'OPEN',
      customer_id: '',
      contact_name: '',
      contact_phone: '',
      contact_email: '',
      quality_level: 'STANDARD',
      job_type: '',
      priority: 'NONE',
      po_number: '',
      quote_reference: '',
      drawings_type: 'NONE',
      customer_property: '',
      description: '',
      due_date: '',
      is_repeat_job: false,
      repeat_job_reference: '',
      treatment_required: 'NONE',
      treatment_other: '',
      notes: ''
    });
    setJobNumber('');
    setCustomer(null);
    setCustomerSearch('');
    setCustomerFormData({
      company_name: '',
      contact_name: '',
      contact_phone: '',
      contact_email: '',
      is_critical_qa: false
    });
    setAssignees([]);
    setLineItems([{ id: Date.now(), item_number: 1, qty: '', description: '' }]);
    setSubcontracts([]);
    setTimeEntries([]);
    setCosting(null);
    setQaForms([]);
    setPhotos([]);
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

      // Map assignees from camelCase API response
      const mappedAssignees = (data.assignees || []).map(a => ({
        user_id: a.userId,
        user_name: a.userName || a.username
      }));
      setAssignees(mappedAssignees);

      // Map line items from camelCase API response
      const mappedItems = (data.items || []).map(item => ({
        id: item.id,
        item_number: item.itemNumber,
        qty: item.qty || '',
        description: item.description || ''
      }));
      setLineItems(mappedItems.length > 0 ? mappedItems : [{ id: Date.now(), item_number: 1, qty: '', description: '' }]);

      // Map subcontracts from camelCase API response
      const mappedSubcontracts = (data.subcontracts || []).map(s => ({
        id: s.id,
        supplier_id: s.supplierId,
        supplier_name: s.supplierName,
        date_sent: s.dateSent || '',
        date_expected: s.dateExpected || '',
        date_received: s.dateReceived || '',
        status: s.status,
        notes: s.notes || ''
      }));
      setSubcontracts(mappedSubcontracts);

      setPhotos(Array.isArray(data.photos) ? data.photos : []);

      // Fetch additional data in parallel
      const [timeEntriesData, qaFormsData] = await Promise.all([
        api.getTimeEntries(jobCardId).catch(() => []),
        api.getQAForms(jobCardId).catch(() => [])
      ]);

      // Map time entries from camelCase
      const mappedTimeEntries = timeEntriesData.map(e => ({
        id: e.id,
        user_id: e.userId,
        user_name: e.userName,
        item_number: e.itemNumber,
        machine_number: e.machineNumber,
        qty: e.qty,
        description: e.description,
        start_time: e.startTime,
        end_time: e.endTime,
        equipment_checks_done: e.equipmentChecksDone,
        measuring_verification_done: e.measuringVerificationDone,
        first_off_inspection: e.firstOffInspection,
        first_off_inspection_notes: e.firstOffInspectionNotes,
        in_process_validation: e.inProcessValidation,
        in_process_validation_notes: e.inProcessValidationNotes,
        scrap_all_good: e.scrapAllGood,
        scrap_recycle_inhouse_qty: e.scrapRecycleInhouseQty,
        scrap_recycle_bin_qty: e.scrapRecycleBinQty
      }));
      setTimeEntries(mappedTimeEntries);

      // Map QA forms from camelCase
      const mappedQaForms = qaFormsData.map(f => ({
        id: f.id,
        form_code: f.formCode,
        form_name: f.formName,
        status: f.status,
        printed_at: f.printedAt,
        scanned_at: f.scannedAt,
        notes: f.notes
      }));
      setQaForms(mappedQaForms);

      // Fetch costing for admin
      if (isAdmin) {
        const costingData = await api.getCosting(jobCardId).catch(() => null);
        if (costingData) {
          setCosting({
            labour_hours: costingData.labourHours || 0,
            labour_rate: costingData.labourRate || 0,
            labour_special_hours: costingData.labourSpecialHours || 0,
            labour_special_rate: costingData.labourSpecialRate || 0,
            materials_cost: costingData.materialsCost || 0,
            materials_profit_percent: costingData.materialsProfitPercent || 100,
            subcontractor_cost: costingData.subcontractorCost || 0,
            subcontractor_profit_percent: costingData.subcontractorProfitPercent || 0
          });
        }
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
    // Prefill the customer form with selected customer data
    setCustomerFormData({
      company_name: cust.name,
      contact_name: cust.contact_name || '',
      contact_phone: cust.contact_phone || '',
      contact_email: cust.contact_email || '',
      is_critical_qa: cust.is_critical_qa || false
    });
    setCustomerSearch(cust.name);
    setShowCustomerDropdown(false);

    // Auto-set quality level for critical customers
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
    setCustomerFormData({
      company_name: '',
      contact_name: '',
      contact_phone: '',
      contact_email: '',
      is_critical_qa: false
    });
    setCustomerSearch('');
  };

  // Handle changes to customer form fields
  const handleCustomerFieldChange = (field, value) => {
    setCustomerFormData(prev => ({ ...prev, [field]: value }));

    // If changing company name, clear existing customer selection and search
    if (field === 'company_name') {
      setCustomerSearch(value);
      if (value.length >= 2) {
        setShowCustomerDropdown(true);
      } else {
        setShowCustomerDropdown(false);
      }
      // Clear existing customer if name changed
      if (customer && value !== customer.name) {
        setCustomer(null);
        setFormData(prev => ({ ...prev, customer_id: '' }));
      }
    }

    // Update formData contact fields
    if (['contact_name', 'contact_phone', 'contact_email'].includes(field)) {
      setFormData(prev => ({ ...prev, [field]: value }));
    }

    // Update quality level if critical QA changed
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

  // Camera functions
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      streamRef.current = stream;
      setCameraActive(true);
    } catch (err) {
      console.error('Failed to access camera:', err);
      alert('Could not access camera: ' + err.message);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
    setCameraReady(false);
  };

  const capturePhoto = () => {
    if (!videoRef.current || !cameraReady) return;

    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    canvas.getContext('2d').drawImage(videoRef.current, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
    setPhotos(prev => [...prev, { id: Date.now(), data: dataUrl }]);
  };

  const removePhoto = (photoId) => {
    setPhotos(photos.filter(p => p.id !== photoId));
  };

  // Time entry handlers
  const resetTimeEntryForm = () => {
    setTimeEntryForm({
      item_number: '',
      machine_number: '',
      qty: '',
      description: '',
      start_time: new Date().toISOString().slice(0, 16),
      end_time: '',
      equipment_checks_done: false,
      measuring_verification_done: false,
      first_off_inspection: 'NOT_APPLICABLE',
      first_off_inspection_notes: '',
      in_process_validation: 'NOT_APPLICABLE',
      in_process_validation_notes: '',
      scrap_all_good: true,
      scrap_recycle_inhouse_qty: 0,
      scrap_recycle_bin_qty: 0
    });
    setEditingTimeEntryId(null);
    setShowTimeEntryForm(false);
  };

  const handleTimeEntryChange = (e) => {
    const { name, value, type, checked } = e.target;
    setTimeEntryForm(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleAddTimeEntry = () => {
    resetTimeEntryForm();
    setTimeEntryForm(prev => ({
      ...prev,
      start_time: new Date().toISOString().slice(0, 16)
    }));
    setShowTimeEntryForm(true);
  };

  const handleEditTimeEntry = (entry) => {
    setEditingTimeEntryId(entry.id);
    setTimeEntryForm({
      item_number: entry.item_number || '',
      machine_number: entry.machine_number || '',
      qty: entry.qty || '',
      description: entry.description || '',
      start_time: entry.start_time ? entry.start_time.slice(0, 16) : '',
      end_time: entry.end_time ? entry.end_time.slice(0, 16) : '',
      equipment_checks_done: entry.equipment_checks_done || false,
      measuring_verification_done: entry.measuring_verification_done || false,
      first_off_inspection: entry.first_off_inspection || 'NOT_APPLICABLE',
      first_off_inspection_notes: entry.first_off_inspection_notes || '',
      in_process_validation: entry.in_process_validation || 'NOT_APPLICABLE',
      in_process_validation_notes: entry.in_process_validation_notes || '',
      scrap_all_good: entry.scrap_all_good !== false,
      scrap_recycle_inhouse_qty: entry.scrap_recycle_inhouse_qty || 0,
      scrap_recycle_bin_qty: entry.scrap_recycle_bin_qty || 0
    });
    setShowTimeEntryForm(true);
  };

  const handleSaveTimeEntry = async () => {
    // Validation: Special Ops and Scrap Rate must be filled
    if (!timeEntryForm.equipment_checks_done || !timeEntryForm.measuring_verification_done) {
      alert('Equipment Checks and Measuring Equipment Verification must be completed');
      return;
    }
    if (timeEntryForm.first_off_inspection === 'ERROR' && !timeEntryForm.first_off_inspection_notes) {
      alert('Please provide notes for First Off Inspection error');
      return;
    }
    if (timeEntryForm.in_process_validation === 'ERROR' && !timeEntryForm.in_process_validation_notes) {
      alert('Please provide notes for In-process Validation error');
      return;
    }

    try {
      const entryData = {
        ...timeEntryForm,
        item_number: timeEntryForm.item_number ? parseInt(timeEntryForm.item_number) : null,
        scrap_recycle_inhouse_qty: parseInt(timeEntryForm.scrap_recycle_inhouse_qty) || 0,
        scrap_recycle_bin_qty: parseInt(timeEntryForm.scrap_recycle_bin_qty) || 0
      };

      if (editingTimeEntryId) {
        await api.updateTimeEntry(jobCardId, editingTimeEntryId, entryData);
      } else {
        await api.addTimeEntry(jobCardId, entryData);
      }

      // Reload time entries and map from camelCase
      const entriesData = await api.getTimeEntries(jobCardId);
      const mappedEntries = entriesData.map(e => ({
        id: e.id,
        user_id: e.userId,
        user_name: e.userName,
        item_number: e.itemNumber,
        machine_number: e.machineNumber,
        qty: e.qty,
        description: e.description,
        start_time: e.startTime,
        end_time: e.endTime,
        equipment_checks_done: e.equipmentChecksDone,
        measuring_verification_done: e.measuringVerificationDone,
        first_off_inspection: e.firstOffInspection,
        first_off_inspection_notes: e.firstOffInspectionNotes,
        in_process_validation: e.inProcessValidation,
        in_process_validation_notes: e.inProcessValidationNotes,
        scrap_all_good: e.scrapAllGood,
        scrap_recycle_inhouse_qty: e.scrapRecycleInhouseQty,
        scrap_recycle_bin_qty: e.scrapRecycleBinQty
      }));
      setTimeEntries(mappedEntries);
      resetTimeEntryForm();
    } catch (err) {
      console.error('Failed to save time entry:', err);
      alert(err.message || 'Failed to save time entry');
    }
  };

  const handleDeleteTimeEntry = async (entryId) => {
    if (!confirm('Delete this time entry?')) return;

    try {
      await api.deleteTimeEntry(jobCardId, entryId);
      const entriesData = await api.getTimeEntries(jobCardId);
      const mappedEntries = entriesData.map(e => ({
        id: e.id,
        user_id: e.userId,
        user_name: e.userName,
        item_number: e.itemNumber,
        machine_number: e.machineNumber,
        qty: e.qty,
        description: e.description,
        start_time: e.startTime,
        end_time: e.endTime,
        equipment_checks_done: e.equipmentChecksDone,
        measuring_verification_done: e.measuringVerificationDone,
        first_off_inspection: e.firstOffInspection,
        first_off_inspection_notes: e.firstOffInspectionNotes,
        in_process_validation: e.inProcessValidation,
        in_process_validation_notes: e.inProcessValidationNotes,
        scrap_all_good: e.scrapAllGood,
        scrap_recycle_inhouse_qty: e.scrapRecycleInhouseQty,
        scrap_recycle_bin_qty: e.scrapRecycleBinQty
      }));
      setTimeEntries(mappedEntries);
    } catch (err) {
      console.error('Failed to delete time entry:', err);
      alert(err.message || 'Failed to delete time entry');
    }
  };

  // Subcontract handlers
  const resetSubcontractForm = () => {
    setSubcontractForm({
      supplier_id: '',
      date_sent: '',
      date_expected: '',
      date_received: '',
      notes: '',
      status: 'PENDING'
    });
    setEditingSubcontractId(null);
    setShowSubcontractForm(false);
  };

  const handleSubcontractChange = (e) => {
    const { name, value } = e.target;
    setSubcontractForm(prev => ({ ...prev, [name]: value }));
  };

  const handleAddSubcontract = () => {
    resetSubcontractForm();
    setShowSubcontractForm(true);
  };

  const handleEditSubcontract = (sub) => {
    setEditingSubcontractId(sub.id);
    setSubcontractForm({
      supplier_id: sub.supplier_id || '',
      date_sent: sub.date_sent || '',
      date_expected: sub.date_expected || '',
      date_received: sub.date_received || '',
      notes: sub.notes || '',
      status: sub.status || 'PENDING'
    });
    setShowSubcontractForm(true);
  };

  const handleSaveSubcontract = async () => {
    if (!subcontractForm.supplier_id) {
      alert('Please select a supplier');
      return;
    }

    try {
      if (editingSubcontractId) {
        await api.updateSubcontract(jobCardId, editingSubcontractId, subcontractForm);
      } else {
        await api.addSubcontract(jobCardId, subcontractForm);
      }

      // Reload and map subcontracts from API response
      const subsData = await api.getSubcontracts(jobCardId);
      const mappedSubs = subsData.map(s => ({
        id: s.id,
        supplier_id: s.supplier_id,
        supplier_name: s.supplier_name,
        date_sent: s.date_sent || '',
        date_expected: s.date_expected || '',
        date_received: s.date_received || '',
        status: s.status,
        notes: s.notes || ''
      }));
      setSubcontracts(mappedSubs);
      resetSubcontractForm();
    } catch (err) {
      console.error('Failed to save subcontract:', err);
      alert(err.message || 'Failed to save subcontract');
    }
  };

  const handleDeleteSubcontract = async (subId) => {
    if (!confirm('Delete this subcontract?')) return;

    try {
      await api.deleteSubcontract(jobCardId, subId);
      const subsData = await api.getSubcontracts(jobCardId);
      const mappedSubs = subsData.map(s => ({
        id: s.id,
        supplier_id: s.supplier_id,
        supplier_name: s.supplier_name,
        date_sent: s.date_sent || '',
        date_expected: s.date_expected || '',
        date_received: s.date_received || '',
        status: s.status,
        notes: s.notes || ''
      }));
      setSubcontracts(mappedSubs);
    } catch (err) {
      console.error('Failed to delete subcontract:', err);
      alert(err.message || 'Failed to delete subcontract');
    }
  };

  // Costing handlers (admin only)
  useEffect(() => {
    if (costing) {
      setCostingForm({
        labour_hours: costing.labour_hours || 0,
        labour_rate: costing.labour_rate || 0,
        labour_special_hours: costing.labour_special_hours || 0,
        labour_special_rate: costing.labour_special_rate || 0,
        materials_cost: costing.materials_cost || 0,
        materials_profit_percent: costing.materials_profit_percent || 100,
        subcontractor_cost: costing.subcontractor_cost || 0,
        subcontractor_profit_percent: costing.subcontractor_profit_percent || 0
      });
    }
  }, [costing]);

  const handleCostingChange = (e) => {
    const { name, value } = e.target;
    setCostingForm(prev => ({ ...prev, [name]: parseFloat(value) || 0 }));
  };

  const calculateCostingTotals = () => {
    const labourTotal = costingForm.labour_hours * costingForm.labour_rate;
    const labourSpecialTotal = costingForm.labour_special_hours * costingForm.labour_special_rate;
    const materialsTotal = costingForm.materials_cost * (1 + costingForm.materials_profit_percent / 100);
    const subcontractorTotal = costingForm.subcontractor_cost * (1 + costingForm.subcontractor_profit_percent / 100);
    const grandTotal = labourTotal + labourSpecialTotal + materialsTotal + subcontractorTotal;

    return { labourTotal, labourSpecialTotal, materialsTotal, subcontractorTotal, grandTotal };
  };

  const handleSaveCosting = async () => {
    setSavingCosting(true);
    try {
      const totals = calculateCostingTotals();
      const costingData = {
        ...costingForm,
        labour_total: totals.labourTotal,
        labour_special_total: totals.labourSpecialTotal,
        materials_total: totals.materialsTotal,
        subcontractor_total: totals.subcontractorTotal,
        grand_total: totals.grandTotal
      };

      await api.updateCosting(jobCardId, costingData);
      const updatedCosting = await api.getCosting(jobCardId);
      setCosting(updatedCosting);
      alert('Costing saved successfully');
    } catch (err) {
      console.error('Failed to save costing:', err);
      alert(err.message || 'Failed to save costing');
    } finally {
      setSavingCosting(false);
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
    // Validate subcontracts - each must have a supplier selected
    const invalidSubcontracts = subcontracts.filter(s => s.isNew && !s.supplier_id);
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

      // If no existing customer selected but company name is filled, create new customer
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

      // Prepare subcontracts for submission (filter out incomplete ones)
      const validSubcontracts = subcontracts
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
        photos: photos,
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
                <div className="modal-form-grid">
                  {/* Header Info */}
                  {isEdit && (
                    <div className="form-section header-section">
                      <div className="job-header">
                        <div className="job-number-display">
                          <span className="label">Job #</span>
                          <span className="value">{jobNumber}</span>
                        </div>
                        {formData.card_type === 'QUOTE' && (
                          <button type="button" className="btn btn-success btn-sm" onClick={handleConvertToJobCard}>
                            Convert to Job Card
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Status & Type Row */}
                  <div className="form-section">
                    <h3 className="form-section-title">Classification</h3>
                    <div className="form-row">
                      <div className="form-group">
                        <label>Card Type</label>
                        <select name="card_type" value={formData.card_type} onChange={handleChange}>
                          <option value="JOB_CARD">Job Card</option>
                          <option value="QUOTE">Quote</option>
                        </select>
                      </div>
                      <div className="form-group">
                        <label>Status</label>
                        <select name="status" value={formData.status} onChange={handleChange}>
                          {STATUS_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="form-group">
                        <label>Priority</label>
                        <select name="priority" value={formData.priority} onChange={handleChange} className={formData.priority === 'HIGH' ? 'priority-high' : ''}>
                          {PRIORITY_OPTIONS.map(p => (
                            <option key={p} value={p}>{p}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Customer Section - All fields shown, with autocomplete on company name */}
                  <div className="form-section">
                    <h3 className="form-section-title">Customer <span className="required">*</span></h3>

                    {/* Selected customer indicator */}
                    {customer && (
                      <div className="selected-customer-banner">
                        <span>Existing customer selected: <strong>{customer.name}</strong></span>
                        {customer.is_critical_qa && <span className="badge badge-critical">Critical QA</span>}
                        <button type="button" className="btn-link" onClick={clearCustomer}>Clear</button>
                      </div>
                    )}

                    {/* Company Name with autocomplete */}
                    <div className="form-row">
                      <div className="form-group" style={{ flex: 2 }} ref={customerSearchRef}>
                        <label>Company Name <span className="required">*</span></label>
                        <div className="autocomplete-container">
                          <input
                            type="text"
                            value={customerFormData.company_name}
                            onChange={(e) => handleCustomerFieldChange('company_name', e.target.value)}
                            onFocus={() => customerFormData.company_name.length >= 2 && setShowCustomerDropdown(true)}
                            placeholder="Start typing company name..."
                            className={!customerFormData.company_name.trim() ? 'field-required' : customer ? 'field-selected' : ''}
                          />
                          {showCustomerDropdown && customers.length > 0 && (
                            <div className="customer-dropdown">
                              <div className="dropdown-hint">Select existing customer or continue typing to create new</div>
                              {customers.map(c => (
                                <div key={c.id} className="customer-option" onClick={() => selectCustomer(c)}>
                                  <span>{c.name}</span>
                                  {c.is_critical_qa && <span className="badge badge-critical">Critical QA</span>}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="form-group">
                        <label>Quality Management</label>
                        <label className="checkbox-inline">
                          <input
                            type="checkbox"
                            checked={customerFormData.is_critical_qa}
                            onChange={(e) => handleCustomerFieldChange('is_critical_qa', e.target.checked)}
                            disabled={customer?.is_critical_qa}
                          />
                          Critical QA
                        </label>
                      </div>
                    </div>

                    {customerFormData.is_critical_qa && (
                      <div className="critical-warning">
                        Critical QA customer - enhanced documentation and QA forms required
                      </div>
                    )}

                    {/* Contact fields - always visible */}
                    <div className="contact-fields-inline">
                      <p className="field-note">Contact details for this job (internal use, not printed):</p>
                      <div className="form-row">
                        <div className="form-group">
                          <label>Contact Name</label>
                          <input
                            type="text"
                            value={customerFormData.contact_name}
                            onChange={(e) => handleCustomerFieldChange('contact_name', e.target.value)}
                            placeholder="Contact person..."
                          />
                        </div>
                        <div className="form-group">
                          <label>Contact Phone</label>
                          <input
                            type="text"
                            value={customerFormData.contact_phone}
                            onChange={(e) => handleCustomerFieldChange('contact_phone', e.target.value)}
                            placeholder="Phone number..."
                          />
                        </div>
                        <div className="form-group">
                          <label>Contact Email</label>
                          <input
                            type="email"
                            value={customerFormData.contact_email}
                            onChange={(e) => handleCustomerFieldChange('contact_email', e.target.value)}
                            placeholder="Email address..."
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Job Details Section */}
                  <div className="form-section">
                    <h3 className="form-section-title">Job Details</h3>
                    <div className="form-row">
                      <div className="form-group">
                        <label>Quality Level</label>
                        <select name="quality_level" value={formData.quality_level} onChange={handleChange}>
                          <option value="STANDARD">Standard</option>
                          <option value="CRITICAL">Critical</option>
                        </select>
                      </div>
                      <div className="form-group">
                        <label>Job Type <span className="required">*</span></label>
                        <select name="job_type" value={formData.job_type} onChange={handleChange} className={!formData.job_type ? 'field-required' : ''}>
                          <option value="">Select job type...</option>
                          {JOB_TYPES.filter(t => {
                            // QUOTE option only available when card_type is QUOTE
                            if (t === 'QUOTE' && formData.card_type !== 'QUOTE') return false;
                            return true;
                          }).map(t => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* References */}
                  <div className="form-section">
                    <h3 className="form-section-title">References</h3>
                    <div className="form-row">
                      <div className="form-group">
                        <label>PO Number</label>
                        <input type="text" name="po_number" value={formData.po_number} onChange={handleChange} />
                      </div>
                      <div className="form-group">
                        <label>Quote Reference</label>
                        <input type="text" name="quote_reference" value={formData.quote_reference} onChange={handleChange} placeholder="QT-XXXXXXXX-XXX" />
                      </div>
                    </div>
                    <div className="form-group">
                      <label>Drawings</label>
                      <div className="checkbox-grid">
                        {DRAWINGS_TYPES.filter(d => d.value !== 'NONE').map(opt => {
                          const values = formData.drawings_type ? formData.drawings_type.split(',') : [];
                          const isChecked = values.includes(opt.value);
                          return (
                            <label key={opt.value} className={`checkbox-chip ${isChecked ? 'selected' : ''}`}>
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => {
                                  const current = formData.drawings_type ? formData.drawings_type.split(',').filter(v => v && v !== 'NONE') : [];
                                  const updated = e.target.checked
                                    ? [...current, opt.value]
                                    : current.filter(v => v !== opt.value);
                                  setFormData(prev => ({ ...prev, drawings_type: updated.length ? updated.join(',') : 'NONE' }));
                                }}
                              />
                              {opt.label}
                            </label>
                          );
                        })}
                      </div>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={toggleScannerFiles}
                        style={{ marginTop: '0.75rem' }}
                      >
                        {showScannerFiles ? 'Hide Scanner Files' : 'Browse Scanner Files'}
                      </button>
                      {showScannerFiles && (
                        <div className="scanner-files-container">
                          {loadingScannerFiles ? (
                            <p className="scanner-files-loading">Loading files...</p>
                          ) : scannerFiles.length === 0 ? (
                            <p className="scanner-files-empty">No scanned files found. Configure scanner folder in Settings.</p>
                          ) : (
                            <div className="scanner-files-list">
                              {scannerFiles.map((file, idx) => (
                                <div key={idx} className="scanner-file-item">
                                  <div className="scanner-file-icon">
                                    {file.name.toLowerCase().endsWith('.pdf') ? 'PDF' : 'IMG'}
                                  </div>
                                  <div className="scanner-file-info">
                                    <div className="scanner-file-name" title={file.name}>{file.name}</div>
                                    <div className="scanner-file-meta">
                                      {formatFileSize(file.size)} - {formatFileDate(file.modified)}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label>Due Date <span className="required">*</span></label>
                        <input
                          type="date"
                          name="due_date"
                          value={formData.due_date}
                          onChange={handleChange}
                          className={`${isOverdue ? 'overdue' : ''} ${!formData.due_date ? 'field-required' : ''}`}
                        />
                        {isOverdue && <span className="overdue-text">OVERDUE</span>}
                      </div>
                    </div>
                  </div>

                  {/* Description */}
                  <div className="form-section">
                    <h3 className="form-section-title">Description</h3>
                    <div className="form-group">
                      <textarea
                        name="description"
                        value={formData.description}
                        onChange={handleChange}
                        rows={3}
                        placeholder="Job description..."
                      />
                    </div>
                    <div className="form-group">
                      <label>Customer Property</label>
                      <div className="checkbox-grid">
                        {CUSTOMER_PROPERTY_OPTIONS.filter(o => o.value !== 'NONE').map(opt => {
                          const values = formData.customer_property ? formData.customer_property.split(',') : [];
                          const isChecked = values.includes(opt.value);
                          return (
                            <label key={opt.value} className={`checkbox-chip ${isChecked ? 'selected' : ''}`}>
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => {
                                  const current = formData.customer_property ? formData.customer_property.split(',').filter(v => v) : [];
                                  const updated = e.target.checked
                                    ? [...current, opt.value]
                                    : current.filter(v => v !== opt.value);
                                  setFormData(prev => ({ ...prev, customer_property: updated.join(',') }));
                                }}
                              />
                              {opt.label}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Line Items - Create mode only shows basic */}
                  {!isEdit && (
                    <div className="form-section">
                      <div className="form-section-header">
                        <h3 className="form-section-title">Line Items <span className="required">*</span></h3>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={addLineItem}>+ Add</button>
                      </div>
                      {lineItems.map((item, idx) => (
                        <div key={item.id} className="line-item-row">
                          <span className="item-num">#{item.item_number}</span>
                          <input
                            type="text"
                            placeholder="Qty"
                            value={item.qty}
                            onChange={(e) => updateLineItem(item.id, 'qty', e.target.value)}
                            style={{ width: '80px' }}
                          />
                          <input
                            type="text"
                            placeholder="Description"
                            value={item.description}
                            onChange={(e) => updateLineItem(item.id, 'description', e.target.value)}
                            style={{ flex: 1 }}
                          />
                          {lineItems.length > 1 && (
                            <button type="button" className="btn-icon danger" onClick={() => removeLineItem(item.id)}>×</button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Assignees */}
                  <div className="form-section">
                    <h3 className="form-section-title">Assignees</h3>
                    <div className="assignees-grid">
                      {employees.map(emp => {
                        const isAssigned = assignees.some(a => a.user_id === emp.id);
                        return (
                          <label key={emp.id} className={`assignee-chip ${isAssigned ? 'selected' : ''}`}>
                            <input
                              type="checkbox"
                              checked={isAssigned}
                              onChange={() => toggleAssignee(emp)}
                            />
                            {emp.name || emp.username}
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* Treatment & Repeat */}
                  <div className="form-section">
                    <h3 className="form-section-title">Treatment & Repeat Job</h3>
                    <div className="form-group">
                      <label>Treatment Required</label>
                      <div className="checkbox-grid">
                        {TREATMENT_OPTIONS.filter(o => o.value !== 'NONE').map(opt => {
                          const values = formData.treatment_required ? formData.treatment_required.split(',') : [];
                          const isChecked = values.includes(opt.value);
                          return (
                            <label key={opt.value} className={`checkbox-chip ${isChecked ? 'selected' : ''}`}>
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => {
                                  const current = formData.treatment_required ? formData.treatment_required.split(',').filter(v => v && v !== 'NONE') : [];
                                  const updated = e.target.checked
                                    ? [...current, opt.value]
                                    : current.filter(v => v !== opt.value);
                                  setFormData(prev => ({ ...prev, treatment_required: updated.length ? updated.join(',') : 'NONE' }));
                                }}
                              />
                              {opt.label}
                            </label>
                          );
                        })}
                      </div>
                      {formData.treatment_required?.includes('OTHER') && (
                        <input
                          type="text"
                          name="treatment_other"
                          value={formData.treatment_other}
                          onChange={handleChange}
                          placeholder="Specify other treatment..."
                          style={{ marginTop: '0.5rem' }}
                        />
                      )}
                    </div>
                    <div className="form-row" style={{ marginTop: '1rem' }}>
                      <div className="form-group checkbox-group">
                        <label className="checkbox-inline">
                          <input
                            type="checkbox"
                            name="is_repeat_job"
                            checked={formData.is_repeat_job}
                            onChange={handleChange}
                          />
                          Repeat Job
                        </label>
                      </div>
                      {formData.is_repeat_job && (
                        <div className="form-group" style={{ flex: 2 }}>
                          <label>Previous Job Reference <span className="required">*</span></label>
                          <input
                            type="text"
                            name="repeat_job_reference"
                            value={formData.repeat_job_reference}
                            onChange={handleChange}
                            placeholder="JC-XXXXXXXX-XXX"
                            className={formData.is_repeat_job && !formData.repeat_job_reference ? 'field-required' : ''}
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Subcontracts */}
                  <div className="form-section">
                    <div className="form-section-header">
                      <h3 className="form-section-title">Subcontracts</h3>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          if (!isEdit) {
                            // For create mode, add to local state
                            setSubcontracts([...subcontracts, {
                              id: Date.now(),
                              supplier_id: '',
                              supplier_name: '',
                              date_sent: '',
                              date_expected: '',
                              status: 'PENDING',
                              notes: '',
                              isNew: true
                            }]);
                          } else {
                            setShowSubcontractForm(true);
                            setEditingSubcontractId(null);
                          }
                        }}
                      >
                        + Add Subcontract
                      </button>
                    </div>
                    {subcontracts.length === 0 ? (
                      <p className="empty-state">No subcontracts added. Click "+ Add Subcontract" to add one.</p>
                    ) : (
                      <div className="subcontracts-list">
                        {subcontracts.map((sub, idx) => (
                          <div key={sub.id} className="subcontract-card">
                            {sub.isNew ? (
                              // Inline form for new subcontracts in create mode
                              <div className="subcontract-inline-form">
                                <div className="form-row">
                                  <div className="form-group">
                                    <label>Supplier <span className="required">*</span></label>
                                    <select
                                      value={sub.supplier_id}
                                      onChange={(e) => {
                                        const supplier = suppliers.find(s => s.id === e.target.value);
                                        const updated = [...subcontracts];
                                        updated[idx] = {
                                          ...sub,
                                          supplier_id: e.target.value,
                                          supplier_name: supplier?.name || ''
                                        };
                                        setSubcontracts(updated);
                                      }}
                                    >
                                      <option value="">Select supplier...</option>
                                      {suppliers.map(s => (
                                        <option key={s.id} value={s.id}>{s.name}</option>
                                      ))}
                                    </select>
                                  </div>
                                  <div className="form-group">
                                    <label>Date Sent</label>
                                    <input
                                      type="date"
                                      value={sub.date_sent}
                                      onChange={(e) => {
                                        const updated = [...subcontracts];
                                        updated[idx] = { ...sub, date_sent: e.target.value };
                                        setSubcontracts(updated);
                                      }}
                                    />
                                  </div>
                                  <div className="form-group">
                                    <label>Date Expected</label>
                                    <input
                                      type="date"
                                      value={sub.date_expected}
                                      onChange={(e) => {
                                        const updated = [...subcontracts];
                                        updated[idx] = { ...sub, date_expected: e.target.value };
                                        setSubcontracts(updated);
                                      }}
                                    />
                                  </div>
                                  <button
                                    type="button"
                                    className="btn-icon danger"
                                    onClick={() => setSubcontracts(subcontracts.filter(s => s.id !== sub.id))}
                                    style={{ alignSelf: 'flex-end', marginBottom: '0.5rem' }}
                                  >
                                    ×
                                  </button>
                                </div>
                              </div>
                            ) : (
                              // Display card for existing subcontracts
                              <div className="subcontract-display">
                                <div className="subcontract-header">
                                  <strong>{sub.supplier_name}</strong>
                                  <span className={`badge badge-${sub.status?.toLowerCase() || 'pending'}`}>
                                    {sub.status || 'PENDING'}
                                  </span>
                                </div>
                                <div className="subcontract-dates">
                                  {sub.date_sent && <span>Sent: {new Date(sub.date_sent).toLocaleDateString()}</span>}
                                  {sub.date_expected && <span>Expected: {new Date(sub.date_expected).toLocaleDateString()}</span>}
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Notes */}
                  <div className="form-section">
                    <h3 className="form-section-title">Internal Notes</h3>
                    <div className="form-group">
                      <textarea
                        name="notes"
                        value={formData.notes}
                        onChange={handleChange}
                        rows={2}
                        placeholder="Internal notes (not shown to customer)..."
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Items Tab */}
              {activeTab === 'items' && isEdit && (
                <div className="modal-form-grid">
                  <div className="form-section">
                    <div className="form-section-header">
                      <h3 className="form-section-title">Line Items <span className="required">*</span></h3>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={addLineItem}>+ Add Item</button>
                    </div>
                    <div className="items-table">
                      <div className="items-header">
                        <span>Item #</span>
                        <span>Qty</span>
                        <span>Description</span>
                        <span></span>
                      </div>
                      {lineItems.map(item => (
                        <div key={item.id} className="items-row">
                          <span className="item-num">#{item.item_number}</span>
                          <input
                            type="text"
                            value={item.qty}
                            onChange={(e) => updateLineItem(item.id, 'qty', e.target.value)}
                          />
                          <input
                            type="text"
                            value={item.description}
                            onChange={(e) => updateLineItem(item.id, 'description', e.target.value)}
                          />
                          {lineItems.length > 1 && (
                            <button type="button" className="btn-icon danger" onClick={() => removeLineItem(item.id)}>×</button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Subcontracts Tab */}
              {activeTab === 'subcontracts' && isEdit && (
                <div className="modal-form-grid">
                  {/* Add/Edit Subcontract Form */}
                  {showSubcontractForm && (
                    <div className="form-section subcontract-form">
                      <div className="form-section-header">
                        <h3 className="form-section-title">
                          {editingSubcontractId ? 'Edit Subcontract' : 'New Subcontract'}
                        </h3>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={resetSubcontractForm}>
                          Cancel
                        </button>
                      </div>

                      <div className="form-group">
                        <label>Supplier <span className="required">*</span></label>
                        <select name="supplier_id" value={subcontractForm.supplier_id} onChange={handleSubcontractChange}>
                          <option value="">Select approved supplier...</option>
                          {suppliers.map(s => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                      </div>

                      <div className="form-row">
                        <div className="form-group">
                          <label>Date Sent</label>
                          <input type="date" name="date_sent" value={subcontractForm.date_sent} onChange={handleSubcontractChange} />
                        </div>
                        <div className="form-group">
                          <label>Date Expected</label>
                          <input type="date" name="date_expected" value={subcontractForm.date_expected} onChange={handleSubcontractChange} />
                        </div>
                        <div className="form-group">
                          <label>Date Received</label>
                          <input type="date" name="date_received" value={subcontractForm.date_received} onChange={handleSubcontractChange} />
                        </div>
                      </div>

                      <div className="form-group">
                        <label>Status</label>
                        <select name="status" value={subcontractForm.status} onChange={handleSubcontractChange}>
                          <option value="PENDING">Pending</option>
                          <option value="SENT">Sent</option>
                          <option value="IN_PROGRESS">In Progress</option>
                          <option value="RECEIVED">Received</option>
                          <option value="COMPLETE">Complete</option>
                        </select>
                      </div>

                      <div className="form-group">
                        <label>Notes</label>
                        <textarea name="notes" value={subcontractForm.notes} onChange={handleSubcontractChange} rows={2} placeholder="Any notes about this subcontract..." />
                      </div>

                      <button type="button" className="btn btn-primary" onClick={handleSaveSubcontract}>
                        {editingSubcontractId ? 'Update Subcontract' : 'Add Subcontract'}
                      </button>
                    </div>
                  )}

                  {/* Subcontracts List */}
                  <div className="form-section">
                    <div className="form-section-header">
                      <h3 className="form-section-title">Subcontracts</h3>
                      {!showSubcontractForm && (
                        <button type="button" className="btn btn-primary btn-sm" onClick={handleAddSubcontract}>
                          + Add Subcontract
                        </button>
                      )}
                    </div>

                    {subcontracts.length === 0 ? (
                      <p className="empty-message">No subcontracts added yet.</p>
                    ) : (
                      <div className="subcontracts-list">
                        {subcontracts.map(sub => (
                          <div key={sub.id} className="subcontract-card">
                            <div className="subcontract-header">
                              <span className="supplier-name">{sub.supplier_name}</span>
                              <span className={`badge badge-${sub.status?.toLowerCase()}`}>{sub.status}</span>
                            </div>
                            <div className="subcontract-dates">
                              <span>Sent: {sub.date_sent || '-'}</span>
                              <span>Expected: {sub.date_expected || '-'}</span>
                              <span>Received: {sub.date_received || '-'}</span>
                            </div>
                            {sub.notes && <div className="subcontract-notes">{sub.notes}</div>}
                            <div className="subcontract-actions">
                              <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleEditSubcontract(sub)}>Edit</button>
                              <button type="button" className="btn btn-danger btn-sm" onClick={() => handleDeleteSubcontract(sub.id)}>Delete</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Time Tab */}
              {activeTab === 'time' && isEdit && (
                <div className="modal-form-grid">
                  {/* Add/Edit Time Entry Form */}
                  {showTimeEntryForm && (
                    <div className="form-section time-entry-form">
                      <div className="form-section-header">
                        <h3 className="form-section-title">
                          {editingTimeEntryId ? 'Edit Time Entry' : 'New Time Entry'}
                        </h3>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={resetTimeEntryForm}>
                          Cancel
                        </button>
                      </div>

                      {/* Basic Info */}
                      <div className="form-row">
                        <div className="form-group">
                          <label>Item #</label>
                          <select name="item_number" value={timeEntryForm.item_number} onChange={handleTimeEntryChange}>
                            <option value="">Select item...</option>
                            {lineItems.map(item => (
                              <option key={item.item_number} value={item.item_number}>
                                #{item.item_number} - {item.description?.substring(0, 30)}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="form-group">
                          <label>Machine #</label>
                          <select name="machine_number" value={timeEntryForm.machine_number} onChange={handleTimeEntryChange}>
                            <option value="">Select machine...</option>
                            {machines.map(m => (
                              <option key={m.id} value={m.machine_number}>{m.machine_number} {m.name && `- ${m.name}`}</option>
                            ))}
                          </select>
                        </div>
                        <div className="form-group">
                          <label>Qty</label>
                          <input type="text" name="qty" value={timeEntryForm.qty} onChange={handleTimeEntryChange} />
                        </div>
                      </div>

                      <div className="form-group">
                        <label>Description</label>
                        <input type="text" name="description" value={timeEntryForm.description} onChange={handleTimeEntryChange} />
                      </div>

                      <div className="form-row">
                        <div className="form-group">
                          <label>Start Time</label>
                          <input type="datetime-local" name="start_time" value={timeEntryForm.start_time} onChange={handleTimeEntryChange} />
                        </div>
                        <div className="form-group">
                          <label>End Time</label>
                          <input type="datetime-local" name="end_time" value={timeEntryForm.end_time} onChange={handleTimeEntryChange} />
                        </div>
                      </div>

                      {/* Special Ops Section */}
                      <div className="special-ops-section">
                        <h4>Special Ops <span className="required">*</span></h4>
                        <div className="form-row">
                          <div className="form-group checkbox-group">
                            <label>
                              <input type="checkbox" name="equipment_checks_done" checked={timeEntryForm.equipment_checks_done} onChange={handleTimeEntryChange} />
                              Equipment Checks Done
                            </label>
                          </div>
                          <div className="form-group checkbox-group">
                            <label>
                              <input type="checkbox" name="measuring_verification_done" checked={timeEntryForm.measuring_verification_done} onChange={handleTimeEntryChange} />
                              Measuring Equipment Verification Done
                            </label>
                          </div>
                        </div>

                        <div className="form-row">
                          <div className="form-group">
                            <label>First Off Inspection</label>
                            <select name="first_off_inspection" value={timeEntryForm.first_off_inspection} onChange={handleTimeEntryChange}>
                              <option value="NOT_APPLICABLE">Not Applicable</option>
                              <option value="OK">OK - Results recorded</option>
                              <option value="ERROR">Error</option>
                            </select>
                          </div>
                          <div className="form-group">
                            <label>In-process Validation</label>
                            <select name="in_process_validation" value={timeEntryForm.in_process_validation} onChange={handleTimeEntryChange}>
                              <option value="NOT_APPLICABLE">Not Applicable</option>
                              <option value="OK">OK - Results recorded</option>
                              <option value="ERROR">Error</option>
                            </select>
                          </div>
                        </div>

                        {timeEntryForm.first_off_inspection === 'ERROR' && (
                          <div className="form-group">
                            <label>First Off Inspection Notes <span className="required">*</span></label>
                            <input type="text" name="first_off_inspection_notes" value={timeEntryForm.first_off_inspection_notes} onChange={handleTimeEntryChange} placeholder="Describe the error..." />
                          </div>
                        )}
                        {timeEntryForm.in_process_validation === 'ERROR' && (
                          <div className="form-group">
                            <label>In-process Validation Notes <span className="required">*</span></label>
                            <input type="text" name="in_process_validation_notes" value={timeEntryForm.in_process_validation_notes} onChange={handleTimeEntryChange} placeholder="Describe the error..." />
                          </div>
                        )}
                      </div>

                      {/* Scrap Rate Analysis */}
                      <div className="scrap-rate-section">
                        <h4>Scrap Rate Analysis</h4>
                        <div className="form-group checkbox-group">
                          <label>
                            <input type="checkbox" name="scrap_all_good" checked={timeEntryForm.scrap_all_good} onChange={handleTimeEntryChange} />
                            All Good (No Scrap)
                          </label>
                        </div>
                        {!timeEntryForm.scrap_all_good && (
                          <div className="form-row">
                            <div className="form-group">
                              <label>Recycle In-House Qty</label>
                              <input type="number" name="scrap_recycle_inhouse_qty" value={timeEntryForm.scrap_recycle_inhouse_qty} onChange={handleTimeEntryChange} min="0" />
                            </div>
                            <div className="form-group">
                              <label>Recycle Bin Qty</label>
                              <input type="number" name="scrap_recycle_bin_qty" value={timeEntryForm.scrap_recycle_bin_qty} onChange={handleTimeEntryChange} min="0" />
                            </div>
                          </div>
                        )}
                      </div>

                      <button type="button" className="btn btn-primary" onClick={handleSaveTimeEntry}>
                        {editingTimeEntryId ? 'Update Entry' : 'Save Entry'}
                      </button>
                    </div>
                  )}

                  {/* Time Entries List */}
                  <div className="form-section">
                    <div className="form-section-header">
                      <h3 className="form-section-title">Time Entries</h3>
                      {!showTimeEntryForm && (
                        <button type="button" className="btn btn-primary btn-sm" onClick={handleAddTimeEntry}>
                          + Add Entry
                        </button>
                      )}
                    </div>

                    {timeEntries.length === 0 ? (
                      <p className="empty-message">No time entries recorded yet.</p>
                    ) : (
                      <div className="time-entries-list">
                        {timeEntries.map(entry => {
                          const hasError = entry.first_off_inspection === 'ERROR' || entry.in_process_validation === 'ERROR';
                          return (
                            <div key={entry.id} className={`time-entry-card ${hasError ? 'has-error' : ''}`}>
                              <div className="entry-header">
                                <div className="entry-info">
                                  <span className="user-name">{entry.user_name}</span>
                                  <span className="entry-date">{new Date(entry.start_time).toLocaleDateString()}</span>
                                  {entry.machine_number && <span className="machine-badge">M#{entry.machine_number}</span>}
                                  {entry.item_number && <span className="item-badge">Item #{entry.item_number}</span>}
                                </div>
                                <div className="entry-actions">
                                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleEditTimeEntry(entry)}>Edit</button>
                                  <button type="button" className="btn btn-danger btn-sm" onClick={() => handleDeleteTimeEntry(entry.id)}>Delete</button>
                                </div>
                              </div>
                              <div className="entry-body">
                                <div className="entry-description">{entry.description || 'No description'}</div>
                                <div className="entry-time">
                                  <span>{new Date(entry.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                  <span> - </span>
                                  <span>{entry.end_time ? new Date(entry.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'In progress'}</span>
                                  {entry.end_time && (
                                    <span className="duration">
                                      ({Math.round((new Date(entry.end_time) - new Date(entry.start_time)) / 60000)} min)
                                    </span>
                                  )}
                                </div>
                                <div className="entry-special-ops">
                                  <span className={entry.equipment_checks_done ? 'status-ok' : 'status-pending'}>
                                    Equip: {entry.equipment_checks_done ? 'Done' : 'Pending'}
                                  </span>
                                  <span className={entry.measuring_verification_done ? 'status-ok' : 'status-pending'}>
                                    Measure: {entry.measuring_verification_done ? 'Done' : 'Pending'}
                                  </span>
                                  <span className={entry.first_off_inspection === 'ERROR' ? 'status-error' : 'status-ok'}>
                                    1st Off: {entry.first_off_inspection || 'N/A'}
                                  </span>
                                  <span className={entry.in_process_validation === 'ERROR' ? 'status-error' : 'status-ok'}>
                                    In-proc: {entry.in_process_validation || 'N/A'}
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Costing Tab (Admin only) */}
              {activeTab === 'costing' && isEdit && isAdmin && (
                <div className="modal-form-grid">
                  <div className="form-section">
                    <h3 className="form-section-title">Job Costing (Admin Only)</h3>

                    {/* Labour */}
                    <div className="costing-row">
                      <span className="costing-label">Labour</span>
                      <div className="costing-inputs">
                        <div className="costing-field">
                          <label>Hours</label>
                          <input type="number" name="labour_hours" value={costingForm.labour_hours} onChange={handleCostingChange} min="0" step="0.5" />
                        </div>
                        <div className="costing-field">
                          <label>Rate ($/hr)</label>
                          <input type="number" name="labour_rate" value={costingForm.labour_rate} onChange={handleCostingChange} min="0" step="0.01" />
                        </div>
                        <div className="costing-field total">
                          <label>Total</label>
                          <span className="costing-total">${(costingForm.labour_hours * costingForm.labour_rate).toFixed(2)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Labour Special */}
                    <div className="costing-row">
                      <span className="costing-label">Labour Special</span>
                      <div className="costing-inputs">
                        <div className="costing-field">
                          <label>Hours</label>
                          <input type="number" name="labour_special_hours" value={costingForm.labour_special_hours} onChange={handleCostingChange} min="0" step="0.5" />
                        </div>
                        <div className="costing-field">
                          <label>Rate ($/hr)</label>
                          <input type="number" name="labour_special_rate" value={costingForm.labour_special_rate} onChange={handleCostingChange} min="0" step="0.01" />
                        </div>
                        <div className="costing-field total">
                          <label>Total</label>
                          <span className="costing-total">${(costingForm.labour_special_hours * costingForm.labour_special_rate).toFixed(2)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Materials */}
                    <div className="costing-row">
                      <span className="costing-label">Materials</span>
                      <div className="costing-inputs">
                        <div className="costing-field">
                          <label>Cost</label>
                          <input type="number" name="materials_cost" value={costingForm.materials_cost} onChange={handleCostingChange} min="0" step="0.01" />
                        </div>
                        <div className="costing-field">
                          <label>Profit %</label>
                          <input type="number" name="materials_profit_percent" value={costingForm.materials_profit_percent} onChange={handleCostingChange} min="0" />
                        </div>
                        <div className="costing-field total">
                          <label>Total</label>
                          <span className="costing-total">${(costingForm.materials_cost * (1 + costingForm.materials_profit_percent / 100)).toFixed(2)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Subcontractor */}
                    <div className="costing-row">
                      <span className="costing-label">Subcontractor</span>
                      <div className="costing-inputs">
                        <div className="costing-field">
                          <label>Cost</label>
                          <input type="number" name="subcontractor_cost" value={costingForm.subcontractor_cost} onChange={handleCostingChange} min="0" step="0.01" />
                        </div>
                        <div className="costing-field">
                          <label>Profit %</label>
                          <input type="number" name="subcontractor_profit_percent" value={costingForm.subcontractor_profit_percent} onChange={handleCostingChange} min="0" />
                        </div>
                        <div className="costing-field total">
                          <label>Total</label>
                          <span className="costing-total">${(costingForm.subcontractor_cost * (1 + costingForm.subcontractor_profit_percent / 100)).toFixed(2)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Grand Total */}
                    <div className="costing-grand-total">
                      <span className="costing-label">GRAND TOTAL</span>
                      <span className="grand-total-value">${calculateCostingTotals().grandTotal.toFixed(2)}</span>
                    </div>

                    <button type="button" className="btn btn-primary" onClick={handleSaveCosting} disabled={savingCosting}>
                      {savingCosting ? 'Saving...' : 'Save Costing'}
                    </button>
                  </div>
                </div>
              )}

              {/* QA Forms Tab */}
              {activeTab === 'qa' && isEdit && (
                <div className="modal-form-grid">
                  <div className="form-section">
                    <h3 className="form-section-title">QA Forms & Documents</h3>

                    {formData.quality_level === 'CRITICAL' && (
                      <div className="critical-qa-notice">
                        This is a Critical QA job - all forms must be completed before invoicing
                      </div>
                    )}

                    <div className="qa-forms-list">
                      {/* DHE-F39 */}
                      <div className="qa-form-row">
                        <div className="qa-form-info">
                          <span className="qa-form-code">DHE-F39</span>
                          <span className="qa-form-name">Critical Parts Inspection & Test Plan</span>
                        </div>
                        <div className="qa-form-actions">
                          <button type="button" className="btn btn-secondary btn-sm">Print</button>
                          <span className={`qa-status ${qaForms.find(f => f.form_code === 'DHE-F39')?.status === 'SCANNED' ? 'status-complete' : 'status-pending'}`}>
                            {qaForms.find(f => f.form_code === 'DHE-F39')?.status === 'SCANNED' ? 'Scanned' : 'Pending'}
                          </span>
                        </div>
                      </div>

                      {/* DHE-F15 */}
                      <div className="qa-form-row">
                        <div className="qa-form-info">
                          <span className="qa-form-code">DHE-F15</span>
                          <span className="qa-form-name">Inwards Goods Inspection Sticker</span>
                        </div>
                        <div className="qa-form-actions">
                          <span className={`qa-status ${qaForms.find(f => f.form_code === 'DHE-F15')?.status === 'SCANNED' ? 'status-complete' : 'status-pending'}`}>
                            {qaForms.find(f => f.form_code === 'DHE-F15')?.status === 'SCANNED' ? 'Scanned' : 'Pending'}
                          </span>
                        </div>
                      </div>

                      {/* DHE-F09 */}
                      <div className="qa-form-row">
                        <div className="qa-form-info">
                          <span className="qa-form-code">DHE-F09</span>
                          <span className="qa-form-name">Inspection Report</span>
                        </div>
                        <div className="qa-form-actions">
                          <button type="button" className="btn btn-secondary btn-sm">Print</button>
                          <span className={`qa-status ${qaForms.find(f => f.form_code === 'DHE-F09')?.status === 'SCANNED' ? 'status-complete' : 'status-pending'}`}>
                            {qaForms.find(f => f.form_code === 'DHE-F09')?.status === 'SCANNED' ? 'Scanned' : 'Pending'}
                          </span>
                        </div>
                      </div>

                      {/* DHE-F43 */}
                      <div className="qa-form-row">
                        <div className="qa-form-info">
                          <span className="qa-form-code">DHE-F43</span>
                          <span className="qa-form-name">Hazard, Incident, Non-Conformance & Customer Complaint</span>
                        </div>
                        <div className="qa-form-actions">
                          <button type="button" className="btn btn-secondary btn-sm">Print</button>
                          <span className={`qa-status ${qaForms.find(f => f.form_code === 'DHE-F43')?.status === 'SCANNED' ? 'status-complete' : 'status-pending'}`}>
                            {qaForms.find(f => f.form_code === 'DHE-F43')?.status === 'SCANNED' ? 'Scanned' : 'Pending'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="qa-procedure-section">
                      <h4>Procedure Reference</h4>
                      <div className="qa-form-row">
                        <div className="qa-form-info">
                          <span className="qa-form-code">DHE-P06</span>
                          <span className="qa-form-name">Quality Procedure</span>
                        </div>
                        <div className="qa-form-actions">
                          <button type="button" className="btn btn-secondary btn-sm">View</button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Photos Tab */}
              {activeTab === 'photos' && isEdit && (
                <div className="modal-form-grid">
                  <div className="form-section">
                    <div className="form-section-header">
                      <h3 className="form-section-title">Photos</h3>
                      {!cameraActive ? (
                        <button type="button" className="btn btn-secondary btn-sm" onClick={startCamera}>Open Camera</button>
                      ) : (
                        <button type="button" className="btn btn-secondary btn-sm" onClick={stopCamera}>Close Camera</button>
                      )}
                    </div>

                    {cameraActive && (
                      <div className="camera-container">
                        <video ref={videoRef} autoPlay playsInline muted />
                        {cameraReady && (
                          <button type="button" className="btn btn-primary" onClick={capturePhoto}>Capture</button>
                        )}
                      </div>
                    )}

                    {photos.length > 0 ? (
                      <div className="photos-grid">
                        {photos.map(photo => (
                          <div key={photo.id} className="photo-item">
                            <img src={photo.data} alt="Captured" onClick={() => setSelectedPhoto(photo)} />
                            <button type="button" className="photo-remove" onClick={() => removePhoto(photo.id)}>×</button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="empty-message">No photos attached.</p>
                    )}
                  </div>
                </div>
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
      {selectedPhoto && (
        <div className="photo-modal" onClick={() => setSelectedPhoto(null)}>
          <div className="photo-modal-content" onClick={e => e.stopPropagation()}>
            <button className="photo-modal-close" onClick={() => setSelectedPhoto(null)}>×</button>
            <img src={selectedPhoto.data} alt="Full size" />
          </div>
        </div>
      )}

      <style>{`
        .modal-tabs {
          display: flex;
          gap: 0.25rem;
          padding: 0.5rem 0;
          margin-bottom: 1rem;
          border-bottom: 1px solid var(--border-color);
          overflow-x: auto;
        }

        .tab {
          padding: 0.5rem 1rem;
          border: none;
          background: none;
          color: var(--text-secondary);
          font-weight: 500;
          cursor: pointer;
          border-radius: 0.375rem;
          white-space: nowrap;
        }

        .tab:hover {
          background: var(--background);
        }

        .tab.active {
          background: var(--primary-color);
          color: white;
        }

        .modal-form-grid {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .form-section {
          background: var(--background);
          border-radius: 0.5rem;
          padding: 1rem;
          position: relative;
          overflow: visible;
        }

        .required {
          color: var(--danger-color);
          font-weight: 600;
        }

        .field-required {
          border-color: var(--warning-color) !important;
        }

        .field-required:focus {
          border-color: var(--primary-color) !important;
        }

        .header-section {
          background: var(--primary-color);
          color: white;
        }

        .job-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .job-number-display {
          display: flex;
          flex-direction: column;
        }

        .job-number-display .label {
          font-size: 0.75rem;
          opacity: 0.8;
        }

        .job-number-display .value {
          font-size: 1.25rem;
          font-weight: 700;
        }

        .form-section-title {
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin: 0 0 0.75rem 0;
        }

        .form-section-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.75rem;
        }

        .form-section-header .form-section-title {
          margin: 0;
        }

        .form-row {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
          gap: 0.75rem;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .form-group label {
          font-size: 0.75rem;
          font-weight: 500;
          color: var(--text-secondary);
        }

        .checkbox-group label {
          flex-direction: row;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.875rem;
          cursor: pointer;
        }

        .checkbox-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
        }

        .checkbox-chip {
          display: flex;
          align-items: center;
          gap: 0.375rem;
          padding: 0.375rem 0.75rem;
          background: var(--card-background);
          border: 1px solid var(--border-color);
          border-radius: 1rem;
          font-size: 0.8125rem;
          cursor: pointer;
          transition: all 0.2s;
        }

        .checkbox-chip input {
          display: none;
        }

        .checkbox-chip:hover {
          border-color: var(--primary-color);
        }

        .checkbox-chip.selected {
          background: var(--primary-color);
          border-color: var(--primary-color);
          color: white;
        }

        .customer-search-container {
          position: relative;
          z-index: 50;
        }

        .customer-search-container input {
          width: 100%;
          padding-right: 2.5rem;
        }

        .customer-search-container .clear-btn {
          position: absolute;
          right: 0.5rem;
          top: 50%;
          transform: translateY(-50%);
          border: none;
          background: var(--danger-color);
          color: white;
          font-size: 1rem;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          line-height: 1;
        }

        .customer-search-container .clear-btn:hover {
          background: #dc2626;
        }

        .customer-dropdown {
          position: absolute;
          top: calc(100% + 4px);
          left: 0;
          right: 0;
          background: var(--surface);
          border: 2px solid var(--primary-color);
          border-radius: 0.5rem;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
          z-index: 9999;
          max-height: 250px;
          overflow-y: auto;
        }

        .customer-option {
          padding: 0.875rem 1rem;
          cursor: pointer;
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid var(--border-color);
          transition: background 0.15s;
        }

        .customer-option:last-child {
          border-bottom: none;
        }

        .customer-option:hover {
          background: var(--primary-color);
          color: white;
        }

        .customer-option:hover .badge-critical {
          background: white;
          color: var(--danger-color);
        }

        .customer-option.no-results {
          color: var(--text-secondary);
          font-style: italic;
          cursor: default;
        }

        .customer-option.no-results:hover {
          background: transparent;
          color: var(--text-secondary);
        }

        .badge-critical {
          background: var(--danger-color);
          color: white;
          font-size: 0.625rem;
          padding: 0.125rem 0.5rem;
          border-radius: 1rem;
          font-weight: 600;
          text-transform: uppercase;
        }

        .critical-warning {
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid var(--danger-color);
          color: var(--danger-color);
          padding: 0.5rem 0.75rem;
          border-radius: 0.375rem;
          font-size: 0.75rem;
          margin-top: 0.5rem;
        }

        /* Autocomplete container */
        .autocomplete-container {
          position: relative;
        }

        .checkbox-inline {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          cursor: pointer;
          font-weight: normal;
          height: 38px;
        }

        .checkbox-inline input[type="checkbox"] {
          width: 18px;
          height: 18px;
          cursor: pointer;
        }

        .checkbox-inline input[type="checkbox"]:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        /* Selected customer banner */
        .selected-customer-banner {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 0.75rem;
          background: rgba(59, 130, 246, 0.1);
          border: 1px solid var(--primary-color);
          border-radius: 0.375rem;
          margin-bottom: 0.75rem;
          font-size: 0.875rem;
        }

        .selected-customer-banner .btn-link {
          margin-left: auto;
          background: none;
          border: none;
          color: var(--primary-color);
          cursor: pointer;
          font-size: 0.875rem;
          text-decoration: underline;
        }

        .selected-customer-banner .btn-link:hover {
          color: var(--primary-dark, #1d4ed8);
        }

        /* Field states */
        .field-selected {
          border-color: var(--primary-color) !important;
          background: rgba(59, 130, 246, 0.05);
        }

        /* Dropdown hint */
        .dropdown-hint {
          padding: 0.5rem 0.75rem;
          font-size: 0.75rem;
          color: var(--text-secondary);
          background: var(--background);
          border-bottom: 1px solid var(--border-color);
          font-style: italic;
        }

        /* Contact fields inline */
        .contact-fields-inline {
          margin-top: 0.75rem;
          padding-top: 0.75rem;
          border-top: 1px solid var(--border-color);
        }

        .field-note {
          font-size: 0.75rem;
          color: var(--text-secondary);
          margin-bottom: 0.5rem;
          font-style: italic;
        }

        .contact-fields-inline .form-row {
          margin-bottom: 0;
        }

        /* Subcontracts in create mode */
        .subcontracts-list {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .subcontract-card {
          background: var(--surface);
          border: 1px solid var(--border-color);
          border-radius: 0.5rem;
          padding: 0.75rem;
        }

        .subcontract-inline-form .form-row {
          display: flex;
          gap: 0.75rem;
          align-items: flex-end;
        }

        .subcontract-inline-form .form-group {
          flex: 1;
          min-width: 0;
        }

        .subcontract-display .subcontract-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.25rem;
        }

        .subcontract-display .subcontract-dates {
          display: flex;
          gap: 1rem;
          font-size: 0.75rem;
          color: var(--text-secondary);
        }

        .empty-state {
          text-align: center;
          padding: 1rem;
          color: var(--text-secondary);
          font-style: italic;
          font-size: 0.875rem;
        }

        .badge-pending {
          background: var(--warning-color, #f59e0b);
          color: white;
        }

        .badge-sent {
          background: var(--info-color, #3b82f6);
          color: white;
        }

        .badge-received {
          background: var(--success-color);
          color: white;
        }

        .priority-high {
          border-color: var(--danger-color) !important;
          color: var(--danger-color);
        }

        .overdue {
          border-color: var(--danger-color) !important;
        }

        .overdue-text {
          color: var(--danger-color);
          font-size: 0.75rem;
          font-weight: 600;
        }

        .line-item-row {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 0.5rem;
        }

        .item-num {
          font-weight: 600;
          color: var(--text-secondary);
          min-width: 30px;
        }

        .btn-icon {
          width: 28px;
          height: 28px;
          padding: 0;
          border: none;
          border-radius: 50%;
          cursor: pointer;
          font-size: 1rem;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .btn-icon.danger {
          background: var(--danger-color);
          color: white;
        }

        .assignees-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
        }

        .assignee-chip {
          display: flex;
          align-items: center;
          gap: 0.375rem;
          padding: 0.375rem 0.75rem;
          background: var(--card-background);
          border: 1px solid var(--border-color);
          border-radius: 1rem;
          font-size: 0.875rem;
          cursor: pointer;
          transition: all 0.2s;
        }

        .assignee-chip input {
          display: none;
        }

        .assignee-chip.selected {
          background: var(--primary-color);
          border-color: var(--primary-color);
          color: white;
        }

        .items-table {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .items-header {
          display: grid;
          grid-template-columns: 60px 80px 1fr 40px;
          gap: 0.5rem;
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--text-secondary);
          padding: 0.5rem 0;
          border-bottom: 1px solid var(--border-color);
        }

        .items-row {
          display: grid;
          grid-template-columns: 60px 80px 1fr 40px;
          gap: 0.5rem;
          align-items: center;
        }

        .time-entries-list {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .time-entry-form {
          border: 2px solid var(--primary-color);
          background: var(--surface);
        }

        .time-entry-card {
          background: var(--card-background);
          padding: 1rem;
          border-radius: 0.5rem;
          border: 1px solid var(--border-color);
        }

        .time-entry-card.has-error {
          background: rgba(239, 68, 68, 0.1);
          border-color: var(--danger-color);
        }

        .time-entry-card .entry-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 0.75rem;
        }

        .entry-info {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.5rem;
        }

        .user-name {
          font-weight: 600;
        }

        .entry-date {
          font-size: 0.75rem;
          color: var(--text-secondary);
        }

        .machine-badge, .item-badge {
          font-size: 0.6875rem;
          padding: 0.125rem 0.5rem;
          border-radius: 1rem;
          background: var(--primary-color);
          color: white;
        }

        .entry-actions {
          display: flex;
          gap: 0.5rem;
        }

        .entry-body {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .entry-description {
          font-size: 0.875rem;
        }

        .entry-time {
          font-size: 0.75rem;
          color: var(--text-secondary);
        }

        .entry-time .duration {
          margin-left: 0.5rem;
          font-weight: 500;
          color: var(--primary-color);
        }

        .entry-special-ops {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          font-size: 0.6875rem;
        }

        .entry-special-ops span {
          padding: 0.125rem 0.5rem;
          border-radius: 0.25rem;
        }

        .status-ok {
          background: rgba(34, 197, 94, 0.1);
          color: var(--success-color);
        }

        .status-pending {
          background: rgba(234, 179, 8, 0.1);
          color: var(--warning-color);
        }

        .status-error {
          background: rgba(239, 68, 68, 0.2);
          color: var(--danger-color);
          font-weight: 600;
        }

        .special-ops-section, .scrap-rate-section {
          margin-top: 1rem;
          padding: 1rem;
          background: var(--card-background);
          border-radius: 0.5rem;
          border: 1px solid var(--border-color);
        }

        .special-ops-section h4, .scrap-rate-section h4 {
          font-size: 0.8125rem;
          font-weight: 600;
          margin: 0 0 0.75rem 0;
          color: var(--text-primary);
        }

        /* Subcontract styles */
        .subcontract-form {
          border: 2px solid var(--primary-color);
          background: var(--surface);
        }

        .subcontracts-list {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .subcontract-card {
          background: var(--card-background);
          padding: 1rem;
          border-radius: 0.5rem;
          border: 1px solid var(--border-color);
        }

        .subcontract-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.5rem;
        }

        .supplier-name {
          font-weight: 600;
        }

        .subcontract-dates {
          display: flex;
          gap: 1rem;
          font-size: 0.75rem;
          color: var(--text-secondary);
          margin-bottom: 0.5rem;
        }

        .subcontract-notes {
          font-size: 0.8125rem;
          color: var(--text-secondary);
          background: var(--background);
          padding: 0.5rem;
          border-radius: 0.25rem;
          margin-bottom: 0.5rem;
        }

        .subcontract-actions {
          display: flex;
          gap: 0.5rem;
          justify-content: flex-end;
        }

        .badge-pending { background: var(--warning-color); color: white; }
        .badge-sent { background: var(--primary-color); color: white; }
        .badge-in_progress { background: #8b5cf6; color: white; }
        .badge-received { background: var(--success-color); color: white; }
        .badge-complete { background: #22c55e; color: white; }

        /* Costing styles */
        .costing-row {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 0.75rem 0;
          border-bottom: 1px solid var(--border-color);
        }

        .costing-label {
          min-width: 120px;
          font-weight: 600;
          font-size: 0.875rem;
        }

        .costing-inputs {
          display: flex;
          gap: 1rem;
          flex: 1;
        }

        .costing-field {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .costing-field label {
          font-size: 0.6875rem;
          color: var(--text-secondary);
        }

        .costing-field input {
          width: 100px;
          padding: 0.5rem;
          border: 1px solid var(--border-color);
          border-radius: 0.25rem;
          font-size: 0.875rem;
        }

        .costing-field.total {
          min-width: 100px;
        }

        .costing-total {
          font-weight: 600;
          color: var(--primary-color);
          font-size: 0.9375rem;
          padding: 0.5rem 0;
        }

        .costing-grand-total {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 1rem;
          padding: 1rem;
          background: var(--primary-color);
          border-radius: 0.5rem;
          color: white;
        }

        .costing-grand-total .costing-label {
          color: white;
          font-size: 1rem;
        }

        .grand-total-value {
          font-size: 1.5rem;
          font-weight: 700;
        }

        /* QA Forms styles */
        .critical-qa-notice {
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid var(--danger-color);
          color: var(--danger-color);
          padding: 0.75rem 1rem;
          border-radius: 0.5rem;
          font-size: 0.875rem;
          margin-bottom: 1rem;
        }

        .qa-forms-list {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .qa-form-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.75rem 1rem;
          background: var(--card-background);
          border-radius: 0.5rem;
          border: 1px solid var(--border-color);
        }

        .qa-form-info {
          display: flex;
          flex-direction: column;
          gap: 0.125rem;
        }

        .qa-form-code {
          font-weight: 700;
          font-size: 0.875rem;
          color: var(--primary-color);
        }

        .qa-form-name {
          font-size: 0.75rem;
          color: var(--text-secondary);
        }

        .qa-form-actions {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        .qa-status {
          padding: 0.25rem 0.75rem;
          border-radius: 1rem;
          font-size: 0.75rem;
          font-weight: 500;
        }

        .qa-status.status-pending {
          background: var(--warning-color);
          color: white;
        }

        .qa-status.status-complete {
          background: var(--success-color);
          color: white;
        }

        .qa-procedure-section {
          margin-top: 1.5rem;
          padding-top: 1rem;
          border-top: 1px solid var(--border-color);
        }

        .qa-procedure-section h4 {
          font-size: 0.875rem;
          margin: 0 0 0.75rem 0;
        }

        .empty-message {
          color: var(--text-secondary);
          text-align: center;
          padding: 1rem;
        }

        .coming-soon {
          color: var(--text-secondary);
          text-align: center;
          padding: 2rem;
          font-style: italic;
        }

        .camera-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1rem;
          margin-bottom: 1rem;
        }

        .camera-container video {
          width: 100%;
          max-width: 400px;
          border-radius: 0.5rem;
          background: black;
        }

        .photos-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
          gap: 0.75rem;
        }

        .photo-item {
          position: relative;
          aspect-ratio: 4/3;
          border-radius: 0.5rem;
          overflow: hidden;
        }

        .photo-item img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          cursor: pointer;
        }

        .photo-remove {
          position: absolute;
          top: 0.25rem;
          right: 0.25rem;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          border: none;
          background: var(--danger-color);
          color: white;
          cursor: pointer;
        }

        .photo-modal {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.9);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 9999;
        }

        .photo-modal-content {
          position: relative;
          max-width: 90vw;
          max-height: 90vh;
        }

        .photo-modal-content img {
          max-width: 100%;
          max-height: 90vh;
          border-radius: 0.5rem;
        }

        .photo-modal-close {
          position: absolute;
          top: -2rem;
          right: -2rem;
          width: 36px;
          height: 36px;
          border-radius: 50%;
          border: 2px solid white;
          background: rgba(0, 0, 0, 0.7);
          color: white;
          font-size: 1.25rem;
          cursor: pointer;
        }

        /* Scanner Files Styles */
        .scanner-files-container {
          margin-top: 0.75rem;
          border: 1px solid var(--border-color);
          border-radius: 0.5rem;
          padding: 0.75rem;
          background: var(--bg-secondary);
          max-height: 250px;
          overflow-y: auto;
        }

        .scanner-files-loading,
        .scanner-files-empty {
          color: var(--text-secondary);
          font-size: 0.875rem;
          margin: 0;
          padding: 0.5rem;
          text-align: center;
        }

        .scanner-files-list {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .scanner-file-item {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.5rem;
          border-radius: 0.375rem;
          background: var(--bg-primary);
          border: 1px solid var(--border-color);
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .scanner-file-item:hover {
          border-color: var(--primary-color);
          background: var(--bg-hover);
        }

        .scanner-file-icon {
          width: 36px;
          height: 36px;
          border-radius: 0.375rem;
          background: var(--primary-color);
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.625rem;
          font-weight: 700;
          flex-shrink: 0;
        }

        .scanner-file-info {
          flex: 1;
          min-width: 0;
        }

        .scanner-file-name {
          font-weight: 500;
          font-size: 0.875rem;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .scanner-file-meta {
          font-size: 0.75rem;
          color: var(--text-secondary);
        }
      `}</style>
    </>
  );
}
