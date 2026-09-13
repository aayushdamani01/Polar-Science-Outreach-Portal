import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'researcher' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function update(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await register(form);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed.');
    } finally {
      setSubmitting(false);
    }
  }

  const inputStyle = { background: 'rgba(7,22,32,0.5)', border: '1px solid var(--brass-dim)' };
  const focusHandlers = {
    onFocus: (e) => (e.target.style.borderColor = 'var(--brass-bright)'),
    onBlur: (e) => (e.target.style.borderColor = 'var(--brass-dim)'),
  };

  return (
    <div className="chart-backdrop absolute inset-0 flex items-center justify-center px-4 py-10">
      <form
        onSubmit={handleSubmit}
        className="brass-plate w-full max-w-sm rounded-2xl p-8"
      >
        <span className="rivet-tl" /><span className="rivet-tr" /><span className="rivet-bl" /><span className="rivet-br" />

        <div className="flex items-center gap-2 mb-5" style={{ color: 'var(--brass-bright)' }}>
          <Compass className="w-5 h-5" strokeWidth={1.5} />
          <span className="gauge-text text-[11px] tracking-wide">NCPOR EXPEDITION ATLAS</span>
        </div>

        <h1 className="text-2xl italic mb-1" style={{ fontFamily: 'var(--font-display)', color: 'var(--ice)' }}>
          Create account
        </h1>
        <p className="text-sm mb-6" style={{ color: 'var(--ice-dim)' }}>Join the NCPOR portal</p>

        {error && (
          <div className="mb-4 px-3 py-2 rounded bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
            {error}
          </div>
        )}

        <label className="block text-sm mb-1" style={{ color: 'var(--ice-dim)' }}>Name</label>
        <input
          required
          value={form.name}
          onChange={update('name')}
          className="w-full mb-4 px-3 py-2 rounded text-white focus:outline-none transition-colors"
          style={inputStyle}
          {...focusHandlers}
        />

        <label className="block text-sm mb-1" style={{ color: 'var(--ice-dim)' }}>Email</label>
        <input
          type="email"
          required
          autoComplete="email"
          value={form.email}
          onChange={update('email')}
          className="w-full mb-4 px-3 py-2 rounded text-white focus:outline-none transition-colors"
          style={inputStyle}
          {...focusHandlers}
        />

        <label className="block text-sm mb-1" style={{ color: 'var(--ice-dim)' }}>Password</label>
        <input
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={form.password}
          onChange={update('password')}
          className="w-full mb-4 px-3 py-2 rounded text-white focus:outline-none transition-colors"
          style={inputStyle}
          {...focusHandlers}
        />

        <label className="block text-sm mb-1" style={{ color: 'var(--ice-dim)' }}>Role</label>
        <select
          value={form.role}
          onChange={update('role')}
          className="w-full mb-6 px-3 py-2 rounded text-white focus:outline-none transition-colors"
          style={inputStyle}
          {...focusHandlers}
        >
          <option value="researcher">Researcher</option>
          <option value="comms_officer">Comms Officer</option>
          {/* "admin" is deliberately not offered here — admin accounts
              should be created manually/by an existing admin, not via
              open self-registration. */}
        </select>

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-2.5 rounded text-[#071620] font-semibold transition-opacity disabled:opacity-50"
          style={{ background: 'linear-gradient(160deg, var(--brass-bright), var(--brass))' }}
        >
          {submitting ? 'Creating account…' : 'Create account'}
        </button>

        <p className="text-sm mt-4 text-center" style={{ color: 'var(--ice-dim)' }}>
          Already have an account?{' '}
          <Link to="/login" className="hover:underline" style={{ color: 'var(--brass-bright)' }}>Sign in</Link>
        </p>
      </form>
    </div>
  );
}
