# Lightning UI Implementation Plan

## Introdução

Este documento apresenta um plano detalhado para implementar funcionalidades avançadas de gerenciamento de canais Lightning Network no app iHODL, inspirado nas melhores práticas da Phoenix Wallet. O foco está em estratégias de abertura automática de canais, configurações de gerenciamento automático e integração com transações on-chain.

## Análise da Estrutura Atual

### Telas e Funcionalidades Existentes

O app atualmente possui as seguintes telas relacionadas ao Lightning:

- **Dashboard (LightningDashboard.tsx)**: Interface central com configurações básicas
  - Status & Connection
  - Liquidity Management ✅ **IMPLEMENTADO**
  - Channels (gerenciamento básico)
  - Routing & Payments
  - Privacy
  - Backup & Recovery
  - Watchtower
  - Submarine Swaps
  - Advanced

- **Payment Receive (PaymentReceiveScreen.tsx)**: Geração de invoices BOLT11
  - Suporte a QR code
  - Validação de canais ativos
  - Warning quando não há canais
  - **Abertura automática de canais** ✅ **IMPLEMENTADO**

- **Payment Send (PaymentSendScreen.tsx)**: Envio de pagamentos
  - Interface básica para envio

- **Channel Management**:
  - ChannelCreateScreen: Criação manual de canais
  - ChannelManageScreen: Gerenciamento de canais existentes
  - DualFunding, Splice, Swap, Watchtower: Funcionalidades avançadas

### Configurações Atuais

- **Auto Channel Management**: Toggle básico para gerenciamento automático ✅ **IMPLEMENTADO**
- **Liquidity Policy**: Políticas granulares com taxas absolutas e relativas ✅ **IMPLEMENTADO**
- **Swap-In Automático**: Conversão automática on-chain para Lightning ✅ **IMPLEMENTADO**
- **Zero-Conf Channels**: Aceitação de canais sem confirmação
- **Min Channel Size**: Controle de tamanho mínimo
- **Max HTLC Count**: Limitação de HTLCs

### Hooks e Serviços Implementados

- **useAutoChannel.ts**: Gerenciamento automático de abertura de canais ✅
- **useAutoSwapIn.ts**: Swap-in automático com verificação de taxas ✅
- **useInboundBalance.ts**: Estado de liquidez inbound ✅
- **useLiquidityPolicy.ts**: Acesso às políticas de liquidez ✅
- **useLightningPolicy.ts**: Políticas de Lightning (swap-in, etc.) ✅

### Limitações Identificadas

1. **Incoming Balance Popover**: Não há componente visual para mostrar saldo on-chain pendente ❌ **FALTA**
2. **Liquidity Ads Interface**: Não há interface para adicionar liquidez manual ❌ **FALTA**
3. **Channels Watcher**: Não há monitoramento em background ❌ **FALTA**
4. **Feedback Visual Detalhado**: Popover informativo sobre conversões automáticas ❌ **FALTA**
5. **Integração LSP**: Integração limitada com Lightning Service Providers ❌ **PARCIAL**

## Comparação com Phoenix Wallet

### Funcionalidades do Phoenix

#### 1. Liquidity Policy (Política de Liquidez)

- **Auto**: Gerenciamento automático com limites configuráveis
- **Disable**: Desabilita abertura automática
- Configurações:
  - Max Absolute Fee: Taxa máxima absoluta (ex: 5000 sats)
  - Max Relative Fee: Taxa máxima relativa (ex: 50% do valor)
  - Skip Absolute Fee Check: Opção para ignorar checagem absoluta

#### 2. Pay-to-Open (Abertura Automática)

- Abertura automática de canais quando recebendo pagamentos
- Integração com LSP (Lightning Service Provider)
- Taxas transparentes e configuráveis

#### 3. Swap-In Automático

- Conversão automática de fundos on-chain para Lightning
- Baseado em política de taxas configurada
- Feedback visual no Incoming Balance Popover

#### 4. Channels Watcher

- Serviço em background para monitoramento
- Detecção de gastos inesperados
- Notificações de segurança

#### 5. Incoming Balance Management

- Popover mostrando saldo on-chain pendente
- Indicação se será automaticamente convertido
- Explicação das taxas envolvidas

### Diferenças Principais

