import React, { useState, useEffect, useCallback } from 'react';
import { adminAPI } from '../../services/api';
import {
  Calendar,
  Plus,
  Search,
  RefreshCw,
  Trash2,
  CheckCircle2,
  AlertCircle,
  X,
  Clock,
  ExternalLink,
  Tag,
  Filter,
} from 'lucide-react';

const EVENT_TYPES = [
  'registration',
  'exam',
  'holiday',
  'admission',
  'fee_payment',
  'result',
  'academic_calendar',
  'convocation',
  'other',
];

const EventManagement = ({ onCacheInvalidate }) => {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState(null);

  // Filters
  const [search, setSearch] = useState('');
  const [eventType, setEventType] = useState('all');
  const [upcoming, setUpcoming] = useState('false');
  const [activeFilter, setActiveFilter] = useState('all');

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [modalError, setModalError] = useState('');
  const [form, setForm] = useState({
    title: '',
    description: '',
    eventType: 'registration',
    startDate: '',
    endDate: '',
    registrationDeadline: '',
    program: '',
    department: '',
    sourceUrl: '',
    isActive: true,
  });

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (search.trim()) params.search = search.trim();
      if (eventType !== 'all') params.eventType = eventType;
      if (upcoming === 'true') params.upcoming = 'true';
      if (activeFilter !== 'all') params.isActive = activeFilter;

      const res = await adminAPI.getEvents(params);
      if (res?.data?.events) {
        setEvents(res.data.events);
      }
    } catch (err) {
      console.error('Failed to fetch events:', err);
      setFeedback({ type: 'error', message: err.message || 'Failed to load events' });
    } finally {
      setLoading(false);
    }
  }, [search, eventType, upcoming, activeFilter]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const handleCreateEvent = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.startDate) {
      setModalError('Title and Start Date are required.');
      return;
    }

    setCreating(true);
    setModalError('');

    try {
      await adminAPI.createEvent({
        title: form.title.trim(),
        description: form.description.trim(),
        eventType: form.eventType,
        startDate: form.startDate,
        endDate: form.endDate || undefined,
        registrationDeadline: form.registrationDeadline || undefined,
        program: form.program.trim() || undefined,
        department: form.department.trim() || undefined,
        sourceUrl: form.sourceUrl.trim() || undefined,
        isActive: form.isActive,
      });

      setFeedback({
        type: 'success',
        message: `Academic Event "${form.title}" successfully created!`,
      });
      setShowModal(false);
      setForm({
        title: '',
        description: '',
        eventType: 'registration',
        startDate: '',
        endDate: '',
        registrationDeadline: '',
        program: '',
        department: '',
        sourceUrl: '',
        isActive: true,
      });
      fetchEvents();
      if (onCacheInvalidate) onCacheInvalidate();
    } catch (err) {
      setModalError(err.message || 'Failed to create event');
    } finally {
      setCreating(false);
    }
  };

  const handleToggleActive = async (event) => {
    try {
      await adminAPI.updateEvent(event._id, { isActive: !event.isActive });
      setFeedback({
        type: 'success',
        message: `Event "${event.title}" marked as ${!event.isActive ? 'Active' : 'Inactive'}`,
      });
      fetchEvents();
      if (onCacheInvalidate) onCacheInvalidate();
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Failed to update event' });
    }
  };

  const handleDelete = async (event) => {
    if (!window.confirm(`Are you sure you want to deactivate/delete event "${event.title}"?`)) {
      return;
    }
    try {
      await adminAPI.deleteEvent(event._id);
      setFeedback({
        type: 'success',
        message: `Event "${event.title}" deleted successfully.`,
      });
      fetchEvents();
      if (onCacheInvalidate) onCacheInvalidate();
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Failed to delete event' });
    }
  };

  const getEventTypeColor = (type) => {
    switch (type) {
      case 'registration':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      case 'exam':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      case 'holiday':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'fee_payment':
        return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
      case 'result':
        return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20';
      default:
        return 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20';
    }
  };

  return (
    <div className="space-y-4">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-purple-400" />
          <h2 className="text-lg font-bold text-white tracking-tight">Academic Events & Deadlines</h2>
          <span className="px-2 py-0.5 rounded text-xs font-mono bg-purple-500/20 text-purple-300 border border-purple-500/30">
            {events.length} events
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowModal(true)}
            className="campus-btn-primary bg-purple-600 hover:bg-purple-500 shadow-purple-500/20 text-xs py-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Academic Event
          </button>
          <button
            onClick={fetchEvents}
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Keyword Search */}
          <div className="relative">
            <Search className="w-4 h-4 text-campus-muted absolute left-3 top-3" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') fetchEvents();
              }}
              placeholder="Search event title, description..."
              className="campus-input pl-9 text-xs"
            />
          </div>

          {/* Event Type Filter */}
          <div>
            <select
              value={eventType}
              onChange={(e) => setEventType(e.target.value)}
              className="campus-input text-xs"
            >
              <option value="all">All Event Types</option>
              {EVENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.replace('_', ' ').toUpperCase()}
                </option>
              ))}
            </select>
          </div>

          {/* Upcoming Filter */}
          <div>
            <select
              value={upcoming}
              onChange={(e) => setUpcoming(e.target.value)}
              className="campus-input text-xs"
            >
              <option value="false">All Deadlines & Past Events</option>
              <option value="true">Upcoming Deadlines Only</option>
            </select>
          </div>

          {/* Active Filter */}
          <div>
            <select
              value={activeFilter}
              onChange={(e) => setActiveFilter(e.target.value)}
              className="campus-input text-xs"
            >
              <option value="all">All Statuses</option>
              <option value="true">Active Only</option>
              <option value="false">Inactive Only</option>
            </select>
          </div>
        </div>
      </div>

      {/* Events Table */}
      <div className="campus-card overflow-hidden">
        {loading && events.length === 0 ? (
          <div className="p-8 text-center text-xs text-campus-muted">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-purple-400" />
            Loading academic events...
          </div>
        ) : events.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <Calendar className="w-12 h-12 text-campus-muted mx-auto" />
            <h3 className="text-sm font-semibold text-white">No academic events found</h3>
            <p className="text-xs text-campus-muted max-w-md mx-auto">
              No calendar events or registration deadlines match your filters. Add official deadlines to answer student date inquiries.
            </p>
            <button
              onClick={() => setShowModal(true)}
              className="campus-btn-primary text-xs mt-2"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Academic Event
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-campus-surface/80 border-b border-campus-border text-campus-muted font-mono uppercase text-[10px]">
                <tr>
                  <th className="py-3 px-4">Event Title & Details</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Dates</th>
                  <th className="py-3 px-4">Deadline</th>
                  <th className="py-3 px-4">Target Scope</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-campus-border/60">
                {events.map((ev) => (
                  <tr key={ev._id} className="hover:bg-campus-card/40 transition-colors">
                    <td className="py-3 px-4 max-w-xs">
                      <div className="font-semibold text-white">{ev.title}</div>
                      {ev.description && (
                        <div className="text-[11px] text-campus-muted truncate">
                          {ev.description}
                        </div>
                      )}
                      {ev.sourceUrl && (
                        <a
                          href={ev.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[10px] text-blue-400 hover:underline mt-0.5"
                        >
                          Official link <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase border font-semibold ${getEventTypeColor(
                          ev.eventType
                        )}`}
                      >
                        {ev.eventType.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px]">
                      <div>{new Date(ev.startDate).toLocaleDateString()}</div>
                      {ev.endDate && (
                        <div className="text-campus-muted text-[10px]">
                          to {new Date(ev.endDate).toLocaleDateString()}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px]">
                      {ev.registrationDeadline ? (
                        <span className="px-2 py-0.5 rounded bg-red-500/10 text-red-300 border border-red-500/20 font-bold">
                          {new Date(ev.registrationDeadline).toLocaleDateString()}
                        </span>
                      ) : (
                        <span className="text-campus-muted">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="text-campus-text">
                        {ev.program || ev.department || 'All Students'}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <button
                        onClick={() => handleToggleActive(ev)}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-medium transition-colors ${
                          ev.isActive
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20'
                            : 'bg-zinc-500/10 text-zinc-400 border border-zinc-500/30 hover:bg-zinc-500/20'
                        }`}
                      >
                        {ev.isActive ? 'ACTIVE' : 'INACTIVE'}
                      </button>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => handleDelete(ev)}
                        className="p-1.5 rounded text-campus-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
                        title="Delete event"
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

      {/* Add Event Modal */}
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
                <Calendar className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-semibold text-white">Add Academic Event or Deadline</h3>
                <p className="text-xs text-campus-muted">Add calendar deadline to structured repository</p>
              </div>
            </div>

            {modalError && (
              <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleCreateEvent} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-campus-subtext mb-1">
                  Event Title *
                </label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="e.g. Autumn Semester Course Registration 2026-2027"
                  required
                  className="campus-input text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-campus-subtext mb-1">
                    Event Type *
                  </label>
                  <select
                    value={form.eventType}
                    onChange={(e) => setForm({ ...form, eventType: e.target.value })}
                    className="campus-input text-xs"
                  >
                    {EVENT_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t.replace('_', ' ').toUpperCase()}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-campus-subtext mb-1">
                    Target Program
                  </label>
                  <input
                    type="text"
                    value={form.program}
                    onChange={(e) => setForm({ ...form, program: e.target.value })}
                    placeholder="e.g. B.Tech (leave blank for all)"
                    className="campus-input text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-campus-subtext mb-1">
                    Start Date *
                  </label>
                  <input
                    type="date"
                    value={form.startDate}
                    onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                    required
                    className="campus-input text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-campus-subtext mb-1">
                    End Date
                  </label>
                  <input
                    type="date"
                    value={form.endDate}
                    onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                    className="campus-input text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-campus-subtext mb-1">
                  Registration / Submission Deadline
                </label>
                <input
                  type="date"
                  value={form.registrationDeadline}
                  onChange={(e) => setForm({ ...form, registrationDeadline: e.target.value })}
                  className="campus-input text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-campus-subtext mb-1">
                  Description
                </label>
                <textarea
                  rows="2"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Details, portal links, eligibility notes..."
                  className="campus-input text-xs resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-campus-subtext mb-1">
                  Source / Notice URL
                </label>
                <input
                  type="url"
                  value={form.sourceUrl}
                  onChange={(e) => setForm({ ...form, sourceUrl: e.target.value })}
                  placeholder="https://nitkkr.ac.in/notices/reg2026.pdf"
                  className="campus-input text-xs"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="eventActive"
                  checked={form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                  className="rounded border-campus-border text-purple-600 focus:ring-purple-500 bg-campus-surface"
                />
                <label htmlFor="eventActive" className="text-xs text-campus-subtext">
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
                  {creating ? 'Saving Event...' : 'Create Event'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default EventManagement;
