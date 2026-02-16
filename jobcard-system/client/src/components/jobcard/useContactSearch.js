import { useState, useEffect, useRef, useCallback } from 'react';
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
    setOriginalContactName(selectedContact.contactName || '');

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

    setContactSearch('');
    setShowContactDropdown(false);
  }, []);

  // Clear contact selection
  const clearContact = useCallback((setFormData) => {
    setContact(null);
    setOriginalContactName('');
    setFormData(prev => ({
      ...prev,
      contactId: '',
      contactName: '',
      companyName: '',
      contactPhone: '',
      contactEmail: ''
    }));
    setContactFormData(getDefaultContactFormData());
    setContactSearch('');
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

    if (contactId || contactName) {
      setContact({
        id: contactId,
        contactName: contactName,
        companyName: companyName
      });
      setOriginalContactName(contactName || '');

      setContactSearch('');

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
    setOriginalContactName('');
    setContactSearch('');
    setContactFormData(getDefaultContactFormData());
    setShowContactDropdown(false);
    setContacts([]);
  }, []);

  // Check if contact name changed (for smart detection)
  const hasContactNameChanged = useCallback(() => {
    if (!originalContactName) return false;
    return contactFormData.contactName.trim() !== originalContactName.trim();
  }, [originalContactName, contactFormData.contactName]);

  return {
    // State
    contact,
    contactSearch,
    setContactSearch,
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
