import {formatDate,formatTime,money} from '../lib/pocketbase';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../common/SafeIcon';
import {Status} from './TrainerDashboard';
import SessionConfirmedBadge from './SessionConfirmedBadge';
import PackageBillingSummary from './PackageBillingSummary';
import ExerciseProgressChart from './ExerciseProgressChart';

const todayKey=()=>localDateKey(new Date());
function localDateKey(date){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;}
function sessionDate(session){return String(session.expand?.slot?.date||'').slice(0,10);}
const sessionSort=(a,b)=>sessionDate(a).localeCompare(sessionDate(b));

function weekStart(key){
  const date=new Date(`${key}T12:00:00`);
  date.setDate(date.getDate()-((date.getDay()+6)%7));
  return localDateKey(date);
}
function weekLabel(start,index,past){
  if(!past&&start===weekStart(todayKey()))return 'This week';
  const next=new Date(`${weekStart(todayKey())}T12:00:00`);
  next.setDate(next.getDate()+7);
  if(!past&&start===localDateKey(next))return 'Next week';
  const date=new Date(`${start}T12:00:00`);
  const end=new Date(date);
  end.setDate(end.getDate()+6);
  return `${date.toLocaleDateString('en-US',{month:'short',day:'numeric'})} – ${end.toLocaleDateString('en-US',{month:'short',day:'numeric'})}`;
}
function grouped(sessions,past=false){
  const map=new Map();
  sessions.forEach((item)=>{
    const start=weekStart(sessionDate(item));
    if(!map.has(start))map.set(start,[]);
    map.get(start).push(item);
  });
  return [...map.entries()].sort(([a],[b])=>past?b.localeCompare(a):a.localeCompare(b))
    .map(([start,items],index)=>({start,label:weekLabel(start,index,past),items:items.sort(sessionSort)}));
}

