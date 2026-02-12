import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../../services/api';
import { getDefaultCustomerFormData } from './mappers';

/**
 * Custom hook for customer search and autocomplete functionality
 * Handles customer selection, search, and form data management
 */
export function useCustomerSearch() {
  // Customer state
  const [customer, setCustomer] = useState(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [customerFormData, setCustomerFormData] = useState(getDefaultCustomerFormData());
  const [customers, setCustomers] = useState([]);
  const customerSearchRef = useRef(null);

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

  const selectCustomer = useCallback((cust, setFormData) => {
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
  }, []);

  const clearCustomer = useCallback((setFormData) => {
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
  }, []);

  const handleCustomerFieldChange = useCallback((field, value, setFormData) => {
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
  }, [customer]);

  // Set customer data from loaded job card
  const setCustomerFromJobCard = useCallback((jobcardData) => {
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
  }, []);

  const resetCustomer = useCallback(() => {
    setCustomer(null);
    setCustomerSearch('');
    setCustomerFormData(getDefaultCustomerFormData());
    setShowCustomerDropdown(false);
    setCustomers([]);
  }, []);

  return {
    // State
    customer,
    customerSearch,
    showCustomerDropdown,
    setShowCustomerDropdown,
    customerFormData,
    customers,
    customerSearchRef,
    // Actions
    selectCustomer,
    clearCustomer,
    handleCustomerFieldChange,
    setCustomerFromJobCard,
    resetCustomer
  };
}
