import { useState, useEffect, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';
import { api } from '../../services/api';

/**
 * Default contact form data for new contacts
 */
function getDefaultContactFormData() {
  return {
    contactName: '',
    companyName: '',
    phone: '',
    email: ''
  };
}

/**
 * Custom hook for contact search and inline autocomplete functionality
 * Handles contact selection, search, and form data management
 * Uses phone contacts-style model where each contact is standalone
 */
export function useContactSearch() {
  // Contact state
  const [contact, setContact] = useState(null);
  const [fieldFocused, setFieldFocused] = useState(false);
  const [showContactDropdown, setShowContactDropdown] = useState(false);
  const [contactFormData, setContactFormData] = useState(getDefaultContactFormData());
  const [contacts, setContacts] = useState([]);
  const [originalCompanyName, setOriginalCompanyName] = useState(''); // For smart detection
  const contactSearchRef = useRef(null);
  const blurTimeoutRef = useRef(null);

  // All contacts cache for showing on focus
  const [allContacts, setAllContacts] = useState([]);
  const allContactsLoaded = useRef(false);

  // Load all contacts once on first focus
  const loadAllContacts = useCallback(async () => {
    if (allContactsLoaded.current) return;
    try {
      const results = await api.getContacts();
      setAllContacts(results || []);
      allContactsLoaded.current = true;
    } catch (err) {
      toast.error('Failed to load contacts');
    }
  }, []);

  // Contact search effect - watches companyName field for autocomplete
  useEffect(() => {
    if (!fieldFocused) return;

    const searchValue = contactFormData.companyName.trim().toLowerCase();

    if (!searchValue) {
      // No text typed - show all contacts (top 10)
      setContacts(allContacts.slice(0, 10));
      setShowContactDropdown(allContacts.length > 0);
      return;
    }

    // Filter from cached contacts for instant results
    const filtered = allContacts.filter(c =>
      (c.companyName || '').toLowerCase().includes(searchValue) ||
      (c.contactName || '').toLowerCase().includes(searchValue)
    ).slice(0, 10);
    setContacts(filtered);
    setShowContactDropdown(filtered.length > 0);
  }, [fieldFocused, contactFormData.companyName, allContacts]);

  // Click outside to close contact dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (contactSearchRef.current && !contactSearchRef.current.contains(event.target)) {
        setShowContactDropdown(false);
        setFieldFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleFieldFocus = useCallback(() => {
    if (blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current);
      blurTimeoutRef.current = null;
    }
    setFieldFocused(true);
    loadAllContacts();
  }, [loadAllContacts]);

  // Handle contactName blur - delayed to allow dropdown clicks and re-focus
  const handleFieldBlur = useCallback(() => {
    blurTimeoutRef.current = setTimeout(() => {
      blurTimeoutRef.current = null;
      setFieldFocused(false);
      setShowContactDropdown(false);
    }, 200);
  }, []);

  // Select an existing contact from the dropdown
  const selectContact = useCallback((selectedContact, setFormData) => {
    setContact(selectedContact);
    setOriginalCompanyName(selectedContact.companyName || '');

    // Update form data with contact info
    setFormData(prev => ({
      ...prev,
      contactId: selectedContact.id,
      contactName: selectedContact.contactName || '',
      companyName: selectedContact.companyName || '',
      contactPhone: selectedContact.phone || '',
      contactEmail: selectedContact.email || ''
    }));

    // Update contact form data
    setContactFormData({
      contactName: selectedContact.contactName || '',
      companyName: selectedContact.companyName || '',
      phone: selectedContact.phone || '',
      email: selectedContact.email || ''
    });

    setFieldFocused(false);
    setShowContactDropdown(false);
  }, []);

  // Handle changes to contact form fields
  const handleContactFieldChange = useCallback((field, value, setFormData) => {
    setContactFormData(prev => ({ ...prev, [field]: value }));

    // Map field names from form to jobcard form data
    const fieldMap = {
      contactName: 'contactName',
      companyName: 'companyName',
      phone: 'contactPhone',
      email: 'contactEmail'
    };

    // Clear contact selection if user edits name or company
    if ((field === 'contactName' || field === 'companyName') && contact) {
      setContact(null);
      setFormData(prev => ({ ...prev, contactId: '' }));
    }

    // Update jobcard form data
    if (fieldMap[field]) {
      const formField = fieldMap[field];
      if (formField === 'contactPhone' || formField === 'contactEmail' || formField === 'contactName' || formField === 'companyName') {
        setFormData(prev => ({ ...prev, [formField]: value }));
      }
    }

  }, [contact]);

  // Set contact data from loaded job card
  const setContactFromJobCard = useCallback((jobcardData) => {
    const contactId = jobcardData.contactId;
    const contactName = jobcardData.contactName;
    const companyName = jobcardData.companyName;

    if (contactId || companyName) {
      setContact({
        id: contactId,
        contactName: contactName,
        companyName: companyName
      });
      setOriginalCompanyName(companyName || '');

      setContactFormData({
        contactName: contactName || '',
        companyName: companyName || '',
        phone: jobcardData.contactPhone || '',
        email: jobcardData.contactEmail || ''
      });
    }
  }, []);

  // Reset contact state
  const resetContact = useCallback(() => {
    setContact(null);
    setOriginalCompanyName('');
    setFieldFocused(false);
    setContactFormData(getDefaultContactFormData());
    setShowContactDropdown(false);
    setContacts([]);
  }, []);

  // Check if company name changed (for smart detection)
  const hasCompanyNameChanged = useCallback(() => {
    if (!originalCompanyName) return false;
    return contactFormData.companyName.trim() !== originalCompanyName.trim();
  }, [originalCompanyName, contactFormData.companyName]);

  return {
    // State
    contact,
    fieldFocused,
    showContactDropdown,
    setShowContactDropdown,
    contactFormData,
    contacts,
    contactSearchRef,
    // Actions
    selectContact,
    handleContactFieldChange,
    handleFieldFocus,
    handleFieldBlur,
    setContactFromJobCard,
    resetContact,
    hasCompanyNameChanged
  };
}

export { getDefaultContactFormData };
