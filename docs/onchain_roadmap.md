# Roadmap On-Chain para ihodl

## Status Atual (08/12/2025)

✅ **IMPLEMENTADO**: RBF (Replace-By-Fee), CPFP (Child-Pays-For-Parent), Batch Transactions, Fee Estimation Avançada
✅ **EM DESENVOLVIMENTO**: Coin Selection aprimorada, Privacy Features
🔄 **PLANEJADO**: Taproot completo, PSBT avançado, Multisig

## Funcionalidades Implementadas (✅ Completo)

### Core On-Chain Features

- **RBF (Replace-By-Fee)**: Implementação completa com UI integrada
- **CPFP (Child-Pays-For-Parent)**: Aceleração de transações com fee bumping
- **Batch Transactions**: Envio múltiplo de transações otimizado
- **Fee Estimation**: Estimativa avançada com histórico e previsões
- **Advanced Transaction Options**: Controles granulares para RBF/CPFP
- **Transaction Details**: Interface completa com ações RBF/CPFP

### Lightning Integration

- **On-Chain Balance Auto Channel Opening**: Monitoramento automático e abertura de canais
- **LSP Integration**: Lightning Service Provider para channel management
- **Liquidity Management**: Políticas automáticas baseadas em saldo on-chain

## Visão Geral

O roadmap é dividido em três fases principais, baseadas na prioridade identificada na análise comparativa:

- **Fase 1: Aperfeiçoamento (Alta Prioridade)** - Foca em completar funcionalidades críticas já parcialmente implementadas, como PSBT e Taproot, para garantir interoperabilidade e segurança.
- **Fase 2: Modernização Completa** - Introduz padrões modernos como Output Descriptors e recursos como watch-only wallets para expandir capacidades.
- **Fase 3: Recursos Avançados** - Adiciona funcionalidades avançadas como multisig e timelocks para um ecossistema completo.

Cada fase inclui tarefas específicas com descrições técnicas, arquivos afetados, dependências, esforço estimado, prioridade e critérios de aceitação.

## Fases Detalhadas

### Fase 1: Aperfeiçoamento (Alta Prioridade)

1. **Completar PSBT (combinação, finalização, Taproot fields)**
   - **Descrição detalhada**: Implementar combinação de múltiplos PSBTs (merge), finalização de PSBTs assinados (convertendo para transação completa) e suporte a campos Taproot (BIP-371), incluindo tap_key_sig e tap_script_sigs. Isso permitirá uso completo com hardware wallets e multisig.
   - **Arquivos principais afetados**: `src/core/lib/transactions/psbt.ts` (expandir PartialTransaction com métodos combine_with e finalize_psbt), `src/core/lib/transactions/transactions.ts` (integrar finalização).
   - **Dependências**: Implementação de Schnorr signing (tarefa 2), KeyOriginInfo completo.
   - **Esforço estimado**: 10 dias de desenvolvimento.
   - **Prioridade**: Crítica.
   - **Critérios de aceitação/testes**: PSBTs de múltiplas fontes podem ser combinados sem conflitos; finalização gera transação válida; testes unitários para merge e finalize com dados mock; integração com hardware wallet simulada.

2. **Implementar Schnorr signing verdadeiro (BIP-340)**
   - **Descrição detalhada**: Substituir o placeholder atual em `crypto.ts` por implementação completa de assinatura Schnorr usando secp256k1 ou biblioteca compatível, incluindo tweak de chaves para Taproot. Suporte a assinatura de mensagens e transações Taproot.
   - **Arquivos principais afetados**: `src/core/lib/crypto/crypto.ts` (função schnorrSign e relacionadas), `src/core/lib/transactions/transactions.ts` (integrar em createSignature).
   - **Dependências**: Biblioteca secp256k1 atualizada ou nova para Schnorr.
   - **Esforço estimado**: 7 dias de desenvolvimento.
   - **Prioridade**: Crítica.
   - **Critérios de aceitação/testes**: Assinaturas Schnorr válidas para P2TR; testes vetoriais BIP-340; compatibilidade com Taproot addresses existentes.

3. **Adicionar derivação pública (CKD_pub) completa**
   - **Descrição detalhada**: Implementar CKD_pub para derivação de chaves públicas sem acesso à chave privada, incluindo validação de pontos EC e suporte a watch-only wallets. Permitir importação de xpub e derivação de endereços.
   - **Arquivos principais afetados**: `src/core/lib/key.ts` (adicionar funções CKD_pub), `src/core/services/wallet.ts` (suporte a watch-only).
   - **Dependências**: Validação de pontos EC (tarefa 4).
   - **Esforço estimado**: 5 dias de desenvolvimento.
   - **Prioridade**: Alta.
   - **Critérios de aceitação/testes**: Derivação pública gera endereços corretos; validação de xpub; testes com vetores BIP-32.

