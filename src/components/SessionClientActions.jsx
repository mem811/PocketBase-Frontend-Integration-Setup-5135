import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../common/SafeIcon';
import './SessionActions.css';

export default function SessionClientActions({session,onConfirm,onCancel,onReschedule,busy}) {
  if (session.status!=='confirmed') return null;
  return (
    <div className="session-client-actions">
      {session.client_confirmed
        ? <span className="client-confirmed-label">Confirmed ✓</span>
        : <button className="button button-primary button-small" disabled={busy} onClick={()=> onConfirm(session)}>
            I’ll be there 👍
          </button>}
      <button className="text-button danger-text" disabled={busy} onClick={()=> onCancel(session)}>Can’t make it</button>
      <button className="text-button" disabled={busy} onClick={()=> onReschedule(session)}>
        <SafeIcon icon={FiIcons.FiCalendar} /> Reschedule
      </button>
    </div>
  );
}
