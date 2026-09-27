import { toTitleCase } from '../../../utils/formatters';
import FieldError from '../../common/FieldError';

const titleCaseBlur = (field, setter) => (e) => {
  const formatted = toTitleCase(e.target.value);
  if (formatted !== e.target.value) setter(field, formatted);
};

// The Customer card: frozen after creation, so an existing job shows a read-only
// strip of what was picked; a brand-new job shows the picker (company, then who
// there the job is for). Split out of DetailsTab.jsx purely to keep that file
// from growing further — every prop here is something DetailsTab already holds
// (management-only; DetailsTab never renders this for the worker view, which has
// its own read-only screen entirely).
export default function CustomerSection({
  isEdit,
  contactFormData,
  selectedCompany,
  people,
  contactSearchRef,
  handleContactFieldChange,
  selectPerson,
  noteCompanyTyping,
  handleFieldFocus,
  handleFieldBlur,
  companyMatches,
  companyListOpen,
  companyNav,
  contactGroupClass = () => 'form-group',
  contactErrorFor = () => null,
  contactErrorProps = (name) => ({ id: `${name}-error` })
}) {
  if (isEdit) {
    return (
      <div className="form-section">
        <h3 className="form-section-title">Customer</h3>
        <div className="customer-input-strip">
          <div className="cis-item">
            <span className="cis-label">Company</span>
            <span className="cis-value">{contactFormData.companyName || '-'}</span>
          </div>
          {contactFormData.contactName && (
            <div className="cis-item">
              <span className="cis-label">Contact</span>
              <span className="cis-value">{contactFormData.contactName}</span>
            </div>
          )}
          {contactFormData.phone && (
            <div className="cis-item">
              <span className="cis-label">Phone</span>
              <span className="cis-value">{contactFormData.phone}</span>
            </div>
          )}
          {contactFormData.email && (
            <div className="cis-item">
              <span className="cis-label">Email</span>
              <span className="cis-value">{contactFormData.email}</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="form-section">
      <h3 className="form-section-title">
        Customer <span className="required">*</span>
        {selectedCompany && <span className="contact-linked-badge">Linked</span>}
      </h3>

      <div className="contact-fields-inline" ref={contactSearchRef}>
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="jc-company-name">Company <span className="required">*</span></label>
            <div className="autocomplete-container">
              <input
                id="jc-company-name"
                type="text"
                value={contactFormData.companyName}
                onChange={(e) => {
                  // Typing again after a pick disarms the guard below — an Enter
                  // pick leaves focus in the box, so without this the flag would
                  // outlive the blur it was meant for and eat a real edit.
                  companyNav.disarmPickGuard();
                  // A pick closed the list; with Enter the cursor never left the
                  // box, so only this brings the matching customers back.
                  noteCompanyTyping();
                  handleContactFieldChange('companyName', e.target.value);
                }}
                onFocus={handleFieldFocus}
                onBlur={(e) => {
                  handleFieldBlur();
                  // The pick just fired its own write; this blur's e.target.value
                  // is still the pre-pick text, so re-capitalising it here would
                  // overwrite the pick with a mis-cased version of what was typed.
                  if (companyNav.consumePickGuard()) return;
                  const formatted = toTitleCase(e.target.value);
                  if (formatted !== e.target.value) handleContactFieldChange('companyName', formatted);
                }}
                onKeyDown={companyNav.handleKeyDown}
                role="combobox"
                aria-expanded={companyListOpen}
                aria-controls={companyNav.listId}
                aria-autocomplete="list"
                aria-activedescendant={companyNav.activeIndex >= 0 ? `${companyNav.listId}-${companyNav.activeIndex}` : undefined}
                autoComplete="off"
                className={!contactFormData.companyName.trim() ? 'field-required' : ''}
              />
              {companyListOpen && (
                <div className="customer-dropdown" id={companyNav.listId} role="listbox" aria-label="Matching customers">
                  {companyMatches.map((c, i) => (
                    <div
                      key={c.id}
                      id={`${companyNav.listId}-${i}`}
                      role="option"
                      aria-selected={i === companyNav.activeIndex}
                      className={`customer-option${i === companyNav.activeIndex ? ' is-active' : ''}`}
                      onMouseDown={() => companyNav.choose(i)}
                      onMouseEnter={() => companyNav.setActiveIndex(i)}
                    >
                      <strong>{c.name}</strong>
                      {(c.people || []).length > 0 && (
                        <span className="contact-name"> ({(c.people || []).map(p => p.contactName).filter(Boolean).join(', ')})</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            {!selectedCompany && contactFormData.companyName.trim() && (
              <span className="field-hint">Not on the list — it will be added as a new customer.</span>
            )}
          </div>
          <div className={selectedCompany && people.length > 0 ? 'form-group' : contactGroupClass('contactName')}>
            <label htmlFor="jc-contact">Contact</label>
            {selectedCompany && people.length > 0 ? (
              <select
                id="jc-contact"
                value={contactFormData.contactId}
                onChange={(e) => selectPerson(e.target.value)}
              >
                <option value="">Someone else...</option>
                {people.map(p => (
                  <option key={p.id} value={p.id}>{p.contactName || 'Unnamed'}</option>
                ))}
              </select>
            ) : (
              <>
                <input
                  id="jc-contact"
                  type="text"
                  value={contactFormData.contactName}
                  onChange={(e) => handleContactFieldChange('contactName', e.target.value)}
                  onBlur={titleCaseBlur('contactName', handleContactFieldChange)}
                  aria-invalid={contactErrorFor('contactName') ? true : undefined}
                  aria-describedby={contactErrorFor('contactName') ? contactErrorProps('contactName').id : undefined}
                />
                <FieldError {...contactErrorProps('contactName')} message={contactErrorFor('contactName')} />
              </>
            )}
          </div>
        </div>
        {selectedCompany && people.length > 0 && !contactFormData.contactId && (
          <div className="form-row">
            <div className={contactGroupClass('contactName')}>
              <label htmlFor="jc-new-contact-name">New contact name</label>
              <input
                id="jc-new-contact-name"
                type="text"
                value={contactFormData.contactName}
                onChange={(e) => handleContactFieldChange('contactName', e.target.value)}
                onBlur={titleCaseBlur('contactName', handleContactFieldChange)}
                aria-invalid={contactErrorFor('contactName') ? true : undefined}
                aria-describedby={contactErrorFor('contactName') ? contactErrorProps('contactName').id : undefined}
              />
              <span className="field-hint">They'll be added under {selectedCompany.name}.</span>
              <FieldError {...contactErrorProps('contactName')} message={contactErrorFor('contactName')} />
            </div>
          </div>
        )}
        <div className="form-row">
          <div className={contactGroupClass('contactPhone')}>
            <label htmlFor="jc-phone">Phone</label>
            <input
              id="jc-phone"
              type="tel"
              value={contactFormData.phone}
              onChange={(e) => handleContactFieldChange('phone', e.target.value)}
              aria-invalid={contactErrorFor('contactPhone') ? true : undefined}
              aria-describedby={contactErrorFor('contactPhone') ? contactErrorProps('contactPhone').id : undefined}
            />
            <FieldError {...contactErrorProps('contactPhone')} message={contactErrorFor('contactPhone')} />
          </div>
          <div className={contactGroupClass('contactEmail')}>
            <label htmlFor="jc-email">Email</label>
            <input
              id="jc-email"
              // Plain text with an email keyboard: type="email" would let the
              // browser's own bubble block Create before a bad address ever
              // reaches the server to be marked on this box.
              type="text"
              inputMode="email"
              autoComplete="email"
              value={contactFormData.email}
              onChange={(e) => handleContactFieldChange('email', e.target.value)}
              aria-invalid={contactErrorFor('contactEmail') ? true : undefined}
              aria-describedby={contactErrorFor('contactEmail') ? contactErrorProps('contactEmail').id : undefined}
            />
            <FieldError {...contactErrorProps('contactEmail')} message={contactErrorFor('contactEmail')} />
          </div>
        </div>
      </div>
    </div>
  );
}
