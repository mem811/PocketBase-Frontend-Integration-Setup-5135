import {useEffect,useState} from 'react';
import {pb,money,formatDate} from '../lib/pocketbase';
import {pocketBaseErrorMessage} from '../lib/pocketbaseErrors';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../common/SafeIcon';
import {Status} from './TrainerDashboard';
import WeeklyScheduleManager from './WeeklyScheduleManager';
import ClientProfileEditor from './ClientProfileEditor';

const today=()=>new Date().toISOString().slice(0,10);

function dateValue(value) {
  return value ? new Date(`${value}T00:00:00.000Z`).toISOString() : '';
}

function expiryFrom(start,weeks) {
  if (!start || !weeks) return '';
  const date=new Date(`${start}T12:00:00`);
  date.setDate(date.getDate()+Number(weeks)*7);
  return date.toISOString().slice(0,10);
}

function packageFromTemplate(template,start=today()) {
  return {
    name:template?.name||'',
    total_sessions:template?.total_sessions||10,
    price:template?.price??0,
    start_date:start,
    expiry_date:expiryFrom(start,template?.expiry_weeks)
  };
}

function noteTimestamp(value) {
  if (!value) return 'Date unavailable';
  const date=new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return date.toLocaleString('en-US',{
    dateStyle:'medium',
    timeStyle:'short'
  });
}

