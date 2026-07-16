import PageHeader from './common/PageHeader';
import { useLabourRates } from '../hooks/useLabourRates';
import ScheduleEditor from './settings/labour/ScheduleEditor';
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

  return (
    <div className="page-container page-enter">
      <PageHeader title="Labour Rates & Overtime" />
      <div className="settings-grid">
        <TimezoneCard
          timezone={lr.timezone} setTimezone={lr.setTimezone}
          onSave={lr.handleSaveTimezone} saving={lr.savingTimezone}
        />
        <MultiplierInputs
          ot1Mult={lr.ot1Mult} setOt1Mult={lr.setOt1Mult}
          ot2Mult={lr.ot2Mult} setOt2Mult={lr.setOt2Mult}
          holidayMult={lr.holidayMult} setHolidayMult={lr.setHolidayMult}
          onSave={lr.handleSaveMultipliers} saving={lr.savingMultipliers}
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
