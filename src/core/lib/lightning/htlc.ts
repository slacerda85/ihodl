// BOLT #2: HTLC Manager - Gerenciamento de estado de HTLCs
// Baseado em electrum/lnhtlc.py

// ==========================================
// TIPOS E CONSTANTES
// ==========================================

/**
 * Direção do HTLC (quem ofereceu)
 */
export enum HTLCOwner {
  LOCAL = 1,
  REMOTE = -1,
}

/**
 * Direção do HTLC para commits
 */
export enum HTLCDirection {
  SENT = 'sent',
  RECEIVED = 'received',
}

/**
 * Estado do HTLC
 */
export enum HTLCState {
  /** HTLC foi oferecido mas não está em nenhum commitment ainda */
  PENDING = 'pending',
  /** HTLC está locked in no commitment transaction */
  LOCKED_IN = 'locked_in',
  /** HTLC foi settled (fulfill) mas não revogado ainda */
  SETTLING = 'settling',
  /** HTLC foi failed mas não revogado ainda */
  FAILING = 'failing',
  /** HTLC foi completamente resolvido (settled) */
  SETTLED = 'settled',
  /** HTLC falhou completamente */
  FAILED = 'failed',
}

/**
 * Informações de um HTLC
 */
export interface UpdateAddHtlc {
  htlcId: bigint
  amountMsat: bigint
  paymentHash: Uint8Array // 32 bytes
  cltvExpiry: number
  onionRoutingPacket?: Uint8Array // 1366 bytes
  blindingPoint?: Uint8Array // 33 bytes (opcional)
}

/**
 * Ação de HTLC (settle ou fail)
 */
export type HTLCAction = 'settle' | 'fail'

/**
 * Registro de commitment transaction number por lado
 */
export interface CtnPair {
  local: number | null
  remote: number | null
}

/**
 * Atualização de fee
 */
export interface FeeUpdate {
  rate: number // feerate em sat/kw
  ctnLocal: number | null
  ctnRemote: number | null
}

/**
 * Log de HTLC para um lado (LOCAL ou REMOTE)
 */
export interface HTLCLog {
  /** HTLCs adicionados: htlcId -> UpdateAddHtlc */
  adds: Map<bigint, UpdateAddHtlc>
  /** HTLCs locked in: htlcId -> CtnPair */
  lockedIn: Map<bigint, CtnPair>
  /** HTLCs settled: htlcId -> CtnPair */
  settles: Map<bigint, CtnPair>
  /** HTLCs failed: htlcId -> CtnPair */
  fails: Map<bigint, CtnPair>
  /** Atualizações de fee: index -> FeeUpdate */
  feeUpdates: Map<number, FeeUpdate>
  /** Se há revoke_and_ack pendente */
  revackPending: boolean
  /** Próximo HTLC ID a ser usado */
  nextHtlcId: bigint
  /** Commitment transaction number mais antigo não revogado */
  ctn: number
}

/**
 * Snapshot do estado de um lado para serialização
 */
export interface HTLCLogSnapshot {
  adds: [string, UpdateAddHtlc][]
  lockedIn: [string, CtnPair][]
  settles: [string, CtnPair][]
  fails: [string, CtnPair][]
  feeUpdates: [number, FeeUpdate][]
  revackPending: boolean
  nextHtlcId: string
  ctn: number
}

/**
 * Estado completo do HTLC Manager para serialização
 */
export interface HTLCManagerState {
  local: HTLCLogSnapshot
  remote: HTLCLogSnapshot
  localUnackedUpdates: Uint8Array[]
  localWasRevokeLast: boolean
}

// ==========================================
// HTLC MANAGER
// ==========================================

/**
 * HTLCManager - Gerencia o estado de HTLCs em um canal Lightning
 *
 * Este gerenciador é responsável por:
 * - Tracking de HTLCs enviados e recebidos
 * - Gerenciamento de commitment transaction numbers (ctn)
 * - Sincronização de estado entre peers
 * - Tracking de revoke_and_ack pendentes
 * - Atualizações de fee
 *
 * Conceitos importantes:
 * - ctn (commitment transaction number): Número sequencial do commitment tx
 * - locked_in: HTLC está incluído em um commitment tx assinado
 * - revack_pending: Aguardando revoke_and_ack do peer
 *
 * Uso típico:
 * 1. Criar manager: new HTLCManager()
 * 2. Abrir canal: manager.channelOpenFinished()
 * 3. Enviar HTLC: manager.sendHtlc(htlc)
 * 4. Enviar commitment: manager.sendCtx()
 * 5. Receber revoke: manager.recvRev()
 */
