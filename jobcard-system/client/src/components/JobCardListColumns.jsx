import { Trash2, ArchiveRestore, Check, AlertTriangle, Paperclip, Printer, ChevronDown } from 'lucide-react';
import { displayName } from '../../../server/src/shared/names';
import './common/CheckboxDropdown.css';
import { getInitials, getAvatarColor } from '../utils/initials';
import { describeAttachmentGaps, attachmentSeverity } from '../utils/attachmentWarnings';
import {
  STATUS_LABELS,
  PRIORITY_LABELS,
  priorityToken,
  getStatusBadgeClass
} from './JobCardList.constants';
import { canChangeStatus } from '../../../server/src/shared/jobStatus';
import { statusMenuModel } from './jobcard/constants';
import { isCriticalLevel } from '../../../server/src/shared/qualityLevels';
import { formatDate, formatDateTime } from '../utils/formatters';
import { isJobClosed } from '../utils/jobLock';
import StatusPopover from './common/StatusPopover';
import PlacedPopover from './common/PlacedPopover';
import { can } from '../utils/roles';

export function getJobCardColumns({
  user,
  canManage,
  canInvoice,
  showArchived,
  activeTimerJobcardId,
  formattedElapsed,
  missingFilesIds,
  attachmentCheckedIds,
  statusPopoverId,
  setStatusPopoverId,
  popoverRef,
  assignPopoverId,
  setAssignPopoverId,
  assignPopoverRef,
  setHoverNames,
  setHoverDesc,
  employees,
  handleAssigneeToggle,
  openEditModal,
  handleQuickStatusChange,
  handleDelete,
  handleUnarchive
}) {
  return [
    {
      id: 'jobNumber',
      label: 'Job #',
      renderCell: (card) => {
        // A Critical QA job wears its level on the number itself — red instead
        // of the usual link blue — so it reads from across the list without a
        // badge crowding the cell. The hidden text and the hover title carry
        // the same meaning for anyone who can't tell the red from the blue.
        const critical = isCriticalLevel(card.qualityLevel);
        return (
          <td key="jobNumber" className="job-number-cell">
            <a
              href="#"
              className={critical ? 'job-number-critical' : undefined}
              title={critical ? 'Critical QA' : undefined}
              onClick={(e) => {
                e.preventDefault();
                openEditModal(card.id);
              }}
            >
              <strong className="mono-num">{card.jobNumber}</strong>
              {critical && <span className="sr-only"> (Critical QA)</span>}
            </a>
          </td>
        );
      }
    },
    {
      id: 'timer',
      label: 'Timer',
      renderCell: (card) => (
        <td key="timer" className="timer-cell">
          {card.id === activeTimerJobcardId && (
            <span className="timer-indicator" aria-label={`Timer running: ${formattedElapsed}`}>
              <span className="timer-dot" aria-hidden="true" />
              {formattedElapsed}
            </span>
          )}
        </td>
      )
    },
    {
      id: 'description',
      label: 'Description',
      renderCell: (card) => (
        <td
          key="description"
          className="description-cell"
          // No native title here: the hover card below already shows the full
          // text, and the two would stack on top of each other.
          onMouseEnter={(e) => {
            const el = e.currentTarget;
            // Only float the full text when it's actually cut off by the ellipsis.
            if (!card.description || el.scrollWidth <= el.clientWidth) return;
            const r = el.getBoundingClientRect();
            setHoverDesc({ top: r.bottom + 6, left: r.left, text: card.description });
          }}
          onMouseLeave={() => setHoverDesc(null)}
        >
          {card.description || '-'}
        </td>
      )
    },
    {
      id: 'company',
      label: 'Company',
      managementOnly: true,
      renderCell: (card) => (
        <td
          key="company"
          className="company-cell"
          onMouseEnter={(e) => {
            const el = e.currentTarget;
            if (!card.companyName || el.scrollWidth <= el.clientWidth) return;
            const r = el.getBoundingClientRect();
            setHoverDesc({ top: r.bottom + 6, left: r.left, title: 'Company', text: card.companyName });
          }}
          onMouseLeave={() => setHoverDesc(null)}
        >
          {card.companyName || '-'}
        </td>
      )
    },
    {
      id: 'customer',
      label: 'Customer',
      managementOnly: true,
      renderCell: (card) => (
        <td
          key="customer"
          className="customer-cell"
          onMouseEnter={(e) => {
            const el = e.currentTarget;
            if (!card.contactName || el.scrollWidth <= el.clientWidth) return;
            const r = el.getBoundingClientRect();
            setHoverDesc({ top: r.bottom + 6, left: r.left, title: 'Customer', text: card.contactName });
          }}
          onMouseLeave={() => setHoverDesc(null)}
        >
          {card.contactName || '-'}
        </td>
      )
    },
    {
      id: 'assignedTo',
      label: 'Assigned To',
      renderCell: (card) => {
        const renderAvatars = () => card.assignees?.length ? (() => {
          const MAX_VISIBLE = 3;
          const visible = card.assignees.slice(0, MAX_VISIBLE);
          const overflow = card.assignees.length - visible.length;
          return (
            <span className="assignee-preview">
              <span className="avatar-stack">
                {visible.map(a => {
                  const c = getAvatarColor(a.userName || a.userId);
                  return (
                    <span
                      key={a.userId}
                      className="avatar-chip"
                      style={{ backgroundColor: c.bg, color: c.fg }}
                    >
                      {getInitials(a.userName)}
                    </span>
                  );
                })}
                {overflow > 0 && (
                  <span className="avatar-chip avatar-overflow">
                    +{overflow}
                  </span>
                )}
              </span>
            </span>
          );
        })() : '-';

        // Mirrors the status column's own rule: once a job is invoiced it's
        // archived and closed — its workers are shown, but there's nothing here
        // to click. Tests the row's own flag (jobLock.js's isJobClosed), not the
        // "Show Archived" view toggle — a row can be archived while the list
        // isn't filtered to archived-only (a search result, for one), and the
        // toggle being on says nothing about any one row already on screen.
        if (isJobClosed(card)) {
          return (
            <td key="assignedTo" className="assignee-cell">
              <span
                className="assignee-trigger assignee-trigger--readonly"
                title={card.assignees?.length
                  ? card.assignees.map(a => a.userName).filter(Boolean).join(', ')
                  : 'This job is paid and archived. Its workers can\'t be changed.'}
              >
                {renderAvatars()}
              </span>
            </td>
          );
        }

        const showHoverNames = (e) => {
          if (!card.assignees?.length) return;
          const r = e.currentTarget.getBoundingClientRect();
          setHoverNames({
            top: r.bottom + 6,
            left: r.left,
            names: card.assignees.map(a => ({
              name: a.userName,
              color: getAvatarColor(a.userName || a.userId).bg
            }))
          });
        };
        const assignedIds = new Set((card.assignees || []).map(a => a.userId));

        return (
          <td key="assignedTo" className="assignee-cell">
            <div className="assignee-cell-row">
              {canManage ? (
                <div className="status-popover-wrapper" ref={assignPopoverId === card.id ? assignPopoverRef : null}>
                  <button
                    type="button"
                    className="assignee-trigger"
                    aria-label="Choose who is on this job"
                    aria-haspopup="true"
                    aria-expanded={assignPopoverId === card.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      setHoverNames(null);
                      setAssignPopoverId(assignPopoverId === card.id ? null : card.id);
                    }}
                    onMouseEnter={showHoverNames}
                    onMouseLeave={() => setHoverNames(null)}
                  >
                    {renderAvatars()}
                  </button>
                  {assignPopoverId === card.id && (
                    <PlacedPopover className="assignee-checklist">
                      {employees.length === 0 && (
                        <div className="checkbox-dropdown-empty">No people to choose from</div>
                      )}
                      {employees.map(emp => {
                        const checked = assignedIds.has(emp.id);
                        return (
                          <button
                            type="button"
                            key={emp.id}
                            className={`checkbox-dropdown-option${checked ? ' is-checked' : ''}`}
                            role="menuitemcheckbox"
                            aria-checked={checked}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAssigneeToggle(card, emp.id, checked);
                            }}
                          >
                            <span className={`checkbox-dropdown-box${checked ? ' is-checked' : ''}`}>
                              {checked && <Check size={14} strokeWidth={3} />}
                            </span>
                            <span className="checkbox-dropdown-text">
                              <span className="checkbox-dropdown-label">{displayName(emp)}</span>
                            </span>
                          </button>
                        );
                      })}
                    </PlacedPopover>
                  )}
                </div>
              ) : (
                <span
                  className="assignee-trigger assignee-trigger--readonly"
                  onMouseEnter={showHoverNames}
                  onMouseLeave={() => setHoverNames(null)}
                >
                  {renderAvatars()}
                </span>
              )}
            </div>
          </td>
        );
      }
    },
    {
      id: 'status',
      label: 'Status',
      renderCell: (card) => {
        // Mirrors the rule in JobIdentityStrip.jsx: a non-management user only gets
        // the popover while the job is still somewhere they're allowed to act from.
        // Once it's moved on (or the row is closed), the badge is plain text, not
        // a button — nothing to click, nothing to offer. Tests the row's own
        // archived flag (jobLock.js's isJobClosed) rather than the "Show Archived"
        // view toggle — see the assignee column's own comment above.
        const rowClosed = isJobClosed(card);
        const changeable = !rowClosed && canChangeStatus({ canManage, canInvoice }, card.status, true, card.previousStatus);
        if (!changeable) {
          return (
            <td key="status">
              <span
                className={`badge ${getStatusBadgeClass(card.status)}`}
                title={!rowClosed ? 'You can\'t change this status' : undefined}
              >
                {STATUS_LABELS[card.status] || card.status}
              </span>
            </td>
          );
        }
        const menu = statusMenuModel({ canManage, canInvoice }, card.status, card.previousStatus);
        // lead: what StatusPopover puts before the badge on its "Put back to …" row.
        const renderRow = ({ value, label }, lead = null) => (
          <button
            key={value}
            type="button"
            className={`status-popover-item${card.status === value ? ' active' : ''}${lead ? ' status-popover-item--putback' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              if (card.status !== value) {
                handleQuickStatusChange(card.id, value);
              } else {
                setStatusPopoverId(null);
              }
            }}
          >
            {lead}
            <span className={`badge ${getStatusBadgeClass(value)}`}>{label}</span>
            {card.status === value && <span className="status-check"><Check size={14} /></span>}
          </button>
        );
        return (
          <td key="status">
            <div className="status-popover-wrapper" ref={statusPopoverId === card.id ? popoverRef : null}>
              <button
                type="button"
                className={`badge ${getStatusBadgeClass(card.status)} badge-clickable`}
                aria-label={`Status: ${STATUS_LABELS[card.status] || card.status}. Change status`}
                onClick={(e) => {
                  e.stopPropagation();
                  setStatusPopoverId(statusPopoverId === card.id ? null : card.id);
                }}
              >
                {STATUS_LABELS[card.status] || card.status}
                <ChevronDown size={12} aria-hidden="true" />
              </button>
              {statusPopoverId === card.id && (
                <StatusPopover putBack={menu.putBack} groups={menu.groups} renderRow={renderRow} />
              )}
            </div>
          </td>
        );
      }
    },
    {
      id: 'latestNote',
      label: 'Latest Comment',
      renderCell: (card) => {
        const note = card.latestNote;
        return (
          <td
            key="latestNote"
            className="latest-note-cell"
            onMouseEnter={(e) => {
              const el = e.currentTarget;
              // Only float the full comment when the row actually cuts it off.
              if (!note?.text || el.scrollWidth <= el.clientWidth) return;
              const r = el.getBoundingClientRect();
              setHoverDesc({
                top: r.bottom + 6,
                left: r.left,
                title: 'Latest comment',
                meta: [note.userName, note.createdAt ? formatDateTime(note.createdAt) : '']
                  .filter(Boolean).join(' · '),
                text: note.text
              });
            }}
            onMouseLeave={() => setHoverDesc(null)}
          >
            {card.unreadNotes > 0 && (
              <span
                className="latest-note-unread-dot"
                title={`${card.unreadNotes} new ${card.unreadNotes === 1 ? 'comment' : 'comments'}`}
              />
            )}
            {card.unreadNotes > 0
              ? <strong className="latest-note-unread-text">{note?.text || '-'}</strong>
              : (note?.text || '-')}
          </td>
        );
      }
    },
    {
      id: 'priority',
      label: 'Priority',
      renderCell: (card) => {
        const priority = card.priority || 'NONE';
        return (
          <td key="priority">
            <span className={`badge priority-${priorityToken(priority)}`}>
              {PRIORITY_LABELS[card.priority] || 'None'}
            </span>
          </td>
        );
      }
    },
    {
      id: 'attachments',
      label: 'Attachments',
      headerHint: 'Tick: all files attached. Warning triangle: drawings missing, asked about before the job is archived. Paperclip: files not attached yet.',
      align: 'center',
      renderCell: (card) => {
        // Until this row has actually been checked, show a faint loading hint
        // rather than a green tick — a not-yet-checked row isn't known to be clean.
        if (attachmentCheckedIds && !attachmentCheckedIds.has(card.id)) {
          return (
            <td key="attachments" className="attachment-cell">
              <span className="attachment-pending" aria-label="Checking files" />
            </td>
          );
        }
        const warning = missingFilesIds?.get(card.id);
        const severity = attachmentSeverity(warning);
        if (severity === 'ok') {
          return (
            <td key="attachments" className="attachment-cell">
              <span className="attachment-ok" title="All files attached" aria-label="All files attached">
                <Check size={14} />
              </span>
            </td>
          );
        }
        const blocking = severity === 'blocking';
        const gaps = describeAttachmentGaps(warning);
        const title = blocking ? 'Drawings missing, asked about before archiving' : 'Files not attached yet';
        return (
          <td key="attachments" className="attachment-cell">
            <span
              className={`missing-files-indicator${blocking ? ' missing-files-blocking' : ''}`}
              tabIndex={0}
              aria-label={`${title}: ${gaps.join(', ')}`}
            >
              {/* Shape carries the meaning, not just colour: an angular warning
                 triangle for a blocking gap vs a paperclip for a not-yet-attached
                 reminder, so the two read apart for colour-blind users too. */}
              {blocking ? <AlertTriangle size={14} /> : <Paperclip size={14} />}
              <span className="mf-tooltip" role="tooltip">
                <span className="mf-tooltip-title">{title}</span>
                {gaps.map((g, i) => (
                  <span key={i} className="mf-tooltip-item">
                    <span className="mf-tooltip-dot" />
                    {g}
                  </span>
                ))}
              </span>
            </span>
          </td>
        );
      }
    },
    {
      id: 'print',
      label: 'Print',
      headerHint: 'Tick: the job card has been printed. Printer: not printed yet.',
      align: 'center',
      renderCell: (card) => {
        if (card.printedAt) {
          return (
            <td key="print" className="print-cell">
              <span className="attachment-ok" title="Printed" aria-label={`Printed ${formatDateTime(card.printedAt)}`}>
                <Check size={14} />
              </span>
            </td>
          );
        }
        return (
          <td key="print" className="print-cell">
            {/* Shape carries the meaning, not just colour: a tick vs a printer. */}
            <span className="print-missing" title="Not printed yet" aria-label="Not printed yet">
              <Printer size={14} />
            </span>
          </td>
        );
      }
    },
    {
      id: 'dueDate',
      label: 'Due Date',
      align: 'right',
      renderCell: (card, isOverdue) => (
        <td key="dueDate" className={`jc-align-right${isOverdue ? ' overdue-date' : ''}`}>
          {card.dueDate ? formatDate(card.dueDate) : '-'}
          {isOverdue && <span className="overdue-label">OVERDUE</span>}
        </td>
      )
    },
    {
      id: 'createdAt',
      label: 'Created At',
      align: 'right',
      renderCell: (card) => (
        <td key="createdAt" className="jc-align-right">
          {card.createdAt ? formatDateTime(card.createdAt) : '-'}
        </td>
      )
    },
    {
      id: 'updatedAt',
      label: 'Last Edited',
      align: 'right',
      renderCell: (card) => (
        <td key="updatedAt" className="jc-align-right">
          {card.updatedAt ? formatDateTime(card.updatedAt) : '-'}
        </td>
      )
    },
    {
      id: 'actions',
      label: 'Actions',
      managementOnly: true,
      align: 'right',
      renderCell: (card) => (
        <td key="actions" className="jc-align-right">
          <div className="action-buttons">
            {showArchived && card.archived && (
              <button
                className="btn btn-outline-warning btn-sm"
                onClick={() => handleUnarchive(card.id)}
              >
                <ArchiveRestore size={14} /> Unarchive
              </button>
            )}
            {can(user, 'deleteJob') && (
              <button
                className="btn btn-outline-danger btn-sm"
                onClick={() => handleDelete(card.id)}
              >
                <Trash2 size={14} /> Delete
              </button>
            )}
          </div>
        </td>
      )
    }
  ];
}
