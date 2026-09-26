import React, { useState, useEffect, useCallback } from 'react';
import { adminAPI } from '../../services/api';
import {
  GraduationCap,
  Plus,
  Search,
  RefreshCw,
  Trash2,
  CheckCircle2,
  AlertCircle,
  X,
  BookOpen,
  Filter,
  Layers,
  Award,
} from 'lucide-react';

const DEPARTMENTS = [
  'Computer Science & Engineering',
  'Information Technology',
  'Electronics & Communication Engineering',
  'Electrical Engineering',
  'Mechanical Engineering',
  'Civil Engineering',
  'Humanities & Social Sciences',
  'Mathematics',
  'Physics',
  'Chemistry',
];

const PROGRAMS = ['B.Tech', 'M.Tech', 'MCA', 'PhD', 'MBA'];
const COURSE_TYPES = ['core', 'elective', 'lab', 'audit'];

const CourseManagement = ({ onCacheInvalidate }) => {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState(null);

  // Filters
  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState('all');
  const [program, setProgram] = useState('all');
  const [semester, setSemester] = useState('all');
  const [courseType, setCourseType] = useState('all');
  const [activeFilter, setActiveFilter] = useState('all');

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [modalError, setModalError] = useState('');
  const [form, setForm] = useState({
    code: '',
    name: '',
    department: 'Computer Science & Engineering',
    program: 'B.Tech',
    semester: 1,
    credits: 4,
    type: 'core',
    description: '',
    prerequisites: '',
    isActive: true,
  });

  const fetchCourses = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (search.trim()) params.search = search.trim();
      if (department !== 'all') params.department = department;
      if (program !== 'all') params.program = program;
      if (semester !== 'all') params.semester = semester;
      if (courseType !== 'all') params.type = courseType;
      if (activeFilter !== 'all') params.isActive = activeFilter;

      const res = await adminAPI.getCourses(params);
      if (res?.data?.courses) {
        setCourses(res.data.courses);
      }
    } catch (err) {
      console.error('Failed to fetch courses:', err);
      setFeedback({ type: 'error', message: err.message || 'Failed to load courses' });
    } finally {
      setLoading(false);
    }
  }, [search, department, program, semester, courseType, activeFilter]);

  useEffect(() => {
    fetchCourses();
  }, [fetchCourses]);

  const handleCreateCourse = async (e) => {
    e.preventDefault();
    if (!form.code.trim() || !form.name.trim()) {
      setModalError('Course Code and Name are required.');
      return;
    }

    setCreating(true);
    setModalError('');

    try {
      const prereqs = form.prerequisites
        ? form.prerequisites.split(',').map((p) => p.trim()).filter(Boolean)
        : [];

      await adminAPI.createCourse({
        code: form.code.trim().toUpperCase(),
        name: form.name.trim(),
        department: form.department,
        program: form.program,
        semester: Number(form.semester),
        credits: Number(form.credits),
        type: form.type,
        description: form.description.trim(),
        prerequisites: prereqs,
        isActive: form.isActive,
      });

      setFeedback({
        type: 'success',
        message: `Course ${form.code.toUpperCase()} successfully created!`,
      });
      setShowModal(false);
      setForm({
        code: '',
        name: '',
        department: 'Computer Science & Engineering',
        program: 'B.Tech',
        semester: 1,
        credits: 4,
        type: 'core',
        description: '',
        prerequisites: '',
        isActive: true,
      });
      fetchCourses();
      if (onCacheInvalidate) onCacheInvalidate();
    } catch (err) {
      setModalError(err.message || 'Failed to create course');
    } finally {
      setCreating(false);
    }
  };

  const handleToggleActive = async (course) => {
    try {
      await adminAPI.updateCourse(course._id, { isActive: !course.isActive });
      setFeedback({
        type: 'success',
        message: `Course ${course.code} marked as ${!course.isActive ? 'Active' : 'Inactive'}`,
      });
      fetchCourses();
      if (onCacheInvalidate) onCacheInvalidate();
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Failed to update course status' });
    }
  };

  const handleDelete = async (course) => {
    if (!window.confirm(`Are you sure you want to deactivate/delete course ${course.code} (${course.name})?`)) {
      return;
    }
    try {
      await adminAPI.deleteCourse(course._id);
      setFeedback({
        type: 'success',
        message: `Course ${course.code} deleted successfully.`,
      });
      fetchCourses();
      if (onCacheInvalidate) onCacheInvalidate();
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Failed to delete course' });
    }
  };

  return (
    <div className="space-y-4">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <GraduationCap className="w-5 h-5 text-purple-400" />
          <h2 className="text-lg font-bold text-white tracking-tight">Structured Course Catalog</h2>
          <span className="px-2 py-0.5 rounded text-xs font-mono bg-purple-500/20 text-purple-300 border border-purple-500/30">
            {courses.length} courses
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowModal(true)}
            className="campus-btn-primary bg-purple-600 hover:bg-purple-500 shadow-purple-500/20 text-xs py-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Course
          </button>
          <button
            onClick={fetchCourses}
            disabled={loading}
            className="campus-btn-secondary text-xs py-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-3 rounded-lg text-xs flex items-center justify-between gap-2 ${
            feedback.type === 'success'
              ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
              : 'bg-red-500/10 border border-red-500/30 text-red-400'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="text-campus-muted hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="campus-card p-4 space-y-3 bg-campus-surface/90 border-campus-border">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          {/* Keyword Search */}
          <div className="relative sm:col-span-2">
            <Search className="w-4 h-4 text-campus-muted absolute left-3 top-3" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') fetchCourses();
              }}
              placeholder="Search code, title, keywords..."
              className="campus-input pl-9 text-xs"
            />
          </div>

          {/* Department Filter */}
          <div>
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="campus-input text-xs"
            >
              <option value="all">All Departments</option>
              {DEPARTMENTS.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
          </div>

          {/* Program Filter */}
          <div>
            <select
              value={program}
              onChange={(e) => setProgram(e.target.value)}
              className="campus-input text-xs"
            >
              <option value="all">All Programs</option>
              {PROGRAMS.map((prog) => (
                <option key={prog} value={prog}>
                  {prog}
                </option>
              ))}
            </select>
          </div>

          {/* Semester Filter */}
          <div>
            <select
              value={semester}
              onChange={(e) => setSemester(e.target.value)}
              className="campus-input text-xs"
            >
              <option value="all">All Semesters</option>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((sem) => (
                <option key={sem} value={sem}>
                  Semester {sem}
                </option>
              ))}
            </select>
          </div>

          {/* Type Filter */}
          <div>
            <select
              value={courseType}
              onChange={(e) => setCourseType(e.target.value)}
              className="campus-input text-xs"
            >
              <option value="all">All Types</option>
              {COURSE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Courses Table */}
      <div className="campus-card overflow-hidden">
        {loading && courses.length === 0 ? (
          <div className="p-8 text-center text-xs text-campus-muted">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-purple-400" />
            Loading course catalog...
          </div>
        ) : courses.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <BookOpen className="w-12 h-12 text-campus-muted mx-auto" />
            <h3 className="text-sm font-semibold text-white">No courses found</h3>
            <p className="text-xs text-campus-muted max-w-md mx-auto">
              No structured courses match the selected filters. Add a new course to seed the catalog.
            </p>
            <button
              onClick={() => setShowModal(true)}
              className="campus-btn-primary text-xs mt-2"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Course
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-campus-surface/80 border-b border-campus-border text-campus-muted font-mono uppercase text-[10px]">
                <tr>
                  <th className="py-3 px-4">Code</th>
                  <th className="py-3 px-4">Course Name</th>
                  <th className="py-3 px-4">Department & Program</th>
                  <th className="py-3 px-4">Sem</th>
                  <th className="py-3 px-4">Credits</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-campus-border/60">
                {courses.map((c) => (
                  <tr key={c._id} className="hover:bg-campus-card/40 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-purple-300">
                      <span className="px-2 py-0.5 rounded bg-purple-500/10 border border-purple-500/20">
                        {c.code}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-white">{c.name}</div>
                      {c.description && (
                        <div className="text-[11px] text-campus-muted truncate max-w-xs">
                          {c.description}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="text-campus-text">{c.department}</div>
                      <div className="text-[10px] font-mono text-campus-muted">{c.program}</div>
                    </td>
                    <td className="py-3 px-4 font-mono text-center">
                      <span className="px-2 py-0.5 rounded bg-campus-surface text-campus-subtext border border-campus-border">
                        Sem {c.semester}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-center text-white font-bold">
                      {c.credits}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase font-semibold ${
                          c.type === 'core'
                            ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                            : c.type === 'elective'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : c.type === 'lab'
                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            : 'bg-zinc-500/10 text-zinc-400 border border-zinc-500/20'
                        }`}
                      >
                        {c.type}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <button
                        onClick={() => handleToggleActive(c)}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-medium transition-colors ${
                          c.isActive
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20'
                            : 'bg-zinc-500/10 text-zinc-400 border border-zinc-500/30 hover:bg-zinc-500/20'
                        }`}
                      >
                        {c.isActive ? 'ACTIVE' : 'INACTIVE'}
                      </button>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => handleDelete(c)}
                        className="p-1.5 rounded text-campus-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
                        title="Delete course"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Course Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in">
          <div className="campus-card max-w-lg w-full p-6 relative border-purple-500/30 my-8">
            <button
              onClick={() => setShowModal(false)}
              className="absolute top-4 right-4 text-campus-muted hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-purple-600/20 text-purple-400 flex items-center justify-center">
                <GraduationCap className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-semibold text-white">Add New Course</h3>
                <p className="text-xs text-campus-muted">Add course to the structured catalog</p>
              </div>
            </div>

            {modalError && (
              <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleCreateCourse} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-campus-subtext mb-1">
                    Course Code *
                  </label>
                  <input
                    type="text"
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                    placeholder="e.g. CS301"
                    required
                    className="campus-input text-xs uppercase font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-campus-subtext mb-1">
                    Course Name *
                  </label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g. Database Management Systems"
                    required
                    className="campus-input text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-campus-subtext mb-1">
                    Department *
                  </label>
                  <select
                    value={form.department}
                    onChange={(e) => setForm({ ...form, department: e.target.value })}
                    className="campus-input text-xs"
                  >
                    {DEPARTMENTS.map((dept) => (
                      <option key={dept} value={dept}>
                        {dept}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-campus-subtext mb-1">
                    Program *
                  </label>
                  <select
                    value={form.program}
                    onChange={(e) => setForm({ ...form, program: e.target.value })}
                    className="campus-input text-xs"
                  >
                    {PROGRAMS.map((prog) => (
                      <option key={prog} value={prog}>
                        {prog}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-campus-subtext mb-1">
                    Semester (1-8) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="8"
                    value={form.semester}
                    onChange={(e) => setForm({ ...form, semester: e.target.value })}
                    required
                    className="campus-input text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-campus-subtext mb-1">
                    Credits *
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="12"
                    value={form.credits}
                    onChange={(e) => setForm({ ...form, credits: e.target.value })}
                    required
                    className="campus-input text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-campus-subtext mb-1">
                    Course Type *
                  </label>
                  <select
                    value={form.type}
                    onChange={(e) => setForm({ ...form, type: e.target.value })}
                    className="campus-input text-xs"
                  >
                    {COURSE_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t.toUpperCase()}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-campus-subtext mb-1">
                  Description
                </label>
                <textarea
                  rows="2"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Overview, curriculum, lab components..."
                  className="campus-input text-xs resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-campus-subtext mb-1">
                  Prerequisites (comma-separated codes)
                </label>
                <input
                  type="text"
                  value={form.prerequisites}
                  onChange={(e) => setForm({ ...form, prerequisites: e.target.value })}
                  placeholder="e.g. CS201, CS204"
                  className="campus-input text-xs font-mono"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="courseActive"
                  checked={form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                  className="rounded border-campus-border text-purple-600 focus:ring-purple-500 bg-campus-surface"
                />
                <label htmlFor="courseActive" className="text-xs text-campus-subtext">
                  Set as Active in Search Catalog
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-campus-border">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="campus-btn-secondary text-xs py-2"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="campus-btn-primary bg-purple-600 hover:bg-purple-500 text-xs py-2"
                >
                  {creating ? 'Saving Course...' : 'Create Course'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default CourseManagement;
