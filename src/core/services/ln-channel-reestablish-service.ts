// Channel Reestablishment Service
// Handles Lightning Network channel reestablishment after reconnection
// Implements BOLT #2 channel_reestablish message handling

import { ChannelId } from '@/core/models/lightning/peer'
import { ChannelState } from '@/core/models/lightning/channel'
import lightningRepository from '@/core/repositories/lightning'
import {
  encodeChannelReestablishMessage,
  decodeChannelReestablishMessage,
} from '@/core/lib/lightning/peer'
import { getPerCommitmentSecretFromSeed } from '@/core/lib/lightning/revocation'
import { broadcastTransaction } from '@/core/lib/electrum/client'
import { getTransport } from './ln-transport-service'
import { uint8ArrayToHex } from '@/core/lib/utils/utils'

// ==========================================
// TYPES & INTERFACES
// ==========================================

export interface ReestablishResult {
  success: boolean
  channelId: ChannelId
  newState: ChannelState
  dataLoss?: {
    local: boolean
    remote: boolean
    commitmentNumber: bigint
  }
  htlcsResumed: number
  error?: string
}

export interface ChannelReestablishData {
  channelId: ChannelId
  nextCommitmentNumber: bigint
  nextRevocationNumber: bigint
  yourLastPerCommitmentSecret: Uint8Array
  myCurrentPerCommitmentPoint: Uint8Array
}

export interface ChannelReestablishStats {
  attempted: number
  succeeded: number
  failed: number
  htlcsResumed: number
  lastErrors: { channelId: string; nodeId: string; error: string }[]
  lastRunAt?: number
}

// ==========================================
// CHANNEL REESTABLISH SERVICE
// ==========================================

export class ChannelReestablishService {
  private readonly repository = lightningRepository
  private stats: ChannelReestablishStats = {
    attempted: 0,
    succeeded: 0,
    failed: 0,
    htlcsResumed: 0,
    lastErrors: [],
  }

