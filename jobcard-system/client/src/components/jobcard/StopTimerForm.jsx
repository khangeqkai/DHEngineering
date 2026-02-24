import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronDown, ChevronUp } from 'lucide-react';
import { api } from '../../services/api';
import { capitalizeFirst } from '../../utils/formatters';
import './StopTimerForm.css';

export default function StopTimerForm({ isOpen, jobCard, entryForm, onItemFieldChange, onItemMachineToggle, onSubmit, onCancel, loading }) {
  const [items, setItems] = useState([]);
  const [machines, setMachines] = useState([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [expandedItems, setExpandedItems] = useState(new Set());
  const formRef = useRef(null);
  const firstInputRef = useRef(null);

  useEffect(() => {
    if (!isOpen || !jobCard?.id) return;
    setDataLoading(true);
    setExpandedItems(new Set());
    Promise.all([
      api.getJobcard(jobCard.id),
      api.getMachines()
    ]).then(([jobcardRes, machinesRes]) => {
      const loadedItems = jobcardRes?.items || [];
      setItems(loadedItems);
      setMachines((machinesRes || []).filter(m => m.active !== 0 && m.active !== false));
      // Auto-expand first item
      if (loadedItems.length > 0) {
        setExpandedItems(new Set([loadedItems[0].itemNumber]));
      }
    }).catch(() => {
      setItems([]);
      setMachines([]);
    }).finally(() => {
      setDataLoading(false);
    });
  }, [isOpen, jobCard?.id]);

  useEffect(() => {
    if (isOpen && !dataLoading && firstInputRef.current) {
      firstInputRef.current.focus();
    }
  }, [isOpen, dataLoading]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (e.key === 'Tab' && formRef.current) {
      const focusable = formRef.current.querySelectorAll('input, textarea, button:not(:disabled)');
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  const itemsData = entryForm.items || {};
  const filledItems = Object.entries(itemsData).filter(
    ([, item]) => item.qty && String(item.qty).trim() !== ''
  );
  const allFilledValid = filledItems.length > 0 && filledItems.every(
    ([, item]) => (item.machineNumbers || []).length > 0
  );

  const toggleExpand = (itemNumber) => {
    setExpandedItems(prev => {
      const next = new Set(prev);
      if (next.has(itemNumber)) next.delete(itemNumber);
      else next.add(itemNumber);
      return next;
    });
  };

  const handleDescriptionBlur = (itemNumber, e) => {
    const formatted = capitalizeFirst(e.target.value);
    if (formatted !== e.target.value) {
      onItemFieldChange(itemNumber, 'description', formatted);
    }
  };

  const handleFormSubmit = (e) => {
    e.preventDefault();
    if (allFilledValid && !loading) onSubmit();
  };

  const getItemStatus = (itemNumber) => {
    const item = itemsData[itemNumber];
    if (!item || !item.qty || !String(item.qty).trim()) return 'empty';
    if ((item.machineNumbers || []).length === 0) return 'incomplete';
    return 'complete';
  };

  return createPortal(
    <div className="stop-timer-overlay" role="alertdialog" aria-modal="true" aria-labelledby="stop-timer-title" aria-describedby="stop-timer-desc">
      <div className="stop-timer-form" ref={formRef}>
        <div className="stop-timer-header">
          <div className="stop-timer-header-top">
            <h3 id="stop-timer-title">Timer Stopped — {jobCard?.jobNumber}</h3>
            <button
              type="button"
              className="stop-timer-close-btn"
              onClick={onCancel}
              disabled={loading}
              aria-label="Resume timer"
              title="Resume timer"
            >
              <X size={18} />
            </button>
          </div>
          <p id="stop-timer-desc">Fill in qty and machines for each item you worked on</p>
        </div>

        {dataLoading ? (
          <div className="stop-timer-loading">Loading...</div>
        ) : (
          <form onSubmit={handleFormSubmit} className="stop-timer-form-body">
            <div className="stop-timer-fields">
              {items.map((item, idx) => {
                const num = item.itemNumber;
                const expanded = expandedItems.has(num);
                const itemData = itemsData[num] || {};
                const status = getItemStatus(num);
                return (
                  <div key={num} className={`stf-item-card stf-item-${status}`}>
                    <button
                      type="button"
                      className="stf-item-card-header"
                      onClick={() => toggleExpand(num)}
                    >
                      <div className="stf-item-card-title">
                        <span className="stf-item-num">#{num}</span>
                        <span className="stf-item-desc" title={item.description}>
                          {item.description?.substring(0, 45)}{item.description?.length > 45 ? '...' : ''}
                        </span>
                        <span className="stf-item-total">Total: {item.qty}</span>
                      </div>
                      <div className="stf-item-card-right">
                        {itemData.qty && String(itemData.qty).trim() && (
                          <span className="stf-item-qty-badge">Qty: {itemData.qty}</span>
                        )}
                        {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </div>
                    </button>

                    {expanded && (
                      <div className="stf-item-card-body">
                        <div className="stf-item-field">
                          <label>Qty Completed</label>
                          <input
                            ref={idx === 0 ? firstInputRef : undefined}
                            type="text"
                            inputMode="numeric"
                            placeholder="0"
                            value={itemData.qty || ''}
                            onChange={(e) => onItemFieldChange(num, 'qty', e.target.value)}
                            className="stf-qty-input"
                          />
                        </div>

                        {machines.length > 0 && (
                          <div className="stf-item-field">
                            <label>Machines Used</label>
                            <div className="stf-machine-grid">
                              {machines.map(m => {
                                const checked = (itemData.machineNumbers || []).includes(m.machineNumber);
                                return (
                                  <label key={m.id} className={`stf-machine-chip${checked ? ' stf-machine-chip-active' : ''}`}>
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() => onItemMachineToggle(num, m.machineNumber)}
                                    />
                                    <span className="stf-machine-label">
                                      {m.machineNumber}{m.name ? ` - ${m.name}` : ''}
                                    </span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        <div className="stf-item-field">
                          <label>Description</label>
                          <input
                            type="text"
                            placeholder="What did you work on?"
                            value={itemData.description || ''}
                            onChange={(e) => onItemFieldChange(num, 'description', e.target.value)}
                            onBlur={(e) => handleDescriptionBlur(num, e)}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="stop-timer-actions">
              <button
                type="submit"
                className="btn btn-primary"
                disabled={!allFilledValid || loading}
              >
                {loading ? 'Saving...' : filledItems.length > 1 ? `Submit (${filledItems.length} items)` : 'Submit'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body
  );
}
