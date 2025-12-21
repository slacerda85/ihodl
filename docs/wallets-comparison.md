# Wallets Comparison (Electrum vs Phoenix vs iHodl)

Scope: comparação das carteiras quanto a recursos on-chain e Lightning, destacando se a ativação ocorre via UI ou por processo/worker em background. Foco em funcionalidades, cobertura de telas e fluxo de inicialização Lightning.

Legenda: ✅ implementado (UI), ⚙️ implementado (background/worker), 🟡 parcial, 🔄 planejado, ❌ ausente.

## On-Chain Features

| Funcionalidade                    | Electrum                     | Phoenix              | iHodl (app)                  | Ativação / Observações              |
| --------------------------------- | ---------------------------- | -------------------- | ---------------------------- | ----------------------------------- |
| Enviar/receber básico             | ✅ UI (desktop/mobile)       | ✅ UI (app)          | ✅ UI (app)                  | Fluxo padrão em todas               |
| Estimativa de fee                 | ✅ UI + ⚙️ historico/servers | ✅ UI (simplificada) | ✅ UI (avançada)             | iHodl usa estimativa avançada       |
| RBF                               | ✅ UI                        | ❌                   | ✅ UI                        | Phoenix não expõe RBF               |
| CPFP                              | ✅ UI                        | ❌                   | ✅ UI                        | Idem acima                          |
| Coin selection                    | ✅ UI (manual/avançado)      | ❌                   | 🟡 Parcial (aprimorando)     | iHodl melhora privacidade           |
| Batch transactions                | ✅ UI                        | ❌                   | ✅ UI                        | Phoenix não oferece batch           |
| PSBT                              | ✅ UI + HW wallets           | ❌                   | 🔄 Planejado (PSBT avançado) | Electrum completo, iHodl em roteiro |
| Multisig                          | ✅ UI                        | ❌                   | 🔄 Planejado                 | Electrum suporta P2SH/P2WSH         |
| Watch-only / xpub                 | ✅ UI                        | ❌                   | 🔄 Planejado                 | Electrum completo                   |
| Hardware wallets                  | ✅ UI (plugins)              | ❌                   | 🔄 Planejado                 | iHodl ainda sem suporte             |
| Taproot                           | ✅ parcial (sign/send)       | ❌                   | 🔄 Planejado                 | Electrum tem P2TR; iHodl planeja    |
| Message signing                   | ✅ UI                        | ❌                   | 🔄 Planejado                 |                                     |
| Descriptors                       | ✅ (import/export)           | ❌                   | 🔄 Planejado                 |                                     |
| Privacy (coin control/avoid link) | ✅ (coin control)            | ❌                   | 🟡 Em desenvolvimento        |                                     |

## Lightning Features (UI vs Background)

| Funcionalidade / Fluxo            | Electrum                              | Phoenix                                     | iHodl (app)                                              | Observações                          |
| --------------------------------- | ------------------------------------- | ------------------------------------------- | -------------------------------------------------------- | ------------------------------------ |
| Modo de roteamento                | ✅ ⚙️ Full gossip local               | ✅ ⚙️ Trampoline (ACINQ)                    | 🟡 Gossip implementado, gates ausentes                   | Phoenix não baixa grafo              |
| Conectividade de pares            | ✅ ⚙️ Multi-peer TCP + Noise          | ✅ ⚙️ Único peer (trampoline)               | ✅ ⚙️ Peer real + backoff                                | iHodl conecta mas readiness otimista |
| Inicialização Electrum (on-chain) | ✅ ⚙️ Electrum client+watcher         | ⚙️ n/a (não usa Electrum)                   | 🟡 Service existe mas não acionado na UI                 | Gatilho pendente                     |
| Abertura manual de canal          | ✅ UI (abrir/fechar)                  | ❌ (auto apenas)                            | ✅ UI (screens `channels.tsx`, `channelCreate`)          |                                      |
| Auto pay-to-open / LSP            | 🟡 Plugins/experimental               | ✅ ⚙️ Automático via LSP                    | ✅ UI + ⚙️ Automático (Pay-to-open)                      |                                      |
| Dual-funding / splice             | 🟡 Parcial (via LN impl)              | ✅ ⚙️ Splicing automático                   | 🟡 UI disponível (`splice.tsx`), integração real parcial |                                      |
| Swap-in / Swap-out (submarine)    | ✅ UI + ⚙️ (`submarine_swaps.py`)     | 🟡 Swap-in via LSP (sem interface avançada) | ✅ UI (`swap.tsx`) + ⚙️ auto swap-in                     |                                      |
| MPP / AMP                         | ✅ ⚙️ MPP                             | 🟡 Parcial (trampoline decide)              | 🟡 Parcial (depende de routing ativo)                    |                                      |
| BOLT 12 Offers                    | 🟡 Parcial                            | ❌                                          | 🟡 Hooks presentes (`useOffer`)                          |                                      |
| Watchtower / monitor de canais    | ✅ ⚙️ LNWatcher + on-chain monitor    | ❌                                          | 🟡 Service existe, não conectado                         |                                      |
| Backup/restauração de canais      | ✅ UI (backups)                       | ✅ ⚙️ Automático (splicing)                 | 🟡 Hooks (`useChannelBackup`) disponíveis                |                                      |
| Política de liquidez              | 🟡 Manual                             | ✅ UI (auto inbound/outbound)               | ✅ UI (Liquidity Management)                             |                                      |
| LSP integration                   | 🟡 Opcional                           | ✅ Core (trampoline LSP)                    | ✅ Implementada (`lsp.ts`)                               |                                      |
| Estado de prontidão / gates       | ✅ Bloqueia operações sem rede/gossip | ✅ Bloqueia sem conexão estabelecida        | ❌ Gates reais ausentes (store otimista)                 | Pendente em roadmap                  |
| Notificações/background           | 🟡 Plugins                            | 🟡 Simples                                  | 🟡 Planejado (notifications, watcher)                    |                                      |

