import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { api } from '../services/api';
import { toTitleCase, capitalizeFirst, autoResize } from '../utils/formatters';
import { Plus, Trash2, Save, History } from 'lucide-react';
import PageHeader from './common/PageHeader';
import ExportButton from './common/ExportButton';
import { exportEquipment } from '../utils/excelExport';
import DataTable from './common/DataTable';
import BottomSheet from './common/BottomSheet';
import ConfirmDialog from './common/ConfirmDialog';
import EntityActivityLog from './common/EntityActivityLog';
import { useConfirmDialog } from '../hooks/useConfirmDialog';

export default function EquipmentManagement() {
  const [machines, setMachines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingMachine, setEditingMachine] = useState(null);
  const [formData, setFormData] = useState({
    machineNumber: '',
    name: '',
    description: ''
  });
  const [saving, setSaving] = useState(false);
  const [activityRefreshKey, setActivityRefreshKey] = useState(0);
  const [showActivityLog, setShowActivityLog] = useState(false);
  const { dialogState, showConfirm, handleCancel, handleConfirm } = useConfirmDialog();

  useEffect(() => {
    loadMachines();
  }, []);

  const loadMachines = async () => {
    setLoading(true);
    try {
      const data = await api.getMachines();
      setMachines(data.filter(m => m.active));
    } catch (err) {
      console.error('Failed to load machines:', err);
      toast.error('Failed to load machines');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);

    try {
      if (editingMachine) {
        await api.updateMachine(editingMachine.id, formData);
      } else {
        await api.createMachine(formData);
      }
      await loadMachines();
      setActivityRefreshKey(k => k + 1);
      resetForm();
    } catch (err) {
      console.error('Failed to save machine:', err);
      toast.error(err.message || 'Failed to save machine');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (machine) => {
    setEditingMachine(machine);
    setFormData({
      machineNumber: machine.machineNumber || '',
      name: machine.name || '',
      description: machine.description || ''
    });
    setShowForm(true);
  };

  const handleDelete = async (machine) => {
    const displayName = machine.name
      ? `${machine.machineNumber} (${machine.name})`
      : machine.machineNumber;
    const confirmed = await showConfirm({
      title: 'Delete Machine',
      message: `Are you sure you want to delete "${displayName}"? This will deactivate the machine.`,
      confirmLabel: 'Delete',
      confirmVariant: 'danger'
    });
    if (!confirmed) return;

    try {
      await api.deleteMachine(machine.id);
      await loadMachines();
      setActivityRefreshKey(k => k + 1);
    } catch (err) {
      console.error('Failed to delete machine:', err);
      toast.error(err.message || 'Failed to delete machine');
    }
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingMachine(null);
    setFormData({
      machineNumber: '',
      name: '',
      description: ''
    });
  };

  if (loading) {
    return <div className="loading">Loading machines...</div>;
  }

  return (
    <div className="equipment-management page-scroll-layout">
      <PageHeader title="Equipment">
        <ExportButton
          onExportView={() => machines.length ? exportEquipment(machines) : false}
        />
        <button className="btn btn-secondary" onClick={() => setShowActivityLog(true)}>
          <History size={16} /> Activity Log
        </button>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>
          <Plus size={16} /> Add Machine
        </button>
      </PageHeader>

      <BottomSheet
        isOpen={showForm}
        onClose={resetForm}
        title={editingMachine ? 'Edit Machine' : 'Add New Machine'}
        size="small"
        closeOnOverlayClick={false}
      >
        <BottomSheet.Body>
          <form id="equipment-form" onSubmit={handleSubmit}>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="machineNumber">Machine Number *</label>
                <input
                  type="text"
                  id="machineNumber"
                  value={formData.machineNumber}
                  onChange={(e) => setFormData({ ...formData, machineNumber: e.target.value })}
                  onBlur={(e) => {
                    const formatted = e.target.value.toUpperCase().trim();
                    if (formatted !== e.target.value) {
                      setFormData(prev => ({ ...prev, machineNumber: formatted }));
                    }
                  }}
                  placeholder="e.g. M1, LATHE-01..."
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="name">Name</label>
                <input
                  type="text"
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  onBlur={(e) => {
                    const formatted = toTitleCase(e.target.value);
                    if (formatted !== e.target.value) {
                      setFormData(prev => ({ ...prev, name: formatted }));
                    }
                  }}
                  placeholder="Machine name..."
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="description">Description</label>
              <textarea
                ref={(el) => { if (el) autoResize(el); }}
                onInput={(e) => autoResize(e.target)}
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                onBlur={(e) => {
                  const formatted = capitalizeFirst(e.target.value);
                  if (formatted !== e.target.value) {
                    setFormData(prev => ({ ...prev, description: formatted }));
                  }
                }}
                rows={2}
              />
            </div>
          </form>
        </BottomSheet.Body>
        <BottomSheet.Footer>
          <button
            type="submit"
            form="equipment-form"
            className="btn btn-primary"
            disabled={saving}
          >
            <Save size={14} /> {saving ? 'Saving...' : editingMachine ? 'Update Machine' : 'Create Machine'}
          </button>
        </BottomSheet.Footer>
      </BottomSheet>

      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          <DataTable
            columns={[
              {
                key: 'machineNumber',
                label: 'Machine Number',
                sortable: true,
                render: (val, row) => (
                  <a href="#" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleEdit(row); }}>
                    <strong>{val}</strong>
                  </a>
                )
              },
              { key: 'name', label: 'Name', sortable: true },
              { key: 'description', label: 'Description' },
              {
                key: 'actions',
                label: 'Actions',
                render: (_, row) => (
                  <div className="action-buttons">
                    <button className="btn btn-danger btn-sm" onClick={(e) => { e.stopPropagation(); handleDelete(row); }}>
                      <Trash2 size={14} /> Delete
                    </button>
                  </div>
                )
              }
            ]}
            data={machines}
            searchable
            searchKeys={['machineNumber', 'name', 'description']}
            searchPlaceholder="Search machines..."
            emptyMessage="No machines found"
            defaultSortKey="machineNumber"
          />
        </div>
      </div>

      <EntityActivityLog
        entityType="machine"
        isOpen={showActivityLog}
        onClose={() => setShowActivityLog(false)}
        refreshKey={activityRefreshKey}
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