4. **Implementar verificação de assinatura**
   - **Descrição detalhada**: Adicionar verificação de assinaturas ECDSA e Schnorr em transações, incluindo preimage calculation para todos sighash types. Integrar em buildTransaction e sendTransaction.
   - **Arquivos principais afetados**: `src/core/lib/transactions/transactions.ts` (método verify_sig_for_txin), `src/core/lib/crypto/crypto.ts` (funções de verificação).
   - **Dependências**: Schnorr signing (tarefa 2).
   - **Esforço estimado**: 4 dias de desenvolvimento.
   - **Prioridade**: Alta.
   - **Critérios de aceitação/testes**: Verificação passa para transações válidas; falha para inválidas; testes com transações de teste.

5. **Melhorar coin selection privacy**
   - **Descrição detalhada**: Implementar algoritmo privacy-focused que agrupa UTXOs por script para evitar linking, incluindo change splitting e effective value calculation. Substituir seleção atual por versão aprimorada.
   - **Arquivos principais afetados**: `src/core/lib/transactions/utxo.ts` (expandir selectCoinsAdvanced com algoritmos privacy), `src/core/lib/transactions/transactions.ts` (integrar).
   - **Dependências**: Nenhuma.
   - **Esforço estimado**: 6 dias de desenvolvimento.
   - **Prioridade**: Alta.
   - **Critérios de aceitação/testes**: Seleção agrupa por endereço; change splitting ativo; testes de privacidade com simulações.

### Fase 2: Modernização Completa

6. **Implementar Output Descriptors**
   - **Descrição detalhada**: Adicionar parsing, validação e expansão de Output Descriptors (BIP-380/381), incluindo checksum e suporte a pk, pkh, wpkh, multi e tr. Integrar com geração de endereços e PSBT.
   - **Arquivos principais afetados**: Novo arquivo `src/core/lib/descriptor.ts`, `src/core/lib/address.ts` (usar descriptors para geração).
   - **Dependências**: PSBT completo (tarefa 1).
   - **Esforço estimado**: 8 dias de desenvolvimento.
   - **Prioridade**: Alta.
   - **Critérios de aceitação/testes**: Parsing de descriptors válidos; expansão gera endereços corretos; checksum validation; testes com exemplos BIP.

7. **Adicionar BIP-341 Taproot sighash**
   - **Descrição detalhada**: Implementar cálculo de sighash para Taproot (BIP-341), incluindo tagged hashes e suporte a script-path spending. Integrar com assinatura Schnorr.
   - **Arquivos principais afetados**: `src/core/lib/transactions/transactions.ts` (método serialize_preimage para Taproot), `src/core/lib/crypto/crypto.ts`.
   - **Dependências**: Schnorr signing (tarefa 2).
   - **Esforço estimado**: 5 dias de desenvolvimento.
   - **Prioridade**: Alta.
   - **Critérios de aceitação/testes**: Sighash Taproot correto; compatibilidade com BIP-341 vetores; testes de transação P2TR.

8. **CPFP (Child Pays For Parent)**
   - **Descrição detalhada**: Implementar aceleração de transações via CPFP, calculando fees efetivos e sugerindo transações filho. Integrar com coin selection.
   - **Arquivos principais afetados**: `src/core/lib/transactions/transactions.ts` (método para CPFP), `src/core/services/transaction.ts`.
   - **Dependências**: Verificação de assinatura (tarefa 4).
   - **Esforço estimado**: 4 dias de desenvolvimento.
   - **Prioridade**: Média.
   - **Critérios de aceitação/testes**: Cálculo de fee efetivo; sugestão de CPFP válida; testes com transações pendentes.

9. **Message signing**
   - **Descrição detalhada**: Adicionar assinatura e verificação de mensagens Bitcoin Signed Message, incluindo compact signatures. Suporte a ECDSA e Schnorr.
   - **Arquivos principais afetados**: `src/core/lib/crypto/crypto.ts` (funções sign_usermessage e verify_usermessage), novo módulo para messages.
   - **Dependências**: Schnorr signing (tarefa 2).
   - **Esforço estimado**: 3 dias de desenvolvimento.
   - **Prioridade**: Média.
   - **Critérios de aceitação/testes**: Assinatura/verificação de mensagens; compatibilidade com Electrum; testes com exemplos padrão.

10. **Watch-only wallets**
    - **Descrição detalhada**: Suporte completo a carteiras watch-only via xpub import, incluindo sincronização de UTXOs e geração de PSBTs não assinados.
    - **Arquivos principais afetados**: `src/core/services/wallet.ts` (suporte xpub), `src/core/lib/transactions/psbt.ts` (PSBTs não assinados), UI para import xpub.
    - **Dependências**: Derivação pública (tarefa 3), Descriptors (tarefa 6).
    - **Esforço estimado**: 6 dias de desenvolvimento.
    - **Prioridade**: Média.
    - **Critérios de aceitação/testes**: Import xpub gera endereços; PSBTs criados sem chave privada; sincronização UTXOs.

