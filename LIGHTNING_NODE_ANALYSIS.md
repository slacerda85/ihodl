# 📋 Análise de Requisitos: Nó Lightning no App Móvel

## 🎯 **Objetivo**

Implementar um nó Lightning Network completo e funcional dentro do app iHodl, permitindo que usuários operem nós Lightning diretamente de seus dispositivos móveis.

## 🔍 **Análise Técnica**

### **1. Capacidades do Dispositivo Móvel**

#### **Limitações de Hardware**

- **CPU**: Processadores móveis (Apple A-series, Snapdragon) têm ~2-8 núcleos, mas performance limitada para operações criptográficas intensivas
- **Memória**: 4-16GB RAM disponível, mas compartilhada com app e sistema operacional
- **Armazenamento**: 64GB+ disponível, mas limitado para dados do nó
- **Bateria**: Operações criptográficas consomem energia rapidamente
- **Rede**: Conectividade móvel instável, latência variável, limites de dados

#### **Capacidades Técnicas**

- **Background Processing**: iOS/Android permitem execução em background limitada
- **Secure Storage**: Keychain (iOS) / Keystore (Android) para dados sensíveis
- **Networking**: WebSockets, TCP/UDP suportados
- **Crypto**: Aceleração hardware para operações criptográficas básicas

### **2. Requisitos Funcionais**

#### **Funcionalidades Mínimas (MVP)**

- [ ] Inicialização e configuração básica do nó
- [ ] Conexão com outros nós Lightning
- [ ] Abertura e fechamento de canais
- [ ] Recebimento de pagamentos (invoices)
- [ ] Envio de pagamentos básicos
- [ ] Sincronização com blockchain via Electrum
- [ ] Backup e recuperação de chaves

#### **Funcionalidades Avançadas (Fase 2)**

- [ ] Routing de pagamentos (HTLC forwarding)
- [ ] Multi-path payments (MPP)
- [ ] Channel rebalancing
- [ ] Liquidity management
- [ ] Advanced fee management
- [ ] Watchtowers para segurança

#### **Funcionalidades Futuras**

- [ ] Lightning Service Provider (LSP) integration
- [ ] Automated channel management
- [ ] Yield farming através de canais
- [ ] Integration com DeFi protocols

### **3. Requisitos Não-Funcionais**

#### **Performance**

- **Startup Time**: < 30 segundos para inicialização completa
- **Memory Usage**: < 200MB em idle, < 500MB durante operações
- **Battery Impact**: < 10% por hora em background
- **Network Usage**: Otimizar para dados móveis limitados

#### **Segurança**

- **Key Security**: Chaves privadas nunca expostas em memória por longos períodos
- **Backup Security**: Seed phrases encriptadas com PIN/biometria
- **Network Security**: TLS obrigatório para todas as conexões
- **State Security**: Dados do nó encriptados em disco

#### **Confiabilidade**

- **Uptime**: Nó deve manter conexões ativas quando app em foreground
- **Crash Recovery**: Recuperação automática de estado após crashes
- **Network Resilience**: Reconexão automática após perdas de conectividade
- **Data Integrity**: Validação de todas as mensagens e transações

### **4. Compatibilidade com Protocolos**

#### **BOLT Specifications**

- **BOLT 1**: Base Protocol (Handshake, Encryption)
- **BOLT 2**: Channel Establishment
- **BOLT 3**: Commitment Transactions
- **BOLT 5**: Onion Routing
- **BOLT 7**: P2P Node Discovery
- **BOLT 9**: Channel Features
- **BOLT 11**: Invoice Protocol

#### **Limitações Móveis**

- **Channel Capacity**: Canais pequenos (0.01-1 BTC) devido a riscos móveis
- **HTLC Forwarding**: Limitado devido a recursos computacionais
- **Watchtowers**: Essencial para segurança em dispositivos móveis

### **5. Dependências Técnicas**

#### **Bibliotecas Necessárias**

- **secp256k1**: Para operações ECDSA (implementação nativa necessária)
- **Noise Protocol**: Para encriptação P2P
- **SQLite**: Para armazenamento local de estado
- **WebSocket**: Para comunicação P2P
- **Electrum Client**: Para sincronização blockchain

#### **Integrações Existentes**

