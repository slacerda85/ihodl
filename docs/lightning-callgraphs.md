# Lightning Call Graphs — Electrum · Phoenix · iHodl

📌 Objetivo: apresentar grafos de chamadas essenciais para o fluxo Lightning (pagamentos, abertura/reestabelecimento de canais, gossip), comparar as três implementações e apontar potenciais causas para o problema na nossa app iHodl.

---

## 1) Electrum — resumo e grafo

- Entry points: `commands.lnpay`, GUI triggers (`gui.* -> wallet.lnworker.pay_invoice`).
- Principais módulos: `lnworker.py`, `lnpeer.py`, `lnchannel.py`, `lnrouter.py`, `lnwatcher.py`, `lntransport.py`.

Mermaid (simplified):

```mermaid
flowchart LR
  subgraph Electrum
    CLI[commands.lnpay / GUI] --> |calls| LNWORKER[lnworker.pay_invoice]
    LNWORKER --> PAYNODE[lnworker.pay_to_node]
    PAYNODE --> CREATE_ROUTES[create_routes_for_payment]
    CREATE_ROUTES --> PAY_ROUTE[lnworker.pay_to_route]
    PAY_ROUTE --> PEER[Peer.pay -> lnpeer.pay]
    PEER --> CHANNEL[Channel.add_htlc / channel manager]
    PEER --> TRANSPORT[lntransport.send_bytes]
    LNWORKER --> OPEN_CHAN[lnworker.open_channel_with_peer]
    OPEN_CHAN --> PEER.channel_establishment_flow
    LNWORKER --> GOSSIP[lngossip (gossip sync)]
  end
```

Pontos-chave:

- Electrum usa gossip/local channel DB para pathfinding (non-trampoline).
- Pagamentos: `pay_invoice` → `pay_to_node` → route-finding → `pay_to_route` → `peer.pay` → htlc sent.
- Abertura de canal envolve `peer.channel_establishment_flow` + broadcasting funding TX.

---

## 2) Phoenix — resumo e grafo

- Arquitetura: foco em trampoline routing (ACINQ) + `PhoenixBusiness`/`AppConnectionsDaemon` para lifecycle.
- Principais módulos (aplicação Android/iOS + shared Kotlin): `PhoenixBusiness`, `PeerManager`, `TrampolineRouter`, `Gossip` (parcial/opt), `ChannelManager`.

Mermaid (simplified):

```mermaid
flowchart LR
  subgraph Phoenix
    UI --> PhoenixBusiness
    PhoenixBusiness --> AppConnectionsDaemon
    AppConnectionsDaemon --> PeerConnectivity[PeerManager / PeerConnectivityService]
    PhoenixBusiness --> LightningWorker(Phoenix Lightning)
    LightningWorker --> TrampolineRouter
    TrampolineRouter --> PeerManager
    LightningWorker --> ChannelManager
    LightningWorker --> (payments) sendPayment()
  end
```

Pontos-chave:

- Phoenix frequentemente usa a estratégia trampoline (gossip é reduzido/ou ausente) — menos dependência de grafo local.
- Strong integration with connection lifecycle and auto-pay-to-open UX.

---

## 3) iHodl (app) — resumo e grafo (detalhado)

- Código: `src/core/lib/lightning/worker.ts`, `peer.ts`, `channel.ts`, `onion.ts`, `peerManager`.
- Entradas de pagamento: `LightningWorker.sendPayment()` (BOLT11 decode) → `findRoute()` → `sendHTLC()` → `sendHTLCToPeer()` → `peerManager.getPeerConnection()` → `sendRawMessage()` / TLS + Noise handshake flows.

Mermaid (simplified):

```mermaid
flowchart LR
  subgraph iHodl
    UI[UI / API call] --> |calls| LW[LightningWorker.sendPayment]
    LW --> decodeInvoice[decodeInvoiceComplete]
    decodeInvoice --> findRoute[findRoute / findPaymentRoute]
    findRoute --> sendHTLC[sendHTLC]
    sendHTLC --> sendHTLCToPeer[sendHTLCToPeer]
    sendHTLCToPeer --> PeerConn[peerManager.getPeerConnection(channel.peerId)]
    PeerConn --> ChannelMgr[channelManager.addHtlc() OR manual build msg]
    ChannelMgr --> encryptAndSend[encryptMessage -> sendRaw(peerConnection)]
    sendRaw --> Socket[Socket.write / sendRawMessage]

    % auxiliary flows
    LW --> MPP[MPP splitting -> sendPaymentPart]
    LW --> Trampoline[sendTrampolinePayment -> trampolineRouter]
    LW --> Gossip[startGossipSync]
    PeerManager --> createConnection(performNoiseHandshake -> exchangeInitMessages)
  end
```

Detalhes críticos encontrados:

