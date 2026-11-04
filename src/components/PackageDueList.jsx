import {money,formatDate} from '../lib/pocketbase';
import {packageBilling,isUrgentPackage} from '../lib/packageBilling';

export default function PackageDueList({packages,clients,payments,onRecord}) {
  const urgent=packages
    .filter((item)=>isUrgentPackage(item,payments))
    .map((item)=>({
      packageRecord:item,
      client:clients.find((client)=>client.id===item.client),
      billing:packageBilling(item,payments)
    }))
    .sort((a,b)=>{
      const urgency=(item)=>item.billing.statusClass==='overdue'?0:1;
      return urgency(a)-urgency(b)||String(a.billing.dueDate).localeCompare(String(b.billing.dueDate));
    });

  return <section className="panel section-gap">
    <div className="panel-title"><div><h2>Due soon &amp; overdue</h2><p>Packages that could use a payment follow-up.</p></div></div>
    <div className="list-stack">
      {urgent.map(({packageRecord,client,billing})=><div className="list-row due-package-row" key={packageRecord.id}>
        <div className="row-main">
          <strong>{client?.name||'Client'} · {packageRecord.name}</strong>
          <span><b className={`billing-sticker billing-${billing.statusClass}`}>{billing.status}</b> · Due {billing.dueDate?formatDate(billing.dueDate):'date unavailable'}</span>
        </div>
        <strong className="due-package-amount">{money(billing.balance)}</strong>
        <button className="button button-secondary button-small" onClick={()=>onRecord?.(client?.id,packageRecord.id)}>Record payment</button>
      </div>)}
      {!urgent.length&&<div className="empty-state"><p>No packages are due soon or overdue.</p></div>}
    </div>
  </section>;
}
