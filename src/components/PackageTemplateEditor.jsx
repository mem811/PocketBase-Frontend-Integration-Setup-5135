import {useEffect,useState} from 'react';
import {pocketBaseErrorMessage} from '../lib/pocketbaseErrors';

const blankTemplate={name:'',total_sessions:10,price:0,expiry_weeks:'',is_default:false,active:true};

export default function PackageTemplateEditor({template,onCancel,onSave}) {
  const [form,setForm]=useState(template||blankTemplate);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');

  useEffect(()=>setForm(template||blankTemplate),[template]);

  function update(event) {
    const {name,value,type,checked}=event.target;
    setForm((current)=>({...current,[name]:type==='checkbox'?checked:value}));
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await onSave({
        name:form.name.trim(),
        total_sessions:Number(form.total_sessions),
        price:Number(form.price),
        expiry_weeks:form.expiry_weeks===''?0:Number(form.expiry_weeks),
        is_default:Boolean(form.is_default),
        active:Boolean(form.active)
      });
    } catch(err) {
      setError(pocketBaseErrorMessage(err,err?.message||'Could not save this template.'));
    } finally {
      setBusy(false);
    }
  }

  return <form className="form-grid template-editor" onSubmit={submit}>
    <label>Package name<input name="name" required value={form.name} onChange={update}/></label>
    <label>Total sessions<input name="total_sessions" type="number" min="1" required value={form.total_sessions} onChange={update}/></label>
    <label>Price<input name="price" type="number" min="0" step="0.01" required value={form.price} onChange={update}/></label>
    <label>Expires after (weeks)<input name="expiry_weeks" type="number" min="1" value={form.expiry_weeks||''} placeholder="No expiry" onChange={update}/></label>
    <label className="template-checkbox"><input name="is_default" type="checkbox" checked={Boolean(form.is_default)} onChange={update}/> Set as default</label>
    {error&&<p className="error-text form-span">{error}</p>}
    <div className="form-actions form-span">
      <button type="button" className="button button-quiet" onClick={onCancel}>Cancel</button>
      <button className="button button-primary" disabled={busy}>{busy?'Saving…':'Save template'}</button>
    </div>
  </form>;
}