export class HTLCManager {
  private logLocal: HTLCLog
  private logRemote: HTLCLog
  private unackedUpdates: Uint8Array[] = []
  private wasRevokeLast: boolean = false
  private maybeActiveHtlcIds: Map<HTLCOwner, Set<bigint>> = new Map()

  constructor(initialFeerate?: number) {
    // Inicializar logs para ambos os lados
    this.logLocal = this.createEmptyLog()
    this.logRemote = this.createEmptyLog()

    // Inicializar conjuntos de HTLCs ativos
    this.maybeActiveHtlcIds.set(HTLCOwner.LOCAL, new Set())
    this.maybeActiveHtlcIds.set(HTLCOwner.REMOTE, new Set())

    // Bootstrap fee_updates se feerate inicial fornecido
    if (initialFeerate !== undefined) {
      const feeUpdate: FeeUpdate = {
        rate: initialFeerate,
        ctnLocal: 0,
        ctnRemote: 0,
      }
      this.logLocal.feeUpdates.set(0, feeUpdate)
      this.logRemote.feeUpdates.set(0, { ...feeUpdate })
    }
  }

  /**
   * Cria um log vazio para um lado
   */
  private createEmptyLog(): HTLCLog {
    return {
      adds: new Map(),
      lockedIn: new Map(),
      settles: new Map(),
      fails: new Map(),
      feeUpdates: new Map(),
      revackPending: false,
      nextHtlcId: 0n,
      ctn: -1,
    }
  }

  /**
   * Obtém o log para um lado específico
   */
  private getLog(owner: HTLCOwner): HTLCLog {
    return owner === HTLCOwner.LOCAL ? this.logLocal : this.logRemote
  }

  // ==========================================
  // CONSULTAS DE ESTADO
  // ==========================================

  /**
   * Retorna o ctn mais recente (newest que tem uma assinatura válida) para um lado
   */
  ctnLatest(owner: HTLCOwner): number {
    return this.ctnOldestUnrevoked(owner) + (this.isRevackPending(owner) ? 1 : 0)
  }

  /**
   * Retorna o ctn mais antigo não revogado para um lado
   */
  ctnOldestUnrevoked(owner: HTLCOwner): number {
    return this.getLog(owner).ctn
  }

  /**
   * Retorna true se o lado tem revoke_and_ack pendente
   * (tem múltiplos ctxs não revogados)
   */
  isRevackPending(owner: HTLCOwner): boolean {
    return this.getLog(owner).revackPending
  }

  /**
   * Define o estado de revack pendente
   */
  private setRevackPending(owner: HTLCOwner, pending: boolean): void {
    this.getLog(owner).revackPending = pending
  }

  /**
   * Retorna o próximo HTLC ID para um lado
   */
  getNextHtlcId(owner: HTLCOwner): bigint {
    return this.getLog(owner).nextHtlcId
  }

  /**
   * Retorna o feerate atual para um commitment tx específico
   */
  getCurrentFeerate(owner: HTLCOwner, ctn?: number): number {
    const log = this.getLog(owner)
    const targetCtn = ctn ?? this.ctnLatest(owner)

    // Encontrar a última fee update que se aplica a este ctn
    let currentRate = 0
    for (const [, feeUpdate] of log.feeUpdates) {
      const applicableCtn = owner === HTLCOwner.LOCAL ? feeUpdate.ctnLocal : feeUpdate.ctnRemote
      if (applicableCtn !== null && applicableCtn <= targetCtn) {
        currentRate = feeUpdate.rate
      }
    }
    return currentRate
  }

  // ==========================================
  // AÇÕES NO CANAL
  // ==========================================

  /**
   * Chamado quando o canal é aberto com sucesso
   * Inicializa os contadores de ctn
   */
  channelOpenFinished(): void {
    this.logLocal.ctn = 0
    this.logRemote.ctn = 0
    this.setRevackPending(HTLCOwner.LOCAL, false)
    this.setRevackPending(HTLCOwner.REMOTE, false)
  }

