import * as React from 'react'

type ErrorBoundaryProps = {
  children: React.ReactNode
  fallback?: React.ReactNode
}

type ErrorBoundaryState = {
  hasError: boolean
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Implementação segura para log de erro
    if (typeof window !== 'undefined' && window.console) {
      window.console.error('ErrorBoundary caught:', error, info)
    }
    // Aqui você pode enviar para um serviço externo se desejar
    // Exemplo: logErrorToMyService(error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div style={{ padding: 16, textAlign: 'center' }}>
            <h2>Ocorreu um erro inesperado.</h2>
            <p>Tente recarregar a página ou entrar em contato com o suporte.</p>
          </div>
        )
      )
    }
    return this.props.children
  }
}

export default ErrorBoundary
