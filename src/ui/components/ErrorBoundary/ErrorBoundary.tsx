import * as React from 'react'
import { View, Text, StyleSheet } from 'react-native'

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
          <View style={styles.container}>
            <Text style={styles.title}>Ocorreu um erro inesperado.</Text>
            <Text style={styles.message}>
              Tente recarregar a página ou entrar em contato com o suporte.
            </Text>
          </View>
        )
      )
    }
    return this.props.children
  }
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    textAlign: 'center',
  },
})

export default ErrorBoundary
