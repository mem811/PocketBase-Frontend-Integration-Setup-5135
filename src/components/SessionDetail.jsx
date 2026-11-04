import {useEffect,useState} from 'react';
import {pb,formatDate,formatTime,sessionSlot,sessionClient} from '../lib/pocketbase';
import {pocketBaseErrorMessage} from '../lib/pocketbaseErrors';
import {saveSessionTime} from '../lib/sessionTime';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../common/SafeIcon';
import {Status} from './TrainerDashboard';
import {slotConflicts} from '../lib/recurringSchedules';

export default function SessionDetail({session,onBack,onUpdated}) {
  const [notes,setNotes]=useState(session.trainer_notes || '');
  const [slots,setSlots]=useState([]);
  const [sessions,setSessions]=useState([]);
  const [targetSlot,setTargetSlot]=useState('');
  const [editDate,setEditDate]=useState('');
  const [editStart,setEditStart]=useState('');
  const [editEnd,setEditEnd]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const slot=sessionSlot(session);
  const client=sessionClient(session);
  const canEditTime=['requested','confirmed'].includes(session.status);

  useEffect(()=> {
    setNotes(session.trainer_notes || '');
    setEditDate(slot.date ? String(slot.date).slice(0,10) : '');
    setEditStart(slot.start || '');
    setEditEnd(slot.end || '');
    setError('');
    Promise.all([
      pb.collection('availability').getFullList({sort: 'date,start'}),
      pb.collection('sessions').getFullList({expand: 'slot'})
    ]).then(([availability,rows])=> {
      setSlots(availability);
      setSessions(rows);
    }).catch((err)=> setError(pocketBaseErrorMessage(err,'Unable to load available times.')));
  },[session.id]);

  async function update(status) {
    if (['cancelled','no-show'].includes(status) && !window.confirm(`Mark this session ${status}?`)) return;
    setBusy(true);
    setError('');
    try {
      await pb.collection('sessions').update(session.id,{status,trainer_notes: notes});
      onUpdated();
    } catch (err) {
      setError(pocketBaseErrorMessage(err,'Could not update the session.'));
    } finally {
      setBusy(false);
    }
  }

  async function saveTime(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await saveSessionTime(session,sessions,{date: editDate,start: editStart,end: editEnd});
      onUpdated();
    } catch (err) {
      setError(pocketBaseErrorMessage(err,'Could not save the session time.'));
    } finally {
      setBusy(false);
    }
  }

  async function reschedule() {
    const nextSlot=slots.find((item)=> item.id===targetSlot
      && item.status==='open'
      && !slotConflicts(item,sessions,session.id));
    if (!nextSlot || !window.confirm('Move this session to the selected time?')) return;
    setBusy(true);
    setError('');
    try {
      await pb.collection('availability').update(nextSlot.id,{status: 'booked'});
      await pb.collection('sessions').update(session.id,{slot: nextSlot.id,moved: true});
      if (session.slot) await pb.collection('availability').update(session.slot,{status: 'open'});
      onUpdated();
    } catch (err) {
      setError(pocketBaseErrorMessage(err,'Could not reschedule this session.'));
    } finally {
      setBusy(false);
    }
  }

  const openSlots=slots.filter((item)=> item.status==='open'
    && !slotConflicts(item,sessions,session.id));

  return <>
    <header className="page-heading">
      <div>
        <button className="back-link" onClick={onBack}>
          <SafeIcon icon={FiIcons.FiArrowLeft} /> Back to sessions
        </button>
        <p className="eyebrow">SESSION DETAILS</p>
        <h1>{client.name || 'Training session'}</h1>
        <p className="muted">{formatDate(slot.date)} · {formatTime(slot.start)}–{formatTime(slot.end)}</p>
      </div>
      <div className="heading-actions">
        {session.moved && <span className="status">Moved this week</span>}
        <Status status={session.status} />
      </div>
    </header>

    {error && <div className="notice notice-error">{error}</div>}

    <section className="detail-grid">
      <article className="panel">
        {canEditTime && <form className="section-gap" onSubmit={saveTime}>
          <div className="panel-title">
            <div><h2>Edit day &amp; time</h2><p>Changing a recurring session moves this week only.</p></div>
          </div>
          <div className="form-grid">
            <label>Date<input type="date" required value={editDate} onChange={(event)=> setEditDate(event.target.value)} /></label>
            <label>Start<input type="time" required value={editStart} onChange={(event)=> setEditStart(event.target.value)} /></label>
            <label>End<input type="time" required value={editEnd} onChange={(event)=> setEditEnd(event.target.value)} /></label>
            <button className="button button-secondary form-span" disabled={busy}>Save day &amp; time</button>
          </div>
        </form>}

        <div className="panel-title section-gap">
          <div><h2>Session notes</h2><p>Save your coaching notes while the details are fresh.</p></div>
        </div>
        <label className="wide-label">Workout notes<textarea rows="7" value={notes} onChange={(event)=> setNotes(event.target.value)} placeholder="Movement,progress,next time…" /></label>
        <button className="button button-secondary" disabled={busy} onClick={()=> update(session.status)}>Save notes</button>

        {session.status==='confirmed' && session.schedule && <div className="section-gap">
          <label className="wide-label">Move this one session<select value={targetSlot} onChange={(event)=> setTargetSlot(event.target.value)}>
            <option value="">Choose an open time</option>
            {openSlots.map((item)=> <option key={item.id} value={item.id}>{formatDate(item.date)} · {formatTime(item.start)}–{formatTime(item.end)}</option>)}
          </select></label>
          <button className="button button-quiet" disabled={busy || !targetSlot} onClick={reschedule}>Reschedule this session only</button>
        </div>}
      </article>

      <article className="panel">
        <div className="panel-title"><div><h2>Update session</h2><p>Only completed sessions count against a package.</p></div></div>
        <div className="action-stack">
          {session.status==='requested' && <>
            <button className="button button-primary" disabled={busy} onClick={()=> update('confirmed')}><SafeIcon icon={FiIcons.FiCheck} /> Confirm request</button>
            <button className="button button-secondary" disabled={busy} onClick={()=> update('cancelled')}>Decline request</button>
          </>}
          {!['completed','cancelled','no-show'].includes(session.status) && <>
            <button className="button button-primary" disabled={busy} onClick={()=> update('completed')}><SafeIcon icon={FiIcons.FiCheckCircle} /> Mark completed</button>
            <button className="button button-quiet" disabled={busy} onClick={()=> update('no-show')}>Mark no-show</button>
          </>}
          {session.client_notes && <div className="client-note"><strong>Client note</strong><p>{session.client_notes}</p></div>}
        </div>
      </article>
    </section>
  </>;
}
