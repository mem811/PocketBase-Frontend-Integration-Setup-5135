import {useEffect,useState} from 'react';
import {pb,money,formatDate} from '../lib/pocketbase';
import {pocketBaseErrorMessage} from '../lib/pocketbaseErrors';
import {archiveClient,permanentlyDeleteClient} from '../lib/clientLifecycle';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../common/SafeIcon';
import {Status} from './TrainerDashboard';
import WeeklyScheduleManager from './WeeklyScheduleManager';
import ClientProfileEditor from './ClientProfileEditor';
import PackageBillingSummary from './PackageBillingSummary';
import ExerciseProgressChart from './ExerciseProgressChart';

const today=()=>new Date().toISOString().slice(0,10);
function dateValue(value){return value?new Date(`${value}T00:00:00.000Z`).toISOString():'';}
function expiryFrom(start,weeks){if(!start||!weeks)return '';const date=new Date(`${start}T12:00:00`);date.setDate(date.getDate()+Number(weeks)*7);return date.toISOString().slice(0,10);}
function packageFromTemplate(template,start=today()){
  return {name:template?.name||'',total_sessions:template?.total_sessions||10,price:template?.price??0,start_date:start,expiry_date:expiryFrom(start,template?.expiry_weeks),due_date:start};
}
function noteTimestamp(value){if(!value)return 'Date unavailable';const date=new Date(value);return Number.isNaN(date.getTime())?'Date unavailable':date.toLocaleString('en-US',{dateStyle:'medium',timeStyle:'short'});}

export default function ClientDetail({client,onBack,onRemoved}) {
  const [profile,setProfile]=useState(client);
  const [editing,setEditing]=useState(false);
  const [data,setData]=useState({packages:[],sessions:[],workouts:[],payments:[],privateNotes:[]});
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
    setError('');
    load().catch((err)=>setError(pocketBaseErrorMessage(err,'Unable to load this client’s details.')));
    pb.collection('package_templates').getFullList({sort:'name'})
      .then((rows)=>setTemplates(rows.filter((item)=>item.active)))
      .catch((err)=>{
        setTemplates([]);
        setError(pocketBaseErrorMessage(err,err?.message||'Unable to load active package templates.'));
      });
  },[client.id]);

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
      status:packageForm.status||'active'
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
    }catch(err){setError(pocketBaseErrorMessage(err,err?.message||'Could not resend the login link.'));}
  }

  async function recordPayment(){
    if(!data.packages.length)return window.alert('Add a package before recording a payment.');
    const amount=Number(window.prompt('Payment amount'));
    if(!amount||amount<0)return;
    try{
      await pb.collection('payments').create({client:client.id,package:data.packages[0].id,amount,date:new Date().toISOString(),method:'cash',note:''});
      await load();
    }catch(err){setError(pocketBaseErrorMessage(err,'Could not record the payment.'));}
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

  return <>
    <header className="page-heading">
      <div><button className="back-link" onClick={onBack}><SafeIcon icon={FiIcons.FiArrowLeft}/> All clients</button><p className="eyebrow">CLIENT PROFILE</p><h1>{profile.name}</h1><p className="muted">{profile.email} · {profile.phone}</p></div>
      <div className="heading-actions">
        <button className="button button-secondary" onClick={()=>openPackageForm()}><SafeIcon icon={FiIcons.FiPlus}/> Add package</button>
        <button className="button button-primary" onClick={recordPayment}><SafeIcon icon={FiIcons.FiDollarSign}/> Record payment</button>
        <button className="button button-quiet" onClick={resendLogin} disabled={!profile.email}><SafeIcon icon={FiIcons.FiMail}/> Resend login</button>
        <button className="text-button" type="button" aria-label="Client actions" aria-expanded={clientMenuOpen} onClick={()=>setClientMenuOpen((value)=>!value)} disabled={lifecycleBusy}>⋯</button>
        {clientMenuOpen&&<div className="row-actions">
          <button className="text-button" type="button" onClick={archiveThisClient} disabled={lifecycleBusy}>Archive client</button>
          <button className="text-button danger-text" type="button" onClick={()=>{setClientMenuOpen(false);setShowDeleteDialog(true);setDeleteName('');}}>Delete permanently</button>
        </div>}
      </div>
    </header>
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
      <article className="panel">
        <div className="panel-title"><div><h2>Profile &amp; goals</h2></div><button className="text-button" onClick={()=>setEditing((value)=>!value)}>{editing?'Cancel edit':'Edit profile'}</button></div>
        {editing?<ClientProfileEditor client={profile} onCancel={()=>setEditing(false)} onSaved={(updated)=>{setProfile(updated);setEditing(false);setError('');}}/>:<><p className="detail-copy">{profile.goals||'No goals added yet.'}</p><h3 className="subheading">Health / injury notes</h3><p className="detail-copy">{profile.health_notes||'Nothing noted.'}</p></>}
      </article>
      <article className="panel">
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
      <article className="panel">
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
      <article className="panel">
        <PanelTitle title="Sessions"/>
        <div className="list-stack">{data.sessions.length?data.sessions.map((session)=><div className="list-row" key={session.id}><div className="row-main"><strong>{session.expand?.slot?.date?formatDate(session.expand.slot.date):'Session'}</strong><span>{session.expand?.slot?.start||''} · {session.trainer_notes||'No workout notes'}</span></div><Status status={session.status}/></div>):<Empty text="No sessions recorded yet."/>}</div>
      </article>
      <article className="panel">
        <PanelTitle title="Payments &amp; workouts"/>
        <div className="list-stack">
          {data.payments.map((payment)=><div className="list-row" key={payment.id}><div className="row-main"><strong>{money(payment.amount)}</strong><span>{formatDate(payment.date)} · {payment.method}</span></div><span className="status status-completed">Payment</span></div>)}
          {data.workouts.map((workout)=><div className="list-row" key={workout.id}><div className="row-main"><strong>Workout logged</strong><span>{formatDate(workout.date)} · {workout.notes||'No notes'}</span></div></div>)}
          {!data.payments.length&&!data.workouts.length&&<Empty text="Payments and workouts will show here."/>}
        </div>
      </article>
    </section>
    <ExerciseProgressChart workouts={data.workouts}/>
    <WeeklyScheduleManager client={profile}/>
  </>;
}

function PanelTitle({title}){return <div className="panel-title"><div><h2>{title}</h2></div></div>;}
function Empty({text}){return <div className="empty-state"><p>{text}</p></div>;}
