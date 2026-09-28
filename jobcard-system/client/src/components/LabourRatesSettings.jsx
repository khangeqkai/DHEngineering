import PageHeader from './common/PageHeader';
import EmptyState from './common/EmptyState';
import { useLabourRates } from '../hooks/useLabourRates';
import ScheduleEditor from './settings/labour/ScheduleEditor';
import DefaultRateCard from './settings/labour/DefaultRateCard';
import MultiplierInputs from './settings/labour/MultiplierInputs';
import PublicHolidaysCard from './settings/labour/PublicHolidaysCard';
import TimezoneCard from './settings/labour/TimezoneCard';
import './settings/labour/LabourRates.css';

export default function LabourRatesSettings() {
  const lr = useLabourRates();

  if (lr.loading) {
    return (
      <div className="page-container page-enter">
        <PageHeader title="Labour Rates & Overtime" />
        <div className="loading">Loading...</div>
      </div>
    );
  }

  // A failed load leaves nothing real to show — offer another try rather than cards
  // holding made-up starting figures that Save would write over the stored ones.
  if (lr.loadFailed) {
    return (
      <div className="page-container page-enter">
        <PageHeader title="Labour Rates & Overtime" />
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
      <PageHeader title="Labour Rates & Overtime" />
      <div className="settings-grid">
        <TimezoneCard
          timezone={lr.timezone} setTimezone={lr.setTimezone}
          onSave={lr.handleSaveTimezone} saving={lr.savingTimezone}
          error={lr.errorFor('timezone')}
        />
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
        />
        <ScheduleEditor
          schedule={lr.schedule}
          paintHour={lr.paintHour}
          copyDayToAll={lr.copyDayToAll}
          onSave={lr.handleSaveSchedule}
          saving={lr.savingSchedule}
        />
        <PublicHolidaysCard
          holidays={lr.holidays}
          addHoliday={lr.addHoliday}
          removeHoliday={lr.removeHoliday}
          onSave={lr.handleSaveHolidays}
          saving={lr.savingHolidays}
        />
      </div>
    </div>
  );
}