- **Carteira Bitcoin**: Reutilizar infraestrutura de chaves e UTXOs
- **Secure Storage**: Integrar com sistema existente
- **UI Components**: Reutilizar componentes do app
- **Network Layer**: Integrar com camadas existentes

### **6. Riscos e Limitações**

#### **Riscos Técnicos**

- **Perda de Fundos**: Maior risco em dispositivos móveis
- **Performance**: Operações criptográficas podem ser lentas
- **Conectividade**: Redes móveis instáveis afetam operação
- **Bateria**: Drenagem excessiva pode causar problemas

#### **Riscos de Segurança**

- **Device Compromise**: Celulares são mais fáceis de perder/roubar
- **Malware**: Apps móveis são vetores de ataque
- **Supply Chain**: Dependências de bibliotecas de terceiros
- **Side Channels**: Ataques baseados em timing/power analysis

#### **Limitações Arquiteturais**

- **No Full Node**: Dependência de Electrum servers
- **Limited Routing**: Capacidade reduzida para forwarding
- **Storage Constraints**: Estado limitado comparado a nós desktop
- **Background Limitations**: iOS/Android limitam execução em background

### **7. Cenários de Uso**

#### **Usuário Casual**

- Receber pagamentos pequenos
- Pagar por serviços
- Manter liquidez básica
- Backup automático

#### **Usuário Avançado**

- Routing fees como renda passiva
- Gerenciamento ativo de canais
- Integração com serviços
- Custom fee settings

#### **Usuário Empresarial**

- Aceitar pagamentos automaticamente
- Gerenciar múltiplos canais
- Relatórios e analytics
- Integração com sistemas existentes

### **8. Métricas de Sucesso**

#### **Funcional**

- Nó consegue abrir/fechar canais
- Pagamentos enviados/recebidos com sucesso
- Sincronização blockchain funciona
- Backup/recuperação funciona

#### **Performance**

- Startup < 30s
- Memory < 200MB idle
- Battery < 10%/hora
- Sync time < 5min

#### **Segurança**

- Zero perda de fundos em testes
- Chaves protegidas contra extração
- Comunicação encriptada
- Audit trail completo

#### **Usabilidade**

- Interface intuitiva
- Configuração automatizada
- Recuperação de erros transparente
- Documentação clara

### **9. Plano de Fallback**

#### **Opções de Contingência**

- **Modo Híbrido**: Nó local + backup para nós externos
- **Modo Watch-Only**: Monitorar apenas, operações via nós externos
- **Delegated Operations**: Usar LSPs para operações complexas
- **Progressive Enhancement**: Começar simples, adicionar funcionalidades

#### **Critérios de Rollback**

- Performance inaceitável (>50% battery drain)
- Instabilidade (>5 crashes/dia)
- Segurança comprometida
- Usabilidade muito complexa

### **10. Próximos Passos**

#### **Decisões Arquiteturais**

- Linguagem de implementação (TypeScript vs Rust/WASM)
- Storage strategy (SQLite vs IndexedDB)
- Networking approach (WebSockets vs WebRTC)
- Key management (Hardware Security vs Software)

#### **Prototipagem**

- Proof of concept básico
- Benchmarking de performance
- Security assessment inicial
- UX wireframes

---

## 📊 **Estimativa de Esforço**

| Componente            | Complexidade | Tempo Estimado |
| --------------------- | ------------ | -------------- |
| Análise de Requisitos | Médio        | 1 semana       |
| Arquitetura Básica    | Alto         | 2 semanas      |
| Storage Seguro        | Médio        | 1 semana       |
| Key Management        | Alto         | 2 semanas      |
| P2P Protocol          | Muito Alto   | 4 semanas      |
| Channel Management    | Alto         | 3 semanas      |
| Payment System        | Alto         | 3 semanas      |
| Blockchain Sync       | Médio        | 2 semanas      |
| Network Discovery     | Médio        | 2 semanas      |
| UI/UX                 | Médio        | 2 semanas      |
| Security Hardening    | Alto         | 2 semanas      |
| Testing & Validation  | Alto         | 3 semanas      |
| **Total**             |              | **27 semanas** |

**Nota**: Estimativas são para implementação MVP. Funcionalidades avançadas adicionariam 8-12 semanas adicionais.
