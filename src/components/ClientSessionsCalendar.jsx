import {useMemo,useState} from 'react';
import {formatDate,formatTime,sessionSlot} from '../lib/pocketbase';
import {Status} from './TrainerDashboard';
import SessionClientActions from './SessionClientActions';
import SafeIcon from '../common/SafeIcon';
import * as FiIcons from 'react-icons/fi';
import './ClientSessionsCalendar.css';

const dayNames=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const dateKey=(value)=>String(value||'').slice(0,10);
const localKey=(date)=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;

export default function ClientSessionsCalendar({sessions,busySession,onConfirm,onCancel,onReschedule,onSaveNote}) {
  const [mode,setMode]=useState('calendar');
  const [month,setMonth]=useState(()=>new Date(new Date().getFullYear(),new Date().getMonth(),1));
  const [selected,setSelected]=useState(localKey(new Date()));
  const cells=useMemo(()=>{
    const offset=(month.getDay()+6)%7;
    const count=new Date(month.getFullYear(),month.getMonth()+1,0).getDate();
    return [...Array(offset).fill(null),...Array.from({length:count},(_,index)=>index+1)];
  },[month]);
  const byDay=useMemo(()=>{
    const grouped={};
    sessions.forEach((session)=>{
      const key=dateKey(sessionSlot(session).date);
      if(key)(grouped[key] ||= []).push(session);
    });
    return grouped;
  },[sessions]);
  const selectedSessions=byDay[selected]||[];

  function shiftMonth(amount) {
    const next=new Date(month.getFullYear(),month.getMonth()+amount,1);
    setMonth(next);
    setSelected(localKey(next));
  }
  function today() {
    const now=new Date();
    setMonth(new Date(now.getFullYear(),now.getMonth(),1));
    setSelected(localKey(now));
  }

  return <section className="panel client-calendar">
    <div className="client-calendar-heading">
      <div className="calendar-month-controls">
        <button className="icon-button" aria-label="Previous month" onClick={()=>shiftMonth(-1)}><SafeIcon icon={FiIcons.FiChevronLeft}/></button>
        <h2>{month.toLocaleDateString('en-US',{month:'long',year:'numeric'})}</h2>
        <button className="icon-button" aria-label="Next month" onClick={()=>shiftMonth(1)}><SafeIcon icon={FiIcons.FiChevronRight}/></button>
        <button className="button button-quiet button-small" onClick={today}>Today</button>
      </div>
      <div className="calendar-view-toggle">
        <button className={mode==='calendar'?'selected':''} onClick={()=>setMode('calendar')}>Calendar</button>
        <button className={mode==='list'?'selected':''} onClick={()=>setMode('list')}>List</button>
      </div>
    </div>
    {mode==='calendar'&&<div className="calendar-grid">
      {dayNames.map((name)=><strong className="calendar-weekday" key={name}>{name}</strong>)}
      {cells.map((day,index)=>{
        if(!day)return <span className="calendar-blank" key={`blank-${index}`}/>;
        const key=localKey(new Date(month.getFullYear(),month.getMonth(),day));
        const daySessions=byDay[key]||[];
        return <button className={`calendar-day ${selected===key?'is-selected':''}`} key={key} onClick={()=>setSelected(key)}>
          <span>{day}</span>
          <span className="calendar-dots">{daySessions.slice(0,4).map((session)=><i className={`dot-${String(session.status).replace('-','')}`} key={session.id}/>)}</span>
        </button>;
      })}
    </div>}
    <div className="calendar-day-detail">
      <div className="calendar-detail-title"><h3>{formatDate(selected)}</h3><span>{selectedSessions.length} session{selectedSessions.length===1?'':'s'}</span></div>
      {selectedSessions.length?selectedSessions.map((session)=><article className="calendar-session" key={session.id}>
        <div className="calendar-session-main"><strong>{formatTime(sessionSlot(session).start)}–{formatTime(sessionSlot(session).end)}</strong><Status status={session.status}/></div>
        <p>{session.trainer_notes||session.client_notes||'Your training session'}</p>
        {['requested','confirmed'].includes(session.status)&&<div className="calendar-session-actions">
          {session.status==='confirmed'&&<SessionClientActions session={session} busy={busySession===session.id} onConfirm={onConfirm} onCancel={onCancel} onReschedule={onReschedule}/>}
          {session.status==='requested'&&<><button className="text-button" disabled={busySession===session.id} onClick={()=>onReschedule(session)}>Reschedule</button><button className="text-button danger-text" disabled={busySession===session.id} onClick={()=>onCancel(session)}>Cancel</button></>}
          <button className="text-button" onClick={()=>onSaveNote(session)}><SafeIcon icon={FiIcons.FiEdit2}/> Notes</button>
        </div>}
      </article>):<div className="empty-state"><p>No sessions on this day.</p></div>}
    </div>
  </section>;
}
