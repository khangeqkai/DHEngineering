import { useState, useRef } from 'react';
import { Plus, Archive, ArchiveRestore, Save, X } from 'lucide-react';
import { toTitleCase } from '../../utils/formatters';
import { useFieldErrors, scrollFieldIntoView } from '../../hooks/useFieldErrors';
import FieldError from '../common/FieldError';
import { changedFields } from '../../utils/changedFields';

const blankPerson = () => ({ contactName: '', phone: '', email: '' });

// Which box on the person form each field named in a server refusal belongs to,
// and which form value each box shows.
export const PERSON_FORM_BOXES = { contactName: 'companyPersonName', phone: 'companyPersonPhone', email: 'companyPersonEmail' };
const PERSON_BOX_VALUE = { companyPersonName: 'contactName', companyPersonPhone: 'phone', companyPersonEmail: 'email' };

/**
 * The people at one company. Several can sit under the same customer, so this is
 * where a Jane who leaves is retired and a Bob who replaces her is added — the
 * company, and everything filed under it, stays put.
 */
export default function CompanyPeople({ people, saving, pendingId, onCreate, onUpdate, onArchive, onRestore, companyArchived }) {
  const [editingId, setEditingId] = useState(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(blankPerson());
  // What the form held when it opened on a person — an edit sends only the boxes
  // changed since, so a detail saved elsewhere meanwhile isn't put back.
  const openedFormRef = useRef(blankPerson());
  const { setFieldErrors, clearAll, groupClass, errorFor, fieldProps, errorProps } = useFieldErrors(
    (box) => form[PERSON_BOX_VALUE[box]]
  );

  const startAdd = () => { setEditingId(null); setAdding(true); setForm(blankPerson()); clearAll(); };
  const startEdit = (p) => {
    setAdding(false);
    setEditingId(p.id);
    const opened = { contactName: p.contactName || '', phone: p.phone || '', email: p.email || '' };
    openedFormRef.current = opened;
    setForm(opened);
    clearAll();
  };
  const cancel = () => { setAdding(false); setEditingId(null); setForm(blankPerson()); clearAll(); };

  const submit = async (e) => {
    e.preventDefault();
    // A person needs something that says who they are or how to reach them — any
    // one of the three will do (the server applies the same rule).
    if (![form.contactName, form.phone, form.email].some(v => v.trim())) {
      setFieldErrors({ companyPersonName: 'Enter a name, phone or email' });
      scrollFieldIntoView('companyPersonName');
      return;
    }
    const person = adding ? { ...form } : changedFields(form, openedFormRef.current);
    // The name box only tidies itself on blur — Enter from inside it submits
    // without that blur, so the same tidy-up is applied here too.
    if ('contactName' in person) person.contactName = toTitleCase(person.contactName);
    const ok = adding ? await onCreate(person, setFieldErrors) : await onUpdate(editingId, person, setFieldErrors);
    if (ok) cancel();
  };

  const titleCaseBlur = (e) => {
    const formatted = toTitleCase(e.target.value);
    if (formatted !== e.target.value) setForm(prev => ({ ...prev, contactName: formatted }));
  };

  // Escape closes only this small person box, like its Cancel button — marking the
  // key handled so the customer window around it (which skips a handled Escape)
  // stays open with everything typed in it.
  const handleEditorKeyDown = (e) => {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    e.preventDefault();
    cancel();
  };

  const editor = (
    <form className="company-person-form" onSubmit={submit} onKeyDown={handleEditorKeyDown} noValidate>
      <div className="form-row">
        <div className={groupClass('companyPersonName')}>
          <label htmlFor="companyPersonName">Name</label>
          <input
            type="text"
            {...fieldProps('companyPersonName')}
            value={form.contactName}
            onChange={(e) => setForm({ ...form, contactName: e.target.value })}
            onBlur={titleCaseBlur}
            autoFocus
          />
          <FieldError {...errorProps('companyPersonName')} message={errorFor('companyPersonName')} />
        </div>
        <div className={groupClass('companyPersonPhone')}>
          <label htmlFor="companyPersonPhone">Phone</label>
          <input type="tel" {...fieldProps('companyPersonPhone')} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <FieldError {...errorProps('companyPersonPhone')} message={errorFor('companyPersonPhone')} />
        </div>
        <div className={groupClass('companyPersonEmail')}>
          <label htmlFor="companyPersonEmail">Email</label>
          <input type="email" {...fieldProps('companyPersonEmail')} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <FieldError {...errorProps('companyPersonEmail')} message={errorFor('companyPersonEmail')} />
        </div>
      </div>
      <div className="company-person-actions">
        <button type="button" className="btn btn-secondary btn-sm" onClick={cancel}>
          <X size={14} /> Cancel
        </button>
        <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
          <Save size={14} /> {saving ? 'Saving...' : adding ? 'Add Person' : 'Save'}
        </button>
      </div>
    </form>
  );

  return (
    <div className="company-people">
      <div className="company-people-head">
        {/* Was an <h4>, which dropped two levels below the page's own <h1> and
            lost the section structure for anyone moving by heading. The styling
            rule in App.css follows it to h2, so the look is unchanged. */}
        <h2>Contacts</h2>
        {!adding && !companyArchived && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={startAdd}>
            <Plus size={14} /> Add Person
          </button>
        )}
      </div>

      {companyArchived && (
        <p className="field-hint">This customer is archived. Restore it before adding people.</p>
      )}

      {adding && editor}

      {people.length === 0 && !adding && (
        <p className="company-people-empty">Nobody here yet. Add the person you deal with.</p>
      )}

      <ul className="company-people-list">
        {people.map(p => (
          <li key={p.id} className={p.archived ? 'is-archived' : ''}>
            {editingId === p.id ? editor : (
              <>
                <div className="cp-who">
                  <button type="button" className="cp-name" onClick={() => startEdit(p)}>
                    {p.contactName || 'Unnamed'}
                  </button>
                  {p.archived && <span className="cp-tag">Retired</span>}
                  <span className="cp-detail">{[p.phone, p.email].filter(Boolean).join(' · ') || 'No phone or email'}</span>
                </div>
                <div className="cp-actions">
                  {p.archived ? (
                    <button type="button" className="btn btn-success btn-sm" disabled={pendingId === p.id} onClick={() => onRestore(p)}>
                      <ArchiveRestore size={14} /> Restore
                    </button>
                  ) : (
                    <button type="button" className="btn btn-warning btn-sm" disabled={pendingId === p.id} onClick={() => onArchive(p)}>
                      <Archive size={14} /> Retire
                    </button>
                  )}
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
