import {useEffect,useRef,useState} from 'react';
import {pb,money,formatDate,formatTime} from '../lib/pocketbase';
import {pocketBaseErrorMessage} from '../lib/pocketbaseErrors';
import {archiveClient,permanentlyDeleteClient} from '../lib/clientLifecycle';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../common/SafeIcon';
import {Status} from './TrainerDashboard';
import SessionConfirmedBadge from './SessionConfirmedBadge';
import WeeklyScheduleManager from './WeeklyScheduleManager';
import ClientProfileEditor from './ClientProfileEditor';
import PackageBillingSummary from './PackageBillingSummary';
import ExerciseProgressChart from './ExerciseProgressChart';

const today=()=>localDateKey(new Date());
function dateValue(value){return value?new Date(`${value}T12:00:00.000Z`).toISOString():'';}
function expiryFrom(start,weeks){if(!start||!weeks)return '';const date=new Date(`${start}T12:00:00`);date.setDate(date.getDate()+Number(weeks)*7);return localDateKey(date);}
function packageFromTemplate(template,start=today()){
  return {name:template?.name||'',total_sessions:template?.total_sessions||10,price:template?.price??0,start_date:start,expiry_date:expiryFrom(start,template?.expiry_weeks),due_date:start};
}
function noteTimestamp(value){if(!value)return 'Date unavailable';const date=new Date(value);return Number.isNaN(date.getTime())?'Date unavailable':date.toLocaleString('en-US',{dateStyle:'medium',timeStyle:'short'});}
function localDateKey(date){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;}
function storedClientTab(clientId){
  try{
    const saved=localStorage.getItem(`client-detail-tab-${clientId}`);
    return ['overview','sessions','payments','workouts','notes'].includes(saved)?saved:'overview';
  }catch{return 'overview';}
}

