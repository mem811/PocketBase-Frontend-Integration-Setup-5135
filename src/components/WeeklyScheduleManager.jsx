import {useEffect,useState} from 'react';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../common/SafeIcon';
import {pb} from '../lib/pocketbase';
import {pocketBaseErrorMessage} from '../lib/pocketbaseErrors';
import {changeSchedule,displayTime,fillSchedule,localDateKey,removeFutureScheduleSessions,weekdays} from '../lib/recurringSchedules';
import './WeeklyScheduleManager.css';

const dayLabels=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const shortDays=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const initialTimes=Object.fromEntries(weekdays.map((day)=>[day,{start:'08:15',end:'09:00'}]));

function addMinutes(value,minutes=45) {
  const [hours,mins]=value.split(':').map(Number);
  const total=(hours*60+mins+minutes)%(24*60);
  return `${String(Math.floor(total/60)).padStart(2,'0')}:${String(total%60).padStart(2,'0')}`;
}

function pocketBaseDate(value) {
  return new Date(`${value}T00:00:00.000Z`).toISOString();
}

function normalizeTime(value) {
  const match=String(value || '').trim().match(/^(\d{1,2}):([0-5]\d)$/);
  if (!match || Number(match[1])>23) return '';
  return `${String(Number(match[1])).padStart(2,'0')}:${match[2]}`;
}

function isDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`));
}

export default function WeeklyScheduleManager({client}) {
  const [schedules,setSchedules]=useState([]);
  const [days,setDays]=useState(['monday']);
  const [shared,setShared]=useState({start:'08:15',end:'09:00',start_date:localDateKey(),end_date:''});
  const [dayTimes,setDayTimes]=useState(initialTimes);
  const [differentTimes,setDifferentTimes]=useState(false);
  const [error,setError]=useState('');

  async function load() {
    const rows=await pb.collection('recurring_schedules').getFullList({filter:`client="${client.id}"`});
    setSchedules(rows.sort((a,b)=>weekdays.indexOf(a.weekday)-weekdays.indexOf(b.weekday)));
  }

  useEffect(()=>{
    load().catch((err)=>setError(pocketBaseErrorMessage(err,'Unable to load weekly schedules.')));
  },[client.id]);

  function toggleDay(day) {
    setDays((current)=>current.includes(day) ? current.filter((item)=>item!==day) : [...current,day]);
  }

  function updateDayTime(day,key,value) {
    setDayTimes((current)=>({...current,[day]:{...current[day],[key]:value}}));
  }

  async function addSchedules(event) {
    event.preventDefault();
    setError('');
    if (!days.length) return setError('Choose at least one weekday.');
    try {
      for (const weekday of weekdays.filter((day)=>days.includes(day))) {
        const times=differentTimes ? dayTimes[weekday] : {start:shared.start,end:shared.end};
        const start=normalizeTime(times.start);
        const end=normalizeTime(times.end);
        if (!start || !end || end<=start) {
          throw new Error(`Enter valid times for ${dayLabels[weekdays.indexOf(weekday)]}.`);
        }
        const schedule=await pb.collection('recurring_schedules').create({
          weekday,
          start,
          end,
          client:client.id,
          start_date:pocketBaseDate(shared.start_date),
          end_date:shared.end_date ? pocketBaseDate(shared.end_date) : '',
          active:true
        });
        await fillSchedule(schedule);
      }
      setDays([]);
      await load();
    } catch (err) {
      setError(pocketBaseErrorMessage(err,'Could not save all weekly times.'));
      await load().catch(()=>{});
    }
  }

  async function editSchedule(schedule) {
    const weekday=window.prompt('Day of the week (Monday–Sunday)',schedule.weekday);
    if (!weekday) return;
    const normalizedDay=normalizeWeekday(weekday);
    if (!weekdays.includes(normalizedDay)) return window.alert('Choose a weekday from Monday to Sunday.');
    const start=window.prompt('Start time (24-hour HH:MM)',schedule.start);
    if (start===null) return;
    const end=window.prompt('End time (24-hour HH:MM)',schedule.end);
    if (end===null) return;
    const effectiveDate=window.prompt('Starting which date?',localDateKey());
    if (!effectiveDate) return;
    const normalizedStart=normalizeTime(start);
    const normalizedEnd=normalizeTime(end);
    if (!normalizedStart || !normalizedEnd || normalizedEnd<=normalizedStart || !isDate(effectiveDate)) {
      return window.alert('Enter a valid date and times in HH:MM format, with the end after the start.');
    }
    if (!window.confirm(`Update unmodified future sessions starting ${effectiveDate}? Extra obsolete sessions will be removed.`)) return;
    setError('');
    try {
      await changeSchedule(schedule,{weekday:normalizedDay,start:normalizedStart,end:normalizedEnd},effectiveDate);
      await load();
    } catch (err) {
      setError(pocketBaseErrorMessage(err,'Could not update the schedule and its future sessions.'));
    }
  }

  async function toggleSchedule(schedule) {
    setError('');
    try {
      if (schedule.active) {
        if (!window.confirm('Pause this weekly time and remove its unmodified future sessions?')) return;
        await removeFutureScheduleSessions(schedule.id,localDateKey());
        await pb.collection('recurring_schedules').update(schedule.id,{active:false});
      } else {
        const updated=await pb.collection('recurring_schedules').update(schedule.id,{active:true});
        await fillSchedule(updated);
      }
      await load();
    } catch (err) {
      setError(pocketBaseErrorMessage(err,'Could not update this weekly time.'));
    }
  }

  async function removeSchedule(schedule) {
    if (!window.confirm('Remove this weekly time and delete its unmodified future sessions?')) return;
    setError('');
    try {
      await removeFutureScheduleSessions(schedule.id,localDateKey());
      const remaining=await pb.collection('sessions').getFullList({filter:`schedule="${schedule.id}"`});
      await Promise.all(remaining.map((session)=>pb.collection('sessions').update(session.id,{schedule:''})));
      await pb.collection('recurring_schedules').delete(schedule.id);
      await load();
    } catch (err) {
      setError(pocketBaseErrorMessage(err,'Could not remove this weekly time.'));
    }
  }

  return <section className="panel section-gap">
    <div className="panel-title">
      <div><h2>Weekly schedule</h2><p>Standing times create confirmed sessions four weeks ahead.</p></div>
    </div>
    {error && <div className="notice notice-error">{error}</div>}
    <div className="list-stack">
      {schedules.map((schedule)=><div className="list-row" key={schedule.id}>
        <div className="row-main">
          <strong>{dayLabels[weekdays.indexOf(schedule.weekday)]} · {displayTime(schedule.start)}–{displayTime(schedule.end)}</strong>
          <span>{schedule.active ? 'Active' : 'Paused'} · Starts {new Date(schedule.start_date).toLocaleDateString()}</span>
        </div>
        <div className="row-actions">
          <button className="text-button" onClick={()=>editSchedule(schedule)}>Edit</button>
          <button className="text-button" onClick={()=>toggleSchedule(schedule)}>{schedule.active ? 'Pause' : 'Resume'}</button>
          <button className="text-button danger-text" onClick={()=>removeSchedule(schedule)}>Remove</button>
        </div>
      </div>)}
      {!schedules.length && <div className="empty-state"><p>No standing times yet. Add the first weekly session below.</p></div>}
    </div>
    <form className="section-gap" onSubmit={addSchedules}>
      <div className="weekday-pills">
        {weekdays.map((day,index)=><label className={`weekday-pill ${days.includes(day) ? 'selected' : ''}`} key={day}>
          <input type="checkbox" checked={days.includes(day)} onChange={()=>toggleDay(day)} />
          <span>{shortDays[index]}</span>
        </label>)}
      </div>
      <label className="different-times-toggle">
        <input type="checkbox" checked={differentTimes} onChange={(event)=>setDifferentTimes(event.target.checked)} />
        Different times per day
      </label>
      {!differentTimes ? <div className="form-grid section-gap">
        <label>Start<input type="time" required value={shared.start} onChange={(event)=>setShared({...shared,start:event.target.value,end:addMinutes(event.target.value)})} /></label>
        <label>End<input type="time" required value={shared.end} onChange={(event)=>setShared({...shared,end:event.target.value})} /></label>
      </div> : <div className="day-time-list section-gap">
        {weekdays.filter((day)=>days.includes(day)).map((day)=><div className="day-time-row" key={day}>
          <strong>{dayLabels[weekdays.indexOf(day)]}</strong>
          <label>Start<input type="time" required value={dayTimes[day].start} onChange={(event)=>updateDayTime(day,'start',event.target.value)} /></label>
          <label>End<input type="time" required value={dayTimes[day].end} onChange={(event)=>updateDayTime(day,'end',event.target.value)} /></label>
        </div>)}
      </div>}
      <div className="form-grid section-gap">
        <label>Start date<input type="date" required value={shared.start_date} onChange={(event)=>setShared({...shared,start_date:event.target.value})} /></label>
        <label>End date <span className="muted">(optional)</span><input type="date" value={shared.end_date} onChange={(event)=>setShared({...shared,end_date:event.target.value})} /></label>
      </div>
      <button className="button button-primary section-gap"><SafeIcon icon={FiIcons.FiPlus} /> Add weekly times</button>
    </form>
  </section>;
}

function normalizeWeekday(value) {
  return String(value || '').trim().toLowerCase();
}
