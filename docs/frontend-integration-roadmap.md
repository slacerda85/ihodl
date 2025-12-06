# Frontend Integration Roadmap - ihodl Lightning Wallet

**Data:** 06/12/2025  
**Versão:** 1.3  
**Responsável:** AI Assistant  
**Status:** Fase 2 Completa - Fase 3 em andamento

---

## 📋 Visão Geral

Este roadmap define a integração das funcionalidades Lightning Network implementadas no core (`src/core/lib/lightning/`) com a interface React Native (`src/ui/`). O objetivo é criar uma experiência completa de carteira Lightning mobile, priorizando funcionalidades críticas para o usuário final.

### 🎯 Objetivos

- **Paridade Funcional**: 90% das features core com interface completa
- **UX Consistente**: Padrões de design mobile-first
- **Performance**: Respostas <500ms para operações críticas
- **Segurança**: Validações robustas e feedback claro ao usuário
- **Testabilidade**: Cobertura de testes >80% para componentes UI

### 📊 Status Atual (06/12/2025)

- **Core Lightning**: ~90% implementado ⬆️
- **UI Básica**: ~90% implementado ⬆️
- **Integrações**: ~75% implementado ⬆️
- **Testes**: ~25% implementado

---

## 🗓️ Fases de Implementação

### Fase 1: Core Channel UI (2-4 semanas)

**Objetivo:** Funcionalidades essenciais de gerenciamento de canais e pagamentos básicos.

#### ✅ Tarefas Concluídas

- [x] Análise da estrutura UI atual (`src/ui/features/`)
- [x] Mapeamento de componentes existentes vs necessários
- [x] Setup de navegação Expo Router para telas Lightning

#### 🔄 Tarefas em Andamento

- [x] **Channel Creation Screen** (`ui/features/lightning/channel/create.tsx`)
  - Formulário para abrir canal
  - Validação de parâmetros (capacity, fees)
  - Integração com `ChannelManager` (TODO)
  - Status: Implementado (UI pronta, ação pendente)

- [x] **Channel Management Screen** (`ui/features/lightning/channel/manage.tsx`)
  - Lista de canais ativos
  - Ações: close, force-close
  - Métricas: balance, fees, uptime
  - Status: Implementado (UI pronta, ações pendentes)

- [x] **Payment Send Screen** (`ui/features/lightning/payment/send.tsx`)
  - Input de invoice/amount
  - MPP splitting automático
  - Status tracking em tempo real
  - Status: Implementado

- [x] **Payment Receive Screen** (`ui/features/lightning/payment/receive.tsx`)
  - Geração de invoices BOLT11
  - QR code display
  - Amount input opcional
  - Status: Implementado

- [x] **Transaction History Screen** (`ui/features/lightning/transaction/index.tsx`)
  - Lista paginada de transações
  - Filtros: date, type, status
  - Detalhes expandidos
  - Status: Implementado

#### 📈 Métricas de Sucesso

- Todas as telas básicas funcionais
- Navegação fluida entre telas
- Integração com state management
- Testes unitários para componentes

### Fase 2: Advanced Features (4-6 semanas)

**Objetivo:** Funcionalidades avançadas para usuários experientes.

#### ✅ Tarefas Concluídas

- [x] **Dual Funding UI** (`ui/features/lightning/channel/dualFunding.tsx`)
  - Wizard multi-etapa para Interactive TX v2
  - Seleção de papel (Initiator/Acceptor)
  - Preview de contribuições e timeline
  - Progress tracking com estados
  - Status: ✅ Implementado

- [x] **Channel Splice Interface** (`ui/features/lightning/channel/splice.tsx`)
  - Interface Splice-In (adicionar fundos)
  - Interface Splice-Out (remover fundos)
  - Preview de nova capacidade
  - Cálculo de fees
  - Status: ✅ Implementado

- [x] **Watchtower Management** (`ui/features/lightning/watchtower/WatchtowerManagementScreen.tsx`)
  - Dashboard de status watchtower local
  - Lista de watchtowers remotos
  - Configuração de endpoints
  - Alertas de breach
  - Status: ✅ Implementado

