# TODO Removal Checklist

Lista numerada de TODOs pendentes com checkbox para acompanhamento. Marque conforme resolver.

## Prioridade imediata (Lightning core)

- [x] (42) `src/core/services/ln-worker-service.ts:366` – Acionar sync real e readiness confiável.
- [x] (43) `src/core/services/ln-worker-service.ts:405` – Carregar estado de inicialização persistido.
- [x] (44) `src/core/services/ln-worker-service.ts:742` – Persistir estado de inicialização.
- [x] (56) `src/core/services/ln-service.ts:629` – Envio via rota local real.
- [x] (57) `src/core/services/ln-service.ts:711` – Conectar a nó trampoline e enviar onion.
- [x] (68) `src/core/services/ln-initializer-service.ts:431` – Delegado ao WorkerService (init centralizado no worker).
- [x] (69) `src/core/services/ln-initializer-service.ts:497` – Delegado ao WorkerService (peers/gossip via worker).
- [x] (74) `src/core/services/ln-initializer-service.ts:724` – Delegado ao WorkerService (persistência via worker saveInitState).
- [x] (75) `src/core/services/ln-channel-reestablish-service.ts:104` – Enviar mensagem via transport service.
- [x] (82) `src/core/services/ln-channel-reestablish-service.ts:517` – Broadcast real de transação.
- [x] (86) `src/core/services/ln-channel-onchain-monitor-service.ts:281` – Monitorar HTLCs pendentes.
- [x] (33) `src/core/lib/lightning/worker.ts:6501` – Broadcast real para a blockchain.
- [x] (34) `src/core/lib/lightning/worker.ts:6511` – Atualizar estado do canal após broadcast.

## src/core/lib

1. [ ] `src/core/lib/transactions/transactions.ts:875` – Gerar `txHex` a partir da transação.
2. [ ] `src/core/lib/lightning/backup.ts:912` – Derivar chaves reais usando `channelSeed`.
3. [ ] `src/core/lib/lightning/backup.ts:943` – Implementar cálculo real do endereço.
4. [ ] `src/core/lib/lightning/boltz.ts:582` – Construir e assinar claim transaction.
5. [ ] `src/core/lib/lightning/boltz.ts:683` – Construir e assinar refund transaction.
6. [ ] `src/core/lib/lightning/commitment.ts:1129` – Armazenar `htlc_basepoint_secret` separadamente.
7. [ ] `src/core/lib/lightning/gossip-sync.ts:176` – Implementar mensagem `query_channel_range`.
8. [ ] `src/core/lib/lightning/gossip-sync.ts:203` – Implementar mensagem `query_short_channel_ids`.
9. [ ] `src/core/lib/lightning/gossip-sync.ts:224` – Rastrear block height real.
10. [ ] `src/core/lib/lightning/gossip-sync.ts:361` – Implementar sincronização real com o peer.
11. [ ] `src/core/lib/lightning/gossip-sync.ts:411` – Processar mensagens BOLT #7 de forma real.
12. [ ] `src/core/lib/lightning/pathfinding.ts:105` – Converter corretamente para `ShortChannelId`.
13. [ ] `src/core/lib/lightning/pathfinding.ts:132` – Adicionar suporte a endereços no nó.
14. [ ] `src/core/lib/lightning/pathfinding.ts:142` – Implementar `removeChannel` em `RoutingGraph`.
15. [ ] `src/core/lib/lightning/pathfinding.ts:150` – Implementar `removeNode` em `RoutingGraph`.
16. [ ] `src/core/lib/lightning/pathfinding.ts:163` – Implementar `updateChannelFees` em `RoutingGraph`.
17. [ ] `src/core/lib/lightning/pathfinding.ts:179` – Rastrear `totalCapacity` do grafo.
18. [ ] `src/core/lib/lightning/graph-cache.ts:153` – Exportar dados da `RoutingGraph`.
19. [ ] `src/core/lib/lightning/graph-cache.ts:291` – Salvar dados limpos de volta no storage.
20. [ ] `src/core/lib/lightning/graph-cache.ts:318` – Limpar todo o cache.
21. [ ] `src/core/lib/lightning/graph-cache.ts:321` – Implementar limpeza completa.
22. [ ] `src/core/lib/lightning/graph-cache.ts:392` – Persistir mudanças no cache.
23. [ ] `src/core/lib/lightning/graph-cache.ts:404` – Persistir mudanças no cache (paths adicionais).
24. [ ] `src/core/lib/lightning/worker.ts:1674` – Implementar aceitação automática de canais baseada em política.
25. [ ] `src/core/lib/lightning/worker.ts:1714` – Decodificar completamente `open_channel`.
26. [ ] `src/core/lib/lightning/worker.ts:1735` – Enviar `accept_channel` real.
27. [ ] `src/core/lib/lightning/worker.ts:3697` – Calcular amount correto com base na rota completa.
28. [ ] `src/core/lib/lightning/worker.ts:3925` – Armazenar `short_channel_id` no `ChannelInfo`.
29. [ ] `src/core/lib/lightning/worker.ts:3955` – Calcular SCID com block height e tx index.
30. [ ] `src/core/lib/lightning/worker.ts:3994` – Melhorar mapeamento `channelId` ↔ `shortChannelId`.
31. [ ] `src/core/lib/lightning/worker.ts:5928` – Remover fallback quando Electrum estiver sempre disponível.
32. [ ] `src/core/lib/lightning/worker.ts:5944` – Implementar validação real de assinatura.
33. [x] `src/core/lib/lightning/worker.ts:6501` – Broadcast real para a blockchain.
34. [x] `src/core/lib/lightning/worker.ts:6511` – Atualizar estado do canal após broadcast.
35. [ ] `src/core/lib/lightning/worker.ts:6534` – Obter transações recentes da blockchain.
36. [ ] `src/core/lib/lightning/worker.ts:6566` – Integrar com blockchain de forma real.
37. [ ] `src/core/lib/lightning/tests/pathfinding.test.ts:311` – Corrigir Dijkstra para alcançar destino.
38. [ ] `src/core/lib/lightning/tests/pathfinding.test.ts:327` – Corrigir Dijkstra para restrições de capacidade.
39. [ ] `src/core/lib/lightning/tests/secp256k1.test.ts:190` – Adicionar testes de assinatura quando hash estiver resolvido.

