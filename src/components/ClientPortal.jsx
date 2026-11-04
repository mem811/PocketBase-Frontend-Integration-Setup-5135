import {useEffect,useState} from 'react';
import {pb,money,formatDate,formatTime,sessionSlot} from '../lib/pocketbase';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../common/SafeIcon';
import {Status} from './TrainerDashboard';
import {dateKey,displayTime,slotConflicts,weekdays} from '../lib/recurringSchedules';
import SessionClientActions from './SessionClientActions';

const editableStatuses=['requested','confirmed'];
const canEditSession=(session)=> editableStatuses.includes(session.status);

export default function ClientPortal({user,page}) {
  const [data,setData]=useState({client:null,packages:[],sessions:[],slots:[],workouts:[],payments:[],schedules:[]});
  const [error,setError]=useState('');
  const [busySession,setBusySession]=useState('');

  async function load() {
    const [clients,packages,sessions,slots,workouts,payments,schedules]=await Promise.all([
      pb.collection('clients').getFullList(),
      pb.collection('packages').getFullList(),
      pb.collection('sessions').getFullList({expand:'slot',sort:'-created'}),
      pb.collection('availability').getFullList({sort:'date,start'}),
      pb.collection('workouts').getFullList({sort:'-date'}),
      pb.collection('payments').getFullList({sort:'-date'}),
      pb.collection('recurring_schedules').getFullList({filter:'active=true'})
    ]);
    setData({client:clients.find((item)=>item.user===user.id),packages,sessions,slots,workouts,payments,schedules});
  }

  useEffect(()=> {
    load().catch(()=> setError('Could not load your account. Please contact your trainer.'));
  },[user.id]);

  if (!data.client && !error) return <div className="panel"><div className="empty-state"><p>Setting up your training space…</p></div></div>;
  if (!data.client) return <div className="notice notice-error">{error || 'No client profile is linked to this login yet. Ask your trainer for help.'}</div>;

  const client=data.client;
  const completed=data.sessions.filter((session)=>session.status==='completed');
  const packageSessionsLeft=data.packages.reduce((sum,item)=>sum+Math.max(0,item.total_sessions-data.sessions.filter((session)=>session.package===item.id && session.status==='completed').length),0);
  const balance=data.packages.reduce((sum,item)=>sum+Number(item.price)-data.payments.filter((payment)=>payment.package===item.id).reduce((total,payment)=>total+Number(payment.amount),0),0);
  const next=data.sessions.filter((session)=>['confirmed','requested'].includes(session.status))
    .sort((first,second)=>new Date(sessionSlot(first).date)-new Date(sessionSlot(second).date))[0];

  async function confirmSession(session) {
    setBusySession(session.id);
    setError('');
    try {
      await pb.collection('sessions').update(session.id,{client_confirmed:true});
      await load();
    } catch {
      setError('Could not confirm this session. Please refresh and try again.');
    } finally {
      setBusySession('');
    }
  }

  async function cancel(session) {
    if (!canEditSession(session) || !window.confirm('Cancel this session? The time will become available again.')) return;
    setBusySession(session.id);
    setError('');
    try {
      await pb.collection('sessions').update(session.id,{status:'cancelled'});
      if (session.slot) await pb.collection('availability').update(session.slot,{status:'open'});
      await load();
    } catch {
      setError('Could not cancel this session. Please refresh and try again.');
    } finally {
      setBusySession('');
    }
  }

  async function reschedule(session) {
    if (!canEditSession(session)) return;
    const slot=availableSlots(data.slots,data.sessions,session.id)[0];
    if (!slot) return window.alert('There are no open times right now. Check back soon.');
    if (!window.confirm(`Move your session to ${formatDate(slot.date)} at ${formatTime(slot.start)}? Your trainer will need to approve the new time.`)) return;
    setBusySession(session.id);
    setError('');
    try {
      await pb.collection('availability').update(slot.id,{status:'booked'});
      try {
        await pb.collection('sessions').update(session.id,{slot:slot.id,status:'requested',client_confirmed:false});
      } catch (updateError) {
        await pb.collection('availability').update(slot.id,{status:'open'}).catch(()=> {});
        throw updateError;
      }
      if (session.slot && session.slot!==slot.id) {
        await pb.collection('availability').update(session.slot,{status:'open'}).catch(()=> {});
      }
      await load();
    } catch {
      setError('Could not reschedule this session. Please refresh and try again.');
    } finally {
      setBusySession('');
    }
  }

  async function book(slot) {
    if (!window.confirm(`Request ${formatDate(slot.date)} at ${formatTime(slot.start)}? Your trainer will confirm it.`)) return;
    try {
      await pb.collection('sessions').create({client:client.id,slot:slot.id,status:'requested',client_notes:''});
      await load();
      setError('');
    } catch {
      setError('That time could not be requested. It may conflict with another booking—refresh and choose another slot.');
    }
  }

  async function saveClientNote(session) {
    if (!canEditSession(session)) return;
    const note=window.prompt('Add a note for your trainer',session.client_notes || '');
    if (note===null) return;
    try {
      await pb.collection('sessions').update(session.id,{client_notes:note});
      await load();
      setError('');
    } catch {
      setError('Could not save your note. Please refresh and try again.');
    }
  }

  async function logWorkout(event) {
    event.preventDefault();
    const values=new FormData(event.currentTarget);
    await pb.collection('workouts').create({
      client:client.id,
      date:new Date().toISOString(),
      logged_by:'client',
      notes:values.get('notes'),
      exercises:[{name:values.get('exercise'),sets:values.get('sets'),reps:values.get('reps'),weight:values.get('weight')}]
    });
    event.currentTarget.reset();
    load();
  }

  const weeklyTimes=groupWeeklyTimes(data.schedules);
  return <>
    {error && <div className="notice notice-error">{error}</div>}
    {page==='home' && <>
      <header className="page-heading"><div><p className="eyebrow">YOUR TRAINING SPACE</p><h1>Hey, {client.name.split(' ')[0]}.</h1><p className="muted">Good things happen one session at a time.</p></div></header>
      <section className="stat-grid">
        <Stat label="Sessions completed" value={completed.length} icon={FiIcons.FiActivity} />
        <Stat label="Sessions left" value={packageSessionsLeft} icon={FiIcons.FiTarget} />
        <Stat label="Balance" value={money(balance)} icon={FiIcons.FiDollarSign} />
      </section>
      <div className="dashboard-grid">
        <article className="panel">
          <PanelTitle title="Next session" />
          <div className="next-session">{next ? <>
            <span className="eyebrow">{next.status==='requested' ? 'AWAITING CONFIRMATION' : 'YOU’RE BOOKED'}</span>
            <strong>{formatDate(sessionSlot(next).date)}</strong><p>{formatTime(sessionSlot(next).start)}</p>
            <SessionClientActions session={next} busy={busySession===next.id} onConfirm={confirmSession} onCancel={cancel} onReschedule={reschedule} />
          </> : <div className="empty-state"><p>No session booked yet. Head to Book to find a time.</p></div>}</div>
        </article>
        <article className="panel"><PanelTitle title="Your weekly times" /><div className="list-stack">{weeklyTimes.length ? weeklyTimes.map((item)=><div className="list-row" key={item.key}><div className="row-main"><strong>{item.days}, {item.time}</strong><span>Standing weekly time</span></div></div>) : <Empty text="Your trainer has not added weekly times yet." />}</div></article>
        <article className="panel"><PanelTitle title="Your coach’s note" /><p className="detail-copy">{data.workouts.find((workout)=>workout.logged_by==='trainer')?.notes || 'Your workout notes will show here after your trainer logs a session.'}</p></article>
      </div>
    </>}
    {page==='book' && <>
      <PageHeading title="Book a session" subtitle="Choose an open time. Your trainer will confirm the request." />
      <section className="slot-list">{availableSlots(data.slots,data.sessions).map((slot)=><div className="slot-card" key={slot.id}><div><strong>{formatDate(slot.date)}</strong><span>{formatTime(slot.start)}–{formatTime(slot.end)}</span></div><button className="button button-primary" onClick={()=>book(slot)}>Request time</button></div>)}{!availableSlots(data.slots,data.sessions).length && <div className="panel empty-state"><p>No open times just yet. Check back soon or message your trainer.</p></div>}</section>
    </>}
    {page==='sessions' && <>
      <PageHeading title="My sessions" subtitle="Your training history, all in one place." />
      <section className="panel"><div className="list-stack">{data.sessions.map((session)=><div className="list-row client-session-row" key={session.id}>
        <div className="row-main"><strong>{formatDate(sessionSlot(session).date)} · {formatTime(sessionSlot(session).start)}</strong><span>{session.trainer_notes || session.client_notes || 'Ready for your next session.'}</span></div>
        <Status status={session.status} />
        {canEditSession(session) && <div className="row-actions">
          {session.status==='confirmed' && <SessionClientActions session={session} busy={busySession===session.id} onConfirm={confirmSession} onCancel={cancel} onReschedule={reschedule} />}
          <button className="icon-button" onClick={()=>saveClientNote(session)} aria-label="Add note"><SafeIcon icon={FiIcons.FiEdit2} /></button>
          {session.status==='requested' && <><button className="text-button" onClick={()=>reschedule(session)}>Reschedule</button><button className="text-button danger-text" onClick={()=>cancel(session)}>Cancel</button></>}
        </div>}
      </div>)}{!data.sessions.length && <Empty text="Your sessions will appear here once you book one." />}</div></section>
    </>}
    {page==='workouts' && <>
      <PageHeading title="My workouts" subtitle="A record of the work you put in, wherever you train." />
      <section className="panel"><form className="form-grid workout-form" onSubmit={logWorkout}>
        <label>Exercise<input name="exercise" required placeholder="Goblet squat" /></label><label>Sets<input name="sets" placeholder="3" /></label><label>Reps<input name="reps" placeholder="10" /></label><label>Weight<input name="weight" placeholder="20 lb" /></label>
        <label className="form-span">Notes<textarea name="notes" placeholder="How did it feel?" /></label><button className="button button-primary form-span">Log workout</button>
      </form></section>
      <section className="panel section-gap"><PanelTitle title="Workout history" /><div className="list-stack">{data.workouts.map((workout)=><div className="list-row" key={workout.id}><div className="row-main"><strong>{formatDate(workout.date)} · {workout.logged_by==='trainer' ? 'Coach' : 'You'}</strong><span>{workout.exercises?.map((exercise)=>exercise.name).join(', ') || workout.notes || 'Workout logged'}</span></div></div>)}{!data.workouts.length && <Empty text="Log your first workout to start your history." />}</div></section>
    </>}
    {page==='payments' && <>
      <PageHeading title="Payments" subtitle="A simple, up-to-date record of your training balance." />
      <section className="panel"><div className="balance-banner"><span>Total outstanding</span><strong>{money(balance)}</strong></div><div className="list-stack">{data.payments.map((payment)=><div className="list-row" key={payment.id}><div className="row-main"><strong>{money(payment.amount)}</strong><span>{formatDate(payment.date)} · {payment.method}</span></div><span className="status status-completed">Recorded</span></div>)}{!data.payments.length && <Empty text="Payment history will appear here." />}</div></section>
    </>}
  </>;
}