  /**
   * Envia um HTLC (LOCAL oferece)
   * Retorna o HTLC com ID preenchido
   */
  sendHtlc(htlc: UpdateAddHtlc): UpdateAddHtlc {
    const expectedId = this.getNextHtlcId(HTLCOwner.LOCAL)
    if (htlc.htlcId !== expectedId) {
      throw new Error(
        `Unexpected local htlc_id. Next should be ${expectedId} but got ${htlc.htlcId}`,
      )
    }

    // Registrar HTLC
    this.logLocal.adds.set(htlc.htlcId, htlc)

    // Marcar como locked_in no próximo commitment do REMOTE
    this.logLocal.lockedIn.set(htlc.htlcId, {
      local: null,
      remote: this.ctnLatest(HTLCOwner.REMOTE) + 1,
    })

    // Incrementar próximo ID
    this.logLocal.nextHtlcId += 1n

    // Adicionar ao conjunto de HTLCs potencialmente ativos
    this.maybeActiveHtlcIds.get(HTLCOwner.LOCAL)!.add(htlc.htlcId)

    return htlc
  }

  /**
   * Recebe um HTLC (REMOTE oferece)
   */
  recvHtlc(htlc: UpdateAddHtlc): void {
    const expectedId = this.getNextHtlcId(HTLCOwner.REMOTE)
    if (htlc.htlcId !== expectedId) {
      throw new Error(
        `Unexpected remote htlc_id. Next should be ${expectedId} but got ${htlc.htlcId}`,
      )
    }

    // Registrar HTLC
    this.logRemote.adds.set(htlc.htlcId, htlc)

    // Marcar como locked_in no próximo commitment LOCAL
    this.logRemote.lockedIn.set(htlc.htlcId, {
      local: this.ctnLatest(HTLCOwner.LOCAL) + 1,
      remote: null,
    })

    // Incrementar próximo ID
    this.logRemote.nextHtlcId += 1n

    // Adicionar ao conjunto de HTLCs potencialmente ativos
    this.maybeActiveHtlcIds.get(HTLCOwner.REMOTE)!.add(htlc.htlcId)
  }

  /**
   * Envia settle (fulfillment) de um HTLC remoto
   */
  sendSettle(htlcId: bigint): void {
    const nextCtn = this.ctnLatest(HTLCOwner.REMOTE) + 1
    if (
      !this.isHtlcActiveAtCtn({
        ctxOwner: HTLCOwner.REMOTE,
        ctn: nextCtn,
        htlcProposer: HTLCOwner.REMOTE,
        htlcId,
      })
    ) {
      throw new Error('(local) cannot remove htlc that is not there...')
    }

    this.logRemote.settles.set(htlcId, {
      local: null,
      remote: nextCtn,
    })
  }

  /**
   * Recebe settle de um HTLC local
   */
  recvSettle(htlcId: bigint): void {
    const nextCtn = this.ctnLatest(HTLCOwner.LOCAL) + 1
    if (
      !this.isHtlcActiveAtCtn({
        ctxOwner: HTLCOwner.LOCAL,
        ctn: nextCtn,
        htlcProposer: HTLCOwner.LOCAL,
        htlcId,
      })
    ) {
      throw new Error('(remote) cannot remove htlc that is not there...')
    }

    this.logLocal.settles.set(htlcId, {
      local: nextCtn,
      remote: null,
    })
  }

  /**
   * Envia fail de um HTLC remoto
   */
  sendFail(htlcId: bigint): void {
    const nextCtn = this.ctnLatest(HTLCOwner.REMOTE) + 1
    if (
      !this.isHtlcActiveAtCtn({
        ctxOwner: HTLCOwner.REMOTE,
        ctn: nextCtn,
        htlcProposer: HTLCOwner.REMOTE,
        htlcId,
      })
    ) {
      throw new Error('(local) cannot remove htlc that is not there...')
    }

    this.logRemote.fails.set(htlcId, {
      local: null,
      remote: nextCtn,
    })
  }

  /**
   * Recebe fail de um HTLC local
   */
  recvFail(htlcId: bigint): void {
    const nextCtn = this.ctnLatest(HTLCOwner.LOCAL) + 1
    if (
      !this.isHtlcActiveAtCtn({
        ctxOwner: HTLCOwner.LOCAL,
        ctn: nextCtn,
        htlcProposer: HTLCOwner.LOCAL,
        htlcId,
      })
    ) {
      throw new Error('(remote) cannot remove htlc that is not there...')
    }

    this.logLocal.fails.set(htlcId, {
      local: nextCtn,
      remote: null,
    })
  }

