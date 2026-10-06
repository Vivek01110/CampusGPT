import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { authAPI, adminAPI } from '../services/api';
import DiagnosticsTab from '../components/admin/DiagnosticsTab';
import KnowledgeManagement from '../components/admin/KnowledgeManagement';
import {
  Shield,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Bot,
  Database,
  Flame,
} from 'lucide-react';

const AdminDashboard = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('knowledge'); // 'knowledge' | 'diagnostics' | 'redis'
  const [adminVerification, setAdminVerification] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');

  // Redis & Cache State
  const [cacheStats, setCacheStats] = useState(null);
  const [loadingCacheStats, setLoadingCacheStats] = useState(false);
  const [invalidatingCache, setInvalidatingCache] = useState(false);
  const [cacheFeedback, setCacheFeedback] = useState(null);

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
    fetchCacheStats();
  }, []);

  const handleInvalidateCache = async () => {
    if (!window.confirm('Are you sure you want to invalidate all RAG cache entries? The active version namespace will be incremented.')) {
      return;
    }

    setInvalidatingCache(true);
    setCacheFeedback(null);
    try {
      const res = await adminAPI.invalidateCache({ target: 'all' });
      setCacheFeedback({
        type: 'success',
        message: `RAG cache invalidated successfully! Active cache version incremented to "${res.data?.newVersion || 'v+1'}".`,
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

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header Banner */}
      <div className="campus-card p-6 bg-gradient-to-r from-purple-950/40 via-campus-surface to-campus-surface border-purple-500/30">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs font-mono font-medium px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Administrator: {user?.email || 'vivekadmin@gmail.com'}
              </span>
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                Role: {user?.role || 'admin'}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight flex items-center gap-2.5">
              <Shield className="w-7 h-7 text-purple-400" />
              CampusGPT Admin Portal
            </h1>
            <p className="text-sm text-campus-muted">
              Unified administration console: PYQ ingestion, NIT website crawler, AI query routing & Redis caching
            </p>
          </div>

          <div className="flex items-center gap-3">
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
                Backend Admin Protection Verified: User <strong>{adminVerification.adminName}</strong> verified with role <strong>{adminVerification.role}</strong>.
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
      </div>

      {/* ---------------------------------------------------- */}
      {/* 3 ADMIN NAVIGATION TABS */}
      {/* ---------------------------------------------------- */}
      <div className="flex items-center gap-2 border-b border-campus-border/80 pb-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('knowledge')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
            activeTab === 'knowledge'
              ? 'bg-gradient-to-r from-blue-600 to-teal-600 text-white shadow-lg shadow-teal-600/20'
              : 'text-campus-muted hover:text-white hover:bg-campus-surface'
          }`}
        >
          <Database className="w-4 h-4 text-teal-300" />
          Knowledge, PYQ & Web Crawler
        </button>

        <button
          onClick={() => setActiveTab('diagnostics')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
            activeTab === 'diagnostics'
              ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/20'
              : 'text-campus-muted hover:text-white hover:bg-campus-surface'
          }`}
        >
          <Bot className="w-4 h-4 text-purple-300" />
          Routing & Diagnostics
        </button>

        <button
          onClick={() => setActiveTab('redis')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
            activeTab === 'redis'
              ? 'bg-red-600 text-white shadow-lg shadow-red-600/20'
              : 'text-campus-muted hover:text-white hover:bg-campus-surface'
          }`}
        >
          <Flame className="w-4 h-4 text-red-300" />
          Redis Cache
        </button>
      </div>

      {/* Tab 1: Knowledge, PYQ & Web Crawler */}
      {activeTab === 'knowledge' && <KnowledgeManagement />}

      {/* Tab 2: Routing & Diagnostics */}
      {activeTab === 'diagnostics' && <DiagnosticsTab />}

      {/* Tab 3: Redis Cache */}
      {activeTab === 'redis' && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className="w-5 h-5 text-red-400" />
              <h2 className="text-lg font-bold text-white tracking-tight">
                Redis Caching, Invalidation & Rate Limiting
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
    </div>
  );
};

export default AdminDashboard;
