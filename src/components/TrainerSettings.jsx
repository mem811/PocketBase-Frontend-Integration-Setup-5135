import {useEffect,useState} from 'react';
import {pb} from '../lib/pocketbase';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../common/SafeIcon';
import StandardPackages from './StandardPackages';

const fallback='Hi {first name}! See you tomorrow at {time}. Tap to confirm: {app link} 💪';

export default function TrainerSettings() {
  const [template,setTemplate]=useState(fallback);
  const [setting,setSetting]=useState(null);
  const [saved,setSaved]=useState(false);
  const [error,setError]=useState('');
  useEffect(()=>{
    pb.collection('settings').getFirstListItem('key="reminder_template"')
      .then((record)=>{setSetting(record);setTemplate(record.reminder_template || fallback);})
      .catch(()=>{});
  },[]);
  async function save(event) {
    event.preventDefault();
    setError('');
    try {
      const record=setting
        ? await pb.collection('settings').update(setting.id,{reminder_template:template})
        : await pb.collection('settings').create({key:'reminder_template',reminder_template:template});
      setSetting(record);
      setSaved(true);
      window.setTimeout(()=>setSaved(false),2400);
    } catch {
      setError('Could not save. Confirm that the settings collection is imported and trainer rules are active.');
    }
  }
  return <>
    <header className="page-heading"><div><p className="eyebrow">YOUR STUDIO, YOUR WAY</p><h1>Settings</h1><p className="muted">Keep the little details feeling personal.</p></div></header>
    <section className="panel settings-panel">
      <div className="panel-title"><div><h2>Reminder message</h2><p>Opens the client’s Messages app. No SMS is sent automatically.</p></div><span className="settings-icon"><SafeIcon icon={FiIcons.FiMessageCircle} /></span></div>
      <form className="stack-form" onSubmit={save}>
        <label>Message template<textarea rows="5" value={template} onChange={(event)=>setTemplate(event.target.value)} /></label>
        <div className="placeholder-list"><span>{'{first name}'}</span><span>{'{time}'}</span><span>{'{date}'}</span><span>{'{app link}'}</span></div>
        <p className="muted small-copy">The app link opens this training planner so clients can confirm or manage their session.</p>
        {error && <p className="error-text">{error}</p>}
        <button className="button button-primary">{saved ? <><SafeIcon icon={FiIcons.FiCheck} /> Saved</> : 'Save reminder'}</button>
      </form>
    </section>
    <StandardPackages />
  </>;
}
