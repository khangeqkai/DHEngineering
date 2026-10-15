import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Search } from 'lucide-react';
import { api } from '../services/api';
import { useLatestRequest } from '../hooks/useLatestRequest';
import PageHeader from './common/PageHeader';
import ExportButton from './common/ExportButton';
import { exportActivityLog } from '../utils/excelExport';
import { formatTime, toIsoDate } from '../utils/formatters';
import { dayHeading } from '../utils/historySentences';
import { describeActivity, activityText, RECORD_TYPES } from '../utils/activitySentences';

// The Excel sheet carries the same plain sentence the screen shows ("What happened").
const withSentences = (rows) => rows.map((e) => ({ ...e, sentence: activityText(e) }));
import './ActivityLog.css';

const PAGE_SIZE = 50;
const EXPORT_PAGE_SIZE = 200;

// The date-range dropdown: how many calendar days back (counting today) each choice reaches.
const RANGES = [
  { key: 'today', label: 'Today', days: 1 },
  { key: '7', label: 'Last 7 days', days: 7 },
  { key: '30', label: 'Last 30 days', days: 30 },
  { key: '90', label: 'Last 90 days', days: 90 },
  { key: 'all', label: 'All time', days: 0 }
];

// The from / to calendar days of a range choice, as the server takes them.
function rangeDays(key) {
  const range = RANGES.find((r) => r.key === key);
  if (!range || !range.days) return {};
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (range.days - 1));
  return { from: toIsoDate(first), to: toIsoDate(now) };
}

// One sentence: names in bold, the old value in small grey.
function Sentence({ line }) {
  return (
    <>
      {line.parts.map((part, i) => (
        part.strong
          ? <strong key={i} className="activity-strong">{part.text}</strong>
          : <span key={i}>{part.text}</span>
      ))}
      {line.was && <span className="activity-was"> was {line.was}</span>}
    </>
  );
}