  /**
   * Envia update_fee (nós iniciamos mudança de feerate)
   */
  sendUpdateFee(feerate: number): void {
    const feeUpdate: FeeUpdate = {
      rate: feerate,
      ctnLocal: null,
      ctnRemote: this.ctnLatest(HTLCOwner.REMOTE) + 1,
    }
    this.newFeeUpdate(feeUpdate, HTLCOwner.LOCAL)
  }

  /**
   * Recebe update_fee do peer
   */
  recvUpdateFee(feerate: number): void {
    const feeUpdate: FeeUpdate = {
      rate: feerate,
      ctnLocal: this.ctnLatest(HTLCOwner.LOCAL) + 1,
      ctnRemote: null,
    }
    this.newFeeUpdate(feeUpdate, HTLCOwner.REMOTE)
  }

  /**
   * Adiciona nova fee update
   */
  private newFeeUpdate(feeUpdate: FeeUpdate, subject: HTLCOwner): void {
    const log = this.getLog(subject)
    const n = log.feeUpdates.size

    if (n > 0) {
      const lastFeeUpdate = log.feeUpdates.get(n - 1)!
      const lastCtnLocal = lastFeeUpdate.ctnLocal
      const lastCtnRemote = lastFeeUpdate.ctnRemote

      // Sobrescrever última update se não commitada por ninguém
      if (
        (lastCtnLocal === null || lastCtnLocal > this.ctnLatest(HTLCOwner.LOCAL)) &&
        (lastCtnRemote === null || lastCtnRemote > this.ctnLatest(HTLCOwner.REMOTE))
      ) {
        log.feeUpdates.set(n - 1, feeUpdate)
        return
      }
    }

    log.feeUpdates.set(n, feeUpdate)
  }

  // ==========================================
  // COMMITMENT TRANSACTION OPERATIONS
  // ==========================================

  /**
   * Enviamos commitment_signed para o peer (REMOTE)
   * Chamado após enviar commitment_signed
   */
  sendCtx(): void {
    const latest = this.ctnLatest(HTLCOwner.REMOTE)
    const oldest = this.ctnOldestUnrevoked(HTLCOwner.REMOTE)
    if (latest !== oldest) {
      throw new Error(`Cannot send ctx: ${latest} !== ${oldest}`)
    }

    this.setRevackPending(HTLCOwner.REMOTE, true)
    this.wasRevokeLast = false
  }

  /**
   * Recebemos commitment_signed do peer
   * Chamado após receber commitment_signed
   */
  recvCtx(): void {
    const latest = this.ctnLatest(HTLCOwner.LOCAL)
    const oldest = this.ctnOldestUnrevoked(HTLCOwner.LOCAL)
    if (latest !== oldest) {
      throw new Error(`Cannot recv ctx: ${latest} !== ${oldest}`)
    }

    this.setRevackPending(HTLCOwner.LOCAL, true)
  }

  /**
   * Enviamos revoke_and_ack para o peer
   * Chamado após enviar revoke_and_ack
   */
  sendRev(): void {
    this.logLocal.ctn += 1
    this.setRevackPending(HTLCOwner.LOCAL, false)
    this.wasRevokeLast = true

    // Atualizar HTLCs do REMOTE que agora estão locked_in
    for (const htlcId of this.maybeActiveHtlcIds.get(HTLCOwner.REMOTE)!) {
      const ctns = this.logRemote.lockedIn.get(htlcId)
      if (ctns && ctns.remote === null && ctns.local !== null) {
        if (ctns.local <= this.ctnLatest(HTLCOwner.LOCAL)) {
          ctns.remote = this.ctnLatest(HTLCOwner.REMOTE) + 1
        }
      }
    }

    // Atualizar settles e fails de HTLCs LOCAL
    for (const action of ['settles', 'fails'] as const) {
      for (const htlcId of this.maybeActiveHtlcIds.get(HTLCOwner.LOCAL)!) {
        const ctns = this.logLocal[action].get(htlcId)
        if (ctns && ctns.remote === null && ctns.local !== null) {
          if (ctns.local <= this.ctnLatest(HTLCOwner.LOCAL)) {
            ctns.remote = this.ctnLatest(HTLCOwner.REMOTE) + 1
          }
        }
      }
    }

    this.updateMaybeActiveHtlcIds()

    // Atualizar fee updates do REMOTE
    for (const [, feeUpdate] of this.logRemote.feeUpdates) {
      if (feeUpdate.ctnRemote === null && feeUpdate.ctnLocal !== null) {
        if (feeUpdate.ctnLocal <= this.ctnLatest(HTLCOwner.LOCAL)) {
          feeUpdate.ctnRemote = this.ctnLatest(HTLCOwner.REMOTE) + 1
        }
      }
    }
  }