- `sendHTLCToPeer` returns error if: channel not found, peer connection not found, or ChannelManager.addHtlc throws.
- Connection setup path: `PeerManager.connectPeer` -> `createLightningConnection` -> `performNoiseHandshake` -> `exchangeInitMessages` -> `startPingPong`. If any step fails, `peerManager.getPeerConnection()` will be null or not ready.
- `sendRawMessage` / `sendRaw` wraps socket.write and will reject if socket invalid or destroyed.

---

## 4) Comparativo (Electrum | Phoenix | iHodl)

| Item             |                                           Electrum |                                                Phoenix | iHodl (app)                                                                   |
| ---------------- | -------------------------------------------------: | -----------------------------------------------------: | ----------------------------------------------------------------------------- |
| Routing approach |                          Full gossip + local graph |                          Trampoline-first, less gossip | Implements gossip + trampoline; hybrid                                        |
| Peer lifecycle   |                lnworker.start_network + Peer tasks |             AppConnectionsDaemon with backoff & health | PeerManager with backoff and Noise handshake                                  |
| Payment flow     | pay_invoice -> pay_to_node -> pay_to_route -> peer | sendPayment -> findRoute -> sendHTLC -> channelManager | sendPayment -> findRoute -> sendHTLC -> sendHTLCToPeer -> peerManager/socket  |
| Channel opening  |       lnworker.open_channel_with_peer -> peer flow |                        openChannel with ChannelManager | openChannel in LightningWorker (buildFundingTx -> send open_channel messages) |
| Main differences |    Mature LN handling, careful replay/save of msgs |           Simpler but production-proven design (ACINQ) | Hybrid; some parts experimental or simplified (mock timeouts, placeholders)   |

---

## 5) Suspeitas / pontos a verificar no iHodl (porque "não está funcionando") ✅

1. Peer connection não estabelecida / `peerManager.getPeerConnection` retorna null.
   - Verificar logs de `PeerManager.connectPeer` e `createLightningConnection` (Noise handshake, Init exchange).
   - Arquivo/funções: `src/core/lib/lightning/peer.ts` (createLightningConnection, performNoiseHandshake, exchangeInitMessages).
2. `transportKeys` ausentes ou inválidos (encryptMessage/decryptMessage falham). Verificar se `performNoiseHandshake` devolve `transportKeys` e se são usados atualizados.
3. `channelId` / formatos inconsistentes (hex string vs bytes) — `hexToUint8Array`/`uint8ArrayToHex` conversões incorretas podem fazer `channel` não ser encontrado.
4. ChannelManager não inicializado para um canal (caminho cai no fallback manual e pode ter bugs; revisar `channelManagers` map). Arquivo relevante: `worker.ts` channel creation / `channelManagers` init.
5. Mensagens codificadas mal / onion packet mal formado — checar `createOnionPacket`/`constructOnionPacket` e TLVs (size/hop ordering).
6. Timeouts ou socket destroyed (ping/pong cleanup) — ver logs de ping/pong e socket.on('close').

---

## 6) Testes e passos de depuração recomendados 🔧

1. Reproduzir fluxo mínimo: conectar peer (PeerManager.connectPeer) e verificar retorno `{ success: true, connection }`.
   - Test: unit test / integration that calls `PeerManager.connectPeer` with a known reachable trampoline node (or local mocked socket).
2. Verificar handshake: add detailed logging in `performNoiseHandshake` and `exchangeInitMessages` to confirm act1/2/3 and init exchange succeeded.
3. Add instrumentation around `peerManager.getPeerConnection()` and `sendHTLCToPeer()` to print the channelId, channel mapping, and peerId used.
4. Verify `transportKeys` present and `encryptMessage` returns `encrypted` and `newKeys` (if implemented). If encryption fails, HTLCs never reach the peer.
5. Test message roundtrip: manually `encodeUpdateAddHtlcMessage`, encrypt and `sendRawMessage` to a test peer, observe remote response or socket errors.
6. Validate TLVs/onion: add a unit test that constructs an onion with `constructOnionPacket` and calls the trampoline decode path to ensure format correctness.
7. Simulate happy path payment in a controlled test (mock PeerManager to return a working socket) and assert `sendPayment()` succeeds.

---

## 7) Próximos passos (curto prazo) ✅

- Priorizar verificação de conectividade/handshake e logs de `connectPeer` / `createLightningConnection` / `performNoiseHandshake`.
- Adicionar testes unitários/integration tests para: handshake success/failure, `sendHTLCToPeer` path (ChannelManager vs manual branch), onion encoding/decoding.
- Se desejar, eu posso: 1) adicionar testes e assert logs mínimos para essas funções, 2) instrumentar pontos-chaves com logs mais verbosos, 3) ajudá-lo a executar um teste de integração contra um nó trampoline conhecido.

---

If you want, I can now: (A) add the Markdown diagrams for more details (per-function call tree), (B) open PR with small targeted debug logging changes, or (C) implement unit tests that reproduce common failure modes — which do you prefer next? ✅
