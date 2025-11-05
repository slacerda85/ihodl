// Background Channel Monitoring
// Simple implementation using Expo BackgroundTask

import { useEffect } from 'react'
import * as TaskManager from 'expo-task-manager'
import * as BackgroundTask from 'expo-background-task'
import { get, set } from '@/lib/storage'
import { ChannelState, transitionChannel } from '@/lib/lightning/channels'

const CHANNEL_MONITOR_TASK = 'channel_monitor'

// Background task for channel maintenance
TaskManager.defineTask(CHANNEL_MONITOR_TASK, async () => {
  try {
    await performChannelMaintenance()
    return BackgroundTask.BackgroundTaskResult.Success
  } catch (error) {
    console.error('[ChannelMonitor] Background task failed:', error)
    return BackgroundTask.BackgroundTaskResult.Failed
  }
})

// Main maintenance function
async function performChannelMaintenance() {
  const channels = await loadChannelsFromStorage()

  if (channels.length === 0) {
    return // No channels to monitor
  }

  const updatedChannels: ChannelState[] = []
  let hasChanges = false

  for (const channel of channels) {
    const updatedChannel = await checkAndUpdateChannel(channel)

    if (updatedChannel !== channel) {
      updatedChannels.push(updatedChannel)
      hasChanges = true
    } else {
      updatedChannels.push(channel)
    }
  }

  if (hasChanges) {
    await saveChannelsToStorage(updatedChannels)
  }
}

// Check individual channel for required actions
async function checkAndUpdateChannel(channel: ChannelState): Promise<ChannelState> {
  let updatedChannel = channel

  // Check for funding confirmation timeout (24 hours)
  if (channel.state === 'opening' && !channel.fundingTxId) {
    const timeSinceCreation = Date.now() - channel.createdAt
    const fundingTimeout = 24 * 60 * 60 * 1000 // 24 hours

    if (timeSinceCreation > fundingTimeout) {
      updatedChannel = transitionChannel(channel, 'funding_timeout')
    }
  }

  // Check for HTLC timeouts
  updatedChannel = await checkHtlcTimeouts(updatedChannel)

  // Check for stale channels (no activity for 30 days)
  const timeSinceUpdate = Date.now() - channel.updatedAt
  const staleTimeout = 30 * 24 * 60 * 60 * 1000 // 30 days

  if (timeSinceUpdate > staleTimeout && channel.state === 'open') {
    // Could implement channel health check here
    console.log(`[ChannelMonitor] Channel ${channel.id} appears stale`)
  }

  return updatedChannel
}

// Check for expired HTLCs
async function checkHtlcTimeouts(channel: ChannelState): Promise<ChannelState> {
  const now = Math.floor(Date.now() / 1000) // Current time in seconds
  let updatedChannel = channel

  for (const htlc of channel.pendingHtlcs) {
    if (htlc.state === 'offered' || htlc.state === 'accepted') {
      if (now > htlc.cltvExpiry) {
        // HTLC expired, cancel it
        console.log(`[ChannelMonitor] HTLC ${htlc.id} in channel ${channel.id} has expired`)
        updatedChannel = transitionChannel(updatedChannel, 'htlc_timeout', { htlcId: htlc.id })
      }
    }
  }

  return updatedChannel
}

// Storage helpers
async function loadChannelsFromStorage(): Promise<ChannelState[]> {
  try {
    const channels = await get<ChannelState[]>('lightning_channels')
    return channels || []
  } catch (error) {
    console.error('[ChannelMonitor] Error loading channels:', error)
    return []
  }
}

async function saveChannelsToStorage(channels: ChannelState[]): Promise<void> {
  try {
    await set('lightning_channels', channels)
  } catch (error) {
    console.error('[ChannelMonitor] Error saving channels:', error)
  }
}

// Public API
export const ChannelMonitor = {
  // Start background monitoring
  async start() {
    try {
      const status = await BackgroundTask.getStatusAsync()

      if (status === BackgroundTask.BackgroundTaskStatus.Available) {
        await BackgroundTask.registerTaskAsync(CHANNEL_MONITOR_TASK, {
          minimumInterval: 15 * 60, // 15 minutes
        })
        console.log('[ChannelMonitor] Background monitoring started')
      } else {
        console.warn('[ChannelMonitor] Background fetch not available')
      }
    } catch (error) {
      console.error('[ChannelMonitor] Failed to start monitoring:', error)
    }
  },

  // Stop background monitoring
  async stop() {
    try {
      await BackgroundTask.unregisterTaskAsync(CHANNEL_MONITOR_TASK)
      console.log('[ChannelMonitor] Background monitoring stopped')
    } catch (error) {
      console.error('[ChannelMonitor] Failed to stop monitoring:', error)
    }
  },

  // Manual maintenance run (for testing or immediate checks)
  async runMaintenance() {
    return performChannelMaintenance()
  },

  // Get monitoring status
  async getStatus() {
    const status = await BackgroundTask.getStatusAsync()
    return {
      available: status === BackgroundTask.BackgroundTaskStatus.Available,
      registered: await TaskManager.isTaskRegisteredAsync(CHANNEL_MONITOR_TASK),
    }
  },
}

// Periodic foreground monitoring (when app is active)
export function useChannelForegroundMonitor() {
  useEffect(() => {
    const interval = setInterval(
      () => {
        performChannelMaintenance().catch(error => {
          console.error('[ChannelMonitor] Foreground maintenance failed:', error)
        })
      },
      5 * 60 * 1000, // 5 minutes
    )

    return () => clearInterval(interval)
  }, [])
}
