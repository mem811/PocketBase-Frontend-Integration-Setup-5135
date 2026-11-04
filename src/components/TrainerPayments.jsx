import {useEffect,useMemo,useState} from 'react';
import {pb,money,formatDate} from '../lib/pocketbase';
import {pocketBaseErrorMessage} from '../lib/pocketbaseErrors';
import PaymentEditor from './PaymentEditor';
import PackageDueList from './PackageDueList';
import './TrainerPayments.css';
import './PackageDueList.css';

const methods=['cash','Venmo','Zelle','card','other'];
const currentMonth=()=>new Date().toISOString().slice(0,7);

export default function TrainerPayments(){
  const [data,setData]=useState({payments:[],clients:[],packages:[]});
  const [month,setMonth]=useState(currentMonth());
  const [clientFilter,setClientFilter]=useState('all');
  const [methodFilter,setMethodFilter]=useState('all');
  const [editing,setEditing]=useState(null);
  const [initialClientId,setInitialClientId]=useState('');
  const [error,setError]=useState('');

  async function load(){
    const [payments,clients,packages]=await Promise.all([
      pb.collection('payments').getFullList({sort:'-date',expand:'client,package'}),
      pb.collection('clients').getFullList({sort:'name'}),
      pb.collection('packages').getFullList()
    ]);
    setData({payments,clients,packages});
  }

  useEffect(()=>{load().catch((err)=>setError(pocketBaseErrorMessage(err,'Could not load payments.')));},[]);

  const periodPayments=useMemo(()=>data.payments.filter((item)=>String(item.date||'').slice(0,7)===month),[data.payments,month]);
  const visiblePayments=periodPayments.filter((item)=>(clientFilter==='all'||item.client===clientFilter)&&(methodFilter==='all'||item.method===methodFilter));
  const methodTotals=Object.fromEntries(methods.map((method)=>[method,periodPayments.filter((item)=>item.method===method).reduce((sum,item)=>sum+Number(item.amount||0),0)]));
  const outstanding=data.clients.map((client)=>{
    const owed=data.packages.filter((item)=>item.client===client.id).reduce((sum,item)=>sum+Number(item.price||0)-data.payments.filter((payment)=>payment.package===item.id).reduce((paid,payment)=>paid+Number(payment.amount||0),0),0);
    return {client,owed:Math.max(0,owed)};
  }).filter((item)=>item.owed>0).sort((a,b)=>b.owed-a.owed);

  function startNew(clientId=''){setEditing(null);setInitialClientId(clientId);}
  function quickRecord(clientId){startNew(clientId||'');}
  function closeEditor(){setEditing(null);setInitialClientId('');}

  async function savePayment(values){
    try{
      if(editing)await pb.collection('payments').update(editing.id,values);
      else await pb.collection('payments').create(values);
      closeEditor();
      await load();
    }catch(err){throw new Error(pocketBaseErrorMessage(err,'Could not save payment.'));}
  }

  async function deletePayment(payment){
    if(!window.confirm('Delete this payment? This cannot be undone.'))return;
    setError('');
    try{await pb.collection('payments').delete(payment.id);await load();}
    catch(err){setError(pocketBaseErrorMessage(err,'Could not delete payment.'));}
  }

  return <>
    <header className="page-heading"><div><p className="eyebrow">MONEY, MADE CLEAR</p><h1>Payments</h1><p className="muted">Track collections and follow up on outstanding balances.</p></div><button className="button button-primary" onClick={()=>startNew()}><span aria-hidden="true">＋</span> Record payment</button></header>
    {error&&<div className="notice notice-error">{error}</div>}
    <section className="payment-summary">
      <article className="payment-sticker payment-total"><span>Collected · {month}</span><strong>{money(periodPayments.reduce((sum,item)=>sum+Number(item.amount||0),0))}</strong></article>
      {methods.map((method)=><article className="payment-sticker" key={method}><span>{method}</span><strong>{money(methodTotals[method])}</strong></article>)}
      <article className="payment-sticker payment-outstanding"><span>Outstanding · all clients</span><strong>{money(outstanding.reduce((sum,item)=>sum+item.owed,0))}</strong></article>
    </section>
    <PackageDueList packages={data.packages} clients={data.clients} payments={data.payments} onRecord={quickRecord}/>
    <section className="panel payment-panel section-gap">
      <div className="panel-title"><div><h2>Payment history</h2><p>Tap any payment to edit or delete it.</p></div></div>
      <div className="payment-filters">
        <label>Month<input type="month" value={month} onChange={(event)=>setMonth(event.target.value)}/></label>
        <label>Client<select value={clientFilter} onChange={(event)=>setClientFilter(event.target.value)}><option value="all">All clients</option>{data.clients.map((client)=><option key={client.id} value={client.id}>{client.name}</option>)}</select></label>
        <label>Method<select value={methodFilter} onChange={(event)=>setMethodFilter(event.target.value)}><option value="all">All methods</option>{methods.map((method)=><option key={method} value={method}>{method}</option>)}</select></label>
      </div>
      <div className="list-stack">{visiblePayments.map((payment)=>{
        const client=data.clients.find((item)=>item.id===payment.client);
        return <div className="payment-row" key={payment.id}>
          <button className="payment-row-main" onClick={()=>{setInitialClientId('');setEditing(payment);}}><span className="payment-date">{formatDate(payment.date)}</span><strong>{client?.name||payment.expand?.client?.name||'Client'}</strong><span>{payment.method}{payment.note?` · ${payment.note}`:''}</span><b>{money(payment.amount)}</b></button>
          <div className="payment-row-actions"><button className="text-button" onClick={()=>{setInitialClientId('');setEditing(payment);}}>Edit</button><button className="text-button danger-text" onClick={()=>deletePayment(payment)}>Delete</button></div>
        </div>;
      })}{!visiblePayments.length&&<div className="empty-state"><p>No payments match these filters.</p></div>}</div>
    </section>
    <section className="panel section-gap payment-panel">
      <div className="panel-title"><div><h2>Outstanding</h2><p>Clients with unpaid package balances.</p></div></div>
      <div className="list-stack">{outstanding.map(({client,owed})=><div className="list-row outstanding-row" key={client.id}><div className="row-main"><strong>{client.name}</strong><span>{client.email||'Client balance'}</span></div><b className="outstanding-amount">{money(owed)}</b><button className="button button-secondary button-small" onClick={()=>startNew(client.id)}>Record payment</button></div>)}{!outstanding.length&&<div className="empty-state"><p>Everyone is all caught up.</p></div>}</div>
    </section>
    {(editing||initialClientId)&&<div className="payment-editor-wrap"><PaymentEditor key={editing?.id||initialClientId||'new'} payment={editing} initialClientId={initialClientId} clients={data.clients} packages={data.packages} payments={data.payments} onCancel={closeEditor} onSave={savePayment}/></div>}
  </>;
}
