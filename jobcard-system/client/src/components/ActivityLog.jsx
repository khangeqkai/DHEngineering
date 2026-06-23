import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '../services/api';
import PageHeader from './common/PageHeader';
import DataTable from './common/DataTable';
import ExportButton from './common/ExportButton';
import { exportActivityLog } from '../utils/excelExport';
import { formatHistoryValue } from '../utils/formatters';

export default function ActivityLog() {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(50);

  useEffect(() => {
    loadActivities();
  }, [limit]);

  const loadActivities = async () => {
    try {
      const data = await api.getActivityHistory(limit);
      setActivities(data);
    } catch (err) {
      toast.error(err.message || 'Failed to load activities');
    } finally {
      setLoading(false);
    }
  };

  const formatAction = (action) => {
    const colors = {
      create: 'var(--accent-ready)',
      update: 'var(--primary-accent)',
      delete: 'var(--accent-caution)',
      login: 'var(--accent-info)',
      archive: 'var(--accent-safety)',
      unarchive: 'var(--accent-ready)',
      'add_photo': 'var(--accent-ready)',
      'remove_photo': 'var(--accent-caution)',
      'add_note': 'var(--accent-ready)',
      'delete_note': 'var(--accent-caution)',
      'start_timer': 'var(--accent-ready)',
      'stop_timer': 'var(--primary-accent)',
      'discard_timer': 'var(--accent-caution)',
      'add_time_entry': 'var(--accent-ready)',
      'update_time_entry': 'var(--primary-accent)',
      'delete_time_entry': 'var(--accent-caution)'
    };
    return (
      <span style={{
        color: colors[action] || 'var(--text-secondary)',
        fontWeight: 500,
        textTransform: 'capitalize'
      }}>
        {action.replace('_', ' ')}
      </span>
    );
  };

  const formatChanges = (changes) => {
    if (!changes) return null;
    return Object.entries(changes).map(([field, change]) => (
      <div key={field} style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
        <strong>{field.replace('_', ' ')}:</strong>{' '}
        {change.changed ? (
          <span style={{ color: 'var(--primary-accent)', fontStyle: 'italic' }}>modified</span>
        ) : (
          <>
            <span style={{ textDecoration: 'line-through', color: 'var(--accent-caution)' }}>
              {formatHistoryValue(field, change.from) || '(empty)'}
            </span>
            {' → '}
            <span style={{ color: 'var(--accent-ready)' }}>{formatHistoryValue(field, change.to) || '(empty)'}</span>
          </>
        )}
      </div>
    ));
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleString();
  };


  return (
    <div className="activity-log page-activity page-enter">
      <PageHeader title="Activity Log">
        <select
          value={limit}
          onChange={(e) => setLimit(Number(e.target.value))}
          className="limit-select"
        >
          <option value={25}>Last 25</option>
          <option value={50}>Last 50</option>
          <option value={100}>Last 100</option>
          <option value={200}>Last 200</option>
        </select>
        <ExportButton
          onExportView={() => activities.length ? exportActivityLog(activities) : false}
          onExportAll={async () => {
            const all = await api.getActivityHistory(999999);
            return all.length ? exportActivityLog(all) : false;
          }}
        />
      </PageHeader>

      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          <DataTable
            columns={[
              {
                key: 'createdAt',
                label: 'Time',
                sortable: true,
                render: (val) => (
                  <span style={{ whiteSpace: 'nowrap' }}>{formatDate(val)}</span>
                )
              },
              {
                key: 'userName',
                label: 'User',
                sortable: true,
                render: (val) => val || 'System'
              },
              {
                key: 'action',
                label: 'Action',
                sortable: true,
                render: (val) => formatAction(val)
              },
              {
                key: 'entityType',
                label: 'Type',
                sortable: true,
                render: (val) => (
                  <span style={{ textTransform: 'capitalize' }}>{val}</span>
                )
              },
              {
                key: 'entityId',
                label: 'Details',
                render: (val, row) => (
                  <>
                    <div style={{ fontSize: '0.875rem' }}>
                      <code style={{
                        fontSize: '0.7rem',
                        background: 'var(--background)',
                        padding: '0.125rem 0.375rem',
                        borderRadius: '0.25rem'
                      }}>
                        {val}
                      </code>
                    </div>
                    {formatChanges(row.changes)}
                  </>
                )
              }
            ]}
            data={activities}
            loading={loading}
            searchable
            searchKeys={['userName', 'action', 'entityType', 'entityId']}
            searchPlaceholder="Search activity..."
            emptyState={{
              icon: 'activity',
              title: 'No activity yet',
              description: 'Activity will appear here as changes are made.',
            }}
          />
        </div>
      </div>

      <style>{`
        .limit-select {
          padding: 0.5rem 0.75rem;
          border-radius: 0.375rem;
          border: 1px solid var(--border-color);
          background: var(--surface);
          color: var(--text-primary);
          font-size: 0.875rem;
        }
      `}</style>
    </div>
  );
}
