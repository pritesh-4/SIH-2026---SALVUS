import { Component } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'

/**
 * Production Fault-Isolation Error Boundary for Salvus UI
 *
 * Prevents isolated component crashes (e.g. Leaflet map render glitches, chart errors,
 * or AI card format anomalies) from crashing the entire emergency application shell.
 *
 * Supported variants:
 * - 'card': Compact inline card fallback for sub-panels and widgets (default)
 * - 'inline': Minimal 1-line alert for badges and status bars
 * - 'fullscreen': Full-page graceful fallback for top-level router routes
 */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo })
    console.error(
      `[Salvus ErrorBoundary] Caught UI error in ${this.props.componentName || 'Component'}:`,
      error,
      errorInfo
    )
    this.props.onError?.(error, errorInfo)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null })
    this.props.onReset?.()
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children
    }

    const {
      variant = 'card',
      fallbackTitle = 'Component Temporarily Unavailable',
      fallbackMessage = 'An unexpected render error occurred in this view. Emergency core systems remain operational.',
      componentName,
    } = this.props

    if (variant === 'inline') {
      return (
        <div className="flex items-center gap-2 p-2 bg-salvus-critical-bg/20 text-salvus-critical border border-salvus-critical/30 rounded-lg text-xs">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{fallbackTitle}</span>
          <button
            type="button"
            onClick={this.handleReset}
            className="ml-auto underline font-medium cursor-pointer"
          >
            Retry
          </button>
        </div>
      )
    }

    if (variant === 'fullscreen') {
      return (
        <div className="min-h-screen bg-salvus-surface flex items-center justify-center p-6 text-salvus-text-primary">
          <div className="max-w-md w-full text-center space-y-4">
            <div className="inline-flex p-3 rounded-full bg-salvus-critical-bg text-salvus-critical border border-salvus-critical/30">
              <AlertTriangle className="h-8 w-8" />
            </div>
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-salvus-text-primary">
                {fallbackTitle || 'Emergency Console Degraded'}
              </h2>
              <p className="text-xs text-salvus-text-secondary leading-relaxed">
                {fallbackMessage}
              </p>
            </div>
            <div className="flex justify-center gap-3 pt-2">
              <Button
                variant="primary"
                size="md"
                onClick={() => window.location.reload()}
                leftIcon={<RefreshCw className="h-4 w-4" />}
              >
                Reload Console
              </Button>
            </div>
          </div>
        </div>
      )
    }

    // Default 'card' variant
    return (
      <Card padding="md" className="space-y-3 border-salvus-border bg-salvus-muted/20">
        <div className="flex items-center justify-between border-b border-salvus-border pb-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-salvus-warning shrink-0" />
            <span className="text-xs font-bold text-salvus-text-primary uppercase tracking-wider">
              {componentName || 'View'} Degraded
            </span>
          </div>
          <Badge variant="warning" size="sm">
            Isolated
          </Badge>
        </div>
        <p className="text-xs text-salvus-text-secondary leading-relaxed">{fallbackMessage}</p>
        <div className="flex justify-end pt-1">
          <Button
            variant="quiet"
            size="sm"
            onClick={this.handleReset}
            leftIcon={<RefreshCw className="h-3 w-3" />}
            className="text-xs"
          >
            Reload View
          </Button>
        </div>
      </Card>
    )
  }
}

export default ErrorBoundary
