import {formatDate,money} from './pocketbase';

export function packageBilling(packageRecord,payments) {
  const packagePayments=payments
    .filter((payment)=>payment.package===packageRecord.id)
    .sort((a,b)=>new Date(b.date)-new Date(a.date));
  const paid=packagePayments.reduce((sum,payment)=>sum+Number(payment.amount||0),0);
  const balance=Math.max(0,Number(packageRecord.price||0)-paid);
  const dueDate=packageRecord.due_date ? String(packageRecord.due_date).slice(0,10) : '';
  const today=new Date();
  today.setHours(0,0,0,0);
  const due=dueDate ? new Date(`${dueDate}T00:00:00`) : null;
  const daysUntilDue=due ? Math.ceil((due-today)/86400000) : null;
  let status='Not due';
  let statusClass='not-due';

  if (balance===0) {
    status='Paid in full';
    statusClass='paid';
  } else if (daysUntilDue!==null && daysUntilDue<0) {
    status='Overdue';
    statusClass='overdue';
  } else if (daysUntilDue!==null && daysUntilDue<=7) {
    status='Due soon';
    statusClass='due-soon';
  } else if (paid>0) {
    status='Partly paid';
    statusClass='partial';
  }

  return {
    paid,
    balance,
    dueDate,
    lastPayment:packagePayments[0]?.date||'',
    packagePayments,
    status,
    statusClass,
    dueLabel:dueDate ? formatDate(dueDate) : 'No due date',
    paidLabel:money(paid),
    balanceLabel:money(balance)
  };
}

export function isUrgentPackage(packageRecord,payments) {
  const billing=packageBilling(packageRecord,payments);
  return billing.balance>0 && ['overdue','due-soon'].includes(billing.statusClass);
}
