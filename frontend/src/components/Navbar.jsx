import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  GraduationCap,
  Bot,
  FileText,
  BookOpen,
  Bell,
  LayoutDashboard,
  Shield,
  User,
  LogOut,
  Menu,
  X,
  Sparkles,
} from 'lucide-react';

const Navbar = () => {
  const { user, isAuthenticated, isAdmin, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const navLinks = [
    { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { name: 'Campus Assistant', path: '/assistant', icon: Bot, highlight: true },
    { name: 'Documents', path: '/documents', icon: FileText },
    { name: 'Courses', path: '/courses', icon: BookOpen },
    { name: 'Notices', path: '/notices', icon: Bell },
  ];

  const isActive = (path) => location.pathname === path;

  return (
    <nav className="sticky top-0 z-50 bg-campus-surface/90 backdrop-blur-md border-b border-campus-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Platform Name */}
          <div className="flex items-center gap-3">
            <Link to={isAuthenticated ? '/assistant' : '/'} className="flex items-center gap-2.5 group">
              <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-sm">
                <GraduationCap className="w-4 h-4" />
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-white tracking-tight text-base sm:text-lg">CampusGpt</span>
                <span className="text-[10px] text-campus-muted -mt-0.5 hidden sm:block">NIT Kurukshetra</span>
              </div>
            </Link>

            {/* Desktop Navigation Links */}
            {isAuthenticated && (
              <div className="hidden md:flex items-center space-x-1 ml-6 pl-6 border-l border-campus-border">
                {navLinks.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.path);
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                        active
                          ? 'bg-campus-border/60 text-white shadow-sm'
                          : 'text-campus-muted hover:text-campus-text hover:bg-campus-card'
                      } ${item.highlight && !active ? 'text-campus-accent-hover' : ''}`}
                    >
                      <Icon className="w-4 h-4" />
                      {item.name}
                      {item.highlight && (
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                      )}
                    </Link>
                  );
                })}

                {isAdmin && (
                  <Link
                    to="/admin"
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      isActive('/admin')
                        ? 'bg-purple-900/40 text-purple-200 border border-purple-500/30'
                        : 'text-purple-400 hover:text-purple-300 hover:bg-purple-950/30'
                    }`}
                  >
                    <Shield className="w-4 h-4" />
                    Admin
                  </Link>
                )}
              </div>
            )}
          </div>

          {/* Right Section: User Status or Auth Buttons */}
          <div className="hidden md:flex items-center gap-3">
            {isAuthenticated ? (
              <div className="relative">
                <button
                  onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
                  className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg border border-campus-border bg-campus-card hover:border-campus-accent/40 transition-colors"
                >
                  <div className="w-7 h-7 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30 flex items-center justify-center font-semibold text-xs uppercase">
                    {user?.name?.charAt(0) || 'U'}
                  </div>
                  <div className="text-left hidden lg:block">
                    <p className="text-xs font-medium text-white leading-none">{user?.name}</p>
                    <span className={`text-[10px] font-mono leading-none capitalize ${isAdmin ? 'text-purple-400' : 'text-campus-muted'}`}>
                      {user?.role}
                    </span>
                  </div>
                </button>

                {/* Dropdown Menu */}
                {profileDropdownOpen && (
                  <div
                    onMouseLeave={() => setProfileDropdownOpen(false)}
                    className="absolute right-0 mt-2 w-56 campus-card py-2 shadow-2xl z-50 border-campus-border animate-in fade-in slide-in-from-top-1"
                  >
                    <div className="px-4 py-2 border-b border-campus-border">
                      <p className="text-sm font-medium text-white truncate">{user?.name}</p>
                      <p className="text-xs text-campus-muted truncate">{user?.email}</p>
                      <div className="mt-1.5 flex items-center gap-2">
                        <span className={`text-[10px] px-2 py-0.5 rounded font-mono uppercase tracking-wider ${
                          isAdmin ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                        }`}>
                          {user?.role}
                        </span>
                        <span className="text-[10px] text-campus-muted font-mono">{user?.year}</span>
                      </div>
                    </div>

                    <Link
                      to="/profile"
                      onClick={() => setProfileDropdownOpen(false)}
                      className="flex items-center gap-2 px-4 py-2 text-sm text-campus-subtext hover:text-white hover:bg-campus-border/40"
                    >
                      <User className="w-4 h-4 text-campus-muted" />
                      Campus Profile
                    </Link>

                    {isAdmin && (
                      <Link
                        to="/admin"
                        onClick={() => setProfileDropdownOpen(false)}
                        className="flex items-center gap-2 px-4 py-2 text-sm text-purple-300 hover:text-white hover:bg-purple-950/40"
                      >
                        <Shield className="w-4 h-4 text-purple-400" />
                        Admin Dashboard
                      </Link>
                    )}

                    <div className="border-t border-campus-border my-1" />

                    <button
                      onClick={handleLogout}
                      className="flex items-center gap-2 w-full px-4 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-950/30"
                    >
                      <LogOut className="w-4 h-4" />
                      Sign Out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link to="/login" className="campus-btn-secondary py-1.5 px-3">
                  Log In
                </Link>
                <Link to="/register" className="campus-btn-primary py-1.5 px-3">
                  Register
                </Link>
              </div>
            )}
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden flex items-center">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-lg text-campus-muted hover:text-white hover:bg-campus-border/50"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b border-campus-border bg-campus-surface px-4 pt-2 pb-4 space-y-1">
          {isAuthenticated ? (
            <>
              <div className="px-3 py-2 border-b border-campus-border mb-2">
                <p className="text-sm font-semibold text-white">{user?.name}</p>
                <p className="text-xs text-campus-muted font-mono">{user?.email} • {user?.role}</p>
              </div>
              {navLinks.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium ${
                    isActive(item.path) ? 'bg-campus-border text-white' : 'text-campus-muted hover:bg-campus-card hover:text-white'
                  }`}
                >
                  <item.icon className="w-4 h-4" />
                  {item.name}
                </Link>
              ))}
              {isAdmin && (
                <Link
                  to="/admin"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium text-purple-400 hover:bg-purple-950/40"
                >
                  <Shield className="w-4 h-4" />
                  Admin Dashboard
                </Link>
              )}
              <Link
                to="/profile"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium text-campus-muted hover:bg-campus-card"
              >
                <User className="w-4 h-4" />
                Profile
              </Link>
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  handleLogout();
                }}
                className="flex items-center gap-2 w-full px-3 py-2 rounded-md text-sm font-medium text-red-400 hover:bg-red-950/30"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </>
          ) : (
            <div className="flex flex-col gap-2 pt-2">
              <Link
                to="/login"
                onClick={() => setMobileMenuOpen(false)}
                className="campus-btn-secondary w-full"
              >
                Log In
              </Link>
              <Link
                to="/register"
                onClick={() => setMobileMenuOpen(false)}
                className="campus-btn-primary w-full"
              >
                Register
              </Link>
            </div>
          )}
        </div>
      )}
    </nav>
  );
};

export default Navbar;
