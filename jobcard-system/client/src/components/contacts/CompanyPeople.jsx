import { useState } from 'react';
import { Plus, Archive, ArchiveRestore, Save, X } from 'lucide-react';
import { toTitleCase } from '../../utils/formatters';

const blankPerson = () => ({ contactName: '', phone: '', email: '' });

/**
 * The people at one company. Several can sit under the same customer, so this is
 * where a Jane who leaves is retired and a Bob who replaces her is added — the
 * company, and everything filed under it, stays put.
 */
export default function CompanyPeople({ people, saving, pendingId, onCreate, onUpdate, onArchive, onRestore }) {
  const [editingId, setEditingId] = useState(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(blankPerson());

  const startAdd = () => { setEditingId(null); setAdding(true); setForm(blankPerson()); };
  const startEdit = (p) => {
    setAdding(false);
    setEditingId(p.id);
    setForm({ contactName: p.contactName || '', phone: p.phone || '', email: p.email || '' });
  };
  const cancel = () => { setAdding(false); setEditingId(null); setForm(blankPerson()); };

  const submit = async (e) => {
    e.preventDefault();
    const ok = adding ? await onCreate(form) : await onUpdate(editingId, form);
    if (ok) cancel();
  };

  const titleCaseBlur = (e) => {
    const formatted = toTitleCase(e.target.value);
    if (formatted !== e.target.value) setForm(prev => ({ ...prev, contactName: formatted }));
  };

  const editor = (
    <form className="company-person-form" onSubmit={submit}>
      <div className="form-row">
        <div className="form-group">
          <label>Name</label>
          <input
            type="text"
            value={form.contactName}
            onChange={(e) => setForm({ ...form, contactName: e.target.value })}
            onBlur={titleCaseBlur}
            autoFocus
          />
        </div>
        <div className="form-group">
          <label>Phone</label>
          <input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </div>
        <div className="form-group">
          <label>Email</label>
          <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
      </div>
      <div className="company-person-actions">
        <button type="button" className="btn btn-secondary btn-sm" onClick={cancel}>
          <X size={14} /> Cancel
        </button>
        <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
          <Save size={14} /> {saving ? 'Saving...' : adding ? 'Add person' : 'Save'}
        </button>
      </div>
    </form>
  );

  return (
    <div className="company-people">
      <div className="company-people-head">
        <h4>Contacts</h4>
        {!adding && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={startAdd}>
            <Plus size={14} /> Add person
          </button>
        )}
      </div>

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
