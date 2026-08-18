import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  reloadHovered: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    reloadHovered: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null, reloadHovered: false };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
    this.setState({
      error: error,
      errorInfo: errorInfo
    });
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '2rem', backgroundColor: '#fee2e2', color: '#991b1b', minHeight: '100vh', fontFamily: 'monospace' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1rem' }}>React Runtime Crash</h1>
          <p style={{ marginBottom: '1rem' }}>The application encountered an unexpected error.</p>
          <div style={{ backgroundColor: '#fef2f2', padding: '1rem', borderRadius: '4px', border: '1px solid #fca5a5', overflowX: 'auto' }}>
            <h2 style={{ fontWeight: 'bold' }}>Error:</h2>
            <pre style={{ marginBottom: '1rem' }}>{this.state.error?.toString()}</pre>
            <h2 style={{ fontWeight: 'bold' }}>Component Stack:</h2>
            <pre>{this.state.errorInfo?.componentStack}</pre>
          </div>
          <button
            onClick={() => window.location.reload()}
            onMouseEnter={() => this.setState({ reloadHovered: true })}
            onMouseLeave={() => this.setState({ reloadHovered: false })}
            style={{
              marginTop: '1rem',
              padding: '0.5rem 1rem',
              backgroundColor: this.state.reloadHovered ? '#dc2626' : '#ef4444',
              color: 'white',
              borderRadius: '4px',
              border: 'none',
              cursor: 'pointer',
              transition: 'background-color 0.15s ease',
            }}
          >
            Reload Application
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
