import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Plus } from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import PageHeader from './common/PageHeader';
import ExportButton from './common/ExportButton';
import { exportJobCardList, exportJobCardsFull } from '../utils/excelExport';
import JobCardModal from './jobcard/JobCardModal';
import ConfirmDialog from './common/ConfirmDialog';
import { useConfirmDialog } from '../hooks/useConfirmDialog';
import { useActiveTimerIndicator } from '../hooks/useActiveTimerIndicator';
import { useMissingFilesIndicator } from '../hooks/useMissingFilesIndicator';
import { describeAttachmentGaps, describeWorkWarning } from '../utils/attachmentWarnings';
import useJobCardSort from '../hooks/useJobCardSort';
import useJobCardColumnOrder from '../hooks/useJobCardColumnOrder';
import EmptyState from './common/EmptyState';
import JobCardCalendarView from './JobCardCalendarView';
import JobCardListFilters from './JobCardListFilters';
import JobCardListTable from './JobCardListTable';
import JobCardListPagination from './JobCardListPagination';
import { getJobCardColumns } from './JobCardListColumns';
import {
  STATUS_OPTIONS,
  STATUS_LABELS,
  PAGE_SIZE,
  getStatusBadgeClass
} from './JobCardList.constants';
import './JobCardList.css';

export default function JobCardList() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [searchParams, setSearchParams] = useSearchParams();

  const [filter, setFilter] = useState(() => {
    const paramFilter = searchParams.get('filter');
    const valid = STATUS_OPTIONS.some(o => o.value === paramFilter);
    return valid ? paramFilter : 'all';
  });
  const [search, setSearch] = useState('');
  const [myJobsOnly, setMyJobsOnly] = useState(() => searchParams.get('mine') === '1');
  const [assigneeFilter, setAssigneeFilter] = useState(() => searchParams.get('assignee') || 'all');
  const [employees, setEmployees] = useState([]);
  const [showArchived, setShowArchived] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCardId, setEditingCardId] = useState(null);
  const [jobcards, setJobcards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [statusPopoverId, setStatusPopoverId] = useState(null);
  const popoverRef = useRef(null);
  const [assignPopoverId, setAssignPopoverId] = useState(null);
  const assignPopoverRef = useRef(null);
  const [hoverNames, setHoverNames] = useState(null);
  const { dialogState, showConfirm, handleCancel, handleConfirm } = useConfirmDialog();
  const [viewMode, setViewMode] = useState('list');
  const { activeTimerJobcardId, formattedElapsed, refresh: refreshTimer } = useActiveTimerIndicator();
  const { warningsById: missingFilesIds, checkedIds: attachmentCheckedIds, ensure: ensureMissingFiles, refresh: refreshMissingFiles } = useMissingFilesIndicator();

  const { columnOrder, handleDragStart, handleDragEnd, handleDragOver, handleDrop } = useJobCardColumnOrder();

  const hasLoadedOnceRef = useRef(false);
  const loadJobcards = useCallback(async () => {
    try {
      if (!hasLoadedOnceRef.current) setLoading(true);
      const filters = {};
      if (showArchived) filters.archived = true;
      if (isAdmin && assigneeFilter !== 'all' && !showArchived) {
        filters.assigneeId = assigneeFilter;
      }
      const data = await api.getJobcards(filters);
      setJobcards(data);
    } catch (err) {
      toast.error(err.message || 'Failed to load job cards');
    } finally {
      hasLoadedOnceRef.current = true;
      setLoading(false);
    }
  }, [showArchived, assigneeFilter, isAdmin]);

  useEffect(() => {
    loadJobcards();
  }, [loadJobcards]);

  useEffect(() => {
    if (!isAdmin) return;
    api.getEmployees().then(setEmployees).catch(() => {});
  }, [isAdmin]);

  const handleDelete = async (id) => {
    try {
      // The first request never deletes — the server bounces back a single
      // confirmation request (409). When the job has recorded work it also sends
      // who/what so we can spell out what's being erased; otherwise it's a plain
      // "are you sure". One box either way, then resend with the confirm flag.
      await api.deleteJobcard(id);
      await loadJobcards();
    } catch (err) {
      if (err.status === 409 && err.data?.error === 'CONFIRM_DELETE') {
        const lines = describeWorkWarning(err.data.workWarning);
        const proceed = await showConfirm({
          title: lines.length ? 'Job has recorded work' : 'Delete Job Card',
          message: lines.length ? (
            <span>
              {lines.map((l, i) => <span key={i}>{l}<br /></span>)}
              <br />
              Deleting erases all of it permanently, and the job number is never reused. Delete anyway?
            </span>
          ) : 'Are you sure you want to delete this job card? The job number is never reused.',
          confirmLabel: lines.length ? 'Delete anyway' : 'Delete',
          cancelLabel: 'Go back',
          confirmVariant: 'danger'
        });
        if (!proceed) return;
        try {
          await api.deleteJobcard(id, true);
          await loadJobcards();
        } catch (e2) {
          toast.error(e2.message || 'Failed to delete job card');
        }
        return;
      }
      toast.error(err.message || 'Failed to delete job card');
    }
  };

  const handleUnarchive = async (id) => {
    const confirmed = await showConfirm({
      title: 'Unarchive Job Card',
      message: 'Are you sure you want to unarchive this job card? It will be restored to the active list.',
      confirmLabel: 'Unarchive',
      confirmVariant: 'warning'
    });
    if (!confirmed) return;

    try {
      await api.unarchiveJobcard(id);
      toast.success('Job card unarchived');
      await loadJobcards();
    } catch (err) {
      toast.error(err.message || 'Failed to unarchive job card');
    }
  };

  const handleQuickStatusChange = useCallback(async (cardId, newStatus) => {
    setStatusPopoverId(null);
    const applyLocally = () => {
      toast.success(`Status updated to ${STATUS_LABELS[newStatus]}`);
      setJobcards(prev => prev.map(c => c.id === cardId ? { ...c, status: newStatus } : c));
      refreshMissingFiles([cardId]);
    };
    try {
      await api.updateJobcardStatus(cardId, newStatus);
      applyLocally();
    } catch (err) {
      // Invoicing with declared-but-missing files: confirm, then resend.
      if (err.status === 409 && err.data?.attachmentWarnings) {
        const gaps = describeAttachmentGaps(err.data.attachmentWarnings);
        const proceed = await showConfirm({
          title: 'Files not attached',
          message: (
            <span>
              This job was marked as having the following, but no file is attached yet:
              <br />
              {gaps.map((g, i) => <span key={i}>• {g}<br /></span>)}
              <br />
              Invoice anyway?
            </span>
          ),
          confirmLabel: 'Invoice anyway',
          cancelLabel: 'Go back',
          confirmVariant: 'warning'
        });
        if (!proceed) return;
        try {
          await api.updateJobcardStatus(cardId, newStatus, true);
          applyLocally();
        } catch (e2) {
          toast.error(e2.message || 'Failed to update status');
        }
        return;
      }
      toast.error(err.message || 'Failed to update status');
    }
  }, [showConfirm, refreshMissingFiles]);

  useEffect(() => {
    if (!statusPopoverId) return;
    const handleClickOutside = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        setStatusPopoverId(null);
      }
    };
    const handleEscape = (e) => {
      if (e.key === 'Escape') setStatusPopoverId(null);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [statusPopoverId]);

  useEffect(() => {
    if (!assignPopoverId) return;
    const handleClickOutside = (e) => {
      if (assignPopoverRef.current && !assignPopoverRef.current.contains(e.target)) {
        setAssignPopoverId(null);
      }
    };
    const handleEscape = (e) => {
      if (e.key === 'Escape') setAssignPopoverId(null);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [assignPopoverId]);

  const handleSelfToggle = useCallback(async (card, isAssigned) => {
    if (!user?.id) return;
    setAssignPopoverId(null);
    try {
      const result = isAssigned
        ? await api.selfUnassign(card.id)
        : await api.selfAssign(card.id);
      toast.success(isAssigned ? 'Removed yourself from job card' : 'Assigned yourself to job card');
      setJobcards(prev => prev.map(c => c.id === card.id
        ? { ...c, assignees: result.assignees }
        : c
      ));
    } catch (err) {
      toast.error(err.message || 'Failed to update assignment');
    }
  }, [user]);

  const filteredCards = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return jobcards.filter((card) => {
      let matchesFilter;
      if (filter === 'all') {
        matchesFilter = true;
      } else if (filter === 'OVERDUE') {
        matchesFilter = card.dueDate && card.dueDate < today &&
          !['DONE', 'INVOICED'].includes(card.status);
      } else {
        matchesFilter = card.status === filter;
      }
      const matchesMine = !myJobsOnly || showArchived || card.assignees?.some(a => a.userId === user?.id);
      const lowerSearch = search.toLowerCase();
      const matchesSearch =
        !search ||
        card.jobNumber?.toLowerCase().includes(lowerSearch) ||
        (isAdmin && card.contactName?.toLowerCase().includes(lowerSearch)) ||
        (isAdmin && card.companyName?.toLowerCase().includes(lowerSearch)) ||
        (isAdmin && card.assignees?.some(a => a.userName?.toLowerCase().includes(lowerSearch))) ||
        card.description?.toLowerCase().includes(lowerSearch);
      return matchesFilter && matchesMine && matchesSearch;
    });
  }, [jobcards, filter, myJobsOnly, showArchived, search, isAdmin, user?.id]);

  const { sortBy, sortDir, handleSort, sortedCards } = useJobCardSort(filteredCards);

  const displayedCards = useMemo(() => {
    if (!activeTimerJobcardId) return sortedCards;
    const idx = sortedCards.findIndex(c => c.id === activeTimerJobcardId);
    if (idx <= 0) return sortedCards;
    const pinned = sortedCards[idx];
    return [pinned, ...sortedCards.slice(0, idx), ...sortedCards.slice(idx + 1)];
  }, [sortedCards, activeTimerJobcardId]);

  useEffect(() => {
    setCurrentPage(1);
    const params = new URLSearchParams(window.location.search);
    if (filter === 'all') {
      params.delete('filter');
    } else {
      params.set('filter', filter);
    }
    if (assigneeFilter === 'all') {
      params.delete('assignee');
    } else {
      params.set('assignee', assigneeFilter);
    }
    if (myJobsOnly) {
      params.set('mine', '1');
    } else {
      params.delete('mine');
    }
    setSearchParams(params, { replace: true });
  }, [filter, search, showArchived, assigneeFilter, myJobsOnly, sortBy, sortDir, setSearchParams]);

  const totalPages = Math.max(1, Math.ceil(displayedCards.length / PAGE_SIZE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedCards = displayedCards.slice(
    (safeCurrentPage - 1) * PAGE_SIZE,
    safeCurrentPage * PAGE_SIZE
  );

  // Check missing-file status only for the rows currently on screen. Re-runs
  // whenever the visible set changes (page turn, filter, search, or sort);
  // already-checked rows are skipped inside the hook.
  const visibleIds = paginatedCards.map(c => c.id);
  const visibleIdsKey = visibleIds.join(',');
  useEffect(() => {
    if (visibleIds.length) ensureMissingFiles(visibleIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleIdsKey, ensureMissingFiles]);

  const openCreateModal = () => {
    setEditingCardId(null);
    setIsModalOpen(true);
  };

  const openEditModal = (cardId) => {
    setEditingCardId(cardId);
    setIsModalOpen(true);
  };

  const handleModalSuccess = () => {
    loadJobcards();
    // Re-check the rows on screen plus the job that was just edited, so its
    // marker reflects any files attached or items changed in the modal.
    refreshMissingFiles([editingCardId, ...visibleIds].filter(Boolean));
  };

  const columns = getJobCardColumns({
    user,
    isAdmin,
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
    openEditModal,
    handleQuickStatusChange,
    handleSelfToggle,
    handleDelete,
    handleUnarchive
  });

  const visibleColumns = columnOrder
    .map(id => columns.find(c => c.id === id))
    .filter(Boolean)
    .filter(col => !col.adminOnly || isAdmin);

  if (loading) {
    return <div className="loading">Loading job cards...</div>;
  }

  return (
    <div className="jobcard-list page-scroll-layout page-enter">
      <PageHeader title={showArchived ? 'Archived Job Cards' : 'Job Cards'}>
        <label className="archive-toggle">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          Show Archived
        </label>
        {isAdmin && (
          <ExportButton
            onExportView={() => displayedCards.length ? exportJobCardList(displayedCards) : false}
            onExportAll={() => exportJobCardsFull()}
          />
        )}
        {!showArchived && isAdmin && (
          <button className="btn btn-primary" onClick={openCreateModal}>
            <Plus size={16} /> New Job Card
          </button>
        )}
      </PageHeader>

      <JobCardListFilters
        isAdmin={isAdmin}
        showArchived={showArchived}
        search={search}
        onSearchChange={setSearch}
        assigneeFilter={assigneeFilter}
        onAssigneeFilterChange={setAssigneeFilter}
        employees={employees}
        myJobsOnly={myJobsOnly}
        onMyJobsOnlyChange={setMyJobsOnly}
        filter={filter}
        onFilterChange={setFilter}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      />

      {viewMode === 'calendar' ? (
        <div className="calendar-container" style={{ flex: 1, minHeight: '600px', marginBottom: '1rem' }}>
          <JobCardCalendarView
            jobcards={filteredCards}
            onCardClick={(card) => openEditModal(card.id)}
            getStatusBadgeClass={getStatusBadgeClass}
            STATUS_LABELS={STATUS_LABELS}
          />
        </div>
      ) : (
        <div className="card">
          <div className="card-body" style={{ padding: 0 }}>
            {filteredCards.length === 0 ? (
              jobcards.length === 0 ? (
                <EmptyState
                  icon="jobcards"
                  title="No job cards yet"
                  description="Create your first job card to get started."
                  actionLabel={isAdmin ? 'New Job Card' : undefined}
                  onAction={isAdmin ? openCreateModal : undefined}
                />
              ) : (
                <EmptyState
                  icon="jobcards"
                  title="No results"
                  description="Try adjusting your search or filters."
                />
              )
            ) : (
              <JobCardListTable
                visibleColumns={visibleColumns}
                paginatedCards={paginatedCards}
                sortBy={sortBy}
                sortDir={sortDir}
                onSort={handleSort}
                activeTimerJobcardId={activeTimerJobcardId}
                handleDragStart={handleDragStart}
                handleDragEnd={handleDragEnd}
                handleDragOver={handleDragOver}
                handleDrop={handleDrop}
              />
            )}
          </div>

          <JobCardListPagination
            currentPage={safeCurrentPage}
            totalPages={totalPages}
            totalItems={displayedCards.length}
            onPageChange={setCurrentPage}
          />
        </div>
      )}

      {hoverNames && createPortal(
        <div
          className="assignee-tooltip"
          style={{ top: hoverNames.top, left: hoverNames.left }}
        >
          <span className="mf-tooltip-title">Assigned to</span>
          {hoverNames.names.map((n, i) => (
            <span key={i} className="mf-tooltip-item">
              <span className="mf-tooltip-dot" style={{ background: n.color }} />
              {n.name}
            </span>
          ))}
        </div>,
        document.body
      )}

      <JobCardModal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); refreshMissingFiles([editingCardId, ...visibleIds].filter(Boolean)); }}
        jobCardId={editingCardId}
        onSuccess={handleModalSuccess}
        onTimerChange={() => { refreshTimer(); loadJobcards(); }}
      />

      <ConfirmDialog
        isOpen={dialogState.isOpen}
        title={dialogState.title}
        message={dialogState.message}
        confirmLabel={dialogState.confirmLabel}
        cancelLabel={dialogState.cancelLabel}
        confirmVariant={dialogState.confirmVariant}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </div>
  );
}