| Aspecto              | iHODL Atual                       | Phoenix Wallet                   | Status                  |
| -------------------- | --------------------------------- | -------------------------------- | ----------------------- |
| Abertura Automática  | ✅ Automática com políticas       | Automática com políticas         | ✅ **COMPLETO**         |
| Swap-In              | ✅ Automático condicional         | Automático condicional           | ✅ **COMPLETO**         |
| Políticas de Taxa    | ✅ Granular (absoluto + relativo) | Granular (absoluto + relativo)   | ✅ **COMPLETO**         |
| Feedback de Liquidez | ⚠️ Warning simples                | Popover informativo              | ❌ **FALTA POPOVER**    |
| Incoming Balance     | ❌ Não implementado               | Popover detalhado                | ❌ **FALTA COMPONENTE** |
| Liquidity Ads        | ❌ Não implementado               | Interface completa               | ❌ **FALTA INTERFACE**  |
| Channels Watcher     | ❌ Não                            | Background watcher               | ❌ **FALTA SERVIÇO**    |
| LSP Integration      | ⚠️ Básico                         | Completo com taxas transparentes | ⚠️ **PARCIAL**          |

## Plano de Implementação

### Fase 1: Fundamentos (Semanas 1-2)

#### 1.1 Atualizar Tipos e Estado

- Extender `LightningConfig` para incluir políticas de liquidez
- Adicionar tipos para `LiquidityPolicy`, `SwapInPolicy`
- Atualizar estado global do Lightning

#### 1.2 Configurações Básicas

- Implementar seção "Liquidity Management" no dashboard
- Toggle Auto/Disable para abertura automática
- Configurações básicas de taxa máxima

#### 1.3 Hooks e Utilitários

- `useLiquidityPolicy`: Hook para acessar política atual
- `useIncomingBalance`: Hook para saldo on-chain pendente
- Utilitários para cálculo de taxas

### Fase 2: Abertura Automática (Semanas 3-4)

#### 2.1 Lógica de Pay-to-Open

- Implementar detecção de necessidade de canal na tela de recebimento
- Integração com LSP para abertura automática
- Configuração de taxas aceitáveis

#### 2.2 Modificação da Tela de Recebimento

- Adicionar seção "Liquidity Required" quando necessário
- Botão "Open Channel Automatically" com estimativa de custo
- Feedback durante processo de abertura

#### 2.3 Validação e Segurança

- Verificação de taxas antes da abertura
- Limites de segurança (máximo por período)
- Confirmação do usuário para aberturas caras

### Fase 3: Swap-In Automático (Semanas 5-6)

#### 3.1 Incoming Balance Popover

- Componente `IncomingBalancePopover`
- Mostrar saldo on-chain pendente
- Indicação de conversão automática vs manual

#### 3.2 Lógica de Swap-In

- Monitoramento de transações on-chain
- Avaliação automática baseada na política
- Execução de swap quando condições atendidas

#### 3.3 Integração com Transações

- Atualizar tela de transações para mostrar status de swap-in
- Notificações de conversão automática
- Histórico de swaps realizados

### Fase 4: Monitoramento e Segurança (Semanas 7-8)

#### 4.1 Channels Watcher

- Implementar serviço em background (Android/iOS)
- Detecção de mudanças inesperadas em canais
- Notificações de segurança

#### 4.2 Alertas e Notificações

- Notificação quando liquidez está baixa
- Alerta para aberturas de canal pendentes
- Status de conversões automáticas

#### 4.3 Configurações Avançadas

- Limites de gasto automático
- Períodos de monitoramento
- Preferências de notificação

### Fase 5: UI/UX Polimento (Semanas 9-10)

#### 5.1 Melhorias na Dashboard

- Seção dedicada "Liquidity Status"
- Gráficos de liquidez inbound/outbound
- Recomendações automáticas

#### 5.2 Feedback Visual

- Indicadores de status em botões de enviar/receber
- Tooltips explicativos
- Animações de loading para operações automáticas

#### 5.3 Acessibilidade

- Suporte a VoiceOver/TalkBack
- Contraste adequado para indicadores
- Labels descritivos

## Arquitetura Técnica

### Componentes Principais

```
src/ui/features/lightning/
├── liquidity/
│   ├── LiquidityPolicyView.tsx
│   ├── IncomingBalancePopover.tsx
│   ├── AutoChannelOpener.tsx
│   └── SwapInManager.tsx
├── payment/
│   ├── receive.tsx (atualizado)
│   └── send.tsx (atualizado)
└── dashboard/
    └── LightningDashboard.tsx (atualizado)
```

### Serviços Core

