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
  const [originalContactName, setOriginalContactName] = useState(''); // For smart detection
  const contactSearchRef = useRef(null);
  const blurTimeoutRef = useRef(null);

  // Contact search effect - watches contactName field for autocomplete
  useEffect(() => {
    if (!fieldFocused) return;

    const searchValue = contactFormData.contactName;

    const searchContacts = async () => {
      if (searchValue && searchValue.length >= 2) {
        try {
          const results = await api.searchContacts(searchValue);
          setContacts(results || []);
          setShowContactDropdown(true);
        } catch (err) {
          console.error('Failed to search contacts:', err);
          setContacts([]);
        }
      } else {
        setContacts([]);
        setShowContactDropdown(false);
      }
    };

    const debounceTimer = setTimeout(searchContacts, 300);
    return () => clearTimeout(debounceTimer);
  }, [fieldFocused, contactFormData.contactName]);

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

  // Handle contactName focus - cancel pending blur and show dropdown if results exist
  const handleFieldFocus = useCallback(() => {
    if (blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current);
      blurTimeoutRef.current = null;
    }
    setFieldFocused(true);
    if (contacts.length > 0) {
      setShowContactDropdown(true);
    }
  }, [contacts.length]);

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

    if (contactId || contactName) {
      setContact({
        id: contactId,
        contactName: contactName,
        companyName: companyName
      });
      setOriginalContactName(contactName || '');

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
    setFieldFocused(false);
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
    fieldFocused,
    showContactDropdown,
    setShowContactDropdown,
    contactFormData,
    contacts,
    contactSearchRef,
    originalContactName,
    // Actions
    selectContact,
    handleContactFieldChange,
    handleFieldFocus,
    handleFieldBlur,
    setContactFromJobCard,
    resetContact,
    hasContactNameChanged
  };
}

export { getDefaultContactFormData };
