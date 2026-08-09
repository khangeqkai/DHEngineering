import { useState, useEffect, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';
import { api } from '../../services/api';

/**
 * Blank customer details for a job with nothing picked yet.
 */
function getDefaultContactFormData() {
  return {
    companyId: '',
    companyName: '',
    contactId: '',
    contactName: '',
    phone: '',
    email: ''
  };
}

/**
 * Picking the customer for a new job: type the company, pick it, then pick which
 * person there the job is for. The company is the customer (it owns the job's
 * folder); the people under it come and go.
 *
 * The person's details stay editable on the job — a number changes more often
 * than anyone updates the customer record — so this hook also reports what was
 * changed (via detailChanges) so the save can offer to update the saved person.
 */
export function useContactSearch() {
  const [contactFormData, setContactFormData] = useState(getDefaultContactFormData());
  const [fieldFocused, setFieldFocused] = useState(false);
  const [showContactDropdown, setShowContactDropdown] = useState(false);
  const [companyMatches, setCompanyMatches] = useState([]);
  const contactSearchRef = useRef(null);
  const blurTimeoutRef = useRef(null);

  // The whole customer list, loaded once on first focus and filtered in the
  // browser — one call beats one per keystroke, and the list is small.
  const [companies, setCompanies] = useState([]);
  const companiesLoaded = useRef(false);

  // The person's details as they are on the saved record, so the save can tell
  // what was changed on this job. Null when nobody is picked.
  const [pickedPerson, setPickedPerson] = useState(null);

  const loadCompanies = useCallback(async () => {
    if (companiesLoaded.current) return;
    try {
      const results = await api.getCompanies({ withPeople: true });
      setCompanies(results || []);
      companiesLoaded.current = true;
    } catch (err) {
      toast.error('Could not load the customer list');
    }
  }, []);

  // Company autocomplete — filters the loaded list as the company field is typed.
  useEffect(() => {
    if (!fieldFocused) return;
    const search = contactFormData.companyName.trim().toLowerCase();
    const matches = search
      ? companies.filter(c => (c.name || '').toLowerCase().includes(search)).slice(0, 10)
      : companies.slice(0, 10);
    setCompanyMatches(matches);
    setShowContactDropdown(matches.length > 0);
  }, [fieldFocused, contactFormData.companyName, companies]);

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
    loadCompanies();
  }, [loadCompanies]);

  // Delayed so a click on the dropdown still lands.
  const handleFieldBlur = useCallback(() => {
    blurTimeoutRef.current = setTimeout(() => {
      blurTimeoutRef.current = null;
      setFieldFocused(false);
      setShowContactDropdown(false);
    }, 200);
  }, []);

  // The people at the picked company, for the person dropdown.
  const selectedCompany = companies.find(c => c.id === contactFormData.companyId) || null;
  const people = selectedCompany?.people || [];

  // Fill the person's saved details in when they're picked, so the common case
  // needs no typing at all.
  const applyPerson = useCallback((person, setFormData) => {
    setPickedPerson(person || null);
    setContactFormData(prev => ({
      ...prev,
      contactId: person ? person.id : '',
      contactName: person ? (person.contactName || '') : '',
      phone: person ? (person.phone || '') : '',
      email: person ? (person.email || '') : ''
    }));
    setFormData(prev => ({
      ...prev,
      contactId: person ? person.id : '',
      contactName: person ? (person.contactName || '') : '',
      contactPhone: person ? (person.phone || '') : '',
      contactEmail: person ? (person.email || '') : ''
    }));
  }, []);

  // Pick a company from the dropdown. Its only person is picked automatically —
  // with one person there is nothing to choose.
  const selectCompany = useCallback((company, setFormData) => {
    const only = (company.people || []).length === 1 ? company.people[0] : null;
    setPickedPerson(only || null);
    setContactFormData({
      companyId: company.id,
      companyName: company.name || '',
      contactId: only ? only.id : '',
      contactName: only ? (only.contactName || '') : '',
      phone: only ? (only.phone || '') : '',
      email: only ? (only.email || '') : ''
    });
    setFormData(prev => ({
      ...prev,
      companyId: company.id,
      companyName: company.name || '',
      contactId: only ? only.id : '',
      contactName: only ? (only.contactName || '') : '',
      contactPhone: only ? (only.phone || '') : '',
      contactEmail: only ? (only.email || '') : ''
    }));
    setFieldFocused(false);
    setShowContactDropdown(false);
  }, []);

  const selectPerson = useCallback((personId, setFormData) => {
    applyPerson(people.find(p => p.id === personId) || null, setFormData);
  }, [people, applyPerson]);

  // Typing in the company field drops whichever customer was picked — the name no
  // longer matches them. Details that were filled in FROM that customer go with
  // them; details typed by hand are left alone, or fixing a typo in the company
  // would blank the phone number someone just entered.
  const handleContactFieldChange = useCallback((field, value, setFormData) => {
    if (field === 'companyName') {
      const wasAutoFilled = !!pickedPerson;
      setPickedPerson(null);
      setContactFormData(prev => ({
        ...prev,
        companyId: '',
        companyName: value,
        contactId: '',
        ...(wasAutoFilled ? { contactName: '', phone: '', email: '' } : {})
      }));
      setFormData(prev => ({
        ...prev,
        companyId: '',
        companyName: value,
        contactId: '',
        ...(wasAutoFilled ? { contactName: '', contactPhone: '', contactEmail: '' } : {})
      }));
      return;
    }

    setContactFormData(prev => ({ ...prev, [field]: value }));
    const formField = { contactName: 'contactName', phone: 'contactPhone', email: 'contactEmail' }[field];
    if (formField) setFormData(prev => ({ ...prev, [formField]: value }));
  }, [pickedPerson]);

  // Fold a company that was just created from the job screen into the loaded
  // list, so the next job can pick it without a reload. It deliberately doesn't
  // touch what's on screen — the details typed for the job are still in play.
  const registerCompany = useCallback((company) => {
    setCompanies(prev => (
      prev.some(c => c.id === company.id)
        ? prev
        : [...prev, { ...company, people: [] }].sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    ));
    setContactFormData(prev => ({ ...prev, companyId: company.id, companyName: company.name || prev.companyName }));
  }, []);

  // Adopt a person that was just created (or updated) on the saved record.
  const adoptPerson = useCallback((person) => {
    setCompanies(prev => prev.map(c => {
      if (c.id !== person.companyId) return c;
      const people = (c.people || []).filter(p => p.id !== person.id);
      return { ...c, people: [...people, person].sort((a, b) => (a.contactName || '').localeCompare(b.contactName || '')) };
    }));
    setPickedPerson(person);
    setContactFormData(prev => ({ ...prev, contactId: person.id }));
  }, []);

  // What the customer details on a saved job were, for the read-only strip.
  const setContactFromJobCard = useCallback((jobcardData) => {
    setContactFormData({
      companyId: jobcardData.companyId || '',
      companyName: jobcardData.companyName || '',
      contactId: jobcardData.contactId || '',
      contactName: jobcardData.contactName || '',
      phone: jobcardData.contactPhone || '',
      email: jobcardData.contactEmail || ''
    });
    setPickedPerson(null);
  }, []);

  const resetContact = useCallback(() => {
    setContactFormData(getDefaultContactFormData());
    setPickedPerson(null);
    setFieldFocused(false);
    setShowContactDropdown(false);
    setCompanyMatches([]);
  }, []);

  // Which of the picked person's details were changed on this job, old → new.
  // Empty when nobody is picked or nothing differs — which is the usual case, so
  // the save stays silent.
  const detailChanges = (() => {
    if (!pickedPerson) return {};
    const same = (a, b) => (a || '').trim() === (b || '').trim();
    const out = {};
    if (!same(pickedPerson.contactName, contactFormData.contactName)) {
      out.contactName = { from: pickedPerson.contactName || '', to: contactFormData.contactName.trim() };
    }
    if (!same(pickedPerson.phone, contactFormData.phone)) {
      out.phone = { from: pickedPerson.phone || '', to: contactFormData.phone.trim() };
    }
    if (!same(pickedPerson.email, contactFormData.email)) {
      out.email = { from: pickedPerson.email || '', to: contactFormData.email.trim() };
    }
    return out;
  })();

  return {
    // State
    contactFormData,
    fieldFocused,
    showContactDropdown,
    setShowContactDropdown,
    companyMatches,
    selectedCompany,
    people,
    pickedPerson,
    detailChanges,
    contactSearchRef,
    // Actions
    selectCompany,
    selectPerson,
    handleContactFieldChange,
    handleFieldFocus,
    handleFieldBlur,
    setContactFromJobCard,
    resetContact,
    registerCompany,
    adoptPerson
  };
}

export { getDefaultContactFormData };
