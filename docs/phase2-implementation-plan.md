# Fase 2 - Plano de Implementação Detalhado

## Visão Geral

Este documento detalha a implementação dos **22 TODOs de média prioridade** relacionados à integração com blockchain, gossip, routing, backup e processamento HTLC.

**Status**: 🟡 **FASE 2 PENDENTE** - Próxima fase após conclusão da Fase 1 (criptografia)

**Dependências**: Fase 1 concluída (secp256k1, assinaturas, HTLC básico)

---

## Arquitetura Proposta

### Integração com Electrum Client

O projeto já possui `src/core/lib/electrum/client.ts` para comunicação com servidores Electrum. Precisamos integrar:

```typescript
// Extensões necessárias ao ElectrumClient
export interface ExtendedElectrumClient extends ElectrumClient {
  // Consultas já existentes
  getTransaction(txid: string): Promise<ElectrumTransaction>
  broadcastTransaction(rawTx: string): Promise<string>

  // Novas funcionalidades necessárias
  getScriptHashHistory(scripthash: string): Promise<ElectrumHistoryItem[]>
  getBalance(scripthash: string): Promise<ElectrumBalance>
  subscribeToScriptHash(scripthash: string, callback: (status: string) => void): Promise<void>
}
```

---

## TODO #16-23: Blockchain Integration

### Contexto

A integração real com blockchain é essencial para:

- Verificar funding transactions
- Broadcast de penalty/justice transactions
- Monitorar canais para breaches
- Gerar endereços de troco

### Problema Atual

```typescript
// worker.ts:5606 - Stub implementation
async getBlockchainInfo(): Promise<BlockchainInfo> {
  // TODO: Implementar consulta real via Electrum
  return {
    blockHeight: 850000, // Hardcoded
    blockHash: new Uint8Array(32), // Dummy
  }
}
```

### Implementação Correta

```typescript
// src/core/lib/lightning/worker.ts
export class LightningWorker {
  private async getBlockchainInfo(): Promise<BlockchainInfo> {
    try {
      const header = await this.electrumClient.getBlockchainHeaders(1, 1)
      return {
        blockHeight: header.height,
        blockHash: hexToUint8Array(header.hex),
      }
    } catch (error) {
      this.logger.error('Failed to get blockchain info:', error)
      throw new Error('Blockchain connection failed')
    }
  }

  private async broadcastTransaction(rawTx: string): Promise<string> {
    try {
      const txid = await this.electrumClient.broadcastTransaction(rawTx)
      this.logger.info(`Transaction broadcasted: ${txid}`)
      return txid
    } catch (error) {
      this.logger.error('Failed to broadcast transaction:', error)
      throw new Error('Broadcast failed')
    }
  }

  private async getRecentTransactions(scripthash: string): Promise<ElectrumHistoryItem[]> {
    try {
      return await this.electrumClient.getScriptHashHistory(scripthash)
    } catch (error) {
      this.logger.error('Failed to get transaction history:', error)
      return []
    }
  }
}
```

### Arquivos a Modificar

- `src/core/lib/lightning/worker.ts`: Integração principal
- `src/core/lib/electrum/client.ts`: Extensões se necessário
- `src/core/lib/transactions/transactions.ts`: Serialização para hex

---

## TODO #24-31: Gossip & Routing

### Contexto

Gossip permite descobrir canais e nós na rede Lightning para routing de pagamentos.

### Problema Atual

```typescript
// gossip.ts:680 - TLV parsing stub
export function parseGossipMessage(message: Uint8Array): GossipMessage {
  // TODO: Parsear TLVs em mensagens gossip
  return {
    type: MessageType.CHANNEL_ANNOUNCEMENT,
    // ... stub data
  }
}
```

### Implementação Correta

