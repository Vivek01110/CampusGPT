import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { UserPlus, AlertCircle, ArrowRight } from 'lucide-react';
const Register = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    department: 'Computer Science & Engineering',
    year: '1st Year',
    role: 'student',
  });

  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { register } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');

    if (!formData.name.trim() || !formData.email.trim() || !formData.password) {
      setFormError('Please fill in all required fields.');
      return;
    }

    if (formData.password.length < 6) {
      setFormError('Password must be at least 6 characters long.');
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setFormError('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    const result = await register({
      name: formData.name.trim(),
      email: formData.email.trim(),
      password: formData.password,
      role: formData.role,
      department: formData.department,
      year: formData.year,
    });
    setIsSubmitting(false);

    if (result.success) {
      navigate('/assistant');
    } else {
      setFormError(result.error || 'Registration failed. Please try again.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-campus-bg">
      <div className="campus-card max-w-lg w-full p-8 relative">
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-blue-600/10 border border-blue-500/20 text-blue-400 mx-auto flex items-center justify-center mb-3 shadow-sm">
            <UserPlus className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Create CampusGpt Account</h1>
          <p className="text-sm text-campus-muted mt-1">
            Register for official university access & AI assistant features
          </p>
        </div>

        {formError && (
          <div className="mb-6 p-3.5 rounded-lg bg-red-500/10 border border-red-500/20 flex items-start gap-2.5 text-sm text-red-400">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <p className="flex-1">{formError}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-campus-subtext mb-1.5">
              Full Name *
            </label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="e.g. Walter White"
              required
              className="campus-input"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-campus-subtext mb-1.5">
              University Email *
            </label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="e.g. walter@nitkkr.ac.in"
              required
              className="campus-input"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-campus-subtext mb-1.5">
                Department
              </label>
              <select
                name="department"
                value={formData.department}
                onChange={handleChange}
                className="campus-input"
              >
                <option value="Computer Science & Engineering">Computer Science & Engineering</option>
                <option value="Information Technology">Information Technology</option>
                <option value="Electrical Engineering">Electrical Engineering</option>
                <option value="Mechanical Engineering">Mechanical Engineering</option>
                <option value="Business Administration">Business Administration</option>
                <option value="General Studies">General Studies</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-campus-subtext mb-1.5">
                Academic Year
              </label>
              <select
                name="year"
                value={formData.year}
                onChange={handleChange}
                className="campus-input"
              >
                <option value="1st Year">1st Year</option>
                <option value="2nd Year">2nd Year</option>
                <option value="3rd Year">3rd Year</option>
                <option value="4th Year">4th Year</option>
                <option value="Postgraduate">Postgraduate</option>
                <option value="Faculty / Staff">Faculty / Staff</option>
              </select>
            </div>
          </div>


          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-campus-subtext mb-1.5">
                Password *
              </label>
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                placeholder="Min 6 characters"
                required
                className="campus-input"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-campus-subtext mb-1.5">
                Confirm Password *
              </label>
              <input
                type="password"
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                placeholder="Re-enter password"
                required
                className="campus-input"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="campus-btn-primary w-full mt-2"
          >
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Creating Account...
              </span>
            ) : (
              <>
                <UserPlus className="w-4 h-4" />
                Register Account
              </>
            )}
          </button>
        </form>

        <div className="mt-6 text-center text-xs text-campus-muted">
          Already have an account?{' '}
          <Link to="/login" className="text-campus-accent hover:underline font-medium inline-flex items-center gap-1">
            Sign in here <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Register;
