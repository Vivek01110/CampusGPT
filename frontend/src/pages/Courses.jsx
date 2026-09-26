import React from 'react';
import { BookOpen, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

const Courses = () => {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <div className="campus-card p-6 bg-campus-surface">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="text-xs font-mono font-medium px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
              Curriculum & Electives
            </span>
            <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
              <BookOpen className="w-6 h-6 text-blue-400" />
              University Course Catalog
            </h1>
            <p className="text-sm text-campus-muted">
              Explore departmental curricula, elective tracks, prerequisites, and credit mappings
            </p>
          </div>
        </div>
      </div>

      {/* Info Card */}
      <div className="campus-card p-12 text-center border-dashed space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400 mx-auto flex items-center justify-center shadow-sm">
          <BookOpen className="w-8 h-8" />
        </div>
        <div className="max-w-md mx-auto space-y-2">
          <h2 className="text-lg font-semibold text-white">Course Inquiries with CampusGpt</h2>
          <p className="text-xs text-campus-muted leading-relaxed">
            You can ask CampusGpt directly about course syllabi, prerequisites, and elective paths (e.g., <em>"Which 7th semester CSE electives cover Cloud Computing?"</em>).
          </p>
        </div>
        <div className="pt-2">
          <Link to="/assistant" className="campus-btn-primary inline-flex items-center gap-2 text-xs">
            Ask in CampusGpt Chat
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Courses;
