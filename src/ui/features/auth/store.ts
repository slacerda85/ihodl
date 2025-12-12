/**
 * Auth Store
 *
 * Store singleton com pub/sub para autenticação biométrica e controle de inatividade.
 * Segue o padrão das demais features (subscribe/getSnapshot/actions).
 */

import { AppState, type AppStateStatus } from 'react-native'
import { checkHardware, checkPermissions, authenticate } from './utils'
import type { AuthState } from '../../state/types'

// ==========================================
// CONSTANTES
// ==========================================

const TIMEOUTS = {
  INACTIVITY: 1000 * 100000, // mantém valor legado
  BACKGROUND: 1000 * 100000,
}

const APP_STATE_TIMEOUTS: Record<AppStateStatus, number | undefined> = {
  active: undefined,
  background: TIMEOUTS.BACKGROUND,
  inactive: TIMEOUTS.INACTIVITY,
  extension: undefined,
  unknown: undefined,
}

// ==========================================
// STORE
// ==========================================

class AuthStore {
  private subscribers = new Set<() => void>()
  private state: AuthState = {
    authenticated: false,
    inactive: false,
  }

  private startTime = 0
  private appState: AppStateStatus = AppState.currentState
  private appStateSubscription?: { remove: () => void }

  constructor() {
    this.setupAppStateListener()
  }

  // ========================================
  // SUBSCRIPTION
  // ========================================

  subscribe = (callback: () => void): (() => void) => {
    this.subscribers.add(callback)
    return () => {
      this.subscribers.delete(callback)
    }
  }

  private notify(): void {
    this.subscribers.forEach(callback => callback())
  }

  // ========================================
  // SNAPSHOT
  // ========================================

  getSnapshot = (): AuthState => {
    return this.state
  }

  // ========================================
  // ACTIONS
  // ========================================

  private setAuthenticated(value: boolean): void {
    if (this.state.authenticated === value) return
    this.state = {
      ...this.state,
      authenticated: value,
      inactive: value ? this.state.inactive : false,
    }
    this.notify()
  }

  private setInactive(value: boolean): void {
    if (this.state.inactive === value) return
    this.state = { ...this.state, inactive: value }
    this.notify()
  }

  private async performBiometricAuth(): Promise<boolean> {
    if (typeof window !== 'undefined' && navigator?.userAgent?.includes('Chrome')) {
      return true
    }

    try {
      const hardwareSupported = await checkHardware()
      if (!hardwareSupported) return false

      const securityLevel = await checkPermissions()
      if (securityLevel === 0) return false

      const { success } = await authenticate()
      return success
    } catch (error) {
      console.warn('[AuthStore] Authentication error:', error)
      return false
    }
  }

  auth = async (): Promise<boolean> => {
    const success = await this.performBiometricAuth()
    this.setAuthenticated(success)
    if (!success) {
      this.setInactive(false)
    }
    return success
  }

  login = (): void => {
    this.setAuthenticated(true)
  }

  logout = (): void => {
    this.setAuthenticated(false)
  }

  setInactiveFlag = (inactive: boolean): void => {
    this.setInactive(inactive)
  }

  // ========================================
  // APP STATE LISTENER
  // ========================================

  private setupAppStateListener(): void {
    this.appStateSubscription = AppState.addEventListener('change', this.handleAppStateChange)
  }

  private handleAppStateChange = (nextAppState: AppStateStatus): void => {
    const hasTimeoutExceeded = (elapsed: number, timeoutType: AppStateStatus): boolean => {
      const timeout = APP_STATE_TIMEOUTS[timeoutType]
      return !!timeout && elapsed > timeout
    }

    const currentState = this.appState

    if (currentState === 'active') {
      if (nextAppState === 'background' || nextAppState === 'inactive') {
        this.startTime = Date.now()
        if (nextAppState === 'inactive') {
          this.setInactive(true)
        }
      }
    } else if (nextAppState === 'active') {
      const elapsed = Date.now() - this.startTime

      if (currentState === 'background' && hasTimeoutExceeded(elapsed, 'background')) {
        this.setAuthenticated(false)
      } else if (currentState === 'inactive' && hasTimeoutExceeded(elapsed, 'inactive')) {
        this.setAuthenticated(false)
      } else {
        this.setInactive(false)
      }
    }

    this.appState = nextAppState
  }

  // ========================================
  // ACTIONS GETTER
  // ========================================

  get actions() {
    return {
      auth: this.auth,
      login: this.login,
      logout: this.logout,
      setInactive: this.setInactiveFlag,
    }
  }
}

// ==========================================
// SINGLETON
// ==========================================

export const authStore = new AuthStore()
