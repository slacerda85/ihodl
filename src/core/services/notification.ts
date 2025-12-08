// Notification Service
// Push notification management for Lightning Network events
// Handles FCM integration and event-driven notifications

import EventEmitter from 'eventemitter3'
import { Platform } from 'react-native'
import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import Constants from 'expo-constants'
import { LightningRepository } from '../repositories/lightning'

// ==========================================
// TYPES & INTERFACES
// ==========================================

export interface NotificationConfig {
  /** Enable push notifications */
  enablePushNotifications: boolean
  /** Enable sound for notifications */
  enableSound: boolean
  /** Enable vibration for notifications */
  enableVibration: boolean
  /** Maximum notifications per hour */
  maxNotificationsPerHour: number
  /** Notification categories */
  categories: NotificationCategory[]
}

export interface NotificationCategory {
  id: string
  name: string
  enabled: boolean
  priority: 'low' | 'normal' | 'high'
}

export interface LightningNotification {
  id: string
  type:
    | 'payment_received'
    | 'payment_sent'
    | 'channel_opened'
    | 'channel_closed'
    | 'liquidity_alert'
    | 'invoice_expired'
    | 'payment_failed'
  title: string
  body: string
  data?: Record<string, any>
  timestamp: number
  categoryId?: string
  priority: 'low' | 'normal' | 'high'
}

export interface NotificationStats {
  totalSent: number
  totalReceived: number
  totalFailed: number
  sentThisHour: number
  lastNotificationTime?: number
}

// ==========================================
// CONSTANTS
// ==========================================

const DEFAULT_CATEGORIES: NotificationCategory[] = [
  { id: 'payments', name: 'Payments', enabled: true, priority: 'high' },
  { id: 'channels', name: 'Channels', enabled: true, priority: 'normal' },
  { id: 'liquidity', name: 'Liquidity', enabled: true, priority: 'normal' },
  { id: 'errors', name: 'Errors', enabled: true, priority: 'high' },
]

const DEFAULT_CONFIG: NotificationConfig = {
  enablePushNotifications: true,
  enableSound: true,
  enableVibration: true,
  maxNotificationsPerHour: 10,
  categories: DEFAULT_CATEGORIES,
}

// ==========================================
// NOTIFICATION SERVICE
// ==========================================

export class NotificationService extends EventEmitter {
  private config: Required<NotificationConfig>
  private repository: LightningRepository
  private notificationStats: NotificationStats = {
    totalSent: 0,
    totalReceived: 0,
    totalFailed: 0,
    sentThisHour: 0,
  }
  private hourlyResetTimer?: ReturnType<typeof setInterval>
  private isInitialized: boolean = false
  private expoPushToken?: string
  private notificationSubscriptions?: {
    receivedSubscription: Notifications.EventSubscription
    responseSubscription: Notifications.EventSubscription
  }

  constructor(config: Partial<NotificationConfig> = {}) {
    super()
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.repository = new LightningRepository()
  }

  // ==========================================
  // PUBLIC API
  // ==========================================

  /**
   * Initialize the notification service
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return

    console.log('[NotificationService] Initializing notification service...')

    try {
      // Only configure notifications on native platforms
      if (Platform.OS === 'ios' || Platform.OS === 'android') {
        console.log(
          '[NotificationService] Configuring expo-notifications for platform:',
          Platform.OS,
        )

        // Configure notification handler for foreground notifications
        Notifications.setNotificationHandler({
          handleNotification: async () => ({
            shouldPlaySound: this.config.enableSound,
            shouldSetBadge: true,
            shouldShowBanner: true,
            shouldShowList: true,
          }),
        })

        // Request permissions and get push token
        const token = await this.registerForPushNotificationsAsync()
        if (token) {
          this.expoPushToken = token
          console.log('[NotificationService] Push token obtained:', token)
        }

        // Set up hourly reset timer
        this.setupHourlyReset()

        // Load persisted stats
        await this.loadStats()

        // Set up notification listeners
        this.setupNotificationListeners()

        this.isInitialized = true
        console.log('[NotificationService] Notification service initialized successfully')
      } else {
        console.log(
          '[NotificationService] Skipping notifications on non-native platform:',
          Platform.OS,
        )
        this.isInitialized = true
      }
    } catch (error) {
      console.error('[NotificationService] Failed to initialize notification service:', error)
      // Don't throw - allow the app to continue without notifications
      this.isInitialized = true
    }
  }

  /**
   * Register for push notifications and get Expo push token
   */
  private async registerForPushNotificationsAsync(): Promise<string | null> {
    let token: string | null = null

    // Check if running on physical device
    if (!Device.isDevice) {
      console.warn('[NotificationService] Push notifications require a physical device')
      return null
    }

    // Get existing permissions
    const { status: existingStatus } = await Notifications.getPermissionsAsync()
    let finalStatus = existingStatus

    // Request permissions if not granted
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync()
      finalStatus = status
    }

