# Roadmap: Seleção de Rede (Mainnet/Testnet)

## Objetivo

Permitir seleção de rede via config central (prod = mainnet), eliminando hardcodes.

## Entregáveis

- Config única `networkConfig` (mainnet/testnet/regtest).
- HRPs parametrizados (segwit, invoices LN).
- ChainHash LN parametrizado.
- Prefixos WIF/BIP32 parametrizados.
- Endpoints por rede (trampoline, watchtowers, Boltz, DNS seeds).
- Testes cobrindo troca de rede.

## Escopo Técnico

1. **Config**: criar `src/config/network.ts` com presets e selector (default mainnet).
2. **Endereços**: `address.ts` usar HRP da config em `createAddress` e `toBech32`; aceitar HRPs válidos no parse.
3. **WIF/Keys**: `key.ts` usar prefixes/WIF e `KEY_VERSIONS` conforme rede; evitar defaults mainnet.
4. **LN ChainHash**: `p2p.ts`, `gossip.ts`, `gossip-sync` e `worker` consumir `chainHash` da config.
5. **Invoices**: `invoice.ts` construir HRP (`lnbc/lntb/lnbcrt`) via config; parsing validar contra HRPs permitidos.
6. **Swaps/Serviços**: `submarineSwap.ts`, `trampoline.ts`, `remoteWatchtower.ts`, `lightning/index.ts` pegar endpoints/HRPs da config.
7. **Parsing de endereços**: `transactions.ts` remover `startsWith('bc1')`; usar lista de HRPs da config.
8. **Tests**: fixtures dual-rede, sanity de HRP/chainHash, smoke de invoice encode/decode e address round-trip.

## Não-Escopo (agora)

- UI de seleção (fica para depois).
- Persistência da escolha em storage seguro (futuro).

## Riscos/Mitigação

- Hardcode residual: rodar grep por `bc1`, `lnbc`, `BITCOIN_CHAIN_HASH`.
- Quebra em tests: atualizar fixtures HRP/WIF.
- Regressão LN init: validar `init` aceita chainHash configurada.

## Verificação

- Unit: invoices (HRP), addresses (hrp main/test), WIF main/test, p2p init (chainHash).
- Integração: enviar/parse invoice em testnet; gerar endereço bech32 testnet; gossip decode com chainHash testnet.

## Cronograma (estimado)

- Dia 1: config + addresses + WIF/keys.
- Dia 2: LN chainHash + invoices + parsing de endereços.
- Dia 3: serviços (swap/trampoline/watchtower/endpoints) + testes e limpeza de fixtures.