```typescript
// src/core/lib/lightning/gossip.ts
export function parseGossipMessage(message: Uint8Array): GossipMessage {
  const stream = new BitStreamReader(message)

  // Skip common message header
  const type = stream.readU16BE()
  const length = stream.readU16BE()

  switch (type) {
    case MessageType.CHANNEL_ANNOUNCEMENT:
      return parseChannelAnnouncement(stream)
    case MessageType.CHANNEL_UPDATE:
      return parseChannelUpdate(stream)
    case MessageType.NODE_ANNOUNCEMENT:
      return parseNodeAnnouncement(stream)
    default:
      throw new Error(`Unknown gossip message type: ${type}`)
  }
}

function parseChannelAnnouncement(stream: BitStreamReader): ChannelAnnouncementMessage {
  // Parse TLV-encoded channel announcement
  const chainHash = stream.readBytes(32)
  const shortChannelId = stream.readU64BE()
  const nodeId1 = stream.readBytes(33)
  const nodeId2 = stream.readBytes(33)
  const bitcoinKey1 = stream.readBytes(33)
  const bitcoinKey2 = stream.readBytes(33)

  // Parse TLVs for features, etc.
  const tlvs = parseTlvs(stream)

  return {
    type: MessageType.CHANNEL_ANNOUNCEMENT,
    chainHash,
    shortChannelId,
    nodeId1,
    nodeId2,
    bitcoinKey1,
    bitcoinKey2,
    features: tlvs.features || new Uint8Array(0),
    // ... other fields
  }
}
```

### Arquivos a Modificar

- `src/core/lib/lightning/gossip.ts`: Parser TLV completo
- `src/core/lib/lightning/worker.ts`: Uso de routing hints
- `src/core/lib/lightning/routing.ts`: Pathfinding com graph real

---

## TODO #32-34: Backup & Recovery

### Contexto

Backup e recovery são críticos para proteger fundos em caso de perda do dispositivo.

### Problema Atual

```typescript
// backup.ts:872 - Key derivation stub
export function deriveChannelKeys(channelSeed: Uint8Array): ChannelKeys {
  // TODO: Derivar chaves reais usando channelSeed
  return {
    fundingPrivkey: new Uint8Array(32), // Dummy
    revocationBasepointSecret: new Uint8Array(32), // Dummy
    // ... other keys
  }
}
```

### Implementação Correta

```typescript
// src/core/lib/lightning/backup.ts
import { BIP32Factory } from 'bip32'
import * as ecc from 'tiny-secp256k1'

const bip32 = BIP32Factory(ecc)

export function deriveChannelKeys(channelSeed: Uint8Array): ChannelKeys {
  // Derivar master key do channel seed
  const masterKey = bip32.fromSeed(channelSeed)

  // Derivar keys conforme BOLT-3
  const fundingKey = masterKey.derivePath('m/0')
  const revocationBasepoint = masterKey.derivePath('m/1')
  const paymentBasepoint = masterKey.derivePath('m/2')
  const delayedPaymentBasepoint = masterKey.derivePath('m/3')
  const htlcBasepoint = masterKey.derivePath('m/4')

  return {
    fundingPrivkey: fundingKey.privateKey!,
    revocationBasepointSecret: revocationBasepoint.privateKey!,
    paymentBasepointSecret: paymentBasepoint.privateKey!,
    delayedPaymentBasepointSecret: delayedPaymentBasepoint.privateKey!,
    htlcBasepointSecret: htlcBasepoint.privateKey!,
  }
}

export function calculateChannelAddress(script: Uint8Array): string {
  // Calcular endereço P2WSH ou P2TR do script
  const scriptHash = sha256(script)
  const version = 0x00 // P2WSH
  const addressBytes = new Uint8Array([version, ...scriptHash])

  // Encode as bech32
  return encodeBech32('bc', addressBytes) // mainnet
}
```

### Arquivos a Modificar

- `src/core/lib/lightning/backup.ts`: Derivação BIP32 completa
- `src/core/lib/lightning/worker.ts`: Configuração isInitiator

---

## TODO #35-37: HTLC Sending & Processing

### Contexto

Processamento completo de HTLCs permite enviar e receber pagamentos Lightning.

### Problema Atual

```typescript
// worker.ts:5650 - HTLC sending stub
async sendHtlc(invoice: string): Promise<string> {
  // TODO: Implementar envio real de HTLC
  throw new Error('HTLC sending not implemented')
}
```

### Implementação Correta

