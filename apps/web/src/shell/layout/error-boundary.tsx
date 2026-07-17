import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ContentError } from './layout-states';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Render a custom fallback given the error and a reset callback. */
  fallback?: (error: Error, reset: () => void) => ReactNode;
  /**
   * Changing any value in this list resets the boundary — the layout passes the
   * current route key so navigating away from a broken page clears the error.
   */
  resetKeys?: unknown[];
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Layout-level error boundary. Catches render errors thrown by page content so a
 * single broken section shows a recoverable error state instead of blanking the
 * whole shell. Resets automatically when `resetKeys` change (e.g. on navigation).
 */
export class LayoutErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    if (this.state.error && this.props.resetKeys && !this.arraysEqual(prevProps.resetKeys)) {
      this.reset();
    }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surface the error for diagnostics; a real logger is wired in a later ola.
    console.error('Layout error boundary caught an error:', error, info);
  }

  private arraysEqual(prev?: unknown[]): boolean {
    const next = this.props.resetKeys;
    if (!prev || !next || prev.length !== next.length) return false;
    return prev.every((value, index) => Object.is(value, next[index]));
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    const { error } = this.state;
    if (error) {
      return this.props.fallback ? (
        this.props.fallback(error, this.reset)
      ) : (
        <ContentError onRetry={this.reset} />
      );
    }
    return this.props.children;
  }
}
