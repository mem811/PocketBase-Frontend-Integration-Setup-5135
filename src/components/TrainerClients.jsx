import {useEffect,useState} from 'react';
import {pb,money,pocketBaseDate,localDateKey} from '../lib/pocketbase';
import {pocketBaseErrorMessage} from '../lib/pocketbaseErrors';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../common/SafeIcon';

export default function TrainerClients({onSelect,notice='',onNoticeDismissed}) {
  const [clients,setClients]=useState([]);
  const [packages,setPackages]=useState([]);
  const [payments,setPayments]=useState([]);
  const [sessions,setSessions]=useState([]);
  const [showCreate,setShowCreate]=useState(false);
  const [filter,setFilter]=useState('active');
  const [error,setError]=useState('');
  const [localNotice,setLocalNotice]=useState('');
  const [busyClient,setBusyClient]=useState('');

  async function load() {
    const [clientRows,packageRows,paymentRows,sessionRows]=await Promise.all([
      pb.collection('clients').getFullList({sort:'name'}),
      pb.collection('packages').getFullList(),
      pb.collection('payments').getFullList(),
      pb.collection('sessions').getFullList()
    ]);
    setClients(clientRows);setPackages(packageRows);setPayments(paymentRows);setSessions(sessionRows);
  }

  useEffect(()=>{load().catch((err)=>setError(pocketBaseErrorMessage(err,'Unable to load clients.')));},[]);

  function clientBalance(client) {
    return packages.filter((item)=>item.client===client.id).reduce((sum,item)=>{
      const paid=payments.filter((payment)=>payment.package===item.id).reduce((total,row)=>total+Number(row.amount),0);
      return sum+Number(item.price)-paid;
    },0);
  }

  function sessionsLeft(client) {
    return packages.filter((item)=>item.client===client.id && item.status==='active').reduce((sum,item)=>
      sum+item.total_sessions-sessions.filter((row)=>row.package===item.id && row.status==='completed').length,0);
  }

  async function unarchive(client) {
    setBusyClient(client.id);
    setError('');
    setLocalNotice('');
    try {
      await pb.collection('clients').update(client.id,{active:true});
      setClients((rows)=>rows.map((row)=>row.id===client.id?{...row,active:true}:row));
      setFilter('active');
      setLocalNotice(`${client.name} was unarchived.`);
    } catch(err) {
      setError(pocketBaseErrorMessage(err,err?.message||'Could not unarchive this client.'));
    } finally {
      setBusyClient('');
    }
  }

  const visibleClients=clients.filter((client)=>filter==='archived'?client.active===false:client.active!==false);

  return <>
    <header className="page-heading"><div><p className="eyebrow">YOUR PEOPLE</p><h1>Clients</h1><p className="muted">The people behind every rep, milestone, and small win.</p></div><button className="button button-primary" onClick={()=>setShowCreate(!showCreate)}><SafeIcon icon={FiIcons.FiPlus} /> Add client</button></header>
    {notice&&<div className="notice notice-success">{notice}<button className="text-button" onClick={onNoticeDismissed}>Dismiss</button></div>}
    {localNotice&&<div className="notice notice-success">{localNotice}<button className="text-button" onClick={()=>setLocalNotice('')}>Dismiss</button></div>}
    {error&&<div className="notice notice-error">{error}</div>}
    <div className="row-actions section-gap" role="group" aria-label="Client status filter">
      <button type="button" className={`button button-small ${filter==='active'?'button-primary':'button-quiet'}`} onClick={()=>setFilter('active')}>Active</button>
      <button type="button" className={`button button-small ${filter==='archived'?'button-primary':'button-quiet'}`} onClick={()=>setFilter('archived')}>Archived</button>
    </div>
    {showCreate&&<CreateClient onCancel={()=>setShowCreate(false)} onCreated={()=>{setShowCreate(false);load();}}/>}
    <section className="client-grid">
      {visibleClients.map((client)=>filter==='archived'?<article className="client-card" key={client.id}>
        <div className="client-card-head"><div className="avatar avatar-large">{client.name?.[0]||'C'}</div><span className="client-active">Archived</span></div>
        <h3>{client.name}</h3><p>{client.email}</p>
        <div className="client-badges"><span><b>{sessionsLeft(client)}</b> sessions left</span><span><b>{money(clientBalance(client))}</b> balance</span></div>
        <button className="client-open" type="button" onClick={()=>onSelect(client)}>Open client <SafeIcon icon={FiIcons.FiArrowUpRight}/></button>
        <button className="button button-secondary button-small" type="button" disabled={busyClient===client.id} onClick={()=>unarchive(client)}>{busyClient===client.id?'Unarchiving…':'Unarchive'}</button>
      </article>:<button className="client-card" key={client.id} onClick={()=>onSelect(client)}>
        <div className="client-card-head"><div className="avatar avatar-large">{client.name?.[0]||'C'}</div><span className={`client-active ${client.active?'is-active':''}`}>{client.active?'Active':'Inactive'}</span></div>
        <h3>{client.name}</h3><p>{client.email}</p>
        <div className="client-badges"><span><b>{sessionsLeft(client)}</b> sessions left</span><span><b>{money(clientBalance(client))}</b> balance</span></div>
        <span className="client-open">Open client <SafeIcon icon={FiIcons.FiArrowUpRight}/></span>
      </button>)}
    </section>
    {!visibleClients.length&&!showCreate&&<div className="panel"><div className="empty-state"><p>{filter==='archived'?'No archived clients yet.':'Your client roster starts here. Add your first client to get moving.'}</p></div></div>}
  </>;
}

