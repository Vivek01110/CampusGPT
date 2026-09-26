import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ChatProvider } from './context/ChatContext';
import Sidebar from './components/Sidebar';
import ProtectedRoute from './components/ProtectedRoute';
import ErrorBoundary from './components/ErrorBoundary';
import { Menu } from 'lucide-react';

// Pages
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Assistant from './pages/Assistant';
import AdminDashboard from './pages/AdminDashboard';
import Documents from './pages/Documents';
import Courses from './pages/Courses';
import Notices from './pages/Notices';
import Profile from './pages/Profile';

// Root redirector: sends authenticated users directly to the CampusGpt chat
const RootRedirect = () => {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return null;
  return <Navigate to={isAuthenticated ? "/assistant" : "/login"} replace />;
};

function AppContent() {
  const { isAuthenticated } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-campus-bg text-campus-text flex font-sans">
      {/* ChatGPT-style Left Sidebar (Authenticated) */}
      {isAuthenticated && (
        <Sidebar mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {/* Mobile Header Bar (when authenticated) */}
        {isAuthenticated && (
          <header className="md:hidden flex items-center justify-between px-3 py-2 bg-campus-sidebar border-b border-campus-border z-20 flex-shrink-0">
            <button
              onClick={() => setMobileOpen(true)}
              className="p-1.5 rounded-lg text-campus-muted hover:text-white hover:bg-campus-card"
              aria-label="Open sidebar"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="w-8" />
          </header>
        )}

        <main className="flex-1 overflow-y-auto min-h-0 flex flex-col">
          <Routes>
            {/* Public Routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />

            {/* Protected Routes (Chat opens directly by default) */}
            <Route
              path="/assistant"
              element={
                <ProtectedRoute>
                  <Assistant onOpenMobileNav={() => setMobileOpen(true)} />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/documents"
              element={
                <ProtectedRoute>
                  <Documents />
                </ProtectedRoute>
              }
            />
            <Route
              path="/courses"
              element={
                <ProtectedRoute>
                  <Courses />
                </ProtectedRoute>
              }
            />
            <Route
              path="/notices"
              element={
                <ProtectedRoute>
                  <Notices />
                </ProtectedRoute>
              }
            />
            <Route
              path="/profile"
              element={
                <ProtectedRoute>
                  <Profile />
                </ProtectedRoute>
              }
            />

            {/* Admin Protected Route */}
            <Route
              path="/admin"
              element={
                <ProtectedRoute adminOnly={true}>
                  <AdminDashboard />
                </ProtectedRoute>
              }
            />

            {/* Root and Fallback */}
            <Route path="/" element={<RootRedirect />} />
            <Route path="*" element={<RootRedirect />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <ChatProvider>
            <AppContent />
          </ChatProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
