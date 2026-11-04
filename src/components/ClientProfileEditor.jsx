import {useState} from 'react';
import {pb} from '../lib/pocketbase';
import {pocketBaseErrorMessage} from '../lib/pocketbaseErrors';

export default function ClientProfileEditor({client,onCancel,onSaved}) {
  const [form,setForm]=useState({
    name: client.name || '',
    email: client.email || '',
    phone: client.phone || '',
    goals: client.goals || '',
    health_notes: client.health_notes || ''
  });
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');

  function updateField(event) {
    setForm((current)=> ({...current,[event.target.name]: event.target.value}));
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const updated=await pb.collection('clients').update(client.id,form);
      onSaved(updated);
    } catch (err) {
      setError(pocketBaseErrorMessage(err,'Could not update the client profile.'));
    } finally {
      setBusy(false);
    }
  }

  return <form className="form-grid" onSubmit={submit}>
    <label>Full name<input name="name" required value={form.name} onChange={updateField} /></label>
    <label>Email<input name="email" type="email" required value={form.email} onChange={updateField} /></label>
    <label>Phone<input name="phone" required value={form.phone} onChange={updateField} /></label>
    <label>Goals<textarea name="goals" value={form.goals} onChange={updateField} /></label>
    <label className="form-span">Health / injury notes<textarea name="health_notes" value={form.health_notes} onChange={updateField} /></label>
    {error && <p className="error-text form-span">{error}</p>}
    <div className="form-actions form-span">
      <button type="button" className="button button-quiet" onClick={onCancel}>Cancel</button>
      <button className="button button-primary" disabled={busy}>{busy ? 'Saving…' : 'Save profile'}</button>
    </div>
  </form>;
}