function CreateClient({onCancel,onCreated}) {
  const [form,setForm]=useState({name:'',email:'',phone:'',goals:'',health_notes:''});
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [templates,setTemplates]=useState([]);
  const [createdClient,setCreatedClient]=useState(null);
  useEffect(()=>{pb.collection('package_templates').getFullList({filter:'active=true',sort:'name'}).then(setTemplates).catch(()=>setTemplates([]));},[]);
  async function submit(event) {
    event.preventDefault();setBusy(true);setError('');
    const password=`${crypto.randomUUID()}Aa1!`;
    try {
      const user=await pb.collection('users').create({email:form.email,password,passwordConfirm:password,role:'client',name:form.name,emailVisibility:false});
      const client=await pb.collection('clients').create({...form,user:user.id,active:true});
      await pb.collection('users').requestPasswordReset(form.email);
      setCreatedClient(client);
    } catch (err) {
      setError(err?.data?.message || 'Could not create the client. Verify PocketBase email settings and rules.');
    } finally {setBusy(false);}
  }
  async function addDefaultPackage() {
    const template=templates.find((item)=>item.is_default && item.active);
    if (!template || !createdClient) return;
    const start=localDateKey();
    let expiry='';
    if (template.expiry_weeks) {
      const date=new Date(`${start}T12:00:00`);
      date.setDate(date.getDate()+Number(template.expiry_weeks)*7);
      expiry=localDateKey(date);
    }
    setBusy(true);setError('');
    try {
      await pb.collection('packages').create({
        client:createdClient.id,name:template.name,total_sessions:Number(template.total_sessions),price:Number(template.price),
        start_date:pocketBaseDate(start),
        expiry_date:expiry ? pocketBaseDate(expiry) : '',
        status:'active'
      });
      onCreated();
    } catch {
      setError('The client was created, but the default package could not be added.');
    } finally {setBusy(false);}
  }
  if (createdClient) {
    const hasDefault=templates.some((item)=>item.is_default && item.active);
    return <section className="panel form-panel"><div className="panel-title"><div><h2>Client invited</h2><p>The setup email has been requested for {createdClient.email}.</p></div></div>{error && <p className="error-text">{error}</p>}<div className="form-actions">{hasDefault && <button className="button button-primary" disabled={busy} onClick={addDefaultPackage}><SafeIcon icon={FiIcons.FiPlus} /> Add default package</button>}<button className="button button-quiet" onClick={onCreated}>{hasDefault ? 'Done' : 'Finish'}</button></div></section>;
  }
  return <section className="panel form-panel">
    <div className="panel-title"><div><h2>Invite a client</h2><p>They’ll receive a set-password email after their profile is created.</p></div></div>
    <form className="form-grid" onSubmit={submit}>
      <label>Full name<input required value={form.name} onChange={(e)=>setForm({...form,name:e.target.value})} /></label>
      <label>Email<input type="email" required value={form.email} onChange={(e)=>setForm({...form,email:e.target.value})} /></label>
      <label>Phone<input required value={form.phone} onChange={(e)=>setForm({...form,phone:e.target.value})} /></label>
      <label>Goals<textarea value={form.goals} onChange={(e)=>setForm({...form,goals:e.target.value})} /></label>
      <label>Health / injury notes<textarea value={form.health_notes} onChange={(e)=>setForm({...form,health_notes:e.target.value})} /></label>
      {error && <p className="error-text form-span">{error}</p>}
      <div className="form-actions form-span"><button type="button" className="button button-quiet" onClick={onCancel}>Cancel</button><button className="button button-primary" disabled={busy}>{busy ? 'Creating…' : 'Create client & email setup link'}</button></div>
    </form>
  </section>;
}