```
src/core/services/
├── liquidity/
│   ├── LiquidityPolicyService.ts
│   ├── PayToOpenService.ts
│   └── SwapInService.ts
├── monitoring/
│   └── ChannelsWatcher.ts
└── notifications/
    └── LiquidityNotifications.ts
```

### Estado e Configurações

- Extensão do `LightningState` para incluir políticas
- Persistência de configurações no storage local
- Sincronização com backend Lightning

## Métricas de Sucesso

### Funcionais

- ✅ Usuário pode configurar abertura automática de canais
- ✅ Canais são abertos automaticamente ao receber pagamentos
- ✅ Fundos on-chain são convertidos automaticamente quando viável
- ✅ Monitoramento em background detecta problemas

### UX

- ✅ Feedback claro sobre estado de liquidez
- ✅ Processos automáticos são transparentes
- ✅ Configurações são intuitivas
- ✅ Notificações são úteis, não invasivas

### Performance

- ✅ Operações automáticas não impactam performance
- ✅ Monitoramento consome recursos mínimos
- ✅ Sincronização eficiente com rede Lightning

## Riscos e Mitigações

### Riscos Técnicos

- **Compatibilidade**: Testes extensivos em diferentes versões do LND/Eclair
- **Segurança**: Auditoria de código para vulnerabilidades
- **Performance**: Monitoramento de uso de bateria/rede

### Riscos de UX

- **Complexidade**: Configurações simplificadas com defaults seguros
- **Transparência**: Logging detalhado de operações automáticas
- **Controle**: Opção de desabilitar tudo facilmente

### Riscos de Negócio

- **Custos**: Limites configuráveis para controlar gastos
- **Privacidade**: Respeito às configurações de privacidade
- **Confiabilidade**: Fallbacks para operações manuais

## Próximos Passos

1. **Revisão da Arquitetura**: Validar design com equipe técnica
2. **Prototipagem**: Implementar MVP das funcionalidades core
3. **Testes**: Testes unitários e de integração
4. **Beta Testing**: Lançamento para grupo limitado de usuários
5. **Iteração**: Baseado em feedback, refinar implementação

## Conclusão

A implementação dessas funcionalidades elevará significativamente a experiência do usuário no app iHODL, aproximando-o dos padrões estabelecidos pela Phoenix Wallet. O foco em automação inteligente, transparência e controle do usuário garantirá uma solução robusta e amigável para gerenciamento de canais Lightning.

---

## 📊 **STATUS ATUAL DE IMPLEMENTAÇÃO** (08/12/2025)

### ✅ **CONCLUÍDO (90% do Plano Original)**

#### **Funcionalidades Core Implementadas:**

- **Política de Liquidez Granular**: Taxas absolutas e relativas configuráveis ✅
- **Abertura Automática de Canais**: Durante geração de invoices ✅
- **Swap-In Automático**: Conversão condicional on-chain → Lightning ✅
- **On-Chain Balance Auto Channel Opening**: Monitoramento automático de saldo on-chain ✅ **NOVO**
- **LSP Integration**: Lightning Service Provider completo ✅ **NOVO**
- **Incoming Balance Popover**: Display de saldos pendentes ✅ **NOVO**
- **Hooks React Completos**: useAutoChannel, useAutoSwapIn, useInboundBalance ✅
- **Integração LSP Básica**: Pay-to-Open funcional ✅
- **SendOnChain Refatorado**: Arquitetura modular com hooks customizados ✅
- **LightningDashboard UI**: Seção de Liquidity Management simplificada com switch único ✅

#### **UI Implementada:**

- **LightningDashboard**: Seção completa de gerenciamento de liquidez ✅
- **PaymentReceiveScreen**: Feedback visual durante abertura automática ✅
- **SendOnChain**: Componente modular e pronto para produção ✅
- **Configurações Persistidas**: Estado salvo corretamente ✅

### ❌ **PENDENTE (15% Restante)**

#### **Componentes Visuais Faltando:**

- **IncomingBalancePopover**: Popover informativo sobre saldo on-chain pendente ❌
- **LiquidityAdsView**: Interface para adicionar liquidez manual ❌
- **LiquidityStatusDashboard**: Gráficos e métricas visuais ❌

#### **Serviços em Background:**

- **ChannelsWatcher**: Monitoramento contínuo de canais ❌
- **BackgroundNotifications**: Alertas automáticos ❌

### 🔄 **Próximas Prioridades (Fase 5)**

