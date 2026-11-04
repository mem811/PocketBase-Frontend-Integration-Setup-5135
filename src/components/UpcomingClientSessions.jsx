import {useMemo,useState} from 'react';
import {formatTime,sessionSlot} from '../lib/pocketbase';
import './UpcomingClientSessions.css';

const dateKey=(value)=>String(value||'').slice(0,10);

function parseLocalDate(value) {
  const [year,month,day]=dateKey(value).split('-').map(Number);
  return new Date(year,month-1,day,12);
}

function startOfWeek(date) {
  const start=new Date(date.getFullYear(),date.getMonth(),date.getDate(),12);
  start.setDate(start.getDate()-(start.getDay()+6)%7);
  return start;
}

function weekNumber(date,base) {
  return Math.round((startOfWeek(date)-startOfWeek(base))/(7*24*60*60*1000));
}

function weekLabel(offset) {
  if(offset===0)return 'This week';
  if(offset===1)return 'Next week';
  return `Week of ${startOfWeek(new Date(Date.now()+offset*7*24*60*60*1000)).toLocaleDateString('en-US',{month:'short',day:'numeric'})}`;
}

function formatDay(value) {
  return parseLocalDate(value).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});
}

export default function UpcomingClientSessions({sessions,busySession,onConfirm,onCancel,onReschedule}) {
  const [celebrating,setCelebrating]=useState('');
  const groups=useMemo(()=>{
    const today=new Date();
    const upcoming=sessions.filter((session)=>{
      const date=dateKey(sessionSlot(session).date);
      return ['confirmed','requested'].includes(session.status)&&date>=dateKey(today);
    }).sort((first,second)=>{
      const a=sessionSlot(first);
      const b=sessionSlot(second);
      return `${dateKey(a.date)}${a.start}`.localeCompare(`${dateKey(b.date)}${b.start}`);
    });
    const grouped=new Map();
    upcoming.forEach((session)=>{
      const offset=weekNumber(parseLocalDate(sessionSlot(session).date),today);
      if(!grouped.has(offset))grouped.set(offset,[]);
      grouped.get(offset).push(session);
    });
    return [...grouped.entries()].sort(([first],[second])=>first-second);
  },[sessions]);

  async function confirm(session) {
    const saved=await onConfirm(session);
    if(!saved)return;
    setCelebrating(session.id);
    window.setTimeout(()=>setCelebrating(''),1200);
  }

  return <section className="panel upcoming-client-sessions">
    <div className="panel-title"><div><h2>Upcoming sessions</h2><p>Your week, with every time and confirmation in one place.</p></div></div>
    {groups.length?groups.map(([offset,items])=><section className="upcoming-week" key={offset}>
      <header className="upcoming-week-heading">
        <h3>{weekLabel(offset)}</h3>
        <span>{items.filter((session)=>session.status==='confirmed'&&session.client_confirmed).length} of {items.length} sessions confirmed</span>
      </header>
      <div className="upcoming-week-list">{items.map((session)=>{
        const slot=sessionSlot(session);
        const requested=session.status==='requested';
        return <article className={`upcoming-session-card ${celebrating===session.id?'is-celebrating':''}`} key={session.id}>
          <div className="upcoming-session-date"><strong>{formatDay(slot.date)}</strong><span>{formatTime(slot.start)}–{formatTime(slot.end)}</span></div>
          {requested
            ? <span className="upcoming-status waiting">Waiting for approval</span>
            : session.client_confirmed
              ? <span className="upcoming-status confirmed">Confirmed ✓</span>
              : <button className="button button-primary upcoming-confirm" disabled={busySession===session.id} onClick={()=>confirm(session)}>I’ll be there 👍</button>}
          {celebrating===session.id&&<span className="session-confetti" aria-hidden="true">✦ ✧ ✦</span>}
          <div className="upcoming-session-actions">
            <button className="text-button danger-text" disabled={busySession===session.id} onClick={()=>onCancel(session)}>Can’t make it</button>
            <button className="text-button" disabled={busySession===session.id} onClick={()=>onReschedule(session)}>Reschedule</button>
          </div>
        </article>;
      })}</div>
    </section>):<div className="empty-state"><p>No upcoming sessions yet. Your trainer’s scheduled times will appear here.</p></div>}
  </section>;
}