    // Check if permissions were granted
    if (finalStatus !== 'granted') {
      console.warn('[NotificationService] Push notification permissions not granted')
      return null
    }

    // Get project ID for token attribution
    const projectId =
      Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId

    if (!projectId) {
      console.warn('[NotificationService] Project ID not found')
      return null
    }

    try {
      // Get Expo push token
      const pushTokenData = await Notifications.getExpoPushTokenAsync({ projectId })
      token = pushTokenData.data
      console.log('[NotificationService] Expo push token:', token)
    } catch (error) {
      console.error('[NotificationService] Failed to get push token:', error)
      return null
    }

    // Set up Android notification channel
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
      })
    }

    return token
  }

  /**
   * Set up notification event listeners
   */
  private setupNotificationListeners(): void {
    // Listener for when notification is received while app is foregrounded
    const receivedSubscription = Notifications.addNotificationReceivedListener(
      (notification: Notifications.Notification) => {
        console.log('[NotificationService] Notification received:', notification)
        this.notificationStats.totalReceived++
        this.emit('notification_received', notification)
      },
    )

    // Listener for when user interacts with notification
    const responseSubscription = Notifications.addNotificationResponseReceivedListener(
      (response: Notifications.NotificationResponse) => {
        console.log('[NotificationService] Notification response:', response)
        this.emit('notification_response', response)
      },
    )

    // Store subscriptions for cleanup
    this.notificationSubscriptions = { receivedSubscription, responseSubscription }
  }
  async sendLightningNotification(
    notification: Omit<LightningNotification, 'id' | 'timestamp'>,
  ): Promise<string> {
    if (!this.isInitialized) {
      console.warn('[NotificationService] Not initialized, skipping notification')
      return ''
    }

    // Check if notifications are enabled for this platform
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
      console.log('[NotificationService] Skipping notification on non-native platform')
      return ''
    }

    // Check rate limiting
    if (!this.canSendNotification()) {
      console.warn('[NotificationService] Rate limit exceeded, skipping notification')
      return ''
    }

    const notificationId = this.generateNotificationId()
    const fullNotification: LightningNotification = {
      ...notification,
      id: notificationId,
      timestamp: Date.now(),
    }

    try {
      // Check if category is enabled
      const category = this.config.categories.find(c => c.id === notification.categoryId)
      if (category && !category.enabled) {
        console.log(`[NotificationService] Category ${category.id} disabled, skipping notification`)
        return notificationId
      }

      // Send push notification
      if (
        this.config.enablePushNotifications &&
        (Platform.OS === 'ios' || Platform.OS === 'android')
      ) {
        await this.sendPushNotification(fullNotification)
      }

      // Update stats
      this.notificationStats.totalSent++
      this.notificationStats.sentThisHour++
      this.notificationStats.lastNotificationTime = Date.now()

      // Persist stats
      await this.saveStats()

      // Emit event
      this.emit('notification_sent', fullNotification)

      console.log(`[NotificationService] Notification sent: ${notificationId}`)
      return notificationId
    } catch (error) {
      this.notificationStats.totalFailed++
      console.error('[NotificationService] Failed to send notification:', error)
      this.emit('notification_failed', { notification: fullNotification, error })
      return notificationId
    }
  }

  /**
   * Send payment received notification
   */
  async notifyPaymentReceived(amount: bigint, paymentHash: string): Promise<string> {
    return this.sendLightningNotification({
      type: 'payment_received',
      title: 'Payment Received',
      body: `Received ${this.formatAmount(amount)} sats`,
      data: { paymentHash, amount: amount.toString() },
      categoryId: 'payments',
      priority: 'high',
    })
  }

  /**
   * Send payment sent notification
   */
  async notifyPaymentSent(amount: bigint, fee: bigint, paymentHash: string): Promise<string> {
    return this.sendLightningNotification({
      type: 'payment_sent',
      title: 'Payment Sent',
      body: `Sent ${this.formatAmount(amount)} sats (fee: ${this.formatAmount(fee)} sats)`,
      data: { paymentHash, amount: amount.toString(), fee: fee.toString() },
      categoryId: 'payments',
      priority: 'normal',
    })
  }

  /**
   * Send channel opened notification
   */
  async notifyChannelOpened(channelId: string, capacity: bigint): Promise<string> {
    return this.sendLightningNotification({
      type: 'channel_opened',
      title: 'Channel Opened',
      body: `New channel opened with capacity ${this.formatAmount(capacity)} sats`,
      data: { channelId, capacity: capacity.toString() },
      categoryId: 'channels',
      priority: 'normal',
    })
  }

  /**
   * Send channel closed notification
   */
  async notifyChannelClosed(channelId: string, reason?: string): Promise<string> {
    return this.sendLightningNotification({
      type: 'channel_closed',
      title: 'Channel Closed',
      body: `Channel closed${reason ? `: ${reason}` : ''}`,
      data: { channelId, reason },
      categoryId: 'channels',
      priority: 'normal',
    })
  }

  /**
   * Send liquidity alert notification
   */
  async notifyLiquidityAlert(
    message: string,
    severity: 'low' | 'medium' | 'high' = 'medium',
  ): Promise<string> {
    const priority = severity === 'high' ? 'high' : severity === 'medium' ? 'normal' : 'low'

    return this.sendLightningNotification({
      type: 'liquidity_alert',
      title: 'Liquidity Alert',
      body: message,
      data: { severity },
      categoryId: 'liquidity',
      priority,
    })
  }

  /**
   * Send payment failed notification
   */
  async notifyPaymentFailed(error: string, invoice?: string): Promise<string> {
    return this.sendLightningNotification({
      type: 'payment_failed',
      title: 'Payment Failed',
      body: `Payment failed: ${error}`,
      data: { error, invoice },
      categoryId: 'errors',
      priority: 'high',
    })
  }

  /**
   * Update notification categories
   */
  updateCategories(categories: NotificationCategory[]): void {
    this.config.categories = categories
    this.emit('categories_updated', categories)
  }

  /**
   * Get notification statistics
   */
  getStats(): NotificationStats {
    return { ...this.notificationStats }
  }

  /**
   * Clear all notifications
   */
  async clearAllNotifications(): Promise<void> {
    try {
      await Notifications.dismissAllNotificationsAsync()
      console.log('[NotificationService] All notifications cleared')
    } catch (error) {
      console.error('[NotificationService] Failed to clear notifications:', error)
    }
  }

  // ==========================================
  // PRIVATE METHODS
  // ==========================================

  private async sendPushNotification(notification: LightningNotification): Promise<void> {
    if (!this.expoPushToken) {
      console.warn('[NotificationService] No push token available')
      return
    }

    try {
      // Create notification content
      const notificationContent: Notifications.NotificationContentInput = {
        title: notification.title,
        body: notification.body,
        data: notification.data,
        sound: this.config.enableSound ? 'default' : undefined,
        priority: this.mapPriorityToExpo(notification.priority),
        categoryIdentifier: notification.categoryId,
      }

      // Schedule local notification
      await Notifications.scheduleNotificationAsync({
        content: notificationContent,
        trigger: null, // Show immediately
      })

      this.notificationStats.totalSent++
      this.notificationStats.sentThisHour++
      this.notificationStats.lastNotificationTime = Date.now()

      console.log('[NotificationService] Push notification sent:', notification.title)
    } catch (error) {
      console.error('[NotificationService] Failed to send push notification:', error)
      this.notificationStats.totalFailed++
    }
  }

  private canSendNotification(): boolean {
    return this.notificationStats.sentThisHour < this.config.maxNotificationsPerHour
  }

  private setupHourlyReset(): void {
    // Reset counter every hour
    this.hourlyResetTimer = setInterval(
      () => {
        this.notificationStats.sentThisHour = 0
      },
      60 * 60 * 1000,
    ) // 1 hour
  }

  private async loadStats(): Promise<void> {
    // TODO: Implement stats persistence
  }

  private async saveStats(): Promise<void> {
    // TODO: Implement stats persistence
  }

  private mapPriorityToExpo(priority: 'low' | 'normal' | 'high'): 'default' | 'normal' | 'high' {
    switch (priority) {
      case 'low':
        return 'default'
      case 'high':
        return 'high'
      default:
        return 'normal'
    }
  }

  private formatAmount(amount: bigint): string {
    // Simple formatting - could be enhanced
    return amount.toLocaleString()
  }

  private generateNotificationId(): string {
    return `notification_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Clean up resources
   */
  async destroy(): Promise<void> {
    if (this.hourlyResetTimer) {
      clearInterval(this.hourlyResetTimer)
    }
    this.removeAllListeners()
  }
}

// ==========================================
// FACTORY FUNCTION
// ==========================================

export function createNotificationService(
  config?: Partial<NotificationConfig>,
): NotificationService {
  return new NotificationService(config)
}

// ==========================================
// DEFAULT EXPORT
// ==========================================

export default NotificationService