function availableSlots(slots,sessions,excludeSessionId='') {
  return slots.filter((slot)=>slot.status==='open' && !slotConflicts(slot,sessions,excludeSessionId))
    .sort((a,b)=>`${dateKey(a.date)}${a.start}`.localeCompare(`${dateKey(b.date)}${b.start}`));
}

function groupWeeklyTimes(schedules) {
  const dayNames=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const groups=new Map();
  schedules.forEach((schedule)=> {
    const dayIndex=weekdays.indexOf(schedule.weekday);
    if (dayIndex<0) return;
    const key=`${schedule.start}-${schedule.end}`;
    if (!groups.has(key)) groups.set(key,{key,start:schedule.start,end:schedule.end,days:[]});
    groups.get(key).days.push({index:dayIndex,label:dayNames[dayIndex]});
  });
  return [...groups.values()].map((item)=>({...item,days:item.days.sort((a,b)=>a.index-b.index).map((day)=>day.label).join(' & '),time:`${displayTime(item.start)}–${displayTime(item.end)}`}));
}

function PageHeading({title,subtitle}) {
  return <header className="page-heading"><div><p className="eyebrow">YOUR TRAINING SPACE</p><h1>{title}</h1><p className="muted">{subtitle}</p></div></header>;
}
function PanelTitle({title}) {return <div className="panel-title"><div><h2>{title}</h2></div></div>;}
function Empty({text}) {return <div className="empty-state"><p>{text}</p></div>;}
function Stat({icon,label,value}) {return <div className="stat-card"><span className="stat-icon"><SafeIcon icon={icon} /></span><p>{label}</p><strong>{value}</strong></div>;}