  /**
   * Recebemos revoke_and_ack do peer
   * Chamado após receber revoke_and_ack
   */
  recvRev(): void {
    this.logRemote.ctn += 1
    this.setRevackPending(HTLCOwner.REMOTE, false)

    // Atualizar HTLCs LOCAL que agora estão locked_in
    for (const htlcId of this.maybeActiveHtlcIds.get(HTLCOwner.LOCAL)!) {
      const ctns = this.logLocal.lockedIn.get(htlcId)
      if (ctns && ctns.local === null && ctns.remote !== null) {
        if (ctns.remote <= this.ctnLatest(HTLCOwner.REMOTE)) {
          ctns.local = this.ctnLatest(HTLCOwner.LOCAL) + 1
        }
      }
    }

    // Atualizar settles e fails de HTLCs REMOTE
    for (const action of ['settles', 'fails'] as const) {
      for (const htlcId of this.maybeActiveHtlcIds.get(HTLCOwner.REMOTE)!) {
        const ctns = this.logRemote[action].get(htlcId)
        if (ctns && ctns.local === null && ctns.remote !== null) {
          if (ctns.remote <= this.ctnLatest(HTLCOwner.REMOTE)) {
            ctns.local = this.ctnLatest(HTLCOwner.LOCAL) + 1
          }
        }
      }
    }

    this.updateMaybeActiveHtlcIds()

    // Atualizar fee updates LOCAL
    for (const [, feeUpdate] of this.logLocal.feeUpdates) {
      if (feeUpdate.ctnLocal === null && feeUpdate.ctnRemote !== null) {
        if (feeUpdate.ctnRemote <= this.ctnLatest(HTLCOwner.REMOTE)) {
          feeUpdate.ctnLocal = this.ctnLatest(HTLCOwner.LOCAL) + 1
        }
      }
    }
  }

  // ==========================================
  // HTLC QUERIES
  // ==========================================

  /**
   * Verifica se um HTLC está ativo em um determinado ctn
   */
  isHtlcActiveAtCtn(params: {
    ctxOwner: HTLCOwner
    ctn: number
    htlcProposer: HTLCOwner
    htlcId: bigint
  }): boolean {
    const { ctxOwner, ctn, htlcProposer, htlcId } = params
    const log = this.getLog(htlcProposer)

    // Verificar se está locked_in
    const lockedIn = log.lockedIn.get(htlcId)
    if (!lockedIn) return false

    const lockedInCtn = ctxOwner === HTLCOwner.LOCAL ? lockedIn.local : lockedIn.remote
    if (lockedInCtn === null || lockedInCtn > ctn) return false

    // Verificar se foi settled
    const settled = log.settles.get(htlcId)
    if (settled) {
      const settledCtn = ctxOwner === HTLCOwner.LOCAL ? settled.local : settled.remote
      if (settledCtn !== null && settledCtn <= ctn) return false
    }

    // Verificar se falhou
    const failed = log.fails.get(htlcId)
    if (failed) {
      const failedCtn = ctxOwner === HTLCOwner.LOCAL ? failed.local : failed.remote
      if (failedCtn !== null && failedCtn <= ctn) return false
    }

    return true
  }

  /**
   * Retorna todos os HTLCs ativos em um determinado ctn
   */
  getHtlcsActiveAtCtn(ctxOwner: HTLCOwner, ctn?: number): UpdateAddHtlc[] {
    const targetCtn = ctn ?? this.ctnLatest(ctxOwner)
    const activeHtlcs: UpdateAddHtlc[] = []

    // Verificar HTLCs oferecidos por LOCAL
    for (const [htlcId, htlc] of this.logLocal.adds) {
      if (
        this.isHtlcActiveAtCtn({
          ctxOwner,
          ctn: targetCtn,
          htlcProposer: HTLCOwner.LOCAL,
          htlcId,
        })
      ) {
        activeHtlcs.push(htlc)
      }
    }

    // Verificar HTLCs oferecidos por REMOTE
    for (const [htlcId, htlc] of this.logRemote.adds) {
      if (
        this.isHtlcActiveAtCtn({
          ctxOwner,
          ctn: targetCtn,
          htlcProposer: HTLCOwner.REMOTE,
          htlcId,
        })
      ) {
        activeHtlcs.push(htlc)
      }
    }

    return activeHtlcs
  }

