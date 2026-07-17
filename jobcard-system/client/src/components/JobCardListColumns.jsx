import { Trash2, ArchiveRestore, Check } from 'lucide-react';
import { getInitials, getAvatarColor } from '../utils/initials';
import { describeAttachmentGaps, attachmentSeverity } from '../utils/attachmentWarnings';
import {
  STATUS_LABELS,
  PRIORITY_COLORS,
  PRIORITY_LABELS,
  getStatusBadgeClass
} from './JobCardList.constants';

export function getJobCardColumns({
  user,
  canManage,
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
  openEditModal,
  handleQuickStatusChange,
  handleSelfToggle,
  handleDelete,
  handleUnarchive
}) {
  return [
    {
      id: 'jobNumber',
      label: 'Job #',
      renderCell: (card) => (
        <td key="jobNumber">
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              openEditModal(card.id);
            }}
          >
            <strong className="mono-num">{card.jobNumber}</strong>
          </a>
          {card.id === activeTimerJobcardId && (
            <span className="timer-indicator">
              <span className="timer-dot" />
              {formattedElapsed}
            </span>
          )}
          {card.qualityLevel === 'CRITICAL' && (
            <span className="critical-badge">Critical QA</span>
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
      renderCell: (card) => <td key="company">{card.companyName || '-'}</td>
    },
    {
      id: 'customer',
      label: 'Customer',
      managementOnly: true,
      renderCell: (card) => <td key="customer">{card.contactName || '-'}</td>
    },
    {
      id: 'assignedTo',
      label: 'Assigned To',
      renderCell: (card) => {
        const isAssigned = !!card.assignees?.some(a => a.userId === user?.id);
        const renderAvatars = () => card.assignees?.length ? (() => {
          const MAX_VISIBLE = 3;
          const visible = card.assignees.slice(0, MAX_VISIBLE);
          const overflow = card.assignees.length - visible.length;
          return (
            <span className="assignee-preview">
              <span className="avatar-stack">
                {visible.map(a => {
                  const c = getAvatarColor(a.userName || a.username || a.userId);
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

        return (
          <td key="assignedTo" className="assignee-cell">
            <div className="status-popover-wrapper" ref={assignPopoverId === card.id ? assignPopoverRef : null}>
              <span
                className="assignee-trigger"
                onClick={(e) => {
                  e.stopPropagation();
                  setAssignPopoverId(assignPopoverId === card.id ? null : card.id);
                }}
                onMouseEnter={(e) => {
                  if (!card.assignees?.length) return;
                  const r = e.currentTarget.getBoundingClientRect();
                  setHoverNames({
                    top: r.bottom + 6,
                    left: r.left,
                    names: card.assignees.map(a => ({
                      name: a.userName,
                      color: getAvatarColor(a.userName || a.username || a.userId).bg
                    }))
                  });
                }}
                onMouseLeave={() => setHoverNames(null)}
              >
                {renderAvatars()}
              </span>
              {assignPopoverId === card.id && (
                <div className="status-popover">
                  <button
                    className="status-popover-item"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSelfToggle(card, isAssigned);
                    }}
                  >
                    {isAssigned ? 'Remove me' : 'Assign me'}
                  </button>
                </div>
              )}
            </div>
          </td>
        );
      }
    },
    {
      id: 'status',
      label: 'Status',
      renderCell: (card) => (
        <td key="status">
          {!showArchived ? (
            <div className="status-popover-wrapper" ref={statusPopoverId === card.id ? popoverRef : null}>
              <span
                className={`badge ${getStatusBadgeClass(card.status)} badge-clickable`}
                onClick={(e) => {
                  e.stopPropagation();
                  setStatusPopoverId(statusPopoverId === card.id ? null : card.id);
                }}
              >
                {STATUS_LABELS[card.status] || card.status}
              </span>
              {statusPopoverId === card.id && (
                <div className="status-popover">
                  {Object.entries(STATUS_LABELS)
                    .filter(([value]) => canManage || value !== 'INVOICED')
                    .map(([value, label]) => (
                    <button
                      key={value}
                      className={`status-popover-item ${card.status === value ? 'active' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (card.status !== value) {
                          handleQuickStatusChange(card.id, value);
                        } else {
                          setStatusPopoverId(null);
                        }
                      }}
                    >
                      <span className={`badge ${getStatusBadgeClass(value)}`}>{label}</span>
                      {card.status === value && <span className="status-check"><Check size={14} /></span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <span className={`badge ${getStatusBadgeClass(card.status)}`}>
              {STATUS_LABELS[card.status] || card.status}
            </span>
          )}
        </td>
      )
    },
    {
      id: 'priority',
      label: 'Priority',
      renderCell: (card) => (
        <td key="priority">
          <span style={{ color: PRIORITY_COLORS[card.priority] || PRIORITY_COLORS.NONE, fontWeight: 500 }}>
            {PRIORITY_LABELS[card.priority] || 'None'}
          </span>
        </td>
      )
    },
    {
      id: 'attachments',
      label: 'Attachments',
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
              <span className="attachment-ok" aria-label="All files attached">
                <Check size={13} />
              </span>
            </td>
          );
        }
        const blocking = severity === 'blocking';
        const gaps = describeAttachmentGaps(warning);
        const title = blocking ? 'Missing — blocking' : 'Not attached yet';
        return (
          <td key="attachments" className="attachment-cell">
            <span
              className={`missing-files-indicator${blocking ? ' missing-files-blocking' : ''}`}
              tabIndex={0}
              aria-label={`${title}: ${gaps.join(', ')}`}
            >
              ⚠
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
      id: 'dueDate',
      label: 'Due Date',
      align: 'right',
      renderCell: (card, isOverdue) => (
        <td key="dueDate" className={`jc-align-right${isOverdue ? ' overdue-date' : ''}`}>
          {card.dueDate ? new Date(card.dueDate).toLocaleDateString('en-AU') : '-'}
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
          {card.createdAt ? new Date(card.createdAt).toLocaleString('en-AU') : '-'}
        </td>
      )
    },
    {
      id: 'updatedAt',
      label: 'Last Edited',
      align: 'right',
      renderCell: (card) => (
        <td key="updatedAt" className="jc-align-right">
          {card.updatedAt ? new Date(card.updatedAt).toLocaleString('en-AU') : '-'}
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
            <button
              className="btn btn-outline-danger btn-sm"
              onClick={() => handleDelete(card.id)}
            >
              <Trash2 size={14} /> Delete
            </button>
          </div>
        </td>
      )
    }
  ];
}