- [x] **Submarine Swap Flow** (`ui/features/lightning/SwapScreen.tsx`, `SwapProgress.tsx`)
  - Seleção de direção (Loop In/Out)
  - Cálculo de fees
  - Progress tracking
  - Status: ✅ Implementado (pré-existente)

- [x] **Lightning Settings Section** (`ui/features/settings/LightningSettingsSection.tsx`)
  - Configurações de rede
  - Roteamento & Pagamentos
  - Privacidade (Blinded Paths, Onion Messages)
  - Backup & Recovery
  - Watchtower settings
  - Submarine Swaps settings
  - Canais (Zero-Conf, Auto-management)
  - Configurações avançadas
  - Status: ✅ Implementado

#### 📈 Métricas de Sucesso

- ✅ Funcionalidades avançadas acessíveis via UI
- ✅ Validações de segurança implementadas
- ✅ Performance mantida em operações complexas

### Fase 3: Ecosystem Integration (6-8 semanas)

**Objetivo:** Integração completa com ecossistema Lightning.

#### ✅ Tarefas Concluídas

- [x] **BOLT 12 Offers UI** (`ui/features/lightning/OfferGenerator.tsx`, `OfferScanner.tsx`)
  - `OfferGenerator` - Criação de offers estáticas (815 linhas)
  - `OfferScanner` - Decodificação e pagamento de offers (772 linhas)
  - `useOffer` hook - Gerenciamento de estado e ações
  - QR Code para compartilhamento
  - Status: ✅ Implementado

- [x] **Recurring Payments** (`ui/features/lightning/RecurringPayments.tsx`)
  - Gerenciamento de pagamentos recorrentes via BOLT 12
  - Suporte a frequências (daily, weekly, monthly, etc.)
  - Histórico de pagamentos
  - Status: ✅ Implementado (1110 linhas)

- [x] **Fee Bumping UI** (`ui/features/lightning/FeeBumping.tsx`)
  - CPFP fee bumping interface
  - `useCpfp` hook
  - Status: ✅ Implementado

- [x] **HTLC Monitor Screen** (`ui/features/lightning/HtlcMonitorScreen.tsx`)
  - Monitoramento de HTLCs pendentes
  - `useHtlcMonitor` hook
  - Status: ✅ Implementado

- [x] **Cloud Backup Setup** (`ui/features/lightning/CloudBackupSetup.tsx`)
  - Configuração de backup em nuvem
  - Suporte a múltiplos providers
  - Status: ✅ Implementado

- [x] **Force Close Status** (`ui/features/lightning/ForceCloseStatus.tsx`)
  - Acompanhamento de force close
  - Status de outputs pendentes
  - Status: ✅ Implementado

- [x] **Pending Sweeps** (`ui/features/lightning/PendingSweeps.tsx`)
  - Lista de sweep transactions pendentes
  - Priorização e status
  - Status: ✅ Implementado

#### 🔄 Tarefas em Andamento

- [ ] **Provider Management** (`ui/features/lightning/provider/index.tsx`)
  - Lista de providers (Boltz, etc.)
  - Configuração de APIs
  - Fee comparison
  - Status: Pendente

- [ ] **Advanced Routing Options** (`ui/features/lightning/routing/index.tsx`)
  - Trampoline settings
  - MPP configuration
  - Fee preferences
  - Status: Pendente

#### 📈 Métricas de Sucesso

- Integração completa com serviços externos
- Configurações avançadas acessíveis
- Backup e recovery flows

---

## 🔧 Componentes Compartilhados

### UI Components Implementados

- [x] `Button` - Botão reutilizável com variantes (primary, glass)
- [x] `IconSymbol` - Ícones SF Symbols
- [x] `ContentContainer` - Container padrão com padding
- [x] `Section` - Seção colapsável com ícone
- [x] `SettingRow` - Linha de configuração com label/descrição
- [x] `StatusBadge` - Badge de status (connected/disconnected)
- [x] `NetworkSelector` - Seletor de rede (mainnet/testnet)

### UI Components Necessários