  /**
   * Retorna o HTLC por ID
   */
  getHtlc(htlcProposer: HTLCOwner, htlcId: bigint): UpdateAddHtlc | undefined {
    return this.getLog(htlcProposer).adds.get(htlcId)
  }

  /**
   * Calcula o saldo local em um determinado ctn
   */
  getLocalBalance(ctxOwner: HTLCOwner, ctn?: number, initialLocalBalance: bigint = 0n): bigint {
    const targetCtn = ctn ?? this.ctnLatest(ctxOwner)
    let balance = initialLocalBalance

    // Subtrair HTLCs que oferecemos
    for (const [htlcId, htlc] of this.logLocal.adds) {
      if (
        this.isHtlcActiveAtCtn({
          ctxOwner,
          ctn: targetCtn,
          htlcProposer: HTLCOwner.LOCAL,
          htlcId,
        })
      ) {
        balance -= htlc.amountMsat
      }
    }

    return balance
  }

  /**
   * Calcula o saldo remoto em um determinado ctn
   */
  getRemoteBalance(ctxOwner: HTLCOwner, ctn?: number, initialRemoteBalance: bigint = 0n): bigint {
    const targetCtn = ctn ?? this.ctnLatest(ctxOwner)
    let balance = initialRemoteBalance

    // Subtrair HTLCs que o peer ofereceu
    for (const [htlcId, htlc] of this.logRemote.adds) {
      if (
        this.isHtlcActiveAtCtn({
          ctxOwner,
          ctn: targetCtn,
          htlcProposer: HTLCOwner.REMOTE,
          htlcId,
        })
      ) {
        balance -= htlc.amountMsat
      }
    }

    return balance
  }

  /**
   * Atualiza o conjunto de HTLCs potencialmente ativos
   */
  private updateMaybeActiveHtlcIds(): void {
    const localCtn = this.ctnOldestUnrevoked(HTLCOwner.LOCAL)
    const remoteCtn = this.ctnOldestUnrevoked(HTLCOwner.REMOTE)

    // Limpar HTLCs LOCAL que já foram completamente resolvidos
    for (const htlcId of this.maybeActiveHtlcIds.get(HTLCOwner.LOCAL)!) {
      const settled = this.logLocal.settles.get(htlcId)
      const failed = this.logLocal.fails.get(htlcId)

      if (settled) {
        if (
          settled.local !== null &&
          settled.local <= localCtn &&
          settled.remote !== null &&
          settled.remote <= remoteCtn
        ) {
          this.maybeActiveHtlcIds.get(HTLCOwner.LOCAL)!.delete(htlcId)
        }
      }
      if (failed) {
        if (
          failed.local !== null &&
          failed.local <= localCtn &&
          failed.remote !== null &&
          failed.remote <= remoteCtn
        ) {
          this.maybeActiveHtlcIds.get(HTLCOwner.LOCAL)!.delete(htlcId)
        }
      }
    }

    // Limpar HTLCs REMOTE que já foram completamente resolvidos
    for (const htlcId of this.maybeActiveHtlcIds.get(HTLCOwner.REMOTE)!) {
      const settled = this.logRemote.settles.get(htlcId)
      const failed = this.logRemote.fails.get(htlcId)

      if (settled) {
        if (
          settled.local !== null &&
          settled.local <= localCtn &&
          settled.remote !== null &&
          settled.remote <= remoteCtn
        ) {
          this.maybeActiveHtlcIds.get(HTLCOwner.REMOTE)!.delete(htlcId)
        }
      }
      if (failed) {
        if (
          failed.local !== null &&
          failed.local <= localCtn &&
          failed.remote !== null &&
          failed.remote <= remoteCtn
        ) {
          this.maybeActiveHtlcIds.get(HTLCOwner.REMOTE)!.delete(htlcId)
        }
      }
    }
  }

  // ==========================================
  // MÉTODOS AUXILIARES ADICIONAIS
  // ==========================================

  /**
   * Retorna o CTN mais antigo não revogado
   */
  ctnOldest(owner: HTLCOwner): number {
    const log = owner === HTLCOwner.LOCAL ? this.logLocal : this.logRemote
    return log.ctn
  }