```typescript
// src/core/lib/lightning/worker.ts
export class LightningWorker {
  async sendHtlc(invoice: string): Promise<string> {
    // Decode invoice
    const decoded = decodeInvoice(invoice)

    // Validate invoice
    this.validateInvoice(decoded)

    // Find route using routing hints or graph
    const route = await this.findRoute(decoded)

    // Generate payment hash and secret
    const paymentSecret = randomBytes(32)
    const paymentHash = sha256(paymentSecret)

    // Send HTLC along the route
    const htlcId = await this.sendHtlcAlongRoute(route, {
      amountMsat: decoded.amountMsat,
      paymentHash,
      cltvExpiry: decoded.minFinalCltvExpiry,
      // ... other fields
    })

    // Store payment info for settlement
    this.storeOutgoingPayment(htlcId, {
      paymentSecret,
      invoice,
      route,
    })

    return htlcId
  }

  private async findRoute(invoice: DecodedInvoice): Promise<Route> {
    // Use routing hints from invoice
    if (invoice.routingHints && invoice.routingHints.length > 0) {
      return this.buildRouteFromHints(invoice.routingHints, invoice.amountMsat)
    }

    // Use full routing graph
    return this.routingEngine.findRoute({
      source: this.nodeId,
      destination: invoice.payeeNodeId,
      amountMsat: invoice.amountMsat,
      // ... other params
    })
  }
}
```

### Arquivos a Modificar

- `src/core/lib/lightning/worker.ts`: Fluxo completo HTLC
- `src/core/lib/lightning/invoice.ts`: Decode e validação
- `src/core/lib/lightning/routing.ts`: Pathfinding

---

## Cronograma de Implementação

| Sprint   | TODOs                           | Arquivos Principais   | Estimativa |
| -------- | ------------------------------- | --------------------- | ---------- |
| Sprint 1 | Blockchain Integration (#16-23) | worker.ts, electrum/  | 3h         |
| Sprint 2 | Gossip & Routing (#24-31)       | gossip.ts, routing.ts | 4h         |
| Sprint 3 | Backup & Recovery (#32-34)      | backup.ts             | 2h         |
| Sprint 4 | HTLC Flow (#35-37)              | worker.ts, invoice.ts | 4h         |
| Sprint 5 | Testes de Integração            | **tests**/            | 4h         |

**Total Estimado: 17 horas**

---

## Testes Requeridos

### Testes de Integração

```typescript
describe('Blockchain Integration', () => {
  it('should get real blockchain info from Electrum', async () => {
    const info = await worker.getBlockchainInfo()
    expect(info.blockHeight).toBeGreaterThan(800000)
    expect(info.blockHash.length).toBe(32)
  })

  it('should broadcast transaction successfully', async () => {
    const rawTx = '0200000001...' // Valid transaction hex
    const txid = await worker.broadcastTransaction(rawTx)
    expect(txid).toMatch(/^[a-f0-9]{64}$/)
  })
})

describe('Gossip Processing', () => {
  it('should parse channel announcement correctly', () => {
    const message = createTestChannelAnnouncement()
    const parsed = parseGossipMessage(message)
    expect(parsed.type).toBe(MessageType.CHANNEL_ANNOUNCEMENT)
    expect(parsed.shortChannelId).toBe(testShortChannelId)
  })
})

describe('HTLC Flow', () => {
  it('should send HTLC payment successfully', async () => {
    const invoice = createTestInvoice()
    const htlcId = await worker.sendHtlc(invoice)
    expect(typeof htlcId).toBe('string')
  })
})
```

---

## Riscos e Mitigações

| Risco                   | Impacto                 | Mitigação                     |
| ----------------------- | ----------------------- | ----------------------------- |
| Electrum server down    | Funcionalidade limitada | Fallback servers, retry logic |
| Routing graph stale     | Pagamentos falham       | Refresh periódico, validation |
| BIP32 derivation errors | Perda de fundos         | Testes extensivos, checksums  |
| Race conditions HTLC    | Double-spend            | Locks, atomic operations      |

---

## Dependências Externas

1. **Electrum Servers**: Conexão confiável para dados blockchain
2. **BIP32**: Para derivação hierárquica de chaves
3. **Routing Graph**: Dados atualizados de canais/nós
4. **Invoice Parser**: Suporte completo BOLT-11

---

## Próximos Passos

1. ⬜ Configurar integração Electrum real
2. ⬜ Implementar parsing TLV gossip completo
3. ⬜ Adicionar derivação BIP32 para backup
4. ⬜ Implementar fluxo HTLC end-to-end
5. ⬜ Testes de integração com regtest
6. ⬜ Documentação de APIs públicas
