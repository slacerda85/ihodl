/**
 * Lightning Node Implementation
 * Main coordinator for Lightning Network node operations
 *
 * @deprecated This implementation assumes running a full Lightning node locally,
 * which is not compatible with SPV (Simple Payment Verification) wallets.
 * SPV wallets should connect to remote Lightning Service Providers (LSPs)
 * or nodes via clients like LNDClient, CLNClient, or EclairClient.
 * Use authenticatedLightningClient() from clients.ts instead.
 *
 * The LightningNodeImpl class has been removed as it relies on gossip routing,
 * which is incompatible with SPV wallets. Use trampoline routing via wallet.ts instead.
 */