export default function ClientDetail({client,onBack}) {
  const [profile,setProfile]=useState(client);
  const [editing,setEditing]=useState(false);
  const [data,setData]=useState({
    packages:[],
    sessions:[],
    workouts:[],
    payments:[],
    privateNotes:[]
  });
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

  async function load() {
    const [packages,sessions,workouts,payments,privateNotes]=await Promise.all([
      pb.collection('packages').getFullList({filter:`client="${client.id}"`}),
      pb.collection('sessions').getFullList({
        filter:`client="${client.id}"`,
        expand:'slot',
        sort:'-created'
      }),
      pb.collection('workouts').getFullList({
        filter:`client="${client.id}"`,
        sort:'-date'
      }),
      pb.collection('payments').getFullList({
        filter:`client="${client.id}"`,
        sort:'-date'
      }),
      pb.collection('trainer_private_notes').getFullList({
        filter:`client="${client.id}"`,
        sort:'-created'
      })
    ]);
    setData({packages,sessions,workouts,payments,privateNotes});
  }

  useEffect(()=>{
    setProfile(client);
    setError('');
    load().catch((err)=>setError(
      pocketBaseErrorMessage(err,'Unable to load this client’s details.')
    ));
    pb.collection('package_templates')
      .getFullList({filter:'active=true',sort:'name'})
      .then(setTemplates)
      .catch(()=>setTemplates([]));
  },[client.id]);

  function openPackageForm() {
    const active=templates.filter((item)=>item.active);
    const chosen=active.find((item)=>item.is_default)||active[0];
    setSelectedTemplate(chosen?.id||'');
    setPackageForm(packageFromTemplate(chosen));
  }

  function chooseTemplate(id) {
    const chosen=templates.find((item)=>item.id===id);
    setSelectedTemplate(id);
    setPackageForm(packageFromTemplate(chosen));
  }

  async function savePackage(event) {
    event.preventDefault();
    setError('');
    try {
      await pb.collection('packages').create({
        client:client.id,
        name:packageForm.name,
        total_sessions:Number(packageForm.total_sessions),
        price:Number(packageForm.price),
        start_date:dateValue(packageForm.start_date),
        expiry_date:dateValue(packageForm.expiry_date),
        status:'active'
      });
      setPackageForm(null);
      await load();
    } catch (err) {
      setError(pocketBaseErrorMessage(err,'Could not add the package.'));
    }
  }

  async function saveNewNote(event) {
    event.preventDefault();
    const notes=newNote.trim();
    if (!notes) return;
    setError('');
    try {
      await pb.collection('trainer_private_notes').create({
        client:client.id,
        notes
      });
      setNewNote('');
      setOpenNoteMenu('');
      await load();
    } catch (err) {
      setError(pocketBaseErrorMessage(err,'Could not save the note.'));
    }
  }

  function beginEditNote(note) {
    setEditingNote(note.id);
    setEditNoteText(note.notes||'');
    setOpenNoteMenu('');
  }

  async function saveEditedNote(note) {
    const notes=editNoteText.trim();
    if (!notes) return;
    setError('');
    try {
      await pb.collection('trainer_private_notes').update(note.id,{notes});
      setEditingNote(null);
      setEditNoteText('');
      await load();
    } catch (err) {
      setError(pocketBaseErrorMessage(err,'Could not update the note.'));
    }
  }

  async function deleteNote(note) {
    if (!window.confirm('Delete this note? This cannot be undone.')) return;
    setError('');
    try {
      await pb.collection('trainer_private_notes').delete(note.id);
      if (editingNote===note.id) setEditingNote(null);
      setOpenNoteMenu('');
      await load();
    } catch (err) {
      setError(pocketBaseErrorMessage(err,'Could not delete the note.'));
    }
  }

  async function resendLogin() {
    setError('');
    setInviteMessage('');
    try {
      await pb.collection('users').requestPasswordReset(profile.email);
      setInviteMessage(`Login link sent to ${profile.email}`);
    } catch (err) {
      setError(pocketBaseErrorMessage(
        err,
        err?.message||'Could not resend the login link.'
      ));
    }
  }

  async function recordPayment() {
    if (!data.packages.length) {
      return window.alert('Add a package before recording a payment.');
    }
    const amount=Number(window.prompt('Payment amount'));
    if (!amount||amount<0) return;
    try {
      await pb.collection('payments').create({
        client:client.id,
        package:data.packages[0].id,
        amount,
        date:new Date().toISOString(),
        method:'cash',
        note:''
      });
      await load();
    } catch (err) {
      setError(pocketBaseErrorMessage(err,'Could not record the payment.'));
    }
  }

  async function editNotes() {
    const notes=window.prompt(
      'Trainer-only private notes',
      data.privateNotes[0]?.notes||''
    );
    if (notes===null) return;
    try {
      if (data.privateNotes[0]) {
        await pb.collection('trainer_private_notes').update(
          data.privateNotes[0].id,
          {notes}
        );
      } else {
        await pb.collection('trainer_private_notes').create({
          client:client.id,
          notes
        });
      }
      await load();
    } catch (err) {
      setError(pocketBaseErrorMessage(err,'Could not save private notes.'));
    }
  }

  const visibleNotes=showAllNotes
    ? data.privateNotes
    : data.privateNotes.slice(0,5);

  return <>
    <header className="page-heading">
      <div>
        <button className="back-link" onClick={onBack}>
          <SafeIcon icon={FiIcons.FiArrowLeft}/> All clients
        </button>
        <p className="eyebrow">CLIENT PROFILE</p>
        <h1>{profile.name}</h1>
        <p className="muted">{profile.email} · {profile.phone}</p>
      </div>
      <div className="heading-actions">
        <button className="button button-secondary" onClick={openPackageForm}>
          <SafeIcon icon={FiIcons.FiPlus}/> Add package
        </button>
        <button className="button button-primary" onClick={recordPayment}>
          <SafeIcon icon={FiIcons.FiDollarSign}/> Record payment
        </button>
        <button
          className="button button-quiet"
          onClick={resendLogin}
          disabled={!profile.email}
        >
          <SafeIcon icon={FiIcons.FiMail}/> Resend login
        </button>
      </div>
    </header>

    {inviteMessage&&<div className="notice notice-success">{inviteMessage}</div>}
    {error&&<div className="notice notice-error">{error}</div>}

    {packageForm&&<section className="panel form-panel">
      <div className="panel-title">
        <div>
          <h2>Add package</h2>
          <p>Choose a standard plan or customize every field for this client.</p>
        </div>
      </div>
      <form className="form-grid" onSubmit={savePackage}>
        <label className="form-span">
          Start from a template
          <select
            value={selectedTemplate}
            onChange={(event)=>chooseTemplate(event.target.value)}
          >
            <option value="">Custom</option>
            {templates.filter((item)=>item.active).map((item)=>
              <option key={item.id} value={item.id}>
                {item.name}{item.is_default?' · Default':''}
              </option>
            )}
          </select>
        </label>
        <label>
          Package name
          <input
            required
            value={packageForm.name}
            onChange={(event)=>setPackageForm({
              ...packageForm,
              name:event.target.value
            })}
          />
        </label>
        <label>
          Total sessions
          <input
            type="number"
            min="1"
            required
            value={packageForm.total_sessions}
            onChange={(event)=>setPackageForm({
              ...packageForm,
              total_sessions:event.target.value
            })}
          />
        </label>
        <label>
          Price
          <input
            type="number"
            min="0"
            step="0.01"
            required
            value={packageForm.price}
            onChange={(event)=>setPackageForm({
              ...packageForm,
              price:event.target.value
            })}
          />
        </label>
        <label>
          Start date
          <input
            type="date"
            required
            value={packageForm.start_date}
            onChange={(event)=>setPackageForm({
              ...packageForm,
              start_date:event.target.value
            })}
          />
        </label>
        <label className="form-span">
          Expiry date <span className="muted">(optional)</span>
          <input
            type="date"
            value={packageForm.expiry_date}
            onChange={(event)=>setPackageForm({
              ...packageForm,
              expiry_date:event.target.value
            })}
          />
        </label>
        <div className="form-actions form-span">
          <button
            type="button"
            className="button button-quiet"
            onClick={()=>setPackageForm(null)}
          >
            Cancel
          </button>
          <button className="button button-primary">Save package</button>
        </div>
      </form>
    </section>}

    <section className="detail-grid">
      <article className="panel">
        <div className="panel-title">
          <div><h2>Profile &amp; goals</h2></div>
          <button
            className="text-button"
            onClick={()=>setEditing((value)=>!value)}
          >
            {editing?'Cancel edit':'Edit profile'}
          </button>
        </div>
        {editing
          ? <ClientProfileEditor
              client={profile}
              onCancel={()=>setEditing(false)}
              onSaved={(updated)=>{
                setProfile(updated);
                setEditing(false);
                setError('');
              }}
            />
          : <>
              <p className="detail-copy">
                {profile.goals||'No goals added yet.'}
              </p>
              <h3 className="subheading">Health / injury notes</h3>
              <p className="detail-copy">
                {profile.health_notes||'Nothing noted.'}
              </p>
            </>
        }
      </article>

      <article className="panel">
        <PanelTitle title="Trainer-only notes"/>
        <form className="stack-form" onSubmit={saveNewNote}>
          <label>
            Add note
            <textarea
              rows="3"
              value={newNote}
              onChange={(event)=>setNewNote(event.target.value)}
              placeholder="Write a note to remember about this client…"
            />
          </label>
          <button
            className="button button-primary"
            disabled={!newNote.trim()}
          >
            Save note
          </button>
        </form>

        <div className="list-stack section-gap">
          {visibleNotes.map((note)=><article className="list-row" key={note.id}>
            <div className="row-main">
              <span>{noteTimestamp(note.created)}</span>
              {editingNote===note.id
                ? <div className="stack-form">
                    <textarea
                      rows="3"
                      value={editNoteText}
                      onChange={(event)=>setEditNoteText(event.target.value)}
                      aria-label="Edit trainer note"
                    />
                    <div className="row-actions">
                      <button
                        type="button"
                        className="text-button"
                        onClick={()=>setEditingNote(null)}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="text-button"
                        disabled={!editNoteText.trim()}
                        onClick={()=>saveEditedNote(note)}
                      >
                        Save
                      </button>
                    </div>
                  </div>
                : <p className="detail-copy">{note.notes}</p>
              }
            </div>
            {editingNote!==note.id&&<div className="row-actions">
              <button
                type="button"
                className="text-button"
                aria-label="Note actions"
                aria-expanded={openNoteMenu===note.id}
                onClick={()=>setOpenNoteMenu(
                  openNoteMenu===note.id?'':note.id
                )}
              >
                ⋯
              </button>
              {openNoteMenu===note.id&&<>
                <button
                  type="button"
                  className="text-button"
                  onClick={()=>beginEditNote(note)}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="text-button danger-text"
                  onClick={()=>deleteNote(note)}
                >
                  Delete
                </button>
              </>}
            </div>}
          </article>)}

          {!data.privateNotes.length&&
            <div className="empty-state">
              <p>No notes yet. Jot down anything you want to remember about this client.</p>
            </div>
          }
        </div>

        {data.privateNotes.length>5&&
          <button
            type="button"
            className="text-button"
            onClick={()=>setShowAllNotes((value)=>!value)}
          >
            {showAllNotes?'Show fewer notes':'Show all notes'}
          </button>
        }
      </article>

      <article className="panel">
        <PanelTitle title="Packages"/>
        <div className="list-stack">
          {data.packages.length
            ? data.packages.map((item)=>{
                const completed=data.sessions.filter(
                  (session)=>session.package===item.id&&session.status==='completed'
                ).length;
                const left=Math.max(0,item.total_sessions-completed);
                return <div className="package-row" key={item.id}>
                  <div className="package-meta">
                    <strong>{item.name}</strong>
                    <span>{left} of {item.total_sessions} sessions left</span>
                  </div>
                  <b>{money(item.price)}</b>
                  <div className="progress-track">
                    <span style={{
                      width:`${Math.min(100,completed/item.total_sessions*100)}%`
                    }}/>
                  </div>
                </div>;
              })
            : <Empty text="No package on this profile yet."/>
          }
        </div>
      </article>

      <article className="panel">
        <PanelTitle title="Sessions"/>
        <div className="list-stack">
          {data.sessions.length
            ? data.sessions.map((session)=><div className="list-row" key={session.id}>
                <div className="row-main">
                  <strong>
                    {session.expand?.slot?.date
                      ? formatDate(session.expand.slot.date)
                      : 'Session'}
                  </strong>
                  <span>
                    {session.expand?.slot?.start||''} ·
                    {' '}{session.trainer_notes||'No workout notes'}
                  </span>
                </div>
                <Status status={session.status}/>
              </div>)
            : <Empty text="No sessions recorded yet."/>
          }
        </div>
      </article>

      <article className="panel">
        <PanelTitle title="Payments &amp; workouts"/>
        <div className="list-stack">
          {data.payments.map((payment)=><div className="list-row" key={payment.id}>
            <div className="row-main">
              <strong>{money(payment.amount)}</strong>
              <span>{formatDate(payment.date)} · {payment.method}</span>
            </div>
            <span className="status status-completed">Payment</span>
          </div>)}
          {data.workouts.map((workout)=><div className="list-row" key={workout.id}>
            <div className="row-main">
              <strong>Workout logged</strong>
              <span>{formatDate(workout.date)} · {workout.notes||'No notes'}</span>
            </div>
          </div>)}
          {!data.payments.length&&!data.workouts.length&&
            <Empty text="Payments and workouts will show here."/>
          }
        </div>
      </article>
    </section>

    <WeeklyScheduleManager client={profile}/>
  </>;
}

function PanelTitle({title}) {
  return <div className="panel-title"><div><h2>{title}</h2></div></div>;
}

function Empty({text}) {
  return <div className="empty-state"><p>{text}</p></div>;
}