## src/core/models

Nenhum TODO encontrado.

## src/core/repositories

40. [ ] `src/core/repositories/cloud/cloud-sync-service.ts:193` – Implementar timestamps reais nos dados de sync.
41. [ ] `src/core/repositories/cloud/cloud-sync-service.ts:197` – Implementar merge manual durante sync.

## src/core/services

42. [x] `src/core/services/ln-worker-service.ts:366` – Acionar sync real; readiness otimista.
43. [x] `src/core/services/ln-worker-service.ts:405` – Carregar estado de inicialização persistido.
44. [x] `src/core/services/ln-worker-service.ts:742` – Salvar estado de inicialização no repositório.
45. [ ] `src/core/services/ln-worker-service.ts:979` – Popular `connectedPeers` real.
46. [ ] `src/core/services/ln-worker-service.ts:980` – Popular `activeChannels` real.
47. [ ] `src/core/services/ln-worker-service.ts:981` – Popular `pendingInvoices` real.
48. [ ] `src/core/services/ln-worker-service.ts:1147` – Implementar handler pendente.
49. [ ] `src/core/services/ln-worker-service.ts:1152` – Implementar handler pendente.
50. [ ] `src/core/services/ln-worker-service.ts:1157` – Implementar handler pendente.
51. [ ] `src/core/services/ln-worker-service.ts:1162` – Implementar handler pendente.
52. [ ] `src/core/services/ln-worker-service.ts:1167` – Implementar handler pendente.
53. [ ] `src/core/services/ln-worker-service.ts:1172` – Implementar handler pendente.
54. [ ] `src/core/services/ln-service.ts:494` – Usar `maxFee` em path finding com limite de fee.
55. [ ] `src/core/services/ln-service.ts:547` – Obter `currentBlockHeight` da blockchain.
56. [x] `src/core/services/ln-service.ts:629` – Implementar envio via rota local real.
57. [x] `src/core/services/ln-service.ts:711` – Conectar a nó trampoline e enviar onion.
58. [ ] `src/core/services/ln-service.ts:761` – Obter node ID real da carteira.
59. [ ] `src/core/services/ln-payment-service.ts:277` – Auto-actions conforme status de invoice.
60. [ ] `src/core/services/ln-monitor-service.ts:108` – Inicializar `channelManager` com parâmetros corretos.
61. [ ] `src/core/services/ln-monitor-service.ts:180` – Calcular `channelsNeedingAttention` real.
62. [ ] `src/core/services/ln-monitor-service.ts:303` – Obter `channelId` real do contexto HTLC.
63. [ ] `src/core/services/ln-monitor-service.ts:468` – Checar responsividade de peers.
64. [ ] `src/core/services/ln-lsp-service.ts:201` – Integrar com LSP real.
65. [ ] `src/core/services/ln-liquidity-service.ts:389` – Lógica automática de abertura de canais.
66. [ ] `src/core/services/ln-initializer-service.ts:363` – Persistir status de inicialização via `LightningRepository`.
67. [ ] `src/core/services/ln-initializer-service.ts:383` – Verificar consistência com checkpoints.
68. [x] `src/core/services/ln-initializer-service.ts:431` – Delegado ao WorkerService (init de gossip/peer centralizado no worker).
69. [x] `src/core/services/ln-initializer-service.ts:497` – Delegado ao WorkerService (bootstrapping de peers/gossip via worker).
70. [x] `src/core/services/ln-initializer-service.ts:499` – Delegado ao WorkerService (peers reais geridos pelo worker).
71. [ ] `src/core/services/ln-initializer-service.ts:565` – Conexão específica a nós trampoline.
72. [x] `src/core/services/ln-initializer-service.ts:704` – Delegado ao WorkerService (serviços downstream expostos pelo worker).
73. [x] `src/core/services/ln-initializer-service.ts:718` – Delegado ao WorkerService (integração LSP/serviços via worker).
74. [x] `src/core/services/ln-initializer-service.ts:724` – Delegado ao WorkerService (persistência via worker saveInitState).
75. [x] `src/core/services/ln-channel-reestablish-service.ts:104` – Enviar mensagem via transport service.
76. [ ] `src/core/services/ln-channel-reestablish-service.ts:186` – Implementar `updateChannelState` no repositório.
77. [ ] `src/core/services/ln-channel-reestablish-service.ts:233` – Derivar pontos corretamente.
78. [ ] `src/core/services/ln-channel-reestablish-service.ts:369` – Persistir storage em repositório.
79. [ ] `src/core/services/ln-channel-reestablish-service.ts:378` – Implementar `findPendingHtlcs` no repositório.
80. [x] `src/core/services/ln-channel-reestablish-service.ts:401` – Enviar mensagem via transport service.
81. [ ] `src/core/services/ln-channel-reestablish-service.ts:405` – Implementar `updateChannelState` no repositório.
82. [x] `src/core/services/ln-channel-reestablish-service.ts:517` – Broadcast real de transação.
83. [ ] `src/core/services/ln-channel-reestablish-service.ts:518` – Tratar resolução de HTLC.
84. [ ] `src/core/services/ln-channel-reestablish-service.ts:519` – Enviar mensagem de erro ao peer.
85. [ ] `src/core/services/ln-channel-onchain-monitor-service.ts:243` – Verificar confirmações reais.
86. [ ] `src/core/services/ln-channel-onchain-monitor-service.ts:281` – Monitorar HTLCs pendentes.
87. [ ] `src/core/services/ln-channel-onchain-monitor-service.ts:304` – Iniciar sweep de outputs.
88. [ ] `src/core/services/ln-channel-onchain-monitor-service.ts:305` – Resolver HTLCs pendentes.
89. [ ] `src/core/services/errorRecovery.ts:379` – Rastrear `failedRecoveries` real.
90. [ ] `src/core/services/notification.ts:487` – Persistir estatísticas de notificações.
91. [ ] `src/core/services/notification.ts:491` – Persistir estatísticas de notificações (duplicata/confirmar).

