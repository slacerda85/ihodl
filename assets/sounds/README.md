# Notification Sound Placeholder

## Decisão: Usando som padrão do sistema

O app foi configurado para usar o som de notificação padrão do sistema iOS/Android, que é a abordagem mais recomendada e confiável.

### Por que usar som padrão?

- ✅ Funciona imediatamente sem necessidade de arquivos adicionais
- ✅ Compatível com todas as versões do iOS/Android
- ✅ Não aumenta o tamanho do app
- ✅ Sons padrão são otimizados para acessibilidade

### Se quiser som customizado no futuro:

#### Opção 1: Sons gratuitos online

- **Freesound.org**: https://freesound.org/ - Busque por "notification" ou "bell"
- **Zapsplat.com**: https://www.zapsplat.com/ - Sons gratuitos para notificações
- **Notification Sounds**: https://notificationsounds.com/

#### Opção 2: Criar som simples

- **Online Tone Generator**: https://www.szynalski.com/tone-generator/
- **Bfxr**: https://www.bfxr.net/ - Para criar sons de 8-bit

#### Requisitos para Expo:

- Formato: WAV (não MP3)
- Duração: Máximo 30 segundos
- Tamanho: Menor que 100KB recomendado
- Nome do arquivo: `notification.wav`

#### Como implementar:

1. Baixe ou crie um arquivo WAV
2. Salve como `assets/sounds/notification.wav`
3. Descomente a linha `sounds` no `app.config.ts`:

```typescript
sounds: ['./assets/sounds/notification.wav'],
```

4. Reinicie o servidor de desenvolvimento

### Configuração atual:

O app está usando o som de notificação padrão do sistema, que é a configuração mais robusta e recomendada.