  /**
   * Conta HTLCs ativos para um owner
   */
  getCurrentHtlcCount(htlcProposer: HTLCOwner): number {
    let count = 0
    const maybeActive = this.maybeActiveHtlcIds.get(htlcProposer)
    if (maybeActive) {
      count = maybeActive.size
    }
    return count
  }

  /**
   * Obtém HTLC por ID
   */
  getHtlcById(htlcProposer: HTLCOwner, htlcId: bigint): UpdateAddHtlc | undefined {
    const log = htlcProposer === HTLCOwner.LOCAL ? this.logLocal : this.logRemote
    return log.adds.get(htlcId)
  }

  // ==========================================
  // MENSAGENS NÃO RECONHECIDAS
  // ==========================================

  /**
   * Armazena mensagem de update não reconhecida
   */
  storeUnackedUpdate(rawMsg: Uint8Array): void {
    this.unackedUpdates.push(rawMsg)
  }

  /**
   * Retorna e limpa mensagens não reconhecidas
   */
  getAndClearUnackedUpdates(): Uint8Array[] {
    const updates = [...this.unackedUpdates]
    this.unackedUpdates = []
    return updates
  }

  /**
   * Verifica se a última mensagem foi revoke_and_ack
   */
  wasLastMessageRevoke(): boolean {
    return this.wasRevokeLast
  }

  // ==========================================
  // SERIALIZAÇÃO
  // ==========================================

  /**
   * Serializa log para snapshot
   */
  private logToSnapshot(log: HTLCLog): HTLCLogSnapshot {
    return {
      adds: Array.from(log.adds.entries()).map(([k, v]) => [k.toString(), v]),
      lockedIn: Array.from(log.lockedIn.entries()).map(([k, v]) => [k.toString(), v]),
      settles: Array.from(log.settles.entries()).map(([k, v]) => [k.toString(), v]),
      fails: Array.from(log.fails.entries()).map(([k, v]) => [k.toString(), v]),
      feeUpdates: Array.from(log.feeUpdates.entries()),
      revackPending: log.revackPending,
      nextHtlcId: log.nextHtlcId.toString(),
      ctn: log.ctn,
    }
  }

  /**
   * Restaura log de snapshot
   */
  private snapshotToLog(snapshot: HTLCLogSnapshot): HTLCLog {
    return {
      adds: new Map(snapshot.adds.map(([k, v]) => [BigInt(k), v])),
      lockedIn: new Map(snapshot.lockedIn.map(([k, v]) => [BigInt(k), v])),
      settles: new Map(snapshot.settles.map(([k, v]) => [BigInt(k), v])),
      fails: new Map(snapshot.fails.map(([k, v]) => [BigInt(k), v])),
      feeUpdates: new Map(snapshot.feeUpdates),
      revackPending: snapshot.revackPending,
      nextHtlcId: BigInt(snapshot.nextHtlcId),
      ctn: snapshot.ctn,
    }
  }

  /**
   * Exporta estado completo para serialização
   */
  toJSON(): HTLCManagerState {
    return {
      local: this.logToSnapshot(this.logLocal),
      remote: this.logToSnapshot(this.logRemote),
      localUnackedUpdates: this.unackedUpdates,
      localWasRevokeLast: this.wasRevokeLast,
    }
  }

  /**
   * Restaura estado de JSON
   */
  static fromJSON(state: HTLCManagerState): HTLCManager {
    const manager = new HTLCManager()
    manager.logLocal = manager.snapshotToLog(state.local)
    manager.logRemote = manager.snapshotToLog(state.remote)
    manager.unackedUpdates = state.localUnackedUpdates || []
    manager.wasRevokeLast = state.localWasRevokeLast || false

    // Reconstruir maybeActiveHtlcIds
    for (const [htlcId] of manager.logLocal.adds) {
      const settled = manager.logLocal.settles.get(htlcId)
      const failed = manager.logLocal.fails.get(htlcId)
      if (!settled && !failed) {
        manager.maybeActiveHtlcIds.get(HTLCOwner.LOCAL)!.add(htlcId)
      }
    }
    for (const [htlcId] of manager.logRemote.adds) {
      const settled = manager.logRemote.settles.get(htlcId)
      const failed = manager.logRemote.fails.get(htlcId)
      if (!settled && !failed) {
        manager.maybeActiveHtlcIds.get(HTLCOwner.REMOTE)!.add(htlcId)
      }
    }

    return manager
  }
}

export default HTLCManager
