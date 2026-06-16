import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import './JobCardCalendarView.css';

export default function JobCardCalendarView({ jobcards, onCardClick, getStatusBadgeClass, STATUS_LABELS }) {
  const [currentDate, setCurrentDate] = useState(new Date());

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const prevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const today = () => {
    setCurrentDate(new Date());
  };

  const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();

  const days = [];
  for (let i = 0; i < firstDayOfMonth; i++) {
    days.push(null);
  }
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(new Date(currentDate.getFullYear(), currentDate.getMonth(), i));
  }

  const monthNames = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  // Group jobcards by due date
  const cardsByDate = useMemo(() => {
    const map = {};
    jobcards.forEach(card => {
      if (card.dueDate) {
        // dueDate is usually YYYY-MM-DD
        const dateStr = card.dueDate.split('T')[0];
        if (!map[dateStr]) map[dateStr] = [];
        map[dateStr].push(card);
      }
    });
    return map;
  }, [jobcards]);

  return (
    <div className="calendar-view">
      <div className="calendar-header">
        <div className="calendar-nav">
          <button className="btn btn-secondary btn-sm" onMouseDown={(e) => e.preventDefault()} onClick={prevMonth} aria-label="Previous month"><ChevronLeft size={16} /></button>
          <button className="btn btn-secondary btn-sm" onMouseDown={(e) => e.preventDefault()} onClick={today}>Today</button>
          <button className="btn btn-secondary btn-sm" onMouseDown={(e) => e.preventDefault()} onClick={nextMonth} aria-label="Next month"><ChevronRight size={16} /></button>
        </div>
        <h3 className="calendar-title">{monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}</h3>
      </div>
      <div className="calendar-grid">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
          <div key={day} className="calendar-day-header">{day}</div>
        ))}
        {days.map((date, index) => {
          if (!date) return <div key={`empty-${index}`} className="calendar-day empty"></div>;
          
          const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
          const dayCards = cardsByDate[dateStr] || [];
          const isToday = new Date().toDateString() === date.toDateString();

          return (
            <div key={dateStr} className={`calendar-day ${isToday ? 'today' : ''}`}>
              <div className="calendar-day-number">{date.getDate()}</div>
              <div className="calendar-day-cards">
                {dayCards.map(card => (
                  <div 
                    key={card.id} 
                    className={`calendar-card ${getStatusBadgeClass(card.status)}`}
                    onClick={() => onCardClick(card)}
                    title={`${card.jobNumber} - ${card.companyName || 'No Company'}\nStatus: ${STATUS_LABELS[card.status] || card.status}`}
                  >
                    <span className="calendar-card-job">{card.jobNumber}</span>
                    <span className="calendar-card-company">{card.companyName || card.contactName || 'No Company'}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