- [ ] `LightningModal` - Modal base para operações Lightning
- [x] `ChannelCard` - Card para exibir informações de canal
- [x] `TransactionItem` - Item de lista para transações
- [ ] `FeeCalculator` - Componente para cálculo de fees
- [x] `StatusIndicator` - Indicador de status com cores
- [ ] `QRCodeScanner` - Scanner para invoices
- [ ] `ProgressStepper` - Stepper para operações multi-etapa

### Hooks Implementados

- [x] `useLightningState` - Hook para estado Lightning global
- [x] `useLightningActions` - Hook para ações Lightning
- [x] `useConnectionState` - Hook para estado de conexão
- [x] `useSettings` - Hook para configurações
- [x] `useActiveColorMode` - Hook para modo de cor ativo
- [x] `useOffer` - Hook para BOLT 12 Offers (criação, decodificação, validação)
- [x] `useChannelBackup` - Hook para backup/restore de canais
- [x] `useSubmarineSwap` - Hook para submarine swaps (Loop In/Out)
- [x] `useCpfp` - Hook para CPFP fee bumping
- [x] `useHtlcMonitor` - Hook para monitoramento de HTLCs
- [x] `useLightningContext` - Hook para acesso ao contexto completo
- [x] `useLightningBalance` - Hook para balance Lightning
- [x] `useLightningChannels` - Hook para lista de canais
- [x] `useHasActiveChannels` - Hook para verificar canais ativos
- [x] `useLightningInvoices` - Hook para invoices
- [x] `useLightningPayments` - Hook para pagamentos
- [x] `useActiveSwaps` - Hook para swaps ativos
- [x] `useSwapLimits` - Hook para limites de swap
- [x] `useCanLoopIn` / `useCanLoopOut` - Hooks para verificar viabilidade de swaps

### Hooks Necessários

- [ ] `useLightningFees` - Hook para cálculo de fees avançado
- [ ] `useInvoiceValidation` - Hook para validação de invoices

---

## 🧪 Estratégia de Testes

### Testes Unitários

- Componentes UI: Jest + React Testing Library
- Hooks: Testes de lógica e state
- Integrações: Testes de conexão core ↔ UI

### Testes de Integração

- Fluxos completos: Send payment → Confirmation → History
- Edge cases: Network errors, invalid inputs
- Performance: Loading states, memory leaks

### Testes E2E

- Cenários críticos: Channel opening, payment sending
- Dispositivos móveis: iOS/Android
- Regressão: Após mudanças no core

---

## 📋 Dependências e Pré-requisitos

### Internas

- Core Lightning implementado (✅ ~85%)
- State management setup (✅)
- Navigation (Expo Router) (✅)
- Basic UI components (✅)

### Externas

- Testnet Lightning nodes para testes
- Boltz API access para swaps
- Watchtower services para remote monitoring
- Hardware wallet libraries (futuro)

---

## 🎯 Critérios de Aceitação

### Por Feature

- **Funcionalidade**: Feature funciona end-to-end
- **UI/UX**: Design consistente, acessível
- **Performance**: <500ms para operações críticas
- **Segurança**: Validações apropriadas, error handling
- **Testes**: Cobertura >80%, testes passando

### Por Fase

- **Fase 1**: Usuário pode abrir canais e enviar/receber pagamentos básicos
- **Fase 2**: Usuário experiente pode usar features avançadas
- **Fase 3**: Integração completa com ecossistema Lightning

---

## 📊 Tracking de Progresso

### Dashboard de Métricas

- **Completion Rate**: Tasks concluídas / total
- **Test Coverage**: % de código testado
- **Performance**: Benchmarks de operações
- **User Feedback**: Issues e sugestões

### Weekly Checkpoints

- Segunda: Review da semana anterior
- Quarta: Planning da semana atual
- Sexta: Demo de progresso

---

## 🚨 Riscos e Mitigação

### Riscos Técnicos

- **Complexidade de State**: Mitigação - Usar hooks especializados
- **Performance Mobile**: Mitigação - Otimização e lazy loading
- **Integração Core**: Mitigação - Interfaces bem definidas

### Riscos de Projeto