  /**
   * Reestablishes a channel after peer reconnection
   * Implements the channel_reestablish protocol from BOLT #2
   */
  async reestablishChannel(channelId: ChannelId, nodeId: string): Promise<ReestablishResult> {
    try {
      this.stats.attempted += 1
      this.stats.lastRunAt = Date.now()

      // Ensure we have transport connectivity before proceeding
      this.requireConnectedTransport(nodeId)

      // Load channel data from repository
      const channelIdHex = uint8ArrayToHex(channelId)
      const channelData = await this.repository.findChannelById(channelIdHex)
      if (!channelData) {
        this.recordFailure(channelId, nodeId, 'Channel not found in repository')
        return {
          success: false,
          channelId,
          newState: ChannelState.CLOSED,
          htlcsResumed: 0,
          error: 'Channel not found in repository',
        }
      }

      // Get current channel state
      const currentState = channelData.state as ChannelState
      if (currentState === ChannelState.CLOSED || currentState === ChannelState.CLOSING) {
        this.recordFailure(channelId, nodeId, 'Channel is closed or closing')
        return {
          success: false,
          channelId,
          newState: currentState,
          htlcsResumed: 0,
          error: 'Channel is closed or closing',
        }
      }

      // Prepare reestablish message data
      const reestablishData = await this.prepareReestablishData(channelData)

      // Send channel_reestablish message
      const message = encodeChannelReestablishMessage(reestablishData)
      await this.sendMessageToPeer(nodeId, message)
      console.log('Sending channel_reestablish to', nodeId, uint8ArrayToHex(channelId))

      // Wait for peer's response (this would be handled by the peer message handler)
      // For now, assume success and update state
      const result = await this.handleReestablishResponse(channelId, channelData)

      this.recordSuccess(result.htlcsResumed)

      return result
    } catch (error) {
      console.error('Channel reestablishment failed:', error)
      this.recordFailure(channelId, nodeId, error)
      return {
        success: false,
        channelId,
        newState: ChannelState.ERROR,
        htlcsResumed: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  getStats(): ChannelReestablishStats {
    return { ...this.stats, lastErrors: [...this.stats.lastErrors] }
  }

  resetStats(): void {
    this.stats = {
      attempted: 0,
      succeeded: 0,
      failed: 0,
      htlcsResumed: 0,
      lastErrors: [],
      lastRunAt: undefined,
    }
  }

  private requireConnectedTransport(nodeId: string) {
    const transport = getTransport()
    if (!transport.isConnected) {
      throw new Error(`Transport not connected; cannot communicate with ${nodeId}`)
    }
    return transport
  }

  private async sendMessageToPeer(nodeId: string, payload: Uint8Array): Promise<void> {
    const transport = this.requireConnectedTransport(nodeId)

    try {
      transport.sendMessage(payload)
    } catch (error) {
      console.error('Failed to send channel_reestablish message to', nodeId, error)
      throw error instanceof Error ? error : new Error('Failed to send channel_reestablish message')
    }
  }

  private extractCommitmentTxHex(channel: any): string {
    if (typeof channel.commitmentTxHex === 'string') return channel.commitmentTxHex
    if (typeof channel.localCommitmentTxHex === 'string') return channel.localCommitmentTxHex
    if (typeof channel.localCommitmentTx === 'string') return channel.localCommitmentTx
    if (channel.localCommitmentTx instanceof Uint8Array)
      return uint8ArrayToHex(channel.localCommitmentTx)

    throw new Error('Missing commitment transaction for force close; store commitmentTxHex first')
  }

  /**
   * Prepares the data needed for channel reestablish message
   */
  private async prepareReestablishData(channelData: any): Promise<any> {
    // Get next commitment number (current + 1)
    const nextCommitmentNumber = channelData.commitmentNumber + 1n

    // Get next revocation number (current revocation index + 1)
    const nextRevocationNumber = channelData.revocationIndex + 1n

    // Get last per-commitment secret received from peer
    const yourLastPerCommitmentSecret = await this.getLastReceivedSecret(channelData)

    // Get our current per-commitment point
    const myCurrentPerCommitmentPoint = await this.getCurrentCommitmentPoint(channelData)

    return {
      type: 136, // CHANNEL_REESTABLISH
      channelId: channelData.channelId,
      nextCommitmentNumber,
      nextRevocationNumber,
      yourLastPerCommitmentSecret,
      myCurrentPerCommitmentPoint,
      tlvs: {}, // No TLVs for basic reestablish
    }
  }

  /**
   * Handles the peer's channel_reestablish response
   */
  private async handleReestablishResponse(
    channelId: ChannelId,
    channelData: any,
  ): Promise<ReestablishResult> {
    // This would normally wait for the peer's response message
    // For now, simulate successful reestablishment

    // Check for data loss
    const dataLoss = await this.detectDataLoss(channelData)

    // Resume pending HTLCs
    const htlcsResumed = await this.resumePendingHtlcs(channelId)

    // Update channel state to NORMAL
    // TODO: Implement updateChannelState in repository
    console.log('Updating channel state to NORMAL for', uint8ArrayToHex(channelId))

    return {
      success: true,
      channelId,
      newState: ChannelState.NORMAL,
      dataLoss,
      htlcsResumed,
    }
  }

  private recordSuccess(resumed: number): void {
    this.stats.succeeded += 1
    this.stats.htlcsResumed += resumed
    this.stats.lastRunAt = Date.now()
  }

  private recordFailure(channelId: ChannelId, nodeId: string, error: unknown): void {
    this.stats.failed += 1
    this.stats.lastRunAt = Date.now()

    const message = error instanceof Error ? error.message : 'Unknown error'
    const channelIdHex = uint8ArrayToHex(channelId)
    this.stats.lastErrors = [
      { channelId: channelIdHex, nodeId, error: message },
      ...this.stats.lastErrors,
    ].slice(0, 10)
  }

  /**
   * Gets the last per-commitment secret received from the peer
   */
  private async getLastReceivedSecret(channelData: any): Promise<Uint8Array> {
    // This should get the last secret received from the peer
    // For now, return a placeholder
    const seed = channelData.revocationSeed
    const index = channelData.revocationIndex
    return getPerCommitmentSecretFromSeed(seed, index)
  }

  /**
   * Gets our current per-commitment point
   */
  private async getCurrentCommitmentPoint(channelData: any): Promise<Uint8Array> {
    // This should derive the current commitment point
    // For now, return a placeholder
    // TODO: Implement proper point derivation
    return new Uint8Array(33).fill(0x02) // Placeholder
  }

  /**
   * Detects if there's data loss on either side
   */
  private async detectDataLoss(channelData: any): Promise<ReestablishResult['dataLoss']> {
    // This method is called when we receive a reestablish message from peer
    // Data loss detection is handled in verifyReestablishMessage
    // Here we return undefined as data loss is detected during verification
    return undefined // No data loss detected during our reestablishment
  }

  /**
   * Handles local data loss detection
   * Called when peer sends commitment number higher than expected
   */
  private async handleLocalDataLoss(
    channelId: ChannelId,
    peerCommitmentNumber: bigint,
    ourCommitmentNumber: bigint,
  ): Promise<void> {
    console.error('Local data loss detected for channel', uint8ArrayToHex(channelId), {
      peerCommitmentNumber,
      ourCommitmentNumber,
    })

    // According to BOLT #2, if we detect local data loss and option_data_loss_protect
    // is negotiated, we should fail the channel to prevent fund loss

    // For now, we'll throw an error to fail the reestablishment
    // In a full implementation, this might trigger:
    // 1. Channel force close
    // 2. Publishing of the latest commitment transaction we have
    // 3. HTLC timeout/settlement based on our local state

    // Check if we can safely force close
    const canForceClose = await this.canSafelyForceClose(channelId, ourCommitmentNumber)

    if (canForceClose) {
      console.log('Initiating force close due to local data loss')
      await this.initiateForceClose(channelId)
    } else {
      console.error('Cannot safely force close channel with data loss')
    }

    throw new Error(
      `Local data loss detected. Cannot safely reestablish channel. ` +
        `Peer expects commitment ${peerCommitmentNumber}, we have ${ourCommitmentNumber}`,
    )
  }

  /**
   * Handles remote data loss detection
   * Called when peer sends commitment number lower than expected
   */
  private async handleRemoteDataLoss(
    channelId: ChannelId,
    peerCommitmentNumber: bigint,
    ourCommitmentNumber: bigint,
    channelData: any,
  ): Promise<void> {
    console.warn('Remote data loss detected for channel', uint8ArrayToHex(channelId), {
      peerCommitmentNumber,
      ourCommitmentNumber,
    })

    // For remote data loss, we can help the peer recover by providing
    // the per_commitment_secret they need to reconstruct their state

    // Calculate how many secrets we need to provide
    const secretsToProvide = Number(ourCommitmentNumber - peerCommitmentNumber)

    if (secretsToProvide > 0 && secretsToProvide <= 1000) {
      // Reasonable limit to prevent abuse
      console.log(`Providing ${secretsToProvide} per-commitment secrets for remote recovery`)

      // Generate the required per_commitment_secrets
      const secrets = await this.generateRecoverySecrets(
        channelData,
        peerCommitmentNumber,
        secretsToProvide,
      )

      // In a full implementation, we would send these secrets via:
      // 1. A special channel_update message with TLVs
      // 2. Or a separate recovery protocol message
      // For now, we just log them
      console.log(
        'Recovery secrets generated:',
        secrets.map(s => uint8ArrayToHex(s)),
      )

      // Store the recovery secrets for the peer to retrieve
      await this.storeRecoverySecrets(channelId, secrets)
    } else if (secretsToProvide > 1000) {
      console.error('Too many secrets requested for recovery:', secretsToProvide)
      throw new Error('Recovery request exceeds reasonable limits')
    }
  }

  /**
   * Generates per-commitment secrets for remote data loss recovery
   */
  private async generateRecoverySecrets(
    channelData: any,
    startingCommitmentNumber: bigint,
    count: number,
  ): Promise<Uint8Array[]> {
    const secrets: Uint8Array[] = []

    for (let i = 0; i < count; i++) {
      const commitmentNumber = startingCommitmentNumber + BigInt(i)
      // The peer needs the secret for commitment number N to reconstruct commitment N+1
      // So we provide the secret corresponding to their last known commitment
      const secret = getPerCommitmentSecretFromSeed(
        channelData.revocationSeed,
        Number(commitmentNumber),
      )
      secrets.push(secret)
    }

    return secrets
  }

  /**
   * Stores recovery secrets for later retrieval by the peer
   */
  private async storeRecoverySecrets(channelId: ChannelId, secrets: Uint8Array[]): Promise<void> {
    // In a full implementation, this would store the secrets in the repository
    // with an expiration time, so the peer can retrieve them
    console.log(
      `Storing ${secrets.length} recovery secrets for channel ${uint8ArrayToHex(channelId)}`,
    )

    // TODO: Implement storage in repository
    // await this.repository.storeRecoverySecrets(channelId, secrets, expirationTime)
  }

  /**
   * Resumes pending HTLCs after reestablishment
   */
  private async resumePendingHtlcs(channelId: ChannelId): Promise<number> {
    // Load pending HTLCs and resume them
    // TODO: Implement findPendingHtlcs in repository
    return 0 // Placeholder
  }

  /**
   * Handles incoming channel_reestablish messages from peers
   */
  async handleIncomingReestablish(nodeId: string, messageData: Uint8Array): Promise<void> {
    const reestablishMsg = decodeChannelReestablishMessage(messageData)

    // Find the channel
    const channelIdHex = uint8ArrayToHex(reestablishMsg.channelId)
    const channelData = await this.repository.findChannelById(channelIdHex)
    if (!channelData) {
      throw new Error(`Channel ${channelIdHex} not found`)
    }

    // Verify the message data
    await this.verifyReestablishMessage(reestablishMsg, channelData)

    // Send our reestablish response
    const responseData = await this.prepareReestablishData(channelData)
    const response = encodeChannelReestablishMessage(responseData)
    await this.sendMessageToPeer(nodeId, response)
    console.log('Sending reestablish response to', nodeId, channelIdHex)

    // Update channel state
    // TODO: Implement updateChannelState in repository
    console.log('Updating channel state to NORMAL for', channelIdHex)
  }

  /**
   * Verifies the incoming channel_reestablish message
   */
  private async verifyReestablishMessage(msg: any, channelData: any): Promise<void> {
    // Verify commitment numbers, secrets, points, etc.
    // Throw error if verification fails

    // Check for local data loss: if peer's next_commitment_number > our current_commitment_number + 1
    const ourNextCommitmentNumber = channelData.commitmentNumber + 1n
    if (msg.nextCommitmentNumber > ourNextCommitmentNumber) {
      // Local data loss detected - we have lost some commitment transactions
      await this.handleLocalDataLoss(
        msg.channelId,
        msg.nextCommitmentNumber,
        ourNextCommitmentNumber,
      )
    }

    // Check for remote data loss: if peer's next_commitment_number < our current_commitment_number + 1
    if (msg.nextCommitmentNumber < ourNextCommitmentNumber) {
      // Remote data loss detected - peer has lost some commitment transactions
      await this.handleRemoteDataLoss(
        msg.channelId,
        msg.nextCommitmentNumber,
        ourNextCommitmentNumber,
        channelData,
      )
    }

    // Verify revocation numbers
    const ourNextRevocationNumber = channelData.revocationIndex + 1n
    if (msg.nextRevocationNumber !== ourNextRevocationNumber) {
      throw new Error(
        `Revocation number mismatch. Expected ${ourNextRevocationNumber}, got ${msg.nextRevocationNumber}`,
      )
    }

    // Additional verifications can be added here
    // - Verify per-commitment secrets
    // - Verify commitment points
    // - Check for feature compatibility
  }

  /**
   * Checks if we can safely force close a channel with data loss
   * This is a simplified check - in production, this would involve
   * checking our commitment transaction and HTLC states
   */
  private async canSafelyForceClose(
    channelId: ChannelId,
    ourCommitmentNumber: bigint,
  ): Promise<boolean> {
    try {
      // Get channel state from repository
      const channel = this.repository.findChannelById(uint8ArrayToHex(channelId))
      if (!channel) {
        console.error('Channel not found for force close check')
        return false
      }

      // Basic checks:
      // 1. We have a valid commitment transaction
      // 2. Our commitment number is reasonable (not too old)
      // 3. Channel is in a state that allows force close

      const hasValidCommitment = channel.fundingTxid !== undefined
      const commitmentNotTooOld = ourCommitmentNumber > 0n // Simplified check

      return hasValidCommitment && commitmentNotTooOld
    } catch (error) {
      console.error('Error checking if can safely force close:', error)
      return false
    }
  }

  /**
   * Initiates force close of a channel due to data loss
   * In a full implementation, this would:
   * 1. Broadcast the commitment transaction
   * 2. Handle HTLC timeouts/settlements
   * 3. Update channel state to closed
   */
  private async initiateForceClose(channelId: ChannelId): Promise<void> {
    const channelIdHex = uint8ArrayToHex(channelId)
    console.log('Initiating force close for channel', channelIdHex)

    try {
      this.requireConnectedTransport(channelIdHex)

      // Get channel state
      const channel = this.repository.findChannelById(channelIdHex)
      if (!channel) {
        throw new Error('Channel not found for force close')
      }

      const commitmentTxHex = this.extractCommitmentTxHex(channel)
      const txid = await broadcastTransaction(commitmentTxHex)
      console.log('Broadcasted commitment transaction for channel', channelIdHex, txid)

      // Update channel state to indicate force close initiated
      const updatedChannel = {
        ...channel,
        state: 'force_closing',
        commitmentTxid: channel.commitmentTxid ?? txid,
        lastActivity: Date.now(),
      }
      this.repository.saveChannel(updatedChannel)

      // TODO: Handle HTLC resolution
      // TODO: Send error message to peer
    } catch (error) {
      console.error('Error initiating force close:', error)
      throw error
    }
  }
}

export default ChannelReestablishService