function ActivityEntry({ item }) {
  const [expanded, setExpanded] = useState(false);
  const { described, time } = item;
  const { kind, ring, headline, details, jobNumber } = described;
  const lone = details.length === 1;

  return (
    <li className="activity-entry">
      <span className={`activity-dot activity-dot-${kind}${ring ? ' activity-dot-ring' : ''}`} aria-hidden="true" />
      <div className="activity-entry-body">
        <div className="activity-entry-line">
          <p className="activity-sentence">
            <Sentence line={headline} />
            {jobNumber && <span className="activity-job"> · job {jobNumber}</span>}
          </p>
          <span className="activity-time">{time}</span>
        </div>
        {details.length > 1 && (
          <button
            type="button"
            className="activity-toggle"
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? 'Hide' : `Show ${details.length} more`}
          </button>
        )}
        {(lone || (expanded && details.length > 1)) && (
          <ul className="activity-details">
            {details.map((line, i) => (
              <li key={i} className="activity-detail"><Sentence line={line} /></li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}

export default function ActivityLog() {
  const [entries, setEntries] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [page, setPage] = useState(1);
  // The search box holds what is typed; `query` is what the list is filtered by. It is
  // applied when the person presses Enter or leaves the box, never while they type.
  const [typed, setTyped] = useState('');
  const [query, setQuery] = useState('');
  const [userId, setUserId] = useState('');
  const [entityType, setEntityType] = useState('');
  const [range, setRange] = useState('30');
  const [people, setPeople] = useState([]);
  const startRequest = useLatestRequest();

  useEffect(() => {
    api.getEmployees()
      .then((list) => setPeople(list))
      .catch(() => { /* the person dropdown simply stays at "Anyone" */ });
  }, []);

  const filters = useMemo(() => ({ q: query, userId, entityType, ...rangeDays(range) }), [query, userId, entityType, range]);

  useEffect(() => {
    const isLatest = startRequest();
    (async () => {
      try {
        const data = await api.getActivityHistory(page, PAGE_SIZE, filters);
        if (!isLatest()) return;
        setEntries(data.items);
        setTotal(data.total);
        setFailed(false);
      } catch (err) {
        if (!isLatest()) return;
        setFailed(true);
        toast.error(err.message || 'Couldn\'t load the activity log. Try again in a moment.', { id: 'activity-load-failed' });
      } finally {
        if (isLatest()) setLoading(false);
      }
    })();
  }, [page, filters, startRequest]);

  // A new filter starts again from the first page.
  const choose = (setter) => (value) => { setter(value); setPage(1); };
  const applyQuery = () => {
    const next = typed.trim();
    if (next !== query) { setQuery(next); setPage(1); }
  };

  const items = useMemo(() => entries.map((entry) => ({
    key: entry.id,
    described: describeActivity(entry),
    time: formatTime(entry.createdAt, { hour: '2-digit', minute: '2-digit' }),
    day: entry.createdAt ? toIsoDate(new Date(entry.createdAt)) : '',
    createdAt: entry.createdAt
  })), [entries]);

  const days = useMemo(() => {
    const groups = [];
    for (const it of items) {
      const last = groups[groups.length - 1];
      if (last && last.day === it.day) last.items.push(it);
      else groups.push({ day: it.day, heading: dayHeading(it.createdAt), items: [it] });
    }
    return groups;
  }, [items]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const exportAll = async () => {
    // Walk the pages of the current filters until one comes back short.
    const all = [];
    for (let p = 1; ; p++) {
      const data = await api.getActivityHistory(p, EXPORT_PAGE_SIZE, filters);
      all.push(...data.items);
      if (data.items.length < EXPORT_PAGE_SIZE || all.length >= data.total) break;
    }
    return all.length ? exportActivityLog(withSentences(all)) : false;
  };

  const renderBody = () => {
    if (loading) return <div className="loading">Loading activity&hellip;</div>;
    if (failed && entries.length === 0) {
      return <div className="empty-state">The activity couldn&rsquo;t be loaded. Change a filter to try again.</div>;
    }
    if (entries.length === 0) {
      return (
        <div className="empty-state">
          {total === 0 && (query || userId || entityType || range !== 'all')
            ? 'Nothing matches those filters.'
            : 'Activity will appear here as changes are made.'}
        </div>
      );
    }
    return (
      <div className="activity-timeline">
        {days.map((group) => (
          <section key={group.day} className="activity-day">
            <h3 className="activity-day-heading">{group.heading}</h3>
            <ul className="activity-entries">
              {group.items.map((item) => <ActivityEntry key={item.key} item={item} />)}
            </ul>
          </section>
        ))}
      </div>
    );
  };

  return (
    <div className="activity-log page-activity page-enter">
      <PageHeader title="Activity Log">
        <ExportButton
          onExportView={() => entries.length ? exportActivityLog(withSentences(entries)) : false}
          onExportAll={exportAll}
        />
      </PageHeader>

      <div className="activity-filters">
        <div className="activity-search">
          <Search size={16} className="activity-search-icon" aria-hidden="true" />
          <input
            type="text"
            className="activity-search-input"
            placeholder="Search activity…"
            aria-label="Search activity"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onBlur={applyQuery}
            onKeyDown={(e) => { if (e.key === 'Enter') applyQuery(); }}
          />
        </div>
        <select className="limit-select" aria-label="Person" value={userId} onChange={(e) => choose(setUserId)(e.target.value)}>
          <option value="">Anyone</option>
          {people.map((p) => <option key={p.id} value={p.id}>{p.displayName}</option>)}
        </select>
        <select className="limit-select" aria-label="Type of record" value={entityType} onChange={(e) => choose(setEntityType)(e.target.value)}>
          {RECORD_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
        <select className="limit-select" aria-label="Date range" value={range} onChange={(e) => choose(setRange)(e.target.value)}>
          {RANGES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
        </select>
      </div>

      <div className="card">
        <div className="card-body">{renderBody()}</div>
      </div>

      {!loading && total > 0 && (
        <div className="activity-pager">
          <button type="button" className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Previous
          </button>
          <span className="activity-pager-text">Page {page} of {pageCount}</span>
          <button type="button" className="btn btn-secondary btn-sm" disabled={page >= pageCount} onClick={() => setPage(page + 1)}>
            Next
          </button>
        </div>
      )}
    </div>
  );
}
