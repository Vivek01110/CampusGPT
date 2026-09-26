import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { authAPI, documentAPI, chatAPI, adminAPI } from '../services/api';
import CourseManagement from '../components/admin/CourseManagement';
import EventManagement from '../components/admin/EventManagement';
import DiagnosticsTab from '../components/admin/DiagnosticsTab';
import CrawlerManagement from '../components/admin/CrawlerManagement';
import {
  Shield,
  FileText,
  Upload,
  Trash2,
  Users,
  Bell,
  BarChart3,
  CheckCircle2,
  AlertCircle,
  Clock,
  Layers,
  RefreshCw,
  Plus,
  X,
  FileCheck,
  AlertTriangle,
  FolderOpen,
  Bot,
  Search,
  Zap,
  Database,
  Flame,
  History,
  GitBranch,
  ExternalLink,
  ToggleLeft,
  ToggleRight,
  RotateCcw,
  Check,
  Copy,
  Hash,
  GraduationCap,
  Calendar,
  Globe,
  Sparkles,
} from 'lucide-react';

const AdminDashboard = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('courses');
  const [adminVerification, setAdminVerification] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');

  // ----------------------------------------------------
  // Phase 5 Document Management Platform State
  // ----------------------------------------------------
  const [documents, setDocuments] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
  });

  // Filters & Search
  const [searchFilter, setSearchFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [activeFilter, setActiveFilter] = useState('all');

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showVersionModal, setShowVersionModal] = useState(false);
  const [showUploadVersionModal, setShowUploadVersionModal] = useState(false);
  const [selectedDocForVersions, setSelectedDocForVersions] = useState(null);
  const [docVersions, setDocVersions] = useState([]);
  const [loadingVersions, setLoadingVersions] = useState(false);

  // Ingest Document Form state
  const [createFile, setCreateFile] = useState(null);
  const [createTitle, setCreateTitle] = useState('');
  const [createCategory, setCreateCategory] = useState('academics');
  const [createDepartment, setCreateDepartment] = useState('Computer Science & Engineering');
  const [createDocType, setCreateDocType] = useState('regulation');
  const [createSourceAuthority, setCreateSourceAuthority] = useState('official');
  const [createDescription, setCreateDescription] = useState('');
  const [createSourceUrl, setCreateSourceUrl] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createSuccess, setCreateSuccess] = useState('');

  // Upload New Version Form state
  const [newVersionFile, setNewVersionFile] = useState(null);
  const [uploadingVersion, setUploadingVersion] = useState(false);
  const [versionUploadError, setVersionUploadError] = useState('');
  const [versionUploadSuccess, setVersionUploadSuccess] = useState('');
  const [isDuplicateWarning, setIsDuplicateWarning] = useState(false);

  // Operational Action states
  const [reindexingId, setReindexingId] = useState(null);
  const [retryingVersionId, setRetryingVersionId] = useState(null);
  const [togglingStatusId, setTogglingStatusId] = useState(null);
  const [actionFeedback, setActionFeedback] = useState(null);

  // Phase 4 Redis & Cache state
  const [cacheStats, setCacheStats] = useState(null);
  const [loadingCacheStats, setLoadingCacheStats] = useState(false);
  const [invalidatingCache, setInvalidatingCache] = useState(false);
  const [cacheFeedback, setCacheFeedback] = useState(null);

  // Phase 3 Hybrid Retrieval Diagnostics State
  const [debugQuery, setDebugQuery] = useState('What does section 1.2 say about medical condonation?');
  const [debugResults, setDebugResults] = useState(null);
  const [debugging, setDebugging] = useState(false);
  const [debugError, setDebugError] = useState('');

  // ----------------------------------------------------
  // Document Fetching (Paginated & Filtered)
  // ----------------------------------------------------
  const fetchDocuments = useCallback(async (pageOverride) => {
    setLoadingDocs(true);
    try {
      const pageToFetch = pageOverride !== undefined ? pageOverride : pagination.page;
      const params = {
        page: pageToFetch,
        limit: pagination.limit,
      };
      if (searchFilter.trim()) params.search = searchFilter.trim();
      if (categoryFilter !== 'all') params.category = categoryFilter;
      if (statusFilter !== 'all') params.status = statusFilter;
      if (activeFilter !== 'all') params.isActive = activeFilter;

      const res = await adminAPI.getDocuments(params);
      if (res?.data) {
        setDocuments(res.data.documents || []);
        if (res.data.pagination) {
          setPagination(res.data.pagination);
        }
      }
    } catch (err) {
      console.error('Failed to load admin documents:', err);
    } finally {
      setLoadingDocs(false);
    }
  }, [pagination.page, pagination.limit, searchFilter, categoryFilter, statusFilter, activeFilter]);

  const fetchCacheStats = async () => {
    setLoadingCacheStats(true);
    try {
      const res = await adminAPI.getCacheStats();
      if (res?.data) {
        setCacheStats(res.data);
      }
    } catch (err) {
      console.warn('Failed to load cache stats:', err);
    } finally {
      setLoadingCacheStats(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
    fetchCacheStats();
  }, [fetchDocuments]);

  // ----------------------------------------------------
  // Document Actions
  // ----------------------------------------------------
  const handleCreateDocument = async (e) => {
    e.preventDefault();
    if (!createFile) {
      setCreateError('Please select a PDF document to upload.');
      return;
    }

    setCreating(true);
    setCreateError('');
    setCreateSuccess('');

    const formData = new FormData();
    formData.append('file', createFile);
    formData.append('title', createTitle.trim() || createFile.name);
    formData.append('category', createCategory);
    formData.append('department', createDepartment);
    formData.append('documentType', createDocType);
    formData.append('sourceAuthority', createSourceAuthority);
    formData.append('description', createDescription.trim());
    formData.append('sourceUrl', createSourceUrl.trim());

    try {
      const res = await adminAPI.createDocument(formData);
      setCreateSuccess(`Document "${res.data.document.title}" registered as Version 1 and scheduled for indexing!`);
      setCreateFile(null);
      setCreateTitle('');
      setCreateDescription('');
      setCreateSourceUrl('');
      setShowCreateModal(false);
      fetchDocuments(1);
      fetchCacheStats();
    } catch (err) {
      setCreateError(err.message || 'Failed to ingest document.');
    } finally {
      setCreating(false);
    }
  };

  const handleOpenVersionsModal = async (doc) => {
    setSelectedDocForVersions(doc);
    setShowVersionModal(true);
    setLoadingVersions(true);
    try {
      const res = await adminAPI.getDocumentVersions(doc._id);
      if (res?.data?.versions) {
        setDocVersions(res.data.versions);
      }
    } catch (err) {
      console.error('Failed to load document versions:', err);
    } finally {
      setLoadingVersions(false);
    }
  };

  const handleOpenUploadVersionModal = (doc) => {
    setSelectedDocForVersions(doc);
    setNewVersionFile(null);
    setVersionUploadError('');
    setVersionUploadSuccess('');
    setIsDuplicateWarning(false);
    setShowUploadVersionModal(true);
  };

  const handleUploadNewVersionSubmit = async (e) => {
    e.preventDefault();
    if (!newVersionFile || !selectedDocForVersions) {
      setVersionUploadError('Please select a PDF file for the new version.');
      return;
    }

    setUploadingVersion(true);
    setVersionUploadError('');
    setVersionUploadSuccess('');
    setIsDuplicateWarning(false);

    const formData = new FormData();
    formData.append('file', newVersionFile);

    try {
      const res = await adminAPI.uploadNewVersion(selectedDocForVersions._id, formData);
      setVersionUploadSuccess(
        `Version ${res.data.version?.versionNumber} created and indexed successfully! It is now the active version for RAG.`
      );
      setNewVersionFile(null);
      setTimeout(() => {
        setShowUploadVersionModal(false);
        fetchDocuments();
        fetchCacheStats();
      }, 1500);
    } catch (err) {
      if (err.status === 409 || err.message?.toLowerCase().includes('identical') || err.message?.toLowerCase().includes('duplicate')) {
        setIsDuplicateWarning(true);
      }
      setVersionUploadError(err.message || 'Failed to upload new version.');
    } finally {
      setUploadingVersion(false);
    }
  };

  const handleReindexDocument = async (id, docTitle) => {
    if (!window.confirm(`Re-index active version of "${docTitle}"? This will re-parse, re-chunk, and re-embed points into Qdrant.`)) {
      return;
    }

    setReindexingId(id);
    setActionFeedback(null);
    try {
      const res = await adminAPI.reindexDocument(id);
      setActionFeedback({
        type: 'success',
        message: `Document "${docTitle}" re-indexed successfully (${res.data.totalChunks} chunks in Qdrant).`,
      });
      fetchDocuments();
      fetchCacheStats();
    } catch (err) {
      setActionFeedback({
        type: 'error',
        message: `Failed to re-index "${docTitle}": ${err.message}`,
      });
    } finally {
      setReindexingId(null);
    }
  };

  const handleToggleStatus = async (doc) => {
    const nextState = !doc.isActive;
    const actionLabel = nextState ? 'activate' : 'deactivate';
    if (!window.confirm(`Are you sure you want to ${actionLabel} "${doc.title}"? ${nextState ? 'It will be included in student RAG searches.' : 'It will be hidden from student RAG queries.'}`)) {
      return;
    }

    setTogglingStatusId(doc._id);
    setActionFeedback(null);
    try {
      await adminAPI.setDocumentStatus(doc._id, nextState);
      setActionFeedback({
        type: 'success',
        message: `Document "${doc.title}" is now ${nextState ? 'ACTIVE' : 'INACTIVE'}. Affected RAG caches invalidated.`,
      });
      fetchDocuments();
      fetchCacheStats();
    } catch (err) {
      setActionFeedback({
        type: 'error',
        message: `Failed to toggle status: ${err.message}`,
      });
    } finally {
      setTogglingStatusId(null);
    }
  };

  const handleRetryVersion = async (docId, versionId, versionNumber) => {
    setRetryingVersionId(versionId);
    setActionFeedback(null);
    try {
      const res = await adminAPI.retryVersion(docId, versionId);
      setActionFeedback({
        type: 'success',
        message: `Version ${versionNumber} retry completed successfully! Chunks indexed: ${res.data.totalChunks}.`,
      });
      // Refresh version list & docs
      const vRes = await adminAPI.getDocumentVersions(docId);
      if (vRes?.data?.versions) setDocVersions(vRes.data.versions);
      fetchDocuments();
      fetchCacheStats();
    } catch (err) {
      setActionFeedback({
        type: 'error',
        message: `Retry for Version ${versionNumber} failed: ${err.message}`,
      });
    } finally {
      setRetryingVersionId(null);
    }
  };

  const handleDeleteDocument = async (id, docTitle) => {
    if (!window.confirm(`Are you sure you want to safely delete "${docTitle}"? It will be deactivated from Qdrant vector retrieval and soft-deleted in MongoDB.`)) {
      return;
    }

    try {
      await adminAPI.deleteDocument(id);
      setActionFeedback({
        type: 'success',
        message: `Document "${docTitle}" deleted safely. Points deactivated and cache invalidated.`,
      });
      fetchDocuments();
      fetchCacheStats();
    } catch (err) {
      setActionFeedback({
        type: 'error',
        message: `Failed to delete document: ${err.message}`,
      });
    }
  };

  const handleInvalidateCache = async () => {
    if (!window.confirm('Are you sure you want to invalidate all RAG cache entries? The active version namespace will be incremented.')) {
      return;
    }

    setInvalidatingCache(true);
    setCacheFeedback(null);
    try {
      const res = await adminAPI.invalidateCache('Admin Dashboard Click');
      setCacheFeedback({
        type: 'success',
        message: `RAG Cache successfully invalidated! Active version bumped to v${res.data?.newVersion}.`,
      });
      fetchCacheStats();
    } catch (err) {
      setCacheFeedback({
        type: 'error',
        message: err.message || 'Failed to invalidate cache.',
      });
    } finally {
      setInvalidatingCache(false);
    }
  };

  const handleVerifyAdminAPI = async () => {
    setVerifying(true);
    setError('');
    try {
      const res = await authAPI.checkAdmin();
      setAdminVerification(res.data);
    } catch (err) {
      setError(err.message || 'Failed to verify admin status with backend.');
    } finally {
      setVerifying(false);
    }
  };

  const handleRunDiagnostics = async (e) => {
    if (e) e.preventDefault();
    if (!debugQuery.trim()) return;

    setDebugging(true);
    setDebugError('');
    try {
      const res = await chatAPI.debug(debugQuery.trim());
      setDebugResults(res.data);
    } catch (err) {
      setDebugError(err.message || 'Retrieval diagnostics failed.');
    } finally {
      setDebugging(false);
    }
  };

  const handleCreateFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.type !== 'application/pdf' && !file.name.endsWith('.pdf')) {
        setCreateError('Only PDF documents (.pdf) are supported.');
        setCreateFile(null);
        return;
      }
      setCreateFile(file);
      setCreateError('');
      if (!createTitle) {
        setCreateTitle(file.name.replace(/\.pdf$/i, ''));
      }
    }
  };

  const formatFileSize = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header Banner */}
      <div className="campus-card p-6 bg-gradient-to-r from-purple-950/40 via-campus-surface to-campus-surface border-purple-500/30">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
              <span className="text-xs font-mono font-medium px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                Phase 5 Production Ingestion Platform (Role: {user?.role})
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight flex items-center gap-2.5">
              <Shield className="w-7 h-7 text-purple-400" />
              Document Registry & Ingestion Platform
            </h1>
            <p className="text-sm text-campus-muted">
              Atomic document versioning, SHA-256 deduplication, Qdrant payload lifecycle & RAG cache management
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowCreateModal(true)}
              className="campus-btn-primary bg-purple-600 hover:bg-purple-500 shadow-purple-500/20 text-xs py-2"
            >
              <Plus className="w-4 h-4" />
              Ingest New Document
            </button>
            <button
              onClick={handleVerifyAdminAPI}
              disabled={verifying}
              className="campus-btn-secondary text-xs border-purple-500/30 text-purple-300 hover:text-white"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${verifying ? 'animate-spin' : ''}`} />
              Test Admin Route
            </button>
          </div>
        </div>

        {/* Live Admin Route verification alert */}
        {adminVerification && (
          <div className="mt-4 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span>
                Backend Admin Protection Verified: User <strong>{adminVerification.adminName}</strong> verified with role <strong>{adminVerification.role}</strong> ({adminVerification.phase}).
              </span>
            </div>
            <span className="font-mono text-[10px] text-emerald-400">Status 200 OK</span>
          </div>
        )}

        {error && (
          <div className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-400 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {actionFeedback && (
          <div
            className={`mt-4 p-3 rounded-lg text-xs flex items-center gap-2 ${
              actionFeedback.type === 'success'
                ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
                : 'bg-red-500/10 border border-red-500/30 text-red-400'
            }`}
          >
            {actionFeedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
            )}
            <span>{actionFeedback.message}</span>
          </div>
        )}
      </div>

      {/* ---------------------------------------------------- */}
      {/* PHASE 6 NAVIGATION TABS */}
      {/* ---------------------------------------------------- */}
      <div className="flex items-center gap-2 border-b border-campus-border/80 pb-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('courses')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
            activeTab === 'courses'
              ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/20'
              : 'text-campus-muted hover:text-white hover:bg-campus-surface'
          }`}
        >
          <GraduationCap className="w-4 h-4" />
          Course Catalog (Phase 6)
        </button>

        <button
          onClick={() => setActiveTab('events')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
            activeTab === 'events'
              ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/20'
              : 'text-campus-muted hover:text-white hover:bg-campus-surface'
          }`}
        >
          <Calendar className="w-4 h-4" />
          Academic Deadlines (Phase 6)
        </button>

        <button
          onClick={() => setActiveTab('crawler')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
            activeTab === 'crawler'
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
              : 'text-campus-muted hover:text-white hover:bg-campus-surface'
          }`}
        >
          <Globe className="w-4 h-4" />
          NIT KKR Crawler (Phase 7)
        </button>

        <button
          onClick={() => setActiveTab('documents')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
            activeTab === 'documents'
              ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/20'
              : 'text-campus-muted hover:text-white hover:bg-campus-surface'
          }`}
        >
          <FileText className="w-4 h-4" />
          Document Registry (Phase 5)
          <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-black/30 font-mono">
            {pagination.total}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('diagnostics')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
            activeTab === 'diagnostics'
              ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/20'
              : 'text-campus-muted hover:text-white hover:bg-campus-surface'
          }`}
        >
          <Bot className="w-4 h-4" />
          Routing & Diagnostics
        </button>

        <button
          onClick={() => setActiveTab('redis')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
            activeTab === 'redis'
              ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/20'
              : 'text-campus-muted hover:text-white hover:bg-campus-surface'
          }`}
        >
          <Database className="w-4 h-4" />
          Redis & Cache (Phase 4)
        </button>
      </div>

      {/* Tab 1: Course Catalog */}
      {activeTab === 'courses' && <CourseManagement onCacheInvalidate={fetchCacheStats} />}

      {/* Tab 2: Academic Events & Deadlines */}
      {activeTab === 'events' && <EventManagement onCacheInvalidate={fetchCacheStats} />}

      {/* Tab: NIT KKR Crawler (Phase 7) */}
      {activeTab === 'crawler' && <CrawlerManagement />}

      {/* Tab 3: Document Registry & Versioning */}
      {activeTab === 'documents' && (
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-purple-400" />
            <h2 className="text-lg font-bold text-white tracking-tight">
              University Document Registry
            </h2>
            <span className="px-2 py-0.5 rounded text-xs font-mono bg-purple-500/20 text-purple-300 border border-purple-500/30">
              {pagination.total} registered
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchDocuments()}
              disabled={loadingDocs}
              className="campus-btn-secondary text-xs py-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingDocs ? 'animate-spin' : ''}`} />
              Refresh Registry
            </button>
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div className="campus-card p-4 space-y-3 bg-campus-surface/90 border-campus-border">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 text-campus-muted absolute left-3 top-3" />
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') fetchDocuments(1); }}
                placeholder="Search document title..."
                className="campus-input pl-9 text-xs"
              />
            </div>

            {/* Category Filter */}
            <div>
              <select
                value={categoryFilter}
                onChange={(e) => { setCategoryFilter(e.target.value); fetchDocuments(1); }}
                className="campus-input text-xs"
              >
                <option value="all">All Categories</option>
                <option value="academics">Academics</option>
                <option value="examinations">Examinations</option>
                <option value="hostel">Hostel</option>
                <option value="admissions">Admissions</option>
                <option value="courses">Courses</option>
                <option value="placements">Placements</option>
                <option value="notices">Notices</option>
                <option value="scholarships">Scholarships</option>
                <option value="other">Other</option>
              </select>
            </div>

            {/* Processing Status Filter */}
            <div>
              <select
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value); fetchDocuments(1); }}
                className="campus-input text-xs"
              >
                <option value="all">All Statuses</option>
                <option value="indexed">Indexed</option>
                <option value="processing">Processing</option>
                <option value="failed">Failed</option>
                <option value="draft">Draft</option>
              </select>
            </div>

            {/* Active / Inactive Filter */}
            <div>
              <select
                value={activeFilter}
                onChange={(e) => { setActiveFilter(e.target.value); fetchDocuments(1); }}
                className="campus-input text-xs"
              >
                <option value="all">All Document States</option>
                <option value="true">Active Only (RAG Live)</option>
                <option value="false">Inactive Only (Hidden)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Documents Table */}
        <div className="campus-card overflow-hidden">
          {loadingDocs && documents.length === 0 ? (
            <div className="p-8 text-center text-xs text-campus-muted">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-purple-400" />
              Loading document registry...
            </div>
          ) : documents.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <FolderOpen className="w-12 h-12 text-campus-muted mx-auto" />
              <h3 className="text-sm font-semibold text-white">No documents found</h3>
              <p className="text-xs text-campus-muted max-w-md mx-auto">
                No university documents match your current filter parameters. Ingest a new document or reset your filters.
              </p>
              <button
                onClick={() => setShowCreateModal(true)}
                className="campus-btn-primary text-xs mt-2"
              >
                <Plus className="w-3.5 h-3.5" />
                Ingest New Document
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-campus-surface/80 border-b border-campus-border text-campus-muted font-mono uppercase text-[10px]">
                  <tr>
                    <th className="py-3 px-4">Document Title & Authority</th>
                    <th className="py-3 px-4">Category / Dept</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4">Current Version</th>
                    <th className="py-3 px-4">Index Status</th>
                    <th className="py-3 px-4">RAG State</th>
                    <th className="py-3 px-4">Chunks / Pages</th>
                    <th className="py-3 px-4">Updated</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-campus-border/60">
                  {documents.map((doc) => (
                    <tr key={doc._id} className="hover:bg-campus-card/40 transition-colors">
                      {/* Document Title & Authority */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-start gap-2">
                          <FileText className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
                          <div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="font-semibold text-white leading-snug">{doc.title}</p>
                              {doc.sourceAuthority && (
                                <span className={`text-[9px] font-mono uppercase px-1.5 py-0.2 rounded border ${
                                  doc.sourceAuthority === 'official'
                                    ? 'bg-purple-500/10 text-purple-300 border-purple-500/30'
                                    : 'bg-campus-card text-campus-muted border-campus-border'
                                }`}>
                                  {doc.sourceAuthority}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[11px] text-campus-muted font-mono truncate max-w-[200px]">
                                {doc.originalFileName || 'Registered Document'}
                              </span>
                              {doc.sourceUrl && (
                                <a
                                  href={doc.sourceUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-400 hover:text-blue-300 inline-flex items-center gap-0.5 text-[10px]"
                                  title="Open source URL"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Category & Department */}
                      <td className="py-3.5 px-4">
                        <div className="space-y-0.5">
                          <span className="capitalize px-2 py-0.5 rounded font-mono text-[10px] bg-campus-card border border-campus-border text-campus-text">
                            {doc.category}
                          </span>
                          <p className="text-[11px] text-campus-muted truncate max-w-[130px]">
                            {doc.department}
                          </p>
                        </div>
                      </td>

                      {/* Document Type */}
                      <td className="py-3.5 px-4 text-campus-subtext capitalize font-mono text-[11px]">
                        {doc.documentType || 'regulation'}
                      </td>

                      {/* Current Version badge */}
                      <td className="py-3.5 px-4">
                        <button
                          onClick={() => handleOpenVersionsModal(doc)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-mono text-[11px] hover:bg-blue-500/20 transition-colors"
                          title="Click to view version history"
                        >
                          <GitBranch className="w-3 h-3" />
                          v{doc.currentVersionNumber || 1}
                        </button>
                      </td>

                      {/* Processing Status */}
                      <td className="py-3.5 px-4">
                        {doc.status === 'indexed' ? (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                            Indexed
                          </span>
                        ) : doc.status === 'processing' ? (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-spin" />
                            Processing
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono bg-red-500/10 text-red-400 border border-red-500/20"
                            title={doc.errorMessage || 'Ingestion failed'}
                          >
                            <AlertTriangle className="w-3 h-3 text-red-400" />
                            Failed
                          </span>
                        )}
                      </td>

                      {/* Active/Inactive RAG State */}
                      <td className="py-3.5 px-4">
                        <button
                          onClick={() => handleToggleStatus(doc)}
                          disabled={togglingStatusId === doc._id}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono border transition-colors ${
                            doc.isActive
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20'
                              : 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20 hover:bg-zinc-500/20'
                          }`}
                          title={`Click to ${doc.isActive ? 'deactivate' : 'activate'}`}
                        >
                          {doc.isActive ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-400" />
                              ACTIVE
                            </>
                          ) : (
                            <>
                              <X className="w-3 h-3 text-zinc-400" />
                              INACTIVE
                            </>
                          )}
                        </button>
                      </td>

                      {/* Chunks / Pages */}
                      <td className="py-3.5 px-4 font-mono text-[11px]">
                        <span className="text-white font-medium">{doc.totalChunks || 0}</span> chunks •{' '}
                        <span className="text-campus-muted">{doc.totalPages || 0} pgs</span>
                      </td>

                      {/* Updated Date */}
                      <td className="py-3.5 px-4 text-campus-muted font-mono text-[11px]">
                        {new Date(doc.updatedAt || doc.createdAt).toLocaleDateString()}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Version History */}
                          <button
                            onClick={() => handleOpenVersionsModal(doc)}
                            className="p-1.5 rounded text-campus-muted hover:text-blue-400 hover:bg-blue-500/10 transition-colors"
                            title="View sequential version history"
                          >
                            <History className="w-3.5 h-3.5" />
                          </button>

                          {/* Upload New Version */}
                          <button
                            onClick={() => handleOpenUploadVersionModal(doc)}
                            className="p-1.5 rounded text-campus-muted hover:text-purple-400 hover:bg-purple-500/10 transition-colors"
                            title="Upload new PDF version"
                          >
                            <Upload className="w-3.5 h-3.5" />
                          </button>

                          {/* Re-index Current Version */}
                          <button
                            onClick={() => handleReindexDocument(doc._id, doc.title)}
                            disabled={reindexingId === doc._id}
                            className="p-1.5 rounded text-campus-muted hover:text-amber-400 hover:bg-amber-500/10 transition-colors"
                            title="Re-index current active version in Qdrant"
                          >
                            <RotateCcw className={`w-3.5 h-3.5 ${reindexingId === doc._id ? 'animate-spin text-amber-400' : ''}`} />
                          </button>

                          {/* Soft Delete */}
                          <button
                            onClick={() => handleDeleteDocument(doc._id, doc.title)}
                            className="p-1.5 rounded text-campus-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
                            title="Safe soft-delete & Qdrant deactivation"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination Controls */}
          {pagination.totalPages > 1 && (
            <div className="p-4 border-t border-campus-border/60 bg-campus-surface/40 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
              <span className="text-campus-muted font-mono">
                Showing Page <strong className="text-white">{pagination.page}</strong> of{' '}
                <strong className="text-white">{pagination.totalPages}</strong> ({pagination.total} total documents)
              </span>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => fetchDocuments(pagination.page - 1)}
                  disabled={pagination.page <= 1 || loadingDocs}
                  className="campus-btn-secondary text-xs py-1 px-3 disabled:opacity-50"
                >
                  Previous
                </button>
                <div className="flex items-center gap-1 font-mono text-xs">
                  {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map((p) => (
                    <button
                      key={p}
                      onClick={() => fetchDocuments(p)}
                      className={`w-7 h-7 rounded text-xs transition-colors ${
                        pagination.page === p
                          ? 'bg-purple-600 text-white font-bold'
                          : 'text-campus-muted hover:bg-campus-surface hover:text-white'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => fetchDocuments(pagination.page + 1)}
                  disabled={pagination.page >= pagination.totalPages || loadingDocs}
                  className="campus-btn-secondary text-xs py-1 px-3 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </section>
      )}

      {/* ---------------------------------------------------- */}
      {/* MODAL 1: INGEST NEW DOCUMENT (Version 1 Creation) */}
      {/* ---------------------------------------------------- */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in">
          <div className="campus-card max-w-lg w-full p-6 relative border-purple-500/30 my-8">
            <button
              onClick={() => setShowCreateModal(false)}
              className="absolute top-4 right-4 text-campus-muted hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-purple-600/20 text-purple-400 flex items-center justify-center">
                <Plus className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-semibold text-white">Ingest University Document</h3>
                <p className="text-xs text-campus-muted">Creates Document record, SHA-256 Version 1 & indexes into Qdrant</p>
              </div>
            </div>

            {createError && (
              <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{createError}</span>
              </div>
            )}

            <form onSubmit={handleCreateDocument} className="space-y-4">
              {/* File selector */}
              <div>
                <label className="block text-xs font-medium text-campus-subtext mb-1.5">
                  Select Official PDF File * (Max 50MB)
                </label>
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={handleCreateFileChange}
                  required
                  className="w-full text-xs text-campus-text file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-purple-600 file:text-white hover:file:bg-purple-500 file:cursor-pointer cursor-pointer border border-campus-border rounded-lg p-2 bg-campus-bg"
                />
              </div>

              {/* Title */}
              <div>
                <label className="block text-xs font-medium text-campus-subtext mb-1.5">
                  Document Title *
                </label>
                <input
                  type="text"
                  value={createTitle}
                  onChange={(e) => setCreateTitle(e.target.value)}
                  placeholder="e.g. B.Tech Academic Regulations 2026-2027"
                  required
                  className="campus-input text-xs"
                />
              </div>

              {/* Category & Document Type */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-campus-subtext mb-1.5">
                    Category *
                  </label>
                  <select
                    value={createCategory}
                    onChange={(e) => setCreateCategory(e.target.value)}
                    className="campus-input text-xs"
                  >
                    <option value="academics">Academics</option>
                    <option value="examinations">Examinations</option>
                    <option value="hostel">Hostel</option>
                    <option value="admissions">Admissions</option>
                    <option value="courses">Courses</option>
                    <option value="placements">Placements</option>
                    <option value="notices">Notices</option>
                    <option value="scholarships">Scholarships</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-campus-subtext mb-1.5">
                    Document Type *
                  </label>
                  <select
                    value={createDocType}
                    onChange={(e) => setCreateDocType(e.target.value)}
                    className="campus-input text-xs"
                  >
                    <option value="regulation">Regulation</option>
                    <option value="previous_year_paper">Previous Year Paper (PYQ)</option>
                    <option value="notification">Official Notification</option>
                    <option value="academic_calendar">Academic Calendar</option>
                    <option value="timetable">Exam / Class Timetable</option>
                    <option value="circular">Administrative Circular</option>
                    <option value="syllabus">Syllabus</option>
                    <option value="notice">Notice</option>
                    <option value="question_paper">Question Paper</option>
                    <option value="handbook">Handbook</option>
                    <option value="policy">Policy</option>
                    <option value="course">Course</option>
                    <option value="fee">Fee</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>

              {/* Source Authority & Department */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-campus-subtext mb-1.5">
                    Source Authority *
                  </label>
                  <select
                    value={createSourceAuthority}
                    onChange={(e) => setCreateSourceAuthority(e.target.value)}
                    className="campus-input text-xs"
                  >
                    <option value="official">Official (Highest Trust)</option>
                    <option value="department">Department</option>
                    <option value="internal">Internal</option>
                    <option value="user_uploaded">User Uploaded</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-campus-subtext mb-1.5">
                    Target Department *
                  </label>
                  <input
                    type="text"
                    value={createDepartment}
                    onChange={(e) => setCreateDepartment(e.target.value)}
                    placeholder="e.g. Computer Science & Engineering"
                    required
                    className="campus-input text-xs"
                  />
                </div>
              </div>

              {/* Source URL */}
              <div>
                <label className="block text-xs font-medium text-campus-subtext mb-1.5">
                  Official Source URL (Optional)
                </label>
                <input
                  type="url"
                  value={createSourceUrl}
                  onChange={(e) => setCreateSourceUrl(e.target.value)}
                  placeholder="https://university.edu/circulars/regulations-2026.pdf"
                  className="campus-input text-xs"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-medium text-campus-subtext mb-1.5">
                  Brief Summary / Description
                </label>
                <textarea
                  rows={2}
                  value={createDescription}
                  onChange={(e) => setCreateDescription(e.target.value)}
                  placeholder="Summary of document purpose, governing body, and academic year..."
                  className="campus-input text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  disabled={creating}
                  className="campus-btn-secondary text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || !createFile}
                  className="campus-btn-primary bg-purple-600 hover:bg-purple-500 text-xs"
                >
                  {creating ? (
                    <span className="flex items-center gap-2">
                      <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Ingesting & Indexing v1...
                    </span>
                  ) : (
                    <>
                      <Upload className="w-3.5 h-3.5" />
                      Create & Ingest Document
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* MODAL 2: UPLOAD NEW VERSION (Atomic Switch) */}
      {/* ---------------------------------------------------- */}
      {showUploadVersionModal && selectedDocForVersions && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in">
          <div className="campus-card max-w-md w-full p-6 relative border-purple-500/30 my-8">
            <button
              onClick={() => setShowUploadVersionModal(false)}
              className="absolute top-4 right-4 text-campus-muted hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-purple-600/20 text-purple-400 flex items-center justify-center">
                <GitBranch className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-semibold text-white">Upload New Version</h3>
                <p className="text-xs text-campus-muted">
                  Creating Version {(selectedDocForVersions.currentVersionNumber || 1) + 1}
                </p>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-campus-surface border border-campus-border text-xs space-y-1 mb-4">
              <p className="text-campus-muted">Document:</p>
              <p className="font-semibold text-white">{selectedDocForVersions.title}</p>
              <p className="font-mono text-[11px] text-blue-400">
                Current Active: Version {selectedDocForVersions.currentVersionNumber || 1}
              </p>
            </div>

            {/* Atomic switch guarantee notice */}
            <div className="p-2.5 rounded bg-blue-500/10 border border-blue-500/20 text-[11px] text-blue-300 leading-relaxed mb-4">
              🛡️ <strong>Atomic Safety Guarantee:</strong> The current active version remains live for student queries while the new version is chunked and indexed into Qdrant. If the new upload fails, the old version stays active.
            </div>

            {versionUploadError && (
              <div className={`mb-4 p-3 rounded-lg border text-xs flex items-center gap-2 ${
                isDuplicateWarning
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                  : 'bg-red-500/10 border-red-500/20 text-red-400'
              }`}>
                {isDuplicateWarning ? (
                  <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                )}
                <span>{versionUploadError}</span>
              </div>
            )}

            {versionUploadSuccess && (
              <div className="mb-4 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span>{versionUploadSuccess}</span>
              </div>
            )}

            <form onSubmit={handleUploadNewVersionSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-campus-subtext mb-1.5">
                  Select Updated PDF File *
                </label>
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={(e) => {
                    setNewVersionFile(e.target.files[0]);
                    setVersionUploadError('');
                    setIsDuplicateWarning(false);
                  }}
                  required
                  className="w-full text-xs text-campus-text file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-purple-600 file:text-white hover:file:bg-purple-500 file:cursor-pointer cursor-pointer border border-campus-border rounded-lg p-2 bg-campus-bg"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowUploadVersionModal(false)}
                  disabled={uploadingVersion}
                  className="campus-btn-secondary text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploadingVersion || !newVersionFile}
                  className="campus-btn-primary bg-purple-600 hover:bg-purple-500 text-xs"
                >
                  {uploadingVersion ? (
                    <span className="flex items-center gap-2">
                      <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Embedding & Switching...
                    </span>
                  ) : (
                    <>
                      <Upload className="w-3.5 h-3.5" />
                      Index & Activate Version
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* MODAL 3: VERSION HISTORY DRAWER / MODAL */}
      {/* ---------------------------------------------------- */}
      {showVersionModal && selectedDocForVersions && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in">
          <div className="campus-card max-w-2xl w-full p-6 relative border-purple-500/30 my-8 space-y-4">
            <button
              onClick={() => setShowVersionModal(false)}
              className="absolute top-4 right-4 text-campus-muted hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-600/20 text-blue-400 flex items-center justify-center">
                <History className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-semibold text-white">Version History</h3>
                <p className="text-xs text-campus-muted font-mono">{selectedDocForVersions.title}</p>
              </div>
            </div>

            {loadingVersions ? (
              <div className="p-8 text-center text-xs text-campus-muted">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-400" />
                Loading sequential version audit trail...
              </div>
            ) : docVersions.length === 0 ? (
              <div className="p-8 text-center text-xs text-campus-muted">
                No versions found for this document.
              </div>
            ) : (
              <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
                {docVersions.map((v) => (
                  <div
                    key={v._id}
                    className={`p-4 rounded-xl border space-y-2 text-xs transition-colors ${
                      v.isActive
                        ? 'bg-purple-950/20 border-purple-500/40'
                        : 'bg-campus-bg/80 border-campus-border'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded font-mono font-bold text-xs bg-blue-500/20 text-blue-300 border border-blue-500/30">
                          Version {v.versionNumber}
                        </span>
                        {v.isActive ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                            ACTIVE IN RAG
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-campus-card text-campus-muted border border-campus-border">
                            INACTIVE
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {v.processingStatus === 'indexed' ? (
                          <span className="text-emerald-400 font-mono text-[10px]">Indexed</span>
                        ) : v.processingStatus === 'failed' ? (
                          <span className="text-red-400 font-mono text-[10px]">Failed</span>
                        ) : (
                          <span className="text-amber-400 font-mono text-[10px]">Processing</span>
                        )}
                        <span className="text-campus-muted font-mono text-[10px]">
                          {new Date(v.createdAt).toLocaleString()}
                        </span>
                      </div>
                    </div>

                    {/* Metadata details */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono text-[11px]">
                      <div>
                        <span className="text-campus-muted block text-[10px]">FILE NAME:</span>
                        <span className="text-white truncate block">{v.fileName || 'N/A'}</span>
                      </div>
                      <div>
                        <span className="text-campus-muted block text-[10px]">FILE SIZE:</span>
                        <span className="text-white">{formatFileSize(v.fileSize)}</span>
                      </div>
                      <div>
                        <span className="text-campus-muted block text-[10px]">PAGES / CHUNKS:</span>
                        <span className="text-white">{v.totalPages || 0} pgs / {v.totalChunks || 0} chunks</span>
                      </div>
                      <div>
                        <span className="text-campus-muted block text-[10px]">SHA-256 HASH:</span>
                        <span className="text-campus-subtext truncate block" title={v.fileHash}>
                          {v.fileHash ? `${v.fileHash.slice(0, 10)}...` : 'N/A'}
                        </span>
                      </div>
                    </div>

                    {/* Failure details & retry button */}
                    {v.processingStatus === 'failed' && (
                      <div className="p-2.5 rounded bg-red-500/10 border border-red-500/20 text-red-400 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mt-2">
                        <div className="space-y-0.5">
                          <p className="font-semibold text-[11px]">Processing Failure:</p>
                          <p className="text-[10px] font-mono">{v.processingError || 'Ingestion encountered an error during indexing.'}</p>
                        </div>
                        <button
                          onClick={() => handleRetryVersion(selectedDocForVersions._id, v._id, v.versionNumber)}
                          disabled={retryingVersionId === v._id}
                          className="campus-btn-primary bg-red-600 hover:bg-red-500 text-xs py-1 px-3 whitespace-nowrap"
                        >
                          <RotateCcw className={`w-3.5 h-3.5 ${retryingVersionId === v._id ? 'animate-spin' : ''}`} />
                          Retry Ingestion
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setShowVersionModal(false)}
                className="campus-btn-secondary text-xs"
              >
                Close History
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Routing & Diagnostics */}
      {activeTab === 'diagnostics' && <DiagnosticsTab />}

      {/* Tab 5: Redis Caching */}
      {activeTab === 'redis' && (
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-red-400" />
            <h2 className="text-lg font-bold text-white tracking-tight">
              Phase 4 Redis Caching, Invalidation & Rate Limiting
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchCacheStats}
              disabled={loadingCacheStats}
              className="campus-btn-secondary text-xs py-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingCacheStats ? 'animate-spin' : ''}`} />
              Refresh Metrics
            </button>
            <button
              onClick={handleInvalidateCache}
              disabled={invalidatingCache}
              className="campus-btn-primary bg-red-600 hover:bg-red-500 shadow-red-500/20 text-xs py-1.5"
            >
              <Flame className={`w-3.5 h-3.5 ${invalidatingCache ? 'animate-spin' : ''}`} />
              {invalidatingCache ? 'Invalidating...' : 'Invalidate RAG Cache'}
            </button>
          </div>
        </div>

        {cacheFeedback && (
          <div
            className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
              cacheFeedback.type === 'success'
                ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
                : 'bg-red-500/10 border border-red-500/30 text-red-400'
            }`}
          >
            {cacheFeedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
            )}
            <span>{cacheFeedback.message}</span>
          </div>
        )}

        <div className="campus-card p-6 space-y-6 border-red-500/20 bg-gradient-to-b from-red-500/5 to-transparent">
          {/* Status Header */}
          <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-campus-border/60">
            <div className="flex items-center gap-3">
              <span className="text-xs text-campus-muted uppercase font-mono">Redis Status:</span>
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono font-medium ${
                  cacheStats?.status === 'ok' || cacheStats?.status === 'mock_connected'
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                    : 'bg-red-500/10 text-red-400 border border-red-500/30'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    cacheStats?.status === 'ok' || cacheStats?.status === 'mock_connected'
                      ? 'bg-emerald-400 animate-pulse'
                      : 'bg-red-400'
                  }`}
                />
                {cacheStats?.status === 'ok'
                  ? 'Connected'
                  : cacheStats?.status === 'mock_connected'
                  ? 'Mock Connected (In-Memory)'
                  : 'Disconnected / Offline'}
              </span>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs text-campus-muted uppercase font-mono">Cache Namespace Version:</span>
              <span className="px-3 py-1 rounded text-xs font-mono font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                {cacheStats?.cacheVersion || 'v1'}
              </span>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs text-campus-muted uppercase font-mono">Overall Hit Rate:</span>
              <span className="px-3 py-1 rounded text-xs font-mono font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                {cacheStats?.overallHitRate || '0.0%'}
              </span>
            </div>
          </div>

          {/* Real Metrics Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Exact Query Cache Card */}
            <div className="p-4 rounded-xl bg-campus-bg/90 border border-campus-border space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-white">Exact Query Cache</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  SHA-256 Normalized
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center pt-1">
                <div className="p-2 rounded bg-campus-surface">
                  <p className="text-[10px] font-mono text-campus-muted uppercase">Hits</p>
                  <p className="text-base font-bold text-emerald-400">{cacheStats?.exactCache?.hits ?? 0}</p>
                </div>
                <div className="p-2 rounded bg-campus-surface">
                  <p className="text-[10px] font-mono text-campus-muted uppercase">Misses</p>
                  <p className="text-base font-bold text-campus-subtext">{cacheStats?.exactCache?.misses ?? 0}</p>
                </div>
                <div className="p-2 rounded bg-campus-surface">
                  <p className="text-[10px] font-mono text-campus-muted uppercase">Rate</p>
                  <p className="text-base font-bold text-blue-400">{cacheStats?.exactCache?.hitRate ?? '0.0%'}</p>
                </div>
              </div>
              <p className="text-[11px] text-campus-muted leading-tight">
                Instantly returns cached response without invoking embeddings, vector search, or LLM.
              </p>
            </div>

            {/* Semantic Query Cache Card */}
            <div className="p-4 rounded-xl bg-campus-bg/90 border border-campus-border space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-white">Semantic Cache</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  Cosine &gt;= 0.88
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center pt-1">
                <div className="p-2 rounded bg-campus-surface">
                  <p className="text-[10px] font-mono text-campus-muted uppercase">Hits</p>
                  <p className="text-base font-bold text-emerald-400">{cacheStats?.semanticCache?.hits ?? 0}</p>
                </div>
                <div className="p-2 rounded bg-campus-surface">
                  <p className="text-[10px] font-mono text-campus-muted uppercase">Misses</p>
                  <p className="text-base font-bold text-campus-subtext">{cacheStats?.semanticCache?.misses ?? 0}</p>
                </div>
                <div className="p-2 rounded bg-campus-surface">
                  <p className="text-[10px] font-mono text-campus-muted uppercase">Rate</p>
                  <p className="text-base font-bold text-amber-400">{cacheStats?.semanticCache?.hitRate ?? '0.0%'}</p>
                </div>
              </div>
              <p className="text-[11px] text-campus-muted leading-tight">
                Reuses answers for paraphrased student questions using Gemini 768d vectors.
              </p>
            </div>

            {/* Abuse Protection / Rate Limiting */}
            <div className="p-4 rounded-xl bg-campus-bg/90 border border-campus-border space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-white">Redis Rate Limiter</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">
                  Sliding Window
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-center pt-1">
                <div className="p-2 rounded bg-campus-surface">
                  <p className="text-[10px] font-mono text-campus-muted uppercase">Blocked Requests</p>
                  <p className="text-base font-bold text-red-400">
                    {cacheStats?.rateLimits?.blockedRequests ?? 0}
                  </p>
                </div>
                <div className="p-2 rounded bg-campus-surface">
                  <p className="text-[10px] font-mono text-campus-muted uppercase">Bypasses</p>
                  <p className="text-base font-bold text-campus-muted">
                    {cacheStats?.bypasses ?? 0}
                  </p>
                </div>
              </div>
              <p className="text-[11px] text-campus-muted leading-tight">
                Protects /api/chat (30 req/min) and /api/auth (10 req/min). Returns HTTP 429 when throttled.
              </p>
            </div>
          </div>
        </div>
      </section>
      )}

      {/* ---------------------------------------------------- */}
      {/* Upgraded Phase Status Roadmap */}
      {/* ---------------------------------------------------- */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-campus-muted">
        <div className="campus-card p-4 space-y-1.5 border-emerald-500/20 bg-emerald-500/5">
          <div className="flex items-center gap-2 text-emerald-400 font-semibold">
            <CheckCircle2 className="w-4 h-4" />
            <span>Phases 1-4 Live: Auth, Hybrid RAG & Redis</span>
          </div>
          <p className="text-[11px] leading-relaxed">
            Multi-stage retrieval, RRF fusion, reranking, source citations, semantic cache, and rate limiting.
          </p>
        </div>

        <div className="campus-card p-4 space-y-1.5 border-emerald-500/20 bg-emerald-500/5">
          <div className="flex items-center gap-2 text-emerald-400 font-semibold">
            <CheckCircle2 className="w-4 h-4" />
            <span>Phase 5 Live: Document Management</span>
          </div>
          <p className="text-[11px] leading-relaxed">
            Document registry, sequential versions, SHA-256 deduplication, atomic version switching, and re-indexing.
          </p>
        </div>

        <div className="campus-card p-4 space-y-1.5 border-purple-500/30 bg-purple-500/10">
          <div className="flex items-center gap-2 text-purple-300 font-semibold">
            <Sparkles className="w-4 h-4 text-purple-400" />
            <span>Phase 6 Live: Intelligent Query Assistant</span>
          </div>
          <p className="text-[11px] leading-relaxed text-campus-text">
            Intent classification, query routing, structured course/event catalog, clarification prompts, and hybrid policy merging.
          </p>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