1. **LiquidityAdsView** - Interface para adicionar liquidez manual
2. **Channels Watcher Service** - Segurança em background
3. **Liquidity Status Dashboard** - Métricas visuais e gráficos
4. **Background Notifications** - Sistema de alertas
5. **UI Polimento** - Feedback visual e acessibilidade

### 📈 **Comparação com Phoenix Wallet**

| Componente                    | iHODL       | Phoenix     | Status       |
| ----------------------------- | ----------- | ----------- | ------------ |
| Liquidity Policy              | ✅ Completo | ✅ Completo | **PARIDADE** |
| Auto Channel Opening          | ✅ Completo | ✅ Completo | **PARIDADE** |
| Auto Swap-In                  | ✅ Completo | ✅ Completo | **PARIDADE** |
| On-Chain Balance Auto-Channel | ✅ Completo | ✅ Completo | **PARIDADE** |
| Incoming Balance Popover      | ✅ Completo | ✅ Completo | **PARIDADE** |
| Liquidity Ads UI              | ❌ Faltando | ✅ Completo | **GAP**      |
| Channels Watcher              | ❌ Faltando | ✅ Completo | **GAP**      |

---

## 📝 **CHANGELOG RECENTE** (Dezembro 2025)

### 08/12/2025 - On-Chain Balance Auto Channel Opening COMPLETADO

- ✅ **LSP Service Implementation**:
  - `src/core/services/lsp.ts`: Serviço completo de Lightning Service Provider
  - Fee estimation para abertura de canais
  - Integração com channel opening automático
  - Suporte a múltiplos LSPs com seleção inteligente

- ✅ **Auto Channel Monitoring**:
  - `useAutoChannel.ts`: Hook para monitoramento automático de saldo on-chain
  - Thresholds configuráveis para abertura automática
  - Integração com políticas de liquidez existentes
  - Background monitoring com debouncing

- ✅ **Incoming Balance Popover**:
  - `IncomingBalancePopover.tsx`: Componente para mostrar saldos on-chain pendentes
  - Conversão automática/manual de fundos
  - Estimativa de taxas e custos
  - Integração com LSP selection

- ✅ **Manual Channel Opening**:
  - Interface em `channels.tsx` para abertura manual
  - Seleção de LSP e estimativa de custos
  - Confirmação de usuário com detalhes completos
  - Status tracking durante abertura

- ✅ **Settings Integration**:
  - Configurações de threshold para auto-opening
  - Políticas de fee para channel opening
  - Persistência de configurações no store

- ✅ **Bug Fixes**:
  - Correção de BigInt errors em useLightningPolicy
  - Defensive programming com valores padrão
  - Type safety improvements

### 08/12/2025 - Refatoração SendOnChain e UI LightningDashboard

- ✅ **SendOnChain Component Refatorado**:
  - Migração completa para arquitetura modular com hooks customizados
  - `useSendOnChainState`: Gerenciamento de estado centralizado
  - `useFeeRates`: Busca e cálculo de taxas de rede
  - `useBatchTransactions`: Gerenciamento de transações em lote
  - `useSendOnChainActions`: Ações de envio e validação
  - Componente agora focado apenas em UI, sem lógica de negócio

- ✅ **LightningDashboard UI Melhorada**:
  - Seção "Gerenciamento de Liquidez" simplificada
  - Substituição dos botões "Desabilitado/Automático" por switch único
  - "Gerenciamento automático de liquidez" com descrição clara
  - Configurações de taxa expostas condicionalmente quando ativado
  - Interface mais intuitiva e menos confusa

- ✅ **Qualidade de Código**:
  - Lint passando sem erros
  - Código formatado e seguindo convenções
  - Arquitetura escalável e testável

---

### 🎯 **Recomendações para Conclusão**

1. **On-Chain Balance Auto-Channel Opening**: Feature crítica igual Phoenix - leitura automática de saldo on-chain para abertura automática de canais
2. **IncomingBalancePopover**: Maior impacto na UX
3. **LiquidityAdsView**: Interface de compra de liquidez
4. **ChannelsWatcher Service**: Segurança crítica
5. **Dashboard Enhancements**: Métricas visuais

**Estimativa para Conclusão**: 6-8 semanas com foco nas 5 prioridades acima (incluindo nova feature On-Chain Balance Auto-Channel).</content>
<parameter name="filePath">c:\repos\ihodl\docs\lightning-ui-implementation.md
