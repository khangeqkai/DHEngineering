import PageHeader from './common/PageHeader';
import EmptyState from './common/EmptyState';
import ConfirmDialog from './common/ConfirmDialog';
import { useConfirmDialog } from '../hooks/useConfirmDialog';
import { useLabourRates, useLeaveGuard } from '../hooks/useLabourRates';
import ScheduleEditor from './settings/labour/ScheduleEditor';
import DefaultRateCard from './settings/labour/DefaultRateCard';
import MultiplierInputs from './settings/labour/MultiplierInputs';
import PublicHolidaysCard from './settings/labour/PublicHolidaysCard';
import TimezoneCard from './settings/labour/TimezoneCard';
import './settings/labour/LabourRates.css';

export default function LabourRatesSettings() {
  const { dialogState, showConfirm, handleConfirm, handleCancel } = useConfirmDialog();
  const lr = useLabourRates({ showConfirm });
  // Painted hours and added holidays wait on their Save button; leaving the page (or the
  // window) with either would lose them, so it is asked about first.
  useLeaveGuard(lr.scheduleDirty || lr.holidaysDirty, showConfirm, {
    title: 'Leave without saving the schedule?',
    message: 'Your repainted hours will be lost.',
    stayLabel: 'Stay',
    leaveLabel: 'Leave without saving'
  });

  if (lr.loading) {
    return (
      <div className="page-container page-enter">
        <PageHeader title="Labour Rates" />
        <div className="loading">Loading…</div>
      </div>
    );
  }

  // A failed load leaves nothing real to show — offer another try rather than cards
  // holding made-up starting figures that Save would write over the stored ones.
  if (lr.loadFailed) {
    return (
      <div className="page-container page-enter">
        <PageHeader title="Labour Rates" />
        <EmptyState
          icon="cpu"
          title="Couldn't load the labour rate settings"
          description="Nothing here can be changed until they load."
          actionLabel="Try again"
          onAction={lr.load}
        />
      </div>
    );
  }

  return (
    <div className="page-container page-enter">
      <PageHeader title="Labour Rates" />
      <div className="settings-grid">
        <DefaultRateCard
          defaultRate={lr.defaultRate} setDefaultRate={lr.setDefaultRate}
          onSave={lr.handleSaveDefaultRate} saving={lr.savingDefaultRate}
          error={lr.errorFor('defaultRate')}
        />
        <MultiplierInputs
          ot1Mult={lr.ot1Mult} setOt1Mult={lr.setOt1Mult}
          ot2Mult={lr.ot2Mult} setOt2Mult={lr.setOt2Mult}
          holidayMult={lr.holidayMult} setHolidayMult={lr.setHolidayMult}
          onSave={lr.handleSaveMultipliers} saving={lr.savingMultipliers}
          ot1Error={lr.errorFor('ot1Mult')}
          ot2Error={lr.errorFor('ot2Mult')}
          holidayError={lr.errorFor('holidayMult')}
          defaultRate={lr.defaultRate}
        />
        <ScheduleEditor
          schedule={lr.schedule}
          paintHour={lr.paintHour}
          copyDayToAll={lr.copyDayToAll}
          onSave={lr.handleSaveSchedule}
          saving={lr.savingSchedule}
          dirty={lr.scheduleDirty}
        />
        <PublicHolidaysCard
          holidays={lr.holidays}
          addHoliday={lr.addHoliday}
          removeHoliday={lr.removeHoliday}
          onSave={lr.handleSaveHolidays}
          saving={lr.savingHolidays}
          dirty={lr.holidaysDirty}
        />
        <TimezoneCard
          timezone={lr.timezone} setTimezone={lr.setTimezone}
          onSave={lr.handleSaveTimezone} saving={lr.savingTimezone}
          error={lr.errorFor('timezone')}
        />
      </div>
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