export default function ClientDetail({client,onBack,onRemoved}) {
  const [profile,setProfile]=useState(client);
  const [editing,setEditing]=useState(false);
  const [data,setData]=useState({packages:[],sessions:[],workouts:[],payments:[],privateNotes:[]});
  const [weeklySchedules,setWeeklySchedules]=useState([]);
  const [templates,setTemplates]=useState([]);
  const [packageForm,setPackageForm]=useState(null);
  const [selectedTemplate,setSelectedTemplate]=useState('');
  const [newNote,setNewNote]=useState('');
  const [editingNote,setEditingNote]=useState(null);
  const [editNoteText,setEditNoteText]=useState('');
  const [openNoteMenu,setOpenNoteMenu]=useState('');
  const [showAllNotes,setShowAllNotes]=useState(false);
  const [error,setError]=useState('');
  const [inviteMessage,setInviteMessage]=useState('');
  const [clientMenuOpen,setClientMenuOpen]=useState(false);
  const [showDeleteDialog,setShowDeleteDialog]=useState(false);
  const [deleteName,setDeleteName]=useState('');
  const [lifecycleBusy,setLifecycleBusy]=useState(false);
  const [tab,setTab]=useState(()=>storedClientTab(client.id));
  const clientMenuRef=useRef(null);

  async function load(){
    const [packages,sessions,workouts,payments,privateNotes]=await Promise.all([
      pb.collection('packages').getFullList({filter:`client="${client.id}"`}),
      pb.collection('sessions').getFullList({filter:`client="${client.id}"`,expand:'slot',sort:'-created'}),
      pb.collection('workouts').getFullList({filter:`client="${client.id}"`,sort:'-date'}),
      pb.collection('payments').getFullList({filter:`client="${client.id}"`,sort:'-date'}),
      pb.collection('trainer_private_notes').getFullList({filter:`client="${client.id}"`,sort:'-created'})
    ]);
    setData({packages,sessions,workouts,payments,privateNotes});
  }

  useEffect(()=>{
    setProfile(client);
    setTab(storedClientTab(client.id));
    setError('');
    load().catch((err)=>setError(pocketBaseErrorMessage(err,'Unable to load this client’s details.')));
    pb.collection('recurring_schedules').getFullList({filter:`client="${client.id}"`})
      .then(setWeeklySchedules)
      .catch((err)=>setError(pocketBaseErrorMessage(err,'Unable to load this client’s weekly times.')));
    pb.collection('package_templates').getFullList({sort:'name'})
      .then((rows)=>setTemplates(rows.filter((item)=>item.active)))
      .catch((err)=>{
        setTemplates([]);
        setError(pocketBaseErrorMessage(err,err?.message||'Unable to load active package templates.'));
      });
  },[client.id]);

  useEffect(()=>{
    async function refreshWeeklyData(){
      try{
        const [schedules]=await Promise.all([
          pb.collection('recurring_schedules').getFullList({filter:`client="${client.id}"`}),
          load()
        ]);
        setWeeklySchedules(schedules);
      }catch(err){setError(pocketBaseErrorMessage(err,'Unable to refresh weekly schedules.'));}
    }
    window.addEventListener('weekly-schedules-updated',refreshWeeklyData);
    return ()=>window.removeEventListener('weekly-schedules-updated',refreshWeeklyData);
  },[client.id]);

  useEffect(()=>{
    if(!clientMenuOpen)return undefined;
    function closeOutside(event){
      if(!clientMenuRef.current?.contains(event.target))setClientMenuOpen(false);
    }
    function closeOnEscape(event){
      if(event.key==='Escape')setClientMenuOpen(false);
    }
    document.addEventListener('pointerdown',closeOutside);
    document.addEventListener('keydown',closeOnEscape);
    return ()=>{
      document.removeEventListener('pointerdown',closeOutside);
      document.removeEventListener('keydown',closeOnEscape);
    };
  },[clientMenuOpen]);

  function changeTab(next){
    setTab(next);
    try{localStorage.setItem(`client-detail-tab-${client.id}`,next);}catch{}
  }

  function openPackageForm(item=null){
    setSelectedTemplate('');
    setPackageForm(item?{...item,start_date:String(item.start_date||'').slice(0,10),expiry_date:String(item.expiry_date||'').slice(0,10),due_date:String(item.due_date||'').slice(0,10)}:packageFromTemplate(templates.find((template)=>template.is_default)||templates[0]));
  }

  function chooseTemplate(id){
    const chosen=templates.find((item)=>item.id===id);
    setSelectedTemplate(id);
    setPackageForm({...packageFromTemplate(chosen,packageForm?.start_date||today()),...(packageForm?.id?{id:packageForm.id}: {})});
  }

  async function savePackage(event){
    event.preventDefault();
    setError('');
    const values={
      client:client.id,
      name:packageForm.name,
      total_sessions:Number(packageForm.total_sessions),
      price:Number(packageForm.price),
      start_date:dateValue(packageForm.start_date),
      expiry_date:dateValue(packageForm.expiry_date),
      due_date:dateValue(packageForm.due_date),
      status:'active'
    };
    try{
      if(packageForm.id) await pb.collection('packages').update(packageForm.id,values);
      else await pb.collection('packages').create(values);
      setPackageForm(null);
      await load();
    }catch(err){setError(pocketBaseErrorMessage(err,err?.message||'Could not save the package.'));}
  }

  async function saveNewNote(event){
    event.preventDefault();
    const notes=newNote.trim();
    if(!notes)return;
    setError('');
    try{
      await pb.collection('trainer_private_notes').create({client:client.id,notes});
      setNewNote('');
      setOpenNoteMenu('');
      await load();
    }catch(err){setError(pocketBaseErrorMessage(err,'Could not save the note.'));}
  }

  function beginEditNote(note){setEditingNote(note.id);setEditNoteText(note.notes||'');setOpenNoteMenu('');}

  async function saveEditedNote(note){
    const notes=editNoteText.trim();
    if(!notes)return;
    setError('');
    try{
      await pb.collection('trainer_private_notes').update(note.id,{notes});
      setEditingNote(null);
      setEditNoteText('');
      await load();
    }catch(err){setError(pocketBaseErrorMessage(err,'Could not update the note.'));}
  }

  async function deleteNote(note){
    if(!window.confirm('Delete this note? This cannot be undone.'))return;
    setError('');
    try{
      await pb.collection('trainer_private_notes').delete(note.id);
      if(editingNote===note.id)setEditingNote(null);
      setOpenNoteMenu('');
      await load();
    }catch(err){setError(pocketBaseErrorMessage(err,'Could not delete the note.'));}
  }

  async function resendLogin(){
    setError('');
    setInviteMessage('');
    try{
      await pb.collection('users').requestPasswordReset(profile.email);
      setInviteMessage(`Login link sent to ${profile.email}`);
      setClientMenuOpen(false);
    }catch(err){setError(pocketBaseErrorMessage(err,err?.message||'Could not resend the login link.'));}
  }

  async function recordPayment(){
    if(!data.packages.length)return window.alert('Add a package before recording a payment.');
    const amount=Number(window.prompt('Payment amount'));
    if(!amount||amount<0)return;
    try{
      await pb.collection('payments').create({client:client.id,package:data.packages[0].id,amount,date:new Date(`${today()}T12:00:00.000Z`).toISOString(),method:'cash',note:''});
      await load();
    }catch(err){setError(pocketBaseErrorMessage(err,'Could not record the payment.'));}
  }

  async function scheduleSession(){
    setError('');
    try{
      const slots=await pb.collection('availability').getFullList({filter:'status="open"',sort:'date,start'});
      const upcoming=slots.filter((slot)=>String(slot.date||'').slice(0,10)>=today());
      if(!upcoming.length)return setError('No open availability slots are available.');
      const choice=window.prompt(`Choose an open slot by number:\n${upcoming.map((slot,index)=>`${index+1}. ${formatDate(slot.date)} · ${formatTime(slot.start)}–${formatTime(slot.end)}`).join('\n')}`,'1');
      if(choice===null)return;
      const slot=upcoming[Number(choice)-1];
      if(!slot)return setError('Choose a valid slot number.');
      await pb.collection('availability').update(slot.id,{status:'booked'});
      try{
        await pb.collection('sessions').create({client:client.id,slot:slot.id,status:'confirmed',client_confirmed:false,client_notes:''});
      }catch(err){
        await pb.collection('availability').update(slot.id,{status:'open'}).catch(()=>{});
        throw err;
      }
      await load();
    }catch(err){setError(pocketBaseErrorMessage(err,err?.message||'Could not schedule this session.'));}
  }

  async function archiveThisClient(){
    if(!window.confirm(`Archive ${profile.name}? Future unfinished sessions will be removed and weekly times paused.`))return;
    setLifecycleBusy(true);
    setError('');
    try{
      await archiveClient(profile);
      onRemoved?.(`${profile.name} was archived. Future sessions were removed and weekly times paused.`);
    }catch(err){
      setError(`${pocketBaseErrorMessage(err,err?.message||'Could not archive this client.')} Earlier steps, if any, may already have been applied.`);
    }finally{setLifecycleBusy(false);}
  }

  async function deleteThisClient(event){
    event.preventDefault();
    if(deleteName.trim()!==profile.name.trim().split(/\s+/)[0])return;
    setLifecycleBusy(true);
    setError('');
    try{
      await permanentlyDeleteClient(profile);
      onRemoved?.(`${profile.name} was permanently deleted.`);
    }catch(err){
      setError(`${pocketBaseErrorMessage(err,err?.message||'Could not delete this client.')} Earlier steps, if any, may already have been applied.`);
    }finally{setLifecycleBusy(false);}
  }

  const visibleNotes=showAllNotes?data.privateNotes:data.privateNotes.slice(0,5);
  const firstName=profile.name.trim().split(/\s+/)[0];
  const upcomingSessions=data.sessions.filter((session)=>{
    const sessionDay=String(session.expand?.slot?.date||'').slice(0,10);
    return sessionDay>=today()&&!['completed','cancelled','no-show'].includes(session.status);
  }).sort((a,b)=>String(a.expand?.slot?.date||'').localeCompare(String(b.expand?.slot?.date||'')));
  const nextSession=upcomingSessions[0];
  const activePackage=data.packages.find((item)=>item.status==='active')||data.packages[0];
  const completed=activePackage?data.sessions.filter((session)=>session.package===activePackage.id&&session.status==='completed').length:0;
  const remaining=activePackage?Math.max(0,Number(activePackage.total_sessions)-completed):0;
  const balance=data.packages.reduce((sum,item)=>{
    const paid=data.payments.filter((payment)=>payment.package===item.id).reduce((total,payment)=>total+Number(payment.amount||0),0);
    return sum+Math.max(0,Number(item.price||0)-paid);
  },0);
  const overdue=data.packages.some((item)=>{
    const paid=data.payments.filter((payment)=>payment.package===item.id).reduce((total,payment)=>total+Number(payment.amount||0),0);
    return Number(item.price||0)>paid&&item.due_date&&String(item.due_date).slice(0,10)<today();
  });
  const orderedDays=['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
  const dayLabels={monday:'Mon',tuesday:'Tue',wednesday:'Wed',thursday:'Thu',friday:'Fri',saturday:'Sat',sunday:'Sun'};
  const activeSchedules=weeklySchedules.filter((schedule)=>schedule.active).sort((a,b)=>orderedDays.indexOf(a.weekday)-orderedDays.indexOf(b.weekday));
  const weeklyLabel=activeSchedules.length?`${activeSchedules.map((schedule)=>dayLabels[schedule.weekday]||schedule.weekday).join(' and ')} · ${formatTime(activeSchedules[0].start)} to ${formatTime(activeSchedules[0].end)}`:'Not set';
  const nextDate=nextSession?.expand?.slot?.date?new Date(`${String(nextSession.expand.slot.date).slice(0,10)}T12:00:00`):null;
  const nextDateLabel=nextDate?nextDate.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'}):'None scheduled';
  const upcomingGroups=groupByWeek(upcomingSessions);
  const pastSessions=data.sessions.filter((session)=>{
    const sessionDay=String(session.expand?.slot?.date||'').slice(0,10);
    return sessionDay<today()||['completed','cancelled','no-show'].includes(session.status);
  }).sort((a,b)=>String(b.expand?.slot?.date||'').localeCompare(String(a.expand?.slot?.date||'')));
  const pastGroups=groupByWeek(pastSessions);

  return <>
    <header className="page-heading" style={{alignItems:'flex-start'}}>
      <div style={{display:'flex',alignItems:'center',gap:15}}>
        <div className="avatar avatar-large" style={{width:76,height:76,fontSize:30,background:profile.active===false?'var(--blush)':'var(--butter)',boxShadow:'4px 4px 0 var(--ink)'}}>{profile.name?.trim()?.[0]?.toUpperCase()||'C'}</div>
        <div>
          <div><button className="back-link" onClick={onBack}><SafeIcon icon={FiIcons.FiArrowLeft}/> All clients</button><p className="eyebrow">CLIENT PROFILE</p><h1>{profile.name}</h1><p className="muted">{profile.email} · {profile.phone}</p></div>
          <div style={{display:'flex',flexWrap:'wrap',gap:12}}>
            {profile.phone&&<a href={`tel:${profile.phone}`}><SafeIcon icon={FiIcons.FiPhone}/> Call {profile.phone}</a>}
            {profile.email&&<a href={`mailto:${profile.email}`}><SafeIcon icon={FiIcons.FiMail}/> Email {profile.email}</a>}
          </div>
          <div style={{display:'flex',flexWrap:'wrap',gap:8,marginTop:10}}>
            <span className={`status ${profile.active===false?'status-noshow':'status-completed'}`}>{profile.active===false?'Archived':'Active'}</span>
            {nextSession?.client_confirmed&&<span className="status status-completed">Confirmed for next session ✓</span>}
          </div>
        </div>
      </div>
    </header>

    <section className="stat-grid">
      <div className="stat-card"><span className="stat-icon"><SafeIcon icon={FiIcons.FiActivity}/></span><p>Sessions left</p><strong>{activePackage?`${remaining} of ${activePackage.total_sessions}`:'—'}</strong><span>{activePackage?.name||'No active package'}</span>{activePackage&&<div className="progress-track"><span style={{width:`${Math.min(100,completed/Number(activePackage.total_sessions||1)*100)}%`}}/></div>}</div>
      <div className="stat-card" style={{background:balance===0?'var(--mint)':overdue?'var(--blush)':'var(--paper)'}}><span className="stat-icon"><SafeIcon icon={FiIcons.FiDollarSign}/></span><p>Balance owed</p><strong>{money(balance)}</strong><span>{balance===0?'Paid in full':overdue?'Overdue':'Outstanding'}</span></div>
      <div className="stat-card"><span className="stat-icon"><SafeIcon icon={FiIcons.FiCalendar}/></span><p>Next session</p><strong style={{fontSize:20}}>{nextDateLabel}</strong><span>{nextSession?`${formatTime(nextSession.expand?.slot?.start)}–${formatTime(nextSession.expand?.slot?.end)}`:'No upcoming session'}</span></div>
      <div className="stat-card"><span className="stat-icon"><SafeIcon icon={FiIcons.FiClock}/></span><p>Weekly times</p><strong style={{fontSize:18}}>{weeklyLabel.split(' · ')[0]}</strong><span>{weeklyLabel.includes(' · ')?weeklyLabel.split(' · ')[1]:'Add a weekly schedule'}</span></div>
    </section>

    <div className="heading-actions" style={{position:'relative',zIndex:1001,justifyContent:'flex-start',flexWrap:'wrap',overflow:'visible',padding:'3px 4px 9px'}}>
      <button className="button button-secondary" onClick={()=>openPackageForm()}><SafeIcon icon={FiIcons.FiPlus}/> Add package</button>
      <button className="button button-primary" onClick={recordPayment}><SafeIcon icon={FiIcons.FiDollarSign}/> Record payment</button>
      <button className="button button-soft" onClick={scheduleSession}><SafeIcon icon={FiIcons.FiCalendar}/> Schedule session</button>
      <div ref={clientMenuRef} style={{position:'relative',display:'flex',alignItems:'center',gap:5,flex:'0 0 auto'}}>
        <button className="button button-quiet" type="button" aria-expanded={clientMenuOpen} onClick={()=>setClientMenuOpen((value)=>!value)} disabled={lifecycleBusy}><SafeIcon icon={FiIcons.FiMoreHorizontal}/> More</button>
        {clientMenuOpen&&<div className="row-actions" style={{position:'absolute',top:'calc(100% + 6px)',right:0,zIndex:1000,display:'grid',minWidth:190,padding:8,border:'2px solid var(--ink)',borderRadius:14,background:'var(--paper)',boxShadow:'3px 3px 0 var(--ink)'}}>
          <button className="text-button" type="button" onClick={()=>{setEditing(true);changeTab('overview');setClientMenuOpen(false);}}>Edit profile</button>
          <button className="text-button" type="button" onClick={()=>{resendLogin();setClientMenuOpen(false);}} disabled={!profile.email}>Resend login</button>
          <button className="text-button" type="button" onClick={archiveThisClient} disabled={lifecycleBusy}>Archive client</button>
          <button className="text-button danger-text" type="button" onClick={()=>{setClientMenuOpen(false);setShowDeleteDialog(true);setDeleteName('');}}>Delete permanently</button>
        </div>}
      </div>
    </div>

    <div role="tablist" aria-label="Client sections" style={{display:'flex',gap:8,overflowX:'auto',padding:'4px 3px 10px'}}>
      {['overview','sessions','payments','workouts','notes'].map((item)=><button key={item} role="tab" aria-selected={tab===item} className={`button button-small ${tab===item?'button-primary':'button-quiet'}`} onClick={()=>changeTab(item)} style={{flex:'0 0 auto',textTransform:'capitalize'}}>{item}</button>)}
    </div>

    {showDeleteDialog&&<section className="panel form-panel" role="dialog" aria-modal="true" aria-labelledby="delete-client-title">
      <div className="panel-title"><div><h2 id="delete-client-title">Delete {profile.name} permanently?</h2><p>This erases their sessions, packages, payments, workouts, notes, weekly times, and login. This cannot be undone.</p></div></div>
      <form className="form-grid" onSubmit={deleteThisClient}>
        <label className="form-span">Type <strong>{firstName}</strong> to confirm<input autoComplete="off" value={deleteName} onChange={(event)=>setDeleteName(event.target.value)} required /></label>
        {error&&<p className="error-text form-span">{error}</p>}
        <div className="form-actions form-span"><button type="button" className="button button-quiet" onClick={()=>setShowDeleteDialog(false)} disabled={lifecycleBusy}>Cancel</button><button className="button button-primary" disabled={lifecycleBusy||deleteName.trim()!==firstName}>{lifecycleBusy?'Deleting…':'Delete permanently'}</button></div>
      </form>
    </section>}
    {inviteMessage&&<div className="notice notice-success">{inviteMessage}</div>}
    {error&&!showDeleteDialog&&<div className="notice notice-error">{error}</div>}
    {packageForm&&<section className="panel form-panel">
      <div className="panel-title"><div><h2>{packageForm.id?'Edit package':'Add package'}</h2><p>Choose a standard plan or customize every field for this client.</p></div></div>
      <form className="form-grid" onSubmit={savePackage}>
        <label className="form-span">Start from a template
          <select value={selectedTemplate} onChange={(event)=>chooseTemplate(event.target.value)}>
            <option value="">Custom</option>
            {templates.map((item)=><option key={item.id} value={item.id}>{item.name}{item.is_default?' · Default':''}</option>)}
          </select>
        </label>
        <label>Package name<input required value={packageForm.name} onChange={(event)=>setPackageForm({...packageForm,name:event.target.value})}/></label>
        <label>Total sessions<input type="number" min="1" required value={packageForm.total_sessions} onChange={(event)=>setPackageForm({...packageForm,total_sessions:event.target.value})}/></label>
        <label>Price<input type="number" min="0" step="0.01" required value={packageForm.price} onChange={(event)=>setPackageForm({...packageForm,price:event.target.value})}/></label>
        <label>Start date<input type="date" required value={packageForm.start_date} onChange={(event)=>setPackageForm({...packageForm,start_date:event.target.value,due_date:packageForm.due_date===packageForm.start_date?event.target.value:packageForm.due_date})}/></label>
        <label>Payment due date<input type="date" value={packageForm.due_date} onChange={(event)=>setPackageForm({...packageForm,due_date:event.target.value})}/></label>
        <label>Expiry date <span className="muted">(optional)</span><input type="date" value={packageForm.expiry_date} onChange={(event)=>setPackageForm({...packageForm,expiry_date:event.target.value})}/></label>
        <div className="form-actions form-span"><button type="button" className="button button-quiet" onClick={()=>setPackageForm(null)}>Cancel</button><button className="button button-primary">Save package</button></div>
      </form>
    </section>}
    <section className="detail-grid">
      <article className="panel" style={{display:tab==='overview'?'':'none'}}>
        <div className="panel-title"><div><h2>Profile &amp; goals</h2></div><button className="text-button" onClick={()=>setEditing((value)=>!value)}>{editing?'Cancel edit':'Edit profile'}</button></div>
        {editing?<ClientProfileEditor client={profile} onCancel={()=>setEditing(false)} onSaved={(updated)=>{setProfile(updated);setEditing(false);setError('');}}/>:<><p className="detail-copy">{profile.goals||'No goals added yet.'}</p><h3 className="subheading">Health / injury notes</h3><p className="detail-copy">{profile.health_notes||'Nothing noted.'}</p></>}
      </article>
      <article className="panel" style={{display:tab==='notes'?'':'none'}}>
        <PanelTitle title="Trainer-only notes"/>
        <form className="stack-form" onSubmit={saveNewNote}><label>Add note<textarea rows="3" value={newNote} onChange={(event)=>setNewNote(event.target.value)} placeholder="Write a note to remember about this client…"/></label><button className="button button-primary" disabled={!newNote.trim()}>Save note</button></form>
        <div className="list-stack section-gap">
          {visibleNotes.map((note)=><article className="list-row" key={note.id}>
            <div className="row-main"><span>{noteTimestamp(note.created)}</span>{editingNote===note.id?<div className="stack-form"><textarea rows="3" value={editNoteText} onChange={(event)=>setEditNoteText(event.target.value)} aria-label="Edit trainer note"/><div className="row-actions"><button type="button" className="text-button" onClick={()=>setEditingNote(null)}>Cancel</button><button type="button" className="text-button" disabled={!editNoteText.trim()} onClick={()=>saveEditedNote(note)}>Save</button></div></div>:<p className="detail-copy">{note.notes}</p>}</div>
            {editingNote!==note.id&&<div className="row-actions"><button type="button" className="text-button" aria-label="Note actions" aria-expanded={openNoteMenu===note.id} onClick={()=>setOpenNoteMenu(openNoteMenu===note.id?'':note.id)}>⋯</button>{openNoteMenu===note.id&&<><button type="button" className="text-button" onClick={()=>beginEditNote(note)}>Edit</button><button type="button" className="text-button danger-text" onClick={()=>deleteNote(note)}>Delete</button></>}</div>}
          </article>)}
          {!data.privateNotes.length&&<div className="empty-state"><p>No notes yet. Jot down anything you want to remember about this client.</p></div>}
        </div>
        {data.privateNotes.length>5&&<button type="button" className="text-button" onClick={()=>setShowAllNotes((value)=>!value)}>{showAllNotes?'Show fewer notes':'Show all notes'}</button>}
      </article>
      <article className="panel" style={{display:tab==='overview'?'':'none'}}>
        <PanelTitle title="Packages"/>
        <div className="list-stack">
          {data.packages.length?data.packages.map((item)=>{
            const completed=data.sessions.filter((session)=>session.package===item.id&&session.status==='completed').length;
            const left=Math.max(0,item.total_sessions-completed);
            return <div className="package-row" key={item.id}>
              <div className="package-meta"><strong>{item.name}</strong><span>{left} of {item.total_sessions} sessions left</span></div>
              <div className="row-actions"><button className="text-button" onClick={()=>openPackageForm(item)}>Edit</button></div>
              <div className="progress-track"><span style={{width:`${Math.min(100,completed/item.total_sessions*100)}%`}}/></div>
              <PackageBillingSummary packageRecord={item} payments={data.payments}/>
            </div>;
          }):<Empty text="No package on this profile yet."/>}
        </div>
      </article>
      <article className="panel" style={{display:tab==='sessions'?'':'none'}}>
        <PanelTitle title="Sessions"/>
        <div className="list-stack">{data.sessions.length?data.sessions.map((session)=><div className="list-row" key={session.id}><div className="row-main"><strong>{session.expand?.slot?.date?formatDate(session.expand.slot.date):'Session'}</strong><span>{formatTime(session.expand?.slot?.start)} · {session.trainer_notes||'No workout notes'}</span></div><SessionConfirmedBadge confirmed={session.client_confirmed}/><Status status={session.status}/></div>):<Empty text="No sessions recorded yet."/>}</div>
        {upcomingGroups.map((group)=><div key={group.label}><h3 className="subheading">{group.label}</h3><SessionRows sessions={group.sessions}/></div>)}
        {pastGroups.length>0&&<><h3 className="subheading">Past sessions</h3>{pastGroups.map((group)=><div key={group.label}><h3 className="subheading">{group.label}</h3><SessionRows sessions={group.sessions}/></div>)}</>}
      </article>
      <article className="panel" style={{display:['payments','workouts'].includes(tab)?'':'none'}}>
        <PanelTitle title={tab==='payments'?'Payments':'Workouts'}/>
        <div className="list-stack">
          {tab==='payments'&&data.payments.map((payment)=><div className="list-row" key={payment.id}><div className="row-main"><strong>{money(payment.amount)}</strong><span>{formatDate(payment.date)} · {payment.method}</span></div><span className="status status-completed">Payment</span></div>)}
          {tab==='payments'&&data.packages.map((item)=><div className="package-row" key={item.id}><div className="package-meta"><strong>{item.name}</strong><span>{money(item.price)} · Package billing</span></div><PackageBillingSummary packageRecord={item} payments={data.payments}/></div>)}
          {tab==='workouts'&&[...data.workouts].sort((a,b)=>new Date(b.date)-new Date(a.date)).map((workout)=><div className="list-row" key={workout.id}><div className="row-main"><strong>Workout logged · {formatDate(workout.date)}</strong><span>{workout.logged_by==='client'?'Client logged':'Trainer logged'} · {workout.notes||'No notes'}</span>{Array.isArray(workout.exercises)&&workout.exercises.map((exercise,index)=><span key={`${exercise.name}-${index}`}>{exercise.name} · {exercise.sets||'—'} sets × {exercise.reps||'—'} reps{exercise.weight?` · ${exercise.weight}`:''}</span>)}</div></div>)}
          {tab==='payments'&&!data.payments.length&&!data.packages.length&&<Empty text="Payments will show here."/>}
          {tab==='workouts'&&!data.workouts.length&&<Empty text="Workouts will show here."/>}
        </div>
        {tab==='workouts'&&<ExerciseProgressChart workouts={data.workouts}/>}
      </article>
      <article className="panel panel-wide" style={{display:tab==='overview'?'':'none'}}>
        <WeeklyScheduleManager client={profile}/>
      </article>
    </section>
  </>;
}

function groupByWeek(sessions){
  const groups=new Map();
  sessions.forEach((session)=>{
    const value=String(session.expand?.slot?.date||'').slice(0,10);
    if(!value)return;
    const date=new Date(`${value}T12:00:00`);
    date.setDate(date.getDate()-((date.getDay()+6)%7));
    const key=localDateKey(date);
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(session);
  });
  return [...groups.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([start,items])=>{
    const date=new Date(`${start}T12:00:00`);
    const end=new Date(date);
    end.setDate(end.getDate()+6);
    const label=start===weekStartForToday()?'This week':start===weekStartForNextWeek()?'Next week':`${date.toLocaleDateString('en-US',{month:'short',day:'numeric'})} – ${end.toLocaleDateString('en-US',{month:'short',day:'numeric'})}`;
    return {label,sessions:items};
  });
}
function weekStartForToday(){
  const date=new Date();
  date.setDate(date.getDate()-((date.getDay()+6)%7));
  return localDateKey(date);
}
function weekStartForNextWeek(){
  const date=new Date();
  date.setDate(date.getDate()-((date.getDay()+6)%7)+7);
  return localDateKey(date);
}
function SessionRows({sessions}){
  return <div className="list-stack">{sessions.map((session)=><div className="list-row" key={session.id}><div className="row-main"><strong>{formatDate(session.expand?.slot?.date)} · {formatTime(session.expand?.slot?.start)}–{formatTime(session.expand?.slot?.end)}</strong><span>{session.trainer_notes||session.client_notes||'Training session'}</span></div><SessionConfirmedBadge confirmed={session.client_confirmed}/><Status status={session.status}/></div>)}</div>;
}
function PanelTitle({title}){return <div className="panel-title"><div><h2>{title}</h2></div></div>;}
function Empty({text}){return <div className="empty-state"><p>{text}</p></div>;}