## UI Coverage (rotas/telas)

- Electrum: desktop/mobile UI completa para on-chain (coin control, RBF/CPFP, PSBT, multisig) e Lightning (abrir/fechar canal, swaps, invoices, backups). Ativação majoritariamente via UI, com watchers rodando em background.
- Phoenix: UI minimalista focada em pagamentos; on-chain exposto apenas como funding/withdraw; nenhuma tela de coin control ou PSBT. Lightning auto-gerenciado (pay-to-open, splicing) com poucas configurações de usuário.
- iHodl (app): Expo Router com rotas em `app/(tabs)/lightning/*.tsx` para channels, dual-funding, splice, swap, payments, watchtower, dashboard. On-chain telas para send/receive com RBF/CPFP e batch. Liquidity Dashboard e toggles de auto channel/swap-in expostos na UI.

## Background Processes / Workers

| Processo/Worker                 | Electrum                           | Phoenix                  | iHodl (app)                                         | Observações                        |
| ------------------------------- | ---------------------------------- | ------------------------ | --------------------------------------------------- | ---------------------------------- |
| Electrum client/watcher         | ✅ ⚙️ Sempre ativo                 | ❌                       | 🟡 Implementado mas não acionado no fluxo           | iHodl precisa ligar no initializer |
| Peer connectivity loop          | ✅ ⚙️ Backoff + multi-peer         | ✅ ⚙️ Backoff único peer | ✅ ⚙️ Backoff implementado                          |                                    |
| Gossip sync                     | ✅ ⚙️ Completo (cache + DB)        | ❌ (usa trampoline)      | ✅ ⚙️ Implementado, gatilhos e cache pendentes      |                                    |
| Channel reestablish             | ✅ ⚙️ Na criação de wallet         | ✅ ⚙️ Na conexão do peer | ✅ ⚙️ Serviço implementado                          |                                    |
| Watchtower / breach monitor     | ✅ ⚙️ LNWatcher + on-chain monitor | ❌ (não client-side)     | 🟡 Serviço existe, não conectado                    |                                    |
| Background swap / liquidity ads | 🟡 Plugins                         | 🟡 LSP interno           | 🟡 Swap-in automático ativo; Liquidity Ads pendente |                                    |
| Notifications                   | 🟡 Plugins                         | 🟡 Básico                | 🟡 Planejado                                        |                                    |

Atualização recente: a troca de init (BOLT #1) agora só dispara após `handshakeComplete` do BOLT #8 e o transporte Lightning não tenta mais TLS (Noise é TCP puro mesmo na porta 443). Isso removeu os erros "Transport not ready" e os timeouts de handshake observados no iOS.

## Lightning Initialization Pipeline (comparativo)

- **Phoenix (AppConnectionsDaemon)**: prepara PhoenixBusiness → controla canConnect (wallet+internet+tor) → conecta Electrum (on-chain) e peer trampoline em loops com backoff → carrega canais locais antes do peer → estado ESTABLISHED libera pagamentos; sem gossip.
- **Electrum (LNWallet.start_network)**: cria LNWatcher, carrega canais/backups → inicia watcher, swap manager e onion messages → spawna tasks (listening, gossip, peers) em paralelo → may_do_payments somente após rede + canais sincronizados; depende de gossip completo.
- **iHodl (estado atual)**: services existem (`ln-initializer`, `peer service`, `gossip sync`, `channel reestablish`), mas fluxo real da UI chama apenas `lightningStore.initialize()` com readiness otimista; Electrum client/watchtower não são iniciados; gates de prontidão ausentes. Roadmap pede acionar initializer no App root, ligar Electrum/peers/gossip/watchtower e bloquear operações até readiness real.

## Gaps Principais para iHodl

- Ativar initializer no App root para conectar Electrum + peers + gossip + watchtower.
- Implementar gates de prontidão em services/UI (sem operações sem peer/gossip/canais).
- Completar componentes visuais faltantes (IncomingBalancePopover, LiquidityAds) e watchers em background.
- Entregar PSBT avançado, multisig, watch-only e suporte a hardware wallets para paridade on-chain com Electrum.
