import { useState } from 'react';
import { pb } from '../lib/pocketbase';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../common/SafeIcon';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function signIn(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await pb.collection('users').authWithPassword(email, password);
    } catch {
      setError('That email and password did not match. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-wrap">
      <section className="login-card">
        <div className="brand-mark"><SafeIcon icon={FiIcons.FiActivity} /></div>
        <p className="eyebrow">YOUR TRAINING STUDIO</p>
        <h1>Welcome back.</h1>
        <p className="muted">Your sessions, progress, and plans—all in one place.</p>
        <form onSubmit={signIn} className="stack-form">
          <label>Email address<input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          <label>Password<input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          {error && <p className="error-text">{error}</p>}
          <button className="button button-primary button-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'} <SafeIcon icon={FiIcons.FiArrowRight} /></button>
        </form>
        <p className="login-foot">Client access is provided by your trainer. No public sign-up.</p>
      </section>
    </main>
  );
}