## src/app

Nenhum TODO encontrado.

## src/ui

92. [ ] `src/ui/features/wallet/Send/SendOnChain/useSendOnChainActions.ts:57` – Obter UTXOs e endereço de troco do wallet service.
93. [ ] `src/ui/features/wallet/Send/SendOnChain/useSendOnChainActions.ts:92` – Obter transação assinada e `txHex`.
94. [ ] `src/ui/features/wallet/Send/SendOnChain/useSendOnChainActions.ts:125` – Obter UTXOs e endereço de troco do wallet service (passo 2).
95. [ ] `src/ui/features/wallet/Send/SendOnChain/useSendOnChainActions.ts:163` – Obter transação assinada e `txHex` (passo 2).
96. [ ] `src/ui/features/wallet/GetSeedPhraseScreen.tsx:23` – Obter senha do usuário ou estado.
97. [ ] `src/ui/features/wallet/CreateWallet.tsx:32` – Suportar outras criptos em `accounts` futuramente.
98. [ ] `src/ui/features/transactions/useUnifiedTransactions.ts:404` – Atualizar transações on-chain via address provider.
99. [ ] `src/ui/features/transactions/UnifiedTransactionCard.tsx:149` – Criar rota de detalhes Lightning.
100.  [ ] `src/ui/features/transactions/TransactionDetails.tsx:85` – Obter fee rate atual ou perguntar ao usuário.
101.  [ ] `src/ui/features/transactions/TransactionDetails.tsx:98` – Assinar e enviar RBF.
102.  [ ] `src/ui/features/transactions/TransactionDetails.tsx:135` – Perguntar ou usar fee rate maior para CPFP.
103.  [ ] `src/ui/features/transactions/TransactionDetails.tsx:144` – Assinar e enviar CPFP.
104.  [ ] `src/ui/features/settings/CloudSyncSection.tsx:72` – Implementar sincronização forçada de todos os repositórios.
105.  [ ] `src/ui/features/lightning/watchtower/WatchtowerManagementScreen.tsx:317` – Persistir watchtowers remotos.
106.  [ ] `src/ui/features/lightning/watchtower/WatchtowerManagementScreen.tsx:351` – Conectar a watchtower remota via `LightningService`.
107.  [ ] `src/ui/features/lightning/transaction/index.tsx:300` – Navegar para detalhes de transação Lightning.
108.  [ ] `src/ui/features/lightning/payment/send.tsx:197` – Navegar para scanner QR.
109.  [ ] `src/ui/features/lightning/payment/receive.tsx:72` – Substituir placeholder por componente real de QR.
110.  [ ] `src/ui/features/lightning/LightningDashboard.tsx:1162` – Implementar conversão manual.
111.  [ ] `src/ui/features/lightning/FeeBumping.tsx:168` – Integrar com serviço de construção de TX.
112.  [ ] `src/ui/features/lightning/hooks/useAutoSwapIn.ts:25` – Verificação real com `useCanLoopIn`.
113.  [ ] `src/ui/features/lightning/hooks/useAutoSwapIn.ts:68` – Obter endereço de refund do usuário.
114.  [ ] `src/ui/features/lightning/hooks/useAutoSwapIn.ts:119` – Cálculo real baseado no serviço de swap.
115.  [ ] `src/ui/features/lightning/hooks/useChannelBackup.ts:98` – Obter secrets do secure storage.
116.  [ ] `src/ui/features/lightning/hooks/useChannelBackup.ts:369` – Iniciar reconexão e restore real.
117.  [ ] `src/ui/features/lightning/hooks/useHtlcMonitor.ts:223` – Mapear alertas para HTLCs na UI.
118.  [ ] `src/ui/features/lightning/hooks/useHtlcMonitor.ts:239` – Implementar no `LightningMonitorService` se necessário.
119.  [ ] `src/ui/features/lightning/hooks/useHtlcMonitor.ts:248` – Implementar no `LightningMonitorService` se necessário (continuação).
120.  [ ] `src/ui/features/lightning/hooks/useHtlcMonitor.ts:257` – Implementar no `LightningMonitorService` se necessário (continuação).
121.  [ ] `src/ui/features/lightning/hooks/useHtlcMonitor.ts:265` – Mapear status do serviço.
122.  [ ] `src/ui/features/lightning/hooks/useHtlcMonitor.ts:273` – Mapear status do serviço (continuação).
123.  [ ] `src/ui/features/lightning/hooks/useHtlcMonitor.ts:281` – Atualizar status no serviço, se necessário.
124.  [ ] `src/ui/features/lightning/hooks/useHtlcMonitor.ts:296` – Mapear demais campos de status.
125.  [ ] `src/ui/features/lightning/hooks/useHtlcMonitor.ts:309` – Configurar listener para updates do serviço.
126.  [ ] `src/ui/features/lightning/hooks/useLightningStartup.ts:199` – Monitorar conectividade.
127.  [ ] `src/ui/features/lightning/hooks/useLightningStartup.ts:202` – Monitorar conectividade (continuação).
128.  [ ] `src/ui/features/lightning/hooks/useLightningStartup.ts:209` – Implementar teste de conexão.
129.  [ ] `src/ui/features/lightning/hooks/useLightningStartup.ts:215` – Implementar lógica de reconexão.
130.  [ ] `src/ui/features/lightning/hooks/useSubmarineSwap.ts:147` – Chamada real ao provider (Boltz API).
131.  [ ] `src/ui/features/lightning/hooks/useSubmarineSwap.ts:376` – Chamada real ao provider (continuação).
132.  [ ] `src/ui/features/lightning/hooks/useAutoChannel.ts:103` – Obter `LightningService` do contexto.
133.  [ ] `src/ui/features/lightning/CloudBackupSetup.tsx:370` – Cloud sync real conforme provider.
134.  [ ] `src/ui/features/lightning/CloudBackupSetup.tsx:414` – Salvar config em secure storage.
135.  [ ] `src/ui/features/lightning/CloudBackupSetup.tsx:415` – Configurar autenticação do cloud provider.
136.  [ ] `src/ui/features/lightning/channel/splice.tsx:192` – Implementar splice real via `LightningService`.

## docs

137. [ ] `docs/lightning-worker-plan.md:7` – Completar itens do TODO numerado do plano do worker.
138. [ ] `docs/lightning-worker-plan.md:27` – Ajustar modo TRAMPOLINE/LOCAL (marcado como pendente).
139. [ ] `docs/repository-models-mapping.md:157` – Derivar chave de criptografia da senha do usuário.
140. [ ] `docs/refactor-implementation-plan.md:9` – Completar checklist de refatoração.
