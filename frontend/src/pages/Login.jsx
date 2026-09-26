import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { GraduationCap, LogIn, AlertCircle, ArrowRight, ShieldCheck, User } from 'lucide-react';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const from = location.state?.from?.pathname || '/assistant';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');

    if (!email.trim() || !password) {
      setFormError('Please enter both email and password.');
      return;
    }

    setIsSubmitting(true);
    const result = await login(email.trim(), password);
    setIsSubmitting(false);

    if (result.success) {
      navigate(from, { replace: true });
    } else {
      setFormError(result.error || 'Authentication failed. Please verify credentials.');
    }
  };

  const handleQuickFill = (type) => {
    if (type === 'student') {
      setEmail('student@campus.edu');
      setPassword('student123');
    } else {
      setEmail('admin@campus.edu');
      setPassword('admin123');
    }
    setFormError('');
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-campus-bg">
      <div className="campus-card max-w-md w-full p-8 relative">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-blue-600/10 border border-blue-500/20 text-blue-400 mx-auto flex items-center justify-center mb-3 shadow-sm">
            <GraduationCap className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">CampusGpt</h1>
          <p className="text-sm text-campus-muted mt-1">
            Sign in to your official university AI assistant
          </p>
        </div>

        {/* Error notification */}
        {formError && (
          <div className="mb-6 p-3.5 rounded-lg bg-red-500/10 border border-red-500/20 flex items-start gap-2.5 text-sm text-red-400 animate-in fade-in">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <p className="flex-1">{formError}</p>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-campus-subtext mb-1.5">
              University Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. student@campus.edu"
              required
              className="campus-input"
              autoComplete="email"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-medium text-campus-subtext">
                Password
              </label>
            </div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="campus-input"
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="campus-btn-primary w-full mt-2"
          >
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Signing in...
              </span>
            ) : (
              <>
                <LogIn className="w-4 h-4" />
                Sign In
              </>
            )}
          </button>
        </form>

        {/* Quick test autofill buttons */}
        <div className="mt-6 pt-5 border-t border-campus-border">
          <p className="text-[11px] text-campus-muted font-mono mb-2 text-center">
            Testing shortcuts (auto-fill credentials):
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleQuickFill('student')}
              className="campus-btn-secondary text-xs py-1.5 px-2 flex items-center justify-center gap-1.5"
            >
              <User className="w-3.5 h-3.5 text-blue-400" />
              Student Demo
            </button>
            <button
              type="button"
              onClick={() => handleQuickFill('admin')}
              className="campus-btn-secondary text-xs py-1.5 px-2 flex items-center justify-center gap-1.5"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-purple-400" />
              Admin Demo
            </button>
          </div>
          <p className="text-[10px] text-campus-muted text-center mt-2">
            *If account doesn't exist yet, click Register below with these sample accounts.
          </p>
        </div>

        {/* Footer */}
        <div className="mt-6 text-center text-xs text-campus-muted">
          New to the campus portal?{' '}
          <Link to="/register" className="text-campus-accent hover:underline font-medium inline-flex items-center gap-1">
            Register here <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Login;
