# Testes E2E com Maestro - Lightning Network

Este documento explica como configurar e executar testes end-to-end (E2E) para o recurso Lightning Network da carteira iHodl usando Maestro.

## Pré-requisitos

1. **Maestro CLI**: Instalado em `C:\maestro\maestro\bin\` conforme instruções abaixo

2. **App Build**: Você precisa de um build do app para testes:

   ```bash
   # Build para Android
   eas build --profile e2e --platform android

   # Build para iOS
   eas build --profile e2e --platform ios
   ```

3. **Dispositivo/Emulador**: Android/iOS emulator ou dispositivo físico conectado

## Instalação do Maestro (Windows)

1. **Download**: Baixe a última versão do Maestro:

   ```bash
   curl -L -o maestro.zip https://github.com/mobile-dev-inc/maestro/releases/latest/download/maestro.zip
   ```

2. **Extração**: Extraia o arquivo zip:

   ```bash
   # PowerShell
   Expand-Archive -Path maestro.zip -DestinationPath C:\maestro -Force
   ```

3. **PATH**: Adicione ao PATH do sistema:

   ```bash
   setx PATH "%PATH%;C:\maestro\maestro\bin"
   ```

4. **Verificação**: Teste a instalação:
   ```bash
   C:\maestro\maestro\bin\maestro.bat --version
   ```

## Estrutura dos Testes

### Flows Disponíveis

- **`receive_lightning_flow.yaml`**: Testa o fluxo de recebimento Lightning
- **`send_lightning_flow.yaml`**: Testa o fluxo de envio Lightning
- **`lightning_full_flow.yaml`**: Teste completo do fluxo Lightning
- **`lightning_error_scenarios.yaml`**: Testa cenários de erro

### O que os testes cobrem

1. **Fluxo Completo**:
   - Inicialização da wallet Bitcoin
   - Derivação de chaves Lightning da seed
   - Conexão com a rede Lightning
   - Geração de invoices
   - Exibição de QR codes
   - Envio de pagamentos

2. **Funcionalidades**:
   - Geração automática de invoice zero-amount
   - Geração de invoice com valor personalizado
   - Parsing e validação de invoices
   - Preparação de pagamentos
   - Confirmação de envio
   - Copiar/compartilhar invoices

3. **Cenários de Erro**:
   - Invoice inválida
   - Falha na geração de invoice
   - Falha no envio de pagamento

## Como Executar os Testes

### Executar Todos os Testes

```bash
npm run test:e2e
```

### Executar Teste Específico

```bash
# Recebimento Lightning
npm run test:e2e:receive

# Envio Lightning
npm run test:e2e:send

# Fluxo completo
npm run test:e2e:full

# Cenários de erro
npm run test:e2e:errors
```

### Executar com Maestro CLI Direto

```bash
# Teste específico
C:\maestro\maestro\bin\maestro.bat test maestro/receive_lightning_flow.yaml

# Todos os testes
C:\maestro\maestro\bin\maestro.bat test maestro/
```

## Configuração dos Flows

### appId

Certifique-se de atualizar o `appId` em cada arquivo YAML com o bundle ID correto do seu app:

```yaml
appId: com.slacerda85.ihodl # Substitua pelo seu bundle ID
```

### Seletores de UI

Os testes usam seletores baseados em texto visível. Se a UI mudar, atualize os seletores nos arquivos YAML:

- `tapOn: "Texto do Botão"`
- `assertVisible: "Texto Esperado"`
- `inputText: "Texto para inserir"`

## Integração com CI/CD

Para integrar com EAS Build, crie um workflow que execute os testes após o build:

```yaml
# .eas/workflows/e2e.yml
jobs:
  - name: Run E2E Tests
    steps:
      - run: C:\maestro\maestro\bin\maestro.bat test maestro/ --format junit > test-results.xml
```

## Troubleshooting

### Problemas Comuns

1. **App não inicia**: Verifique se o `appId` está correto
2. **Elementos não encontrados**: A UI pode ter mudado - atualize os seletores
3. **Timeouts**: Aumente `waitForAnimationToEnd` ou `waitFor` se necessário
4. **Screenshots não salvam**: Certifique-se de que o diretório tem permissões de escrita

### Debug

Use o modo interativo do Maestro para debug:

```bash
C:\maestro\maestro\bin\maestro.bat studio
```

## Melhorando os Testes

### Adicionando Novos Cenários

1. Crie um novo arquivo `.yaml` na pasta `maestro/`
2. Defina o `appId`
3. Escreva os comandos de teste
4. Adicione screenshots importantes com `takeScreenshot`

### Mocks e Dados de Teste

Para testes mais robustos, considere:

- Mockar respostas da API Lightning
- Usar dados de teste consistentes
- Configurar estado inicial conhecido

## Arquitetura dos Testes

Os testes seguem o fluxo real do usuário:

1. **LightningProvider**: Inicializa contexto Lightning
2. **Seed Storage**: Carrega seed do storage seguro
3. **Key Derivation**: Deriva chaves Lightning da seed
4. **Invoice Generation**: Gera invoice via useLightningInvoice
5. **UI Display**: Mostra QR code em ReceiveLightning/SendLightning
6. **Payment Flow**: Processa pagamentos enviados