function SessionGroup({group,onPast=false}){
  return <section className="client-session-week">
    <h3>{group.label}</h3>
    <div className="list-stack">{group.items.map((session)=>{
      const slot=session.expand?.slot||{};
      return <article className="client-session-row" key={session.id}>
        <div className="client-session-date-block"><strong>{new Date(`${sessionDate(session)}T12:00:00`).toLocaleDateString('en-US',{weekday:'short'})}</strong><span>{new Date(`${sessionDate(session)}T12:00:00`).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</span></div>
        <div className="row-main"><strong>{formatTime(slot.start)}–{formatTime(slot.end)}</strong><span>{session.trainer_notes||session.client_notes||'Training session'}</span></div>
        <div className="client-session-status-wrap"><SessionConfirmedBadge confirmed={session.client_confirmed}/><Status status={session.status}/></div>
      </article>;
    })}</div>
  </section>;
}

function Sessions({sessions=[]}){
  const current=todayKey();
  const upcoming=sessions.filter((item)=>sessionDate(item)>=current&&!['completed','cancelled','no-show'].includes(item.status)).sort(sessionSort);
  const past=sessions.filter((item)=>sessionDate(item)<current||['completed','cancelled','no-show'].includes(item.status)).sort((a,b)=>sessionSort(b,a));
  const upcomingGroups=grouped(upcoming);
  const pastGroups=grouped(past,true);
  return <div className="client-detail-section-grid">
    <section className="panel"><div className="panel-title"><div><h2>Upcoming sessions</h2></div><span className="count-pill">{upcoming.length}</span></div>
      {upcomingGroups.length?upcomingGroups.map((group)=><SessionGroup key={group.start} group={group}/>):<div className="empty-state"><p>No upcoming sessions scheduled.</p></div>}
    </section>
    <section className="panel"><div className="panel-title"><div><h2>Past sessions</h2></div><span className="count-pill">{past.length}</span></div>
      {pastGroups.length?pastGroups.map((group)=><SessionGroup key={group.start} group={group} onPast/>):<div className="empty-state"><p>Completed sessions will appear here.</p></div>}
    </section>
  </div>;
}

function Payments({packages=[],payments=[]}){
  return <section className="panel">
    <div className="panel-title"><div><h2>Packages &amp; payment history</h2><p>Package prices, balances, due dates, and payments recorded.</p></div></div>
    {packages.length?<div className="client-payment-packages">{packages.map((item)=><article className="client-payment-package" key={item.id}>
      <div className="client-payment-heading"><div><strong>{item.name}</strong><span>{money(item.price)} package price</span></div><span className="status status-confirmed">{item.status||'active'}</span></div>
      <PackageBillingSummary packageRecord={item} payments={payments}/>
    </article>)}</div>:<div className="empty-state"><p>No packages recorded yet.</p></div>}
    <div className="client-payment-history">
      <h3>Payment history</h3>
      {payments.length?<div className="list-stack">{[...payments].sort((a,b)=>new Date(b.date)-new Date(a.date)).map((payment)=><div className="list-row" key={payment.id}>
        <div className="row-main"><strong>{money(payment.amount)}</strong><span>{formatDate(payment.date)} · {payment.method||'Method not recorded'}</span></div>
        <span className="client-session-sticker confirmed">Paid</span>
      </div>)}</div>:<div className="empty-state"><p>No payments recorded yet.</p></div>}
    </div>
  </section>;
}

function Workouts({workouts=[]}){
  const sorted=[...workouts].sort((a,b)=>new Date(b.date)-new Date(a.date));
  return <div className="client-detail-section-grid">
    <section className="panel"><div className="panel-title"><div><h2>Workout history</h2><p>Trainer and client workout logs, newest first.</p></div></div>
      {sorted.length?<div className="list-stack">{sorted.map((workout)=><article className="client-workout-row" key={workout.id}>
        <div className="client-workout-heading"><strong>{formatDate(workout.date)}</strong><span className={`client-session-sticker ${workout.logged_by==='client'?'requested':'confirmed'}`}>{workout.logged_by==='client'?'Client logged':'Trainer logged'}</span></div>
        {workout.notes&&<p>{workout.notes}</p>}
        {Array.isArray(workout.exercises)&&workout.exercises.length>0&&<div className="client-exercise-list">{workout.exercises.map((exercise,index)=><div key={`${exercise.name}-${index}`}><strong>{exercise.name}</strong><span>{exercise.sets||'—'} sets × {exercise.reps||'—'} reps{exercise.weight?` · ${exercise.weight}`:''}</span></div>)}</div>}
      </article>)}</div>:<div className="empty-state"><p>No workouts have been logged yet.</p></div>}
    </section>
    <ExerciseProgressChart workouts={sorted}/>
  </div>;
}

function Notes({notes=[],editingNote,editNoteText,newNote,openNoteMenu,showAllNotes,onNewNoteChange,onAddNote,onEditNote,onEditTextChange,onSaveEdit,onCancelEdit,onToggleMenu,onDeleteNote,onToggleAll}){
  const visible=showAllNotes?notes:notes.slice(0,5);
  return <section className="panel">
    <div className="panel-title"><div><h2>Trainer-only notes</h2><p>Private to the trainer and never shown in the client portal.</p></div></div>
    <form className="stack-form client-note-form" onSubmit={onAddNote}><label>Add a note<textarea rows="3" value={newNote} onChange={(event)=>onNewNoteChange(event.target.value)} placeholder="Write a note to remember about this client…"/></label><button className="button button-primary" disabled={!newNote.trim()}><SafeIcon icon={FiIcons.FiPlus}/> Save note</button></form>
    <div className="list-stack client-notes-list">
      {visible.map((note)=><article className="client-note-entry" key={note.id}>
        <div className="client-note-content"><span>{note.created?new Date(note.created).toLocaleString('en-US',{dateStyle:'medium',timeStyle:'short'}):'Date unavailable'}</span>
          {editingNote===note.id?<div className="stack-form"><textarea rows="3" value={editNoteText} onChange={(event)=>onEditTextChange(event.target.value)} aria-label="Edit trainer note"/><div className="row-actions"><button type="button" className="text-button" onClick={onCancelEdit}>Cancel</button><button type="button" className="text-button" disabled={!editNoteText.trim()} onClick={()=>onSaveEdit(note)}>Save</button></div></div>:<p>{note.notes}</p>}
        </div>
        {editingNote!==note.id&&<div className="client-note-actions"><button type="button" className="text-button" aria-label="Note actions" aria-expanded={openNoteMenu===note.id} onClick={()=>onToggleMenu(note.id)}><SafeIcon icon={FiIcons.FiMoreHorizontal}/></button>{openNoteMenu===note.id&&<div className="row-actions"><button type="button" className="text-button" onClick={()=>onEditNote(note)}>Edit</button><button type="button" className="text-button danger-text" onClick={()=>onDeleteNote(note)}>Delete</button></div>}</div>}
      </article>)}
      {!notes.length&&<div className="empty-state"><p>No notes yet. Jot down anything you want to remember about this client.</p></div>}
    </div>
    {notes.length>5&&<button type="button" className="text-button" onClick={onToggleAll}>{showAllNotes?'Show fewer notes':'Show all notes'}</button>}
  </section>;
}

export default {Sessions,Payments,Workouts,Notes};
