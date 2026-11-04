import {useEffect,useMemo,useState} from 'react';
import {formatDate,formatTime,sessionClient,sessionSlot} from '../lib/pocketbase';
import './SessionReminders.css';

const storagePrefix='session-reminders-';
const day=24*60*60*1000;
const hour=60*60*1000;

function readReminders(key){
  try{return JSON.parse(window.localStorage.getItem(key)||'{}');}
  catch{return {};}
}

function saveReminders(key,value){
  try{window.localStorage.setItem(key,JSON.stringify(value));}
  catch{}
}

function sessionStart(session){
  const slot=sessionSlot(session);
  if(!slot.date||!slot.start)return 0;
  return new Date(`${String(slot.date).slice(0,10)}T${slot.start}`).getTime();
}

function reminderTime(start){
  const remaining=start-Date.now();
  if(remaining<=hour)return 0;
  return start-(remaining>day?day:hour);
}

export default function SessionReminders({sessions,userId}){
  const storageKey=`${storagePrefix}${userId||'local'}`;
  const [reminders,setReminders]=useState(()=>readReminders(storageKey));
  const [message,setMessage]=useState('');
  const upcoming=useMemo(()=>sessions
    .filter((session)=>session.status==='confirmed'&&sessionStart(session)>Date.now())
    .sort((first,second)=>sessionStart(first)-sessionStart(second))
    .slice(0,6),[sessions]);

  useEffect(()=>{
    const validIds=new Set(upcoming.map((session)=>session.id));
    const current=readReminders(storageKey);
    const next={};
    Object.entries(current).forEach(([id,reminder])=>{
      if(validIds.has(id))next[id]=reminder;
    });
    saveReminders(storageKey,next);
    setReminders(next);
  },[storageKey,upcoming]);

  useEffect(()=>{
    function checkReminders(){
      const current=readReminders(storageKey);
      let changed=false;
      Object.entries(current).forEach(([id,reminder])=>{
        const session=upcoming.find((item)=>item.id===id);
        const start=session?sessionStart(session):0;
        if(!start||Date.now()>=start){
          delete current[id];
          changed=true;
          return;
        }
        if(Date.now()>=reminder.at&&window.Notification?.permission==='granted'){
          const name=sessionClient(session).name?.split(' ')[0];
          const notification=new window.Notification('Training session reminder',{
            body:`${name?`${name}, your session`: 'Your session'} is coming up ${formatDate(sessionSlot(session).date)} at ${formatTime(sessionSlot(session).start)}.`
          });
          notification.onclick=()=>{window.focus();notification.close();};
          delete current[id];
          changed=true;
        }
      });
      if(changed){
        saveReminders(storageKey,current);
        setReminders(current);
      }
    }
    checkReminders();
    const timer=window.setInterval(checkReminders,30000);
    return ()=>window.clearInterval(timer);
  },[storageKey,upcoming]);

  async function toggleReminder(session){
    if(reminders[session.id]){
      const next={...reminders};
      delete next[session.id];
      saveReminders(storageKey,next);
      setReminders(next);
      setMessage('Reminder removed.');
      return;
    }
    if(!('Notification'in window)){
      setMessage('This browser does not support notifications.');
      return;
    }
    const permission=await window.Notification.requestPermission();
    if(permission!=='granted'){
      setMessage('Allow notifications in your browser settings to set a reminder.');
      return;
    }
    const start=sessionStart(session);
    const at=reminderTime(start);
    if(!at){
      setMessage('This session starts in less than an hour, so it is too soon to set a reminder.');
      return;
    }
    const next={...reminders,[session.id]:{at,start}};
    saveReminders(storageKey,next);
    setReminders(next);
    setMessage('Reminder set for this device.');
  }

  return <section className="panel session-reminders">
    <div className="panel-title"><div><h2>Session reminders</h2><p>Get a browser notification before a confirmed session.</p></div></div>
    <p className="reminder-note">Reminders run on this device while the planner is open. Your browser must allow notifications.</p>
    {message&&<p className="reminder-message" role="status">{message}</p>}
    <div className="list-stack">
      {upcoming.length?upcoming.map((session)=>{
        const slot=sessionSlot(session);
        const scheduled=reminders[session.id];
        const tooSoon=!reminderTime(sessionStart(session));
        return <div className="list-row" key={session.id}>
          <div className="row-main">
            <strong>{sessionClient(session).name||'Your session'}</strong>
            <span>{formatDate(slot.date)} · {formatTime(slot.start)}</span>
            {scheduled&&<span className="reminder-scheduled">Reminder set for {formatTime(new Date(scheduled.at).toTimeString().slice(0,5))}</span>}
          </div>
          <button type="button" className={`button button-small ${scheduled?'button-soft':'button-primary'}`} disabled={tooSoon&&!scheduled} onClick={()=>toggleReminder(session)}>
            {scheduled?'Remove reminder':tooSoon?'Too soon':'Set reminder'}
          </button>
        </div>;
      }):<div className="empty-state"><p>No upcoming confirmed sessions to remind you about.</p></div>}
    </div>
  </section>;
}
