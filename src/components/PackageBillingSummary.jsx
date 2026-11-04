import {money,formatDate} from '../lib/pocketbase';
import {packageBilling} from '../lib/packageBilling';
import './PackageBillingSummary.css';

export default function PackageBillingSummary({packageRecord,payments}) {
  const billing=packageBilling(packageRecord,payments);
  return <div className="package-billing">
    <div className="package-billing-top">
      <span className={`billing-sticker billing-${billing.statusClass}`}>{billing.status}</span>
      <strong>{money(packageRecord.price)}</strong>
    </div>
    <div className="package-billing-grid">
      <span>Total paid <b>{billing.paidLabel}</b></span>
      <span>Balance owed <b>{billing.balanceLabel}</b></span>
      <span>Payment due <b>{billing.dueLabel}</b></span>
      <span>Last payment <b>{billing.lastPayment ? formatDate(billing.lastPayment) : 'No payments yet'}</b></span>
    </div>
    {billing.packagePayments.length>0&&<div className="package-payment-history">
      <strong>Payment history</strong>
      {billing.packagePayments.map((payment)=><div key={payment.id}>
        <span>{formatDate(payment.date)}</span>
        <span>{money(payment.amount)}</span>
        <span>{payment.method}</span>
      </div>)}
    </div>}
  </div>;
}
