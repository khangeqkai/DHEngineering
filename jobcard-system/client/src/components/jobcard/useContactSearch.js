import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../../services/api';

/**
 * Default contact form data for new contacts
 */
function getDefaultContactFormData() {
  return {
    contact_name: '',
    company_name: '',
    phone: '',
    email: '',
    is_critical_qa: false
  };
}

/**
 * Custom hook for contact search and autocomplete functionality
 * Handles contact selection, search, and form data management
 * Uses phone contacts-style model where each contact is standalone
 */
export function useContactSearch() {
  // Contact state
  const [contact, setContact] = useState(null);
  const [contactSearch, setContactSearch] = useState('');
  const [showContactDropdown, setShowContactDropdown] = useState(false);
  const [contactFormData, setContactFormData] = useState(getDefaultContactFormData());
  const [contacts, setContacts] = useState([]);
  const [originalContactName, setOriginalContactName] = useState(''); // For smart detection
  const contactSearchRef = useRef(null);

  // Contact search effect using API - searches by name OR company
  useEffect(() => {
    const searchContacts = async () => {
      if (contactSearch.length >= 2) {
        try {
          const results = await api.searchContacts(contactSearch);
          setContacts(results || []);
          setShowContactDropdown(true);
        } catch (err) {
          console.error('Failed to search contacts:', err);
          setContacts([]);
        }
      } else {
        setContacts([]);
      }
    };

    const debounceTimer = setTimeout(searchContacts, 300);
    return () => clearTimeout(debounceTimer);
  }, [contactSearch]);

  // Click outside to close contact dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (contactSearchRef.current && !contactSearchRef.current.contains(event.target)) {
        setShowContactDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Select an existing contact from the dropdown
  const selectContact = useCallback((selectedContact, setFormData) => {
    setContact(selectedContact);
    setOriginalContactName(selectedContact.contact_name || selectedContact.contactName || '');

    // Update form data with contact info
    setFormData(prev => ({
      ...prev,
      contact_id: selectedContact.id,
      contact_name: selectedContact.contact_name || selectedContact.contactName || '',
      company_name: selectedContact.company_name || selectedContact.companyName || '',
      contact_phone: selectedContact.phone || '',
      contact_email: selectedContact.email || ''
    }));

    // Update contact form data
    setContactFormData({
      contact_name: selectedContact.contact_name || selectedContact.contactName || '',
      company_name: selectedContact.company_name || selectedContact.companyName || '',
      phone: selectedContact.phone || '',
      email: selectedContact.email || '',
      is_critical_qa: selectedContact.is_critical_qa || selectedContact.isCriticalQa || false
    });

    // Display format: "John (ABC Pty Ltd)"
    const displayName = selectedContact.company_name || selectedContact.companyName
      ? `${selectedContact.contact_name || selectedContact.contactName} (${selectedContact.company_name || selectedContact.companyName})`
      : selectedContact.contact_name || selectedContact.contactName;
    setContactSearch(displayName);
    setShowContactDropdown(false);

    // Auto-set critical QA quality level
    if (selectedContact.is_critical_qa || selectedContact.isCriticalQa) {
      setFormData(prev => ({ ...prev, quality_level: 'CRITICAL' }));
    }
  }, []);

  // Clear contact selection
  const clearContact = useCallback((setFormData) => {
    setContact(null);
    setOriginalContactName('');
    setFormData(prev => ({
      ...prev,
      contact_id: '',
      contact_name: '',
      company_name: '',
      contact_phone: '',
      contact_email: ''
    }));
    setContactFormData(getDefaultContactFormData());
    setContactSearch('');
  }, []);

  // Handle changes to contact form fields
  const handleContactFieldChange = useCallback((field, value, setFormData) => {
    setContactFormData(prev => ({ ...prev, [field]: value }));

    // Map field names from form to jobcard form data
    const fieldMap = {
      contact_name: 'contact_name',
      company_name: 'company_name',
      phone: 'contact_phone',
      email: 'contact_email',
      is_critical_qa: 'is_critical_qa'
    };

    // Update search display when contact name or company changes
    if (field === 'contact_name' || field === 'company_name') {
      setContactFormData(prev => {
        const name = field === 'contact_name' ? value : prev.contact_name;
        const company = field === 'company_name' ? value : prev.company_name;
        // Only update search if we haven't selected a contact yet
        if (!contact) {
          const displayName = company ? `${name} (${company})` : name;
          setContactSearch(name); // Search by name only for typing
        }
        return { ...prev, [field]: value };
      });

      // Clear contact selection if user starts typing something different
      if (contact) {
        setContact(null);
        setFormData(prev => ({ ...prev, contact_id: '' }));
      }
    }

    // Update jobcard form data
    if (fieldMap[field]) {
      const formField = fieldMap[field];
      if (formField === 'contact_phone' || formField === 'contact_email' || formField === 'contact_name' || formField === 'company_name') {
        setFormData(prev => ({ ...prev, [formField]: value }));
      }
    }

    // Auto-set critical QA if flagged
    if (field === 'is_critical_qa' && value) {
      setFormData(prev => ({ ...prev, quality_level: 'CRITICAL' }));
    }
  }, [contact]);

  // Set contact data from loaded job card
  const setContactFromJobCard = useCallback((jobcardData) => {
    const contactId = jobcardData.contactId || jobcardData.contact_id;
    const contactName = jobcardData.contactName || jobcardData.contact_name;
    const companyName = jobcardData.companyName || jobcardData.company_name;

    if (contactId || contactName) {
      setContact({
        id: contactId,
        contact_name: contactName,
        company_name: companyName,
        is_critical_qa: jobcardData.contactIsCritical || jobcardData.contact_is_critical
      });
      setOriginalContactName(contactName || '');

      // Display format: "John (ABC Pty Ltd)"
      const displayName = companyName ? `${contactName} (${companyName})` : contactName;
      setContactSearch(displayName || '');

      setContactFormData({
        contact_name: contactName || '',
        company_name: companyName || '',
        phone: jobcardData.contactPhone || jobcardData.contact_phone || '',
        email: jobcardData.contactEmail || jobcardData.contact_email || '',
        is_critical_qa: jobcardData.contactIsCritical || jobcardData.contact_is_critical || false
      });
    }
  }, []);

  // Reset contact state
  const resetContact = useCallback(() => {
    setContact(null);
    setOriginalContactName('');
    setContactSearch('');
    setContactFormData(getDefaultContactFormData());
    setShowContactDropdown(false);
    setContacts([]);
  }, []);

  // Check if contact name changed (for smart detection)
  const hasContactNameChanged = useCallback(() => {
    if (!contact || !originalContactName) return false;
    return contactFormData.contact_name.trim() !== originalContactName.trim();
  }, [contact, originalContactName, contactFormData.contact_name]);

  return {
    // State
    contact,
    contactSearch,
    showContactDropdown,
    setShowContactDropdown,
    contactFormData,
    contacts,
    contactSearchRef,
    originalContactName,
    // Actions
    selectContact,
    clearContact,
    handleContactFieldChange,
    setContactFromJobCard,
    resetContact,
    hasContactNameChanged
  };
}

export { getDefaultContactFormData };
