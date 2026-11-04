import {useEffect,useState} from 'react';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../common/SafeIcon';
import SessionConfirmedBadge from './SessionConfirmedBadge';
import {pb,dateOnly,formatDate,formatTime,money,sessionSlot,sessionClient} from '../lib/pocketbase';

const defaultTemplate='Hi {first name}! See you tomorrow at {time}. Tap to confirm: {app link} 💪';

export default function TrainerDashboard({onOpenSession}) {
  const [data,setData]=useState({sessions:[],clients:[],packages:[],payments:[],workouts:[]});
  const [template,setTemplate]=useState(defaultTemplate);
  const [error,setError]=useState('');

  useEffect(()=> {
    Promise.all([
      pb.collection('sessions').getFullList({expand:'client,slot',sort:'slot.date'}),
      pb.collection('clients').getFullList({sort:'name'}),
      pb.collection('packages').getFullList(),
      pb.collection('payments').getFullList(),
      pb.collection('workouts').getFullList({expand:'client',sort:'-date',requestKey:'dashboard-workouts'}),
      pb.collection('settings').getFirstListItem('key="reminder_template"').catch(()=>null)
    ]).then(([sessions,clients,packages,payments,workouts,setting])=> {
      setData({sessions,clients,packages,payments,workouts});
      if (setting?.reminder_template) setTemplate(setting.reminder_template);
    }).catch(()=>setError('Could not load planner data. Check the PocketBase rules and connection.'));
  },[]);

  const today=dateOnly();
  const tomorrow=dateOnly(new Date(Date.now()+86400000));
  const todays=data.sessions.filter((session)=>sessionSlot(session).date?.startsWith(today));
  const week=data.sessions.filter((session)=> {
    const day=new Date(sessionSlot(session).date || 0);
    return day>=new Date(today) && day<new Date(Date.now()+7*86400000);
  });
  const due=data.sessions.filter((session)=>sessionSlot(session).date?.startsWith(tomorrow) && session.status==='confirmed');
  const activePackages=data.packages.filter((item)=>item.status==='active');
  const remaining=(item)=>item.total_sessions-data.sessions.filter((session)=>session.package===item.id && session.status==='completed').length;
  const low=activePackages.filter((item)=>remaining(item)<=2);
  const owed=data.clients.map((client)=>({client,balance:data.packages.filter((item)=>item.client===client.id).reduce((sum,item)=> {
    const paid=data.payments.filter((payment)=>payment.package===item.id).reduce((total,row)=>total+Number(row.amount),0);
    return sum+Number(item.price)-paid;
  },0)})).filter((item)=>item.balance>0);

  async function textReminder(session) {
    const slot=sessionSlot(session);
    const first=sessionClient(session).name?.split(' ')[0] || 'there';
    const appLink=`${window.location.origin}${window.location.pathname}${window.location.hash}`;
    const message=template.replaceAll('{first name}',first).replaceAll('{time}',formatTime(slot.start))
      .replaceAll('{date}',formatDate(slot.date)).replaceAll('{app link}',appLink);
    window.location.href=`sms:${sessionClient(session).phone || ''}?body=${encodeURIComponent(message)}`;
    await pb.collection('sessions').update(session.id,{reminder_sent:true});
    setData((previous)=>({...previous,sessions:previous.sessions.map((item)=>item.id===session.id ? {...item,reminder_sent:true} : item)}));
  }

  return <>
    <header className="page-heading"><div><p className="eyebrow">YOUR STUDIO</p><h1>Good morning.</h1><p className="muted">A clear view of your day, your clients, and what needs a little attention.</p></div><span className="today-pill">{formatDate(today)}</span></header>
    {error && <div className="notice notice-error">{error}</div>}
    <section className="stat-grid">
      <Stat icon={FiIcons.FiCalendar} label="Today" value={todays.length} detail="sessions on the calendar" />
      <Stat icon={FiIcons.FiTrendingUp} label="This week" value={week.length} detail="sessions scheduled" />
      <Stat icon={FiIcons.FiInbox} label="Requests" value={data.sessions.filter((item)=>item.status==='requested').length} detail="waiting for your review" />
      <Stat icon={FiIcons.FiUsers} label="Active clients" value={data.clients.filter((client)=>client.active).length} detail="currently training" />
    </section>
    <div className="dashboard-grid">
      <section className="panel"><PanelTitle title="Tomorrow’s check-ins" subtitle="A quick personal nudge before you meet." />
        <div className="list-stack">{due.length ? due.map((session)=><div className="list-row" key={session.id}>
          <div className="avatar">{sessionClient(session).name?.[0] || 'C'}</div>
          <div className="row-main"><strong>{sessionClient(session).name}</strong><span>{formatTime(sessionSlot(session).start)} · {formatDate(sessionSlot(session).date)}</span>
            {session.client_confirmed ? <span className="session-confirmation-status">Confirmed ✓</span> : <span className="confirmation-pending">Not yet confirmed</span>}
          </div>
          <SessionConfirmedBadge confirmed={session.client_confirmed} />
          <button className={`button button-small ${session.reminder_sent ? 'button-soft' : 'button-primary'}`} onClick={()=>textReminder(session)}><SafeIcon icon={session.reminder_sent ? FiIcons.FiCheck : FiIcons.FiMessageCircle} />{session.reminder_sent ? 'Sent' : 'Text'}</button>
        </div>) : <Empty text="No confirmed sessions tomorrow." />}</div>
      </section>
      <section className="panel"><PanelTitle title="Needs a look" subtitle="Small follow-ups that keep the studio moving." /><div className="attention-list">
        <Attention title="Low on sessions" value={`${low.length} package${low.length===1 ? '' : 's'}`} detail="Two or fewer sessions remaining" />
        <Attention title="Outstanding balances" value={money(owed.reduce((sum,item)=>sum+item.balance,0))} detail={`${owed.length} client${owed.length===1 ? '' : 's'} with a balance`} />
        <Attention title="Recent workouts" value={data.workouts.length} detail="Client and trainer logs" />
      </div></section>
      <section className="panel panel-wide"><PanelTitle title="Today’s schedule" subtitle="Tap a session to review or update it." />
        <div className="list-stack">{todays.length ? todays.map((session)=><button className="list-row row-button" key={session.id} onClick={()=>onOpenSession(session)}>
          <div className="time-block">{formatTime(sessionSlot(session).start)}</div>
          <div className="row-main"><strong>{sessionClient(session).name}</strong><span>{sessionSlot(session).start}–{sessionSlot(session).end}</span></div>
          <SessionConfirmedBadge confirmed={session.client_confirmed} />
          <Status status={session.status} />
        </button>) : <Empty text="Nothing scheduled today. Enjoy the breathing room." />}</div>
      </section>
    </div>
  </>;
}

function Stat({icon,label,value,detail}) {return <div className="stat-card"><span className="stat-icon"><SafeIcon icon={icon} /></span><p>{label}</p><strong>{value}</strong><span>{detail}</span></div>;}
function PanelTitle({title,subtitle}) {return <div className="panel-title"><div><h2>{title}</h2><p>{subtitle}</p></div></div>;}
function Empty({text}) {return <div className="empty-state"><span className="empty-dot"><SafeIcon icon={FiIcons.FiSun} /></span><p>{text}</p></div>;}
function Attention({title,value,detail}) {return <div className="attention-row"><div><strong>{title}</strong><span>{detail}</span></div><b>{value}</b></div>;}
export function Status({status}) {return <span className={`status status-${String(status).replace('-','')}`}>{status}</span>;}
