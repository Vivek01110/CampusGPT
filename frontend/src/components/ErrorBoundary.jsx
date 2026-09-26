import React from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('AskCampusAi ErrorBoundary caught an unhandled error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-campus-bg text-campus-text flex items-center justify-center p-4">
          <div className="campus-card max-w-lg w-full p-6 text-center border-red-500/30 bg-red-500/5 space-y-4">
            <div className="w-12 h-12 rounded-full bg-red-500/10 text-red-400 mx-auto flex items-center justify-center">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white mb-1">Something went wrong</h2>
              <p className="text-xs text-campus-muted">
                An unexpected interface error occurred. You can refresh or return home.
              </p>
            </div>

            {this.state.error && (
              <pre className="text-left font-mono text-[11px] p-3 rounded bg-black/40 text-red-300 overflow-x-auto border border-red-500/20 max-h-36">
                {this.state.error.toString()}
              </pre>
            )}

            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={() => window.location.reload()}
                className="campus-btn-secondary text-xs"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Reload Page
              </button>
              <a
                href="/dashboard"
                className="campus-btn-primary text-xs"
              >
                <Home className="w-3.5 h-3.5" />
                Back to Dashboard
              </a>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
