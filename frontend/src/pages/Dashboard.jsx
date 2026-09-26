import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  Bot,
  FileText,
  BookOpen,
  Bell,
  ArrowRight,
  Shield,
  Layers,
  Calendar,
} from 'lucide-react';

const Dashboard = () => {
  const { user, isAdmin } = useAuth();

  const quickActions = [
    {
      title: 'CampusGpt Chat',
      description: 'Ask any question grounded in official university documents',
      icon: Bot,
      to: '/assistant',
      badge: 'AI Assistant',
      borderHover: 'hover:border-blue-500/50',
      iconColor: 'text-blue-400 bg-blue-500/10',
    },
    {
      title: 'Browse Documents',
      description: 'Official academic regulations, syllabi, handbooks, rules',
      icon: FileText,
      to: '/documents',
      badge: 'Verified Docs',
      borderHover: 'hover:border-emerald-500/50',
      iconColor: 'text-emerald-400 bg-emerald-500/10',
    },
    {
      title: 'Explore Courses',
      description: 'Course catalog, prerequisites, syllabus, and credit structures',
      icon: BookOpen,
      to: '/courses',
      badge: 'Catalog',
      borderHover: 'hover:border-amber-500/50',
      iconColor: 'text-amber-400 bg-amber-500/10',
    },
    {
      title: 'View Notices',
      description: 'Official university circulars, datesheets, and announcements',
      icon: Bell,
      to: '/notices',
      badge: 'Circulars',
      borderHover: 'hover:border-rose-500/50',
      iconColor: 'text-rose-400 bg-rose-500/10',
    },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Welcome Banner */}
      <div className="campus-card p-6 sm:p-8 bg-campus-surface">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-medium px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                {user?.role === 'admin' ? 'Administrator' : 'Student Portal'}
              </span>
              <span className="text-xs text-campus-muted font-mono">{user?.year}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              Welcome, {user?.name || 'Student'}
            </h1>
            <p className="text-sm text-campus-muted">
              Department of {user?.department || 'Computer Science & Engineering'} • CampusGpt
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              to="/assistant"
              className="campus-btn-primary"
            >
              <Bot className="w-4 h-4" />
              Open Chat
            </Link>
            {isAdmin && (
              <Link
                to="/admin"
                className="campus-btn-secondary border-purple-500/30 text-purple-300 hover:text-white"
              >
                <Shield className="w-4 h-4 text-purple-400" />
                Admin Panel
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions Grid */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white tracking-tight flex items-center gap-2">
          <Layers className="w-4 h-4 text-campus-accent" />
          Quick Actions
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <Link
                key={action.title}
                to={action.to}
                className={`campus-card campus-card-hover p-5 flex flex-col justify-between group ${action.borderHover}`}
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${action.iconColor}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-campus-card border border-campus-border text-campus-muted">
                      {action.badge}
                    </span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-white group-hover:text-campus-accent transition-colors">
                      {action.title}
                    </h3>
                    <p className="text-xs text-campus-muted mt-1 leading-relaxed">
                      {action.description}
                    </p>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-campus-border/60 flex items-center justify-between text-xs text-campus-subtext group-hover:text-white">
                  <span>Open</span>
                  <ArrowRight className="w-3.5 h-3.5 transform group-hover:translate-x-1 transition-transform" />
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Recent Activity Section */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white tracking-tight flex items-center gap-2">
          <Calendar className="w-4 h-4 text-campus-accent" />
          Recent Activity
        </h2>
        <div className="campus-card p-8 text-center border-dashed">
          <div className="w-12 h-12 rounded-full bg-campus-card border border-campus-border text-campus-muted mx-auto flex items-center justify-center mb-3">
            <Calendar className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-medium text-campus-subtext">No recent activity</h3>
          <p className="text-xs text-campus-muted mt-1 max-w-sm mx-auto">
            Your conversations and viewed documents will appear here.
          </p>
        </div>
      </section>
    </div>
  );
};

export default Dashboard;
