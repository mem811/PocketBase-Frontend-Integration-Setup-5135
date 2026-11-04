import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../common/SafeIcon';
import './SessionActions.css';

export default function SessionConfirmedBadge({confirmed}) {
  if (!confirmed) return null;
  return (
    <span className="session-confirmed-badge" title="Client confirmed attendance" aria-label="Client confirmed attendance">
      <SafeIcon icon={FiIcons.FiCheck} />
    </span>
  );
}