### Fase 3: Recursos Avançados

11. **P2SH, P2WSH para multisig**
    - **Descrição detalhada**: Implementar geração de endereços P2SH e P2WSH para multisig, incluindo script parsing e validação. Suporte a 2-of-3 e similares.
    - **Arquivos principais afetados**: `src/core/lib/address.ts` (novos tipos), `src/core/lib/transactions/transactions.ts` (scripts multisig).
    - **Dependências**: Descriptors (tarefa 6).
    - **Esforço estimado**: 7 dias de desenvolvimento.
    - **Prioridade**: Média.
    - **Critérios de aceitação/testes**: Endereços P2SH/P2WSH válidos; transações multisig; testes com scripts de exemplo.

12. **Múltiplos sighash types**
    - **Descrição detalhada**: Adicionar suporte a SIGHASH_NONE, SIGHASH_SINGLE e SIGHASH_ANYONECANPAY, além de ALL. Integrar em assinatura.
    - **Arquivos principais afetados**: `src/core/lib/transactions/transactions.ts` (enum Sighash e preimage calculation).
    - **Dependências**: Verificação de assinatura (tarefa 4).
    - **Esforço estimado**: 4 dias de desenvolvimento.
    - **Prioridade**: Média.
    - **Critérios de aceitação/testes**: Todos sighash types funcionam; testes com vetores BIP-143.

13. **BIP-68 relative locktime**
    - **Descrição detalhada**: Implementar timelocks relativos baseados em blocos e tempo, incluindo parsing e validação em transações.
    - **Arquivos principais afetados**: `src/core/lib/transactions/transactions.ts` (relative locktime em TxInput).
    - **Dependências**: Nenhuma.
    - **Esforço estimado**: 3 dias de desenvolvimento.
    - **Prioridade**: Média.
    - **Critérios de aceitação/testes**: Locktime relativo aplicado; validação correta; testes com BIP-68 exemplos.

14. **Backup criptografado (AES)**
    - **Descrição detalhada**: Adicionar criptografia AES para backups de seeds e keystores, incluindo ChaCha20-Poly1305 como alternativa.
    - **Arquivos principais afetados**: `src/core/lib/crypto/crypto.ts` (funções aes_encrypt/decrypt), módulo de backup.
    - **Dependências**: Nenhuma.
    - **Esforço estimado**: 4 dias de desenvolvimento.
    - **Prioridade**: Média.
    - **Critérios de aceitação/testes**: Backups criptografados descriptografam corretamente; testes de segurança.

15. **Recuperação BIP-39 de outras carteiras**
    - **Descrição detalhada**: Suporte a recuperação de seeds BIP-39 de carteiras como Trezor ou Ledger, incluindo normalização e validação.
    - **Arquivos principais afetados**: `src/core/lib/bips/bip39.ts` (expandir com recuperação), novo módulo bip39_recovery.
    - **Dependências**: Nenhuma.
    - **Esforço estimado**: 3 dias de desenvolvimento.
    - **Prioridade**: Baixa.
    - **Critérios de aceitação/testes**: Seeds de outras carteiras recuperadas; validação passa; testes com exemplos conhecidos.

## Cronograma

- **Fase 1 (Aperfeiçoamento)**: 32 dias (início imediato, conclusão em ~1-2 meses, assumindo 1 desenvolvedor full-time).
- **Fase 2 (Modernização)**: 29 dias (início após Fase 1, conclusão em ~1 mês).
- **Fase 3 (Avançado)**: 21 dias (início após Fase 2, conclusão em ~3 semanas).
- **Total estimado**: 82 dias (~4 meses), com buffers para testes e integração.

## Métricas de Sucesso

- **Funcionalidade**: 100% das tarefas críticas e altas implementadas e testadas.
- **Cobertura de Testes**: >90% de cobertura em módulos afetados, incluindo testes de integração.
- **Compatibilidade**: Interoperabilidade completa com Electrum e hardware wallets (Ledger, Trezor).
- **Performance**: Transações processadas em <1s; coin selection otimizada.
- **Segurança**: Zero vulnerabilidades críticas em auditoria; assinaturas verificadas.
- **Usuário**: Suporte a Taproot, PSBT avançado e watch-only em produção.

## Riscos e Mitigações

- **Risco: Dependências de bibliotecas** - Mitigação: Usar bibliotecas auditadas como secp256k1; testar extensivamente.
- **Risco: Complexidade de Taproot/Schnorr** - Mitigação: Seguir BIPs rigorosamente; consultar implementações de referência (Electrum).
- **Risco: Quebras de compatibilidade** - Mitigação: Versionamento de APIs; testes de regressão completos.
- **Risco: Atrasos em testes** - Mitigação: Integrar testes desde o início; usar CI/CD para validação automática.
- **Risco: Falta de expertise** - Mitigação: Consultar documentação Bitcoin; pares programar com especialistas externos se necessário.