- **Scope Creep**: Mitigação - Priorização rigorosa
- **Dependências Externas**: Mitigação - Fallbacks locais
- **Mudanças no Core**: Mitigação - Versionamento e testes

---

## 📞 Suporte e Comunicação

### Canais

- **Issues**: GitHub issues para bugs/features
- **Discussions**: GitHub discussions para decisões
- **Docs**: Atualização contínua desta documentação

### Stakeholders

- **Desenvolvedores**: Updates diários no Discord
- **QA**: Test reports semanais
- **Product**: Demo quinzenal de progresso

---

## 🔄 Processo de Atualização

Este documento será atualizado:

- **Semanalmente**: Status das tarefas
- **Após cada fase**: Review e planning da próxima
- **Após mudanças**: Ajustes no roadmap

**Última atualização:** 06/12/2025

---

## 📊 Progresso Atual (06/12/2025)

### ✅ Concluído - Fase 1

- **Roadmap criado** - Documento completo de integração frontend
- **Estrutura de pastas** - Diretórios `channel/`, `payment/`, `transaction/`, `watchtower/` criados
- **Channel Creation Screen** - Componente UI implementado com validações
- **Channel Management Screen** - Lista de canais com ações
- **Payment Send Screen** - Envio de pagamentos com invoice parsing
- **Payment Receive Screen** - Geração de invoices com QR code
- **Transaction History Screen** - Lista paginada com filtros
- **Integração de cores** - Suporte a dark/light mode
- **Navegação** - Expo Router configurado com todas as rotas

### ✅ Concluído - Fase 2

- **Dual Funding UI** - Wizard completo para Interactive TX v2
- **Channel Splice Interface** - Splice-In/Out com preview
- **Watchtower Management** - Dashboard e configuração remota
- **Submarine Swap Flow** - Loop In/Out com progress tracking
- **Lightning Settings Section** - Configurações avançadas integradas ao Settings
- **Expo Router Integration** - Rotas para todas as telas avançadas:
  - `/lightning/channels` - Lista de canais
  - `/lightning/channelCreate` - Criar canal
  - `/lightning/dualFunding` - Dual funding
  - `/lightning/splice` - Splice
  - `/lightning/paymentSend` - Enviar pagamento
  - `/lightning/paymentReceive` - Receber pagamento
  - `/lightning/watchtower` - Watchtower management
  - `/lightning/swap` - Submarine swaps

### ✅ Melhorias de UX

- **LightningDashboard refatorado** - Removido `onNavigate` prop confuso
- **Navegação via Expo Router** - Navegação direta usando `router.push()`
- **Botões padronizados** - Quick actions seguindo padrão do WalletScreen
- **Overflow corrigido** - Seções agora renderizam corretamente

### ✅ Concluído - Fase 3 (Parcial)

- **BOLT 12 Offers UI** - OfferGenerator e OfferScanner implementados
- **Recurring Payments** - Gerenciamento de pagamentos recorrentes
- **Fee Bumping** - Interface CPFP implementada
- **HTLC Monitor** - Tela de monitoramento de HTLCs
- **Cloud Backup** - Setup de backup em nuvem
- **Force Close Status** - Acompanhamento de force closes
- **Pending Sweeps** - Lista de sweeps pendentes

### 🔄 Próximos Passos - Fase 3 (Restante)

1. **Provider Management** - Configuração de LSPs e swap providers
2. **Advanced Routing Options** - Configuração de trampoline e MPP
3. **Integração com Core** - Conectar actions às funções do core
4. **Testes E2E** - Cenários completos de uso

### 📊 Métricas de Componentes Lightning

| Categoria | Arquivos | LOC Total |
| --------- | -------- | --------- |
| Screens   | 23       | ~15.000   |
| Hooks     | 9        | ~3.500    |
| Utils     | 3        | ~500      |
| Types     | 2        | ~300      |

### 🎯 Metas da Próxima Semana

- [ ] Implementar Provider Management UI
- [ ] Conectar Channel actions ao ChannelManager do core
- [ ] Testes unitários para componentes principais
- [ ] Documentação de uso das novas telas</content>
      <parameter name="filePath">c:\repos\ihodl\docs\frontend-integration-roadmap.md
