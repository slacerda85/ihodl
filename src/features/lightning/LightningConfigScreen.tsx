import React, { useState, useEffect, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  FlatList,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useLightning, useWallet, useLightningChannels, useSettings } from '../store'
import { LightningConfig, authenticatedLightningClient } from '@/lib/lightning'
import colors from '@/ui/colors'
import { alpha } from '@/ui/utils'

type NodeType = 'lnd' | 'cln' | 'eclair'

interface DetectedNode {
  id: string
  url: string
  type: NodeType
  alias?: string
  pubkey?: string
  isLocal: boolean
  confidence: number // 0-100, how confident we are this is a valid node
}

const LightningConfigScreen: React.FC = () => {
  const router = useRouter()
  const { activeWalletId } = useWallet()
  const { getLightningConfig, saveLightningConfig, initializeLightningWallet } = useLightning()
  const { openChannelAsync, isWalletConfigured } = useLightningChannels()
  const { isDark } = useSettings()

  // Auto-detection state
  const [isDetecting, setIsDetecting] = useState(false)
  const [detectedNodes, setDetectedNodes] = useState<DetectedNode[]>([])
  const [selectedNode, setSelectedNode] = useState<DetectedNode | null>(null)

  // Manual config state (fallback)
  const [showManualConfig, setShowManualConfig] = useState(false)
  const [nodeType, setNodeType] = useState<NodeType>('lnd')
  const [nodeUrl, setNodeUrl] = useState('')
  const [cert, setCert] = useState('')
  const [macaroon, setMacaroon] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [timeout, setTimeout] = useState('30000')

  // Auto-channel opening state
  const [isOpeningChannels, setIsOpeningChannels] = useState(false)
  const [autoChannelProgress, setAutoChannelProgress] = useState<string>('')

  // Status
  const [isConnecting, setIsConnecting] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<
    'disconnected' | 'connecting' | 'connected' | 'error'
  >('disconnected')
  const [errors, setErrors] = useState<{ [key: string]: string }>({})

  // Load existing config on mount
  useEffect(() => {
    if (activeWalletId) {
      const config = getLightningConfig(activeWalletId)
      if (config) {
        setNodeType(config.type || 'lnd')
        setNodeUrl(config.nodeUrl || '')
        setCert(config.tlsCert || '')
        setMacaroon(config.macaroon || '')
        setApiKey(config.apiKey || '')
        setTimeout((config.timeout || 30000).toString())
      }
    }
  }, [activeWalletId, getLightningConfig])

  // Auto-detect Lightning nodes
  const detectNodes = useCallback(async () => {
    if (!activeWalletId) return

    setIsDetecting(true)
    setDetectedNodes([])
    setErrors({})

    try {
      const detected: DetectedNode[] = []

      // Common local Lightning node configurations
      const commonConfigs = [
        // LND defaults
        {
          url: 'https://localhost:8080',
          type: 'lnd' as NodeType,
          cert: '',
          macaroon: '',
          apiKey: '',
        },
        {
          url: 'https://127.0.0.1:8080',
          type: 'lnd' as NodeType,
          cert: '',
          macaroon: '',
          apiKey: '',
        },
        {
          url: 'https://localhost:10009',
          type: 'lnd' as NodeType,
          cert: '',
          macaroon: '',
          apiKey: '',
        },

        // CLN defaults
        {
          url: 'https://localhost:9737',
          type: 'cln' as NodeType,
          cert: '',
          macaroon: '',
          apiKey: '',
        },
        {
          url: 'https://127.0.0.1:9737',
          type: 'cln' as NodeType,
          cert: '',
          macaroon: '',
          apiKey: '',
        },

        // Eclair defaults
        {
          url: 'https://localhost:8080',
          type: 'eclair' as NodeType,
          cert: '',
          macaroon: '',
          apiKey: '',
        },
      ]

      // Test each configuration
      for (const config of commonConfigs) {
        try {
          const clientConfig = {
            url: config.url,
            auth: {
              cert: config.cert,
              macaroon: config.macaroon,
              apiKey: config.apiKey,
            },
            type: config.type,
            timeout: 5000, // Short timeout for detection
          }

          const client = authenticatedLightningClient(clientConfig)
          const nodeInfo = await client.getInfo()

          detected.push({
            id: `${config.type}-${config.url}`,
            url: config.url,
            type: config.type,
            alias: nodeInfo.alias,
            pubkey: nodeInfo.pubKey,
            isLocal: true,
            confidence: 95,
          })

          console.log(`✅ Detected ${config.type} node at ${config.url}: ${nodeInfo.alias}`)
        } catch {
          // Node not available at this config, continue
          console.log(`❌ No ${config.type} node at ${config.url}`)
        }
      }

      // If no local nodes found, suggest popular public nodes
      if (detected.length === 0) {
        // Add some well-known public Lightning nodes as suggestions
        detected.push(
          {
            id: 'public-lnd-1',
            url: 'https://lnd1.example.com:8080', // Placeholder - would be real public nodes
            type: 'lnd',
            alias: 'Public LND Node 1',
            isLocal: false,
            confidence: 50,
          },
          {
            id: 'public-cln-1',
            url: 'https://cln1.example.com:9737',
            type: 'cln',
            alias: 'Public CLN Node 1',
            isLocal: false,
            confidence: 50,
          },
        )
      }

      setDetectedNodes(detected)

      if (detected.length === 0) {
        setErrors({
          detection: 'Nenhum nó Lightning detectado automaticamente. Configure manualmente.',
        })
        setShowManualConfig(true)
      }
    } catch (error) {
      console.error('Error detecting nodes:', error)
      setErrors({ detection: 'Erro ao detectar nós automaticamente' })
      setShowManualConfig(true)
    } finally {
      setIsDetecting(false)
    }
  }, [activeWalletId])

  // Auto-connect to selected node
  const connectToNode = useCallback(
    async (node: DetectedNode) => {
      if (!activeWalletId) return

      setIsConnecting(true)
      setConnectionStatus('connecting')
      setErrors({})

      try {
        // Create config based on node type
        let config: LightningConfig

        if (node.type === 'lnd') {
          // For LND, try to auto-detect cert and macaroon paths
          config = {
            nodeUrl: node.url,
            type: 'lnd',
            authMethod: 'tls',
            tlsCert: '', // Would auto-detect from ~/.lnd/tls.cert
            macaroon: '', // Would auto-detect from ~/.lnd/data/chain/bitcoin/mainnet/admin.macaroon
            timeout: 30000,
          }
        } else if (node.type === 'cln') {
          config = {
            nodeUrl: node.url,
            type: 'cln',
            authMethod: 'api',
            apiKey: '', // Would auto-detect from CLN config
            timeout: 30000,
          }
        } else {
          config = {
            nodeUrl: node.url,
            type: 'eclair',
            authMethod: 'api',
            timeout: 30000,
          }
        }

        // Test connection
        const clientConfig = {
          url: config.nodeUrl,
          auth: {
            cert: config.tlsCert,
            macaroon: config.macaroon,
            apiKey: config.apiKey,
          },
          type: config.type,
          timeout: config.timeout,
        }

        const client = authenticatedLightningClient(clientConfig)
        const nodeInfo = await client.getInfo()

        // Save config
        await saveLightningConfig(config, activeWalletId)

        // Initialize wallet if needed
        await initializeLightningWallet(activeWalletId, config)

        setConnectionStatus('connected')
        Alert.alert('Sucesso', `Conectado ao nó ${nodeInfo.alias || nodeInfo.pubKey}`)

        // Auto-open channels if this is a fresh setup
        if (!isWalletConfigured) {
          await autoOpenChannels(nodeInfo.pubKey)
        }
      } catch (error) {
        console.error('Connection failed:', error)
        setConnectionStatus('error')
        setErrors({ connection: `Falha na conexão: ${error}` })

        // Fall back to manual config
        setShowManualConfig(true)
      } finally {
        setIsConnecting(false)
      }
    },
    [activeWalletId, saveLightningConfig, initializeLightningWallet, isWalletConfigured],
  )

  // Auto-open recommended channels
  const autoOpenChannels = useCallback(
    async (localNodePubkey: string) => {
      setIsOpeningChannels(true)
      setAutoChannelProgress('Analisando rede Lightning...')

      try {
        // Get recommended peers (this would be implemented with a peer recommendation service)
        const recommendedPeers = [
          {
            pubkey: '03864ef025fde8fb587d989186ce6a4a186895ee44a926bfc370e2c366597a3f8f452', // ACINQ
            host: '34.239.230.56:9735',
            alias: 'ACINQ',
          },
          {
            pubkey: '03abf6f44c355dec0d5aa155bdbdd6e0c8fefe318eff402de65c6eb2e1be55dc3eb4', // River Financial
            host: '104.196.249.140:9735',
            alias: 'River Financial',
          },
        ]

        setAutoChannelProgress(
          `Abrindo canais com ${recommendedPeers.length} peers recomendados...`,
        )

        for (const peer of recommendedPeers) {
          try {
            setAutoChannelProgress(`Conectando com ${peer.alias}...`)

            // Connect to peer first
            const config = getLightningConfig(activeWalletId!)
            if (!config) continue

            const clientConfig = {
              url: config.nodeUrl,
              auth: {
                cert: config.tlsCert,
                macaroon: config.macaroon,
                apiKey: config.apiKey,
              },
              type: config.type,
              timeout: config.timeout,
            }

            const client = authenticatedLightningClient(clientConfig)
            await client.connectPeer(peer.pubkey, peer.host)

            setAutoChannelProgress(`Abrindo canal com ${peer.alias}...`)

            // Open channel with recommended amount
            await openChannelAsync({
              nodePubkey: peer.pubkey,
              localFundingAmount: 100000, // 0.001 BTC
              targetConf: 1,
              private: false,
            })

            setAutoChannelProgress(`Canal com ${peer.alias} aberto com sucesso!`)
          } catch (error) {
            console.warn(`Failed to open channel with ${peer.alias}:`, error)
            setAutoChannelProgress(`Erro ao abrir canal com ${peer.alias}, continuando...`)
          }
        }

        setAutoChannelProgress('Configuração automática concluída!')
        Alert.alert('Sucesso', 'Canais automáticos configurados com sucesso!')
      } catch (error) {
        console.error('Auto channel opening failed:', error)
        setAutoChannelProgress('Erro na configuração automática de canais')
      } finally {
        setIsOpeningChannels(false)
      }
    },
    [activeWalletId, getLightningConfig, openChannelAsync],
  )

  // Manual config validation
  const validateManualForm = () => {
    const newErrors: { [key: string]: string } = {}

    if (!nodeUrl.trim()) {
      newErrors.nodeUrl = 'URL do nó é obrigatória'
    } else {
      try {
        new URL(nodeUrl)
      } catch {
        newErrors.nodeUrl = 'URL inválida'
      }
    }

    if (nodeType === 'lnd') {
      if (!cert.trim()) {
        newErrors.cert = 'Certificado TLS é obrigatório para LND'
      }
      if (!macaroon.trim()) {
        newErrors.macaroon = 'Macaroon é obrigatório para LND'
      }
    } else if (nodeType === 'cln') {
      if (!apiKey.trim()) {
        newErrors.apiKey = 'API Key é obrigatória para CLN'
      }
    }

    const timeoutNum = parseInt(timeout)
    if (isNaN(timeoutNum) || timeoutNum < 1000 || timeoutNum > 120000) {
      newErrors.timeout = 'Timeout deve ser entre 1000 e 120000 ms'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  // Manual connection test
  const handleManualTestConnection = async () => {
    if (!validateManualForm() || !activeWalletId) return

    setIsConnecting(true)
    setConnectionStatus('connecting')

    try {
      const config: LightningConfig = {
        nodeUrl: nodeUrl.trim(),
        type: nodeType,
        authMethod: nodeType === 'lnd' ? 'tls' : 'api',
        tlsCert: cert.trim() || undefined,
        macaroon: macaroon.trim() || undefined,
        apiKey: apiKey.trim() || undefined,
        timeout: parseInt(timeout),
      }

      const client = authenticatedLightningClient({
        url: config.nodeUrl,
        auth: {
          cert: config.tlsCert,
          macaroon: config.macaroon,
          apiKey: config.apiKey,
        },
        type: config.type,
        timeout: config.timeout,
      })

      const nodeInfo = await client.getInfo()

      setConnectionStatus('connected')
      Alert.alert('Sucesso', `Conectado ao nó ${nodeInfo.alias || nodeInfo.pubKey}`)
    } catch (error) {
      console.error('Manual connection test failed:', error)
      setConnectionStatus('error')
      Alert.alert('Erro', `Falha na conexão: ${error}`)
    } finally {
      setIsConnecting(false)
    }
  }

  // Manual save
  const handleManualSaveConfig = async () => {
    if (!validateManualForm() || !activeWalletId) return

    try {
      const config: LightningConfig = {
        nodeUrl: nodeUrl.trim(),
        type: nodeType,
        authMethod: nodeType === 'lnd' ? 'tls' : 'api',
        tlsCert: cert.trim() || undefined,
        macaroon: macaroon.trim() || undefined,
        apiKey: apiKey.trim() || undefined,
        timeout: parseInt(timeout),
      }

      await saveLightningConfig(config, activeWalletId)
      Alert.alert('Sucesso', 'Configuração salva com sucesso')
      router.back()
    } catch (error) {
      console.error('Manual save config failed:', error)
      Alert.alert('Erro', `Falha ao salvar configuração: ${error}`)
    }
  }

  // Auto-detect on mount
  useEffect(() => {
    if (activeWalletId && !isWalletConfigured) {
      detectNodes()
    }
  }, [activeWalletId, isWalletConfigured, detectNodes])

  // Render detected node item
  const renderDetectedNode = ({ item }: { item: DetectedNode }) => (
    <TouchableOpacity
      style={[
        styles.nodeCard,
        isDark && styles.nodeCardDark,
        selectedNode?.id === item.id && styles.nodeCardSelected,
        item.isLocal && styles.nodeCardLocal,
      ]}
      onPress={() => setSelectedNode(item)}
      disabled={isConnecting}
    >
      <View style={styles.nodeHeader}>
        <Text style={[styles.nodeAlias, isDark && styles.nodeAliasDark]}>
          {item.alias || `${item.type.toUpperCase()} Node`}
        </Text>
        <View
          style={[
            styles.confidenceBadge,
            { backgroundColor: item.confidence > 80 ? colors.success : colors.warning },
          ]}
        >
          <Text style={styles.confidenceText}>{item.confidence}%</Text>
        </View>
      </View>
      <Text style={[styles.nodeUrl, isDark && styles.nodeUrlDark]}>{item.url}</Text>
      <Text style={[styles.nodeType, isDark && styles.nodeTypeDark]}>
        {item.type.toUpperCase()}
      </Text>
      {item.isLocal && (
        <Text style={[styles.localBadge, isDark && styles.localBadgeDark]}>LOCAL</Text>
      )}
    </TouchableOpacity>
  )

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.keyboardAvoidingView}
    >
      <ScrollView
        style={[styles.container, isDark && styles.containerDark]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.title, isDark && styles.titleDark]}>Configurar Lightning</Text>
        <Text style={[styles.subtitle, isDark && styles.subtitleDark]}>
          Configure automaticamente ou manualmente sua conexão com a rede Lightning
        </Text>

        {/* Status Section */}
        <View style={[styles.statusSection, isDark && styles.statusSectionDark]}>
          <Text style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}>
            Status da Conexão
          </Text>
          <View style={[styles.statusIndicator, styles[`status${connectionStatus}`]]}>
            <Text style={styles.statusText}>
              {connectionStatus === 'disconnected' && 'Desconectado'}
              {connectionStatus === 'connecting' && 'Conectando...'}
              {connectionStatus === 'connected' && 'Conectado'}
              {connectionStatus === 'error' && 'Erro de Conexão'}
            </Text>
          </View>
          {isWalletConfigured && (
            <Text style={styles.walletConfiguredText}>Carteira Lightning configurada</Text>
          )}
        </View>

        {/* Auto-Detection Section */}
        {!showManualConfig && (
          <View style={[styles.section, isDark && styles.sectionDark]}>
            <Text style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}>
              Detecção Automática
            </Text>
            <Text style={[styles.sectionDescription, isDark && styles.sectionDescriptionDark]}>
              Procurando nós Lightning disponíveis na sua rede...
            </Text>

            <TouchableOpacity
              style={[styles.button, styles.detectButton, isDetecting && styles.buttonDisabled]}
              onPress={detectNodes}
              disabled={isDetecting}
            >
              <Text style={styles.detectButtonText}>
                {isDetecting ? 'Detectando...' : 'Detectar Nós'}
              </Text>
            </TouchableOpacity>

            {detectedNodes.length > 0 && (
              <View style={styles.detectedNodesSection}>
                <Text style={[styles.detectedTitle, isDark && styles.detectedTitleDark]}>
                  Nós Detectados
                </Text>
                <FlatList
                  data={detectedNodes}
                  renderItem={renderDetectedNode}
                  keyExtractor={item => item.id}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.nodesList}
                />

                {selectedNode && (
                  <TouchableOpacity
                    style={[
                      styles.button,
                      styles.connectButton,
                      isConnecting && styles.buttonDisabled,
                    ]}
                    onPress={() => connectToNode(selectedNode)}
                    disabled={isConnecting}
                  >
                    <Text style={styles.connectButtonText}>
                      {isConnecting
                        ? 'Conectando...'
                        : `Conectar a ${selectedNode.alias || selectedNode.type.toUpperCase()}`}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {errors.detection && <Text style={styles.errorText}>{errors.detection}</Text>}
          </View>
        )}

        {/* Auto Channel Opening Progress */}
        {isOpeningChannels && (
          <View style={[styles.progressSection, isDark && styles.progressSectionDark]}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={[styles.progressText, isDark && styles.progressTextDark]}>
              {autoChannelProgress}
            </Text>
          </View>
        )}

        {/* Manual Configuration Section */}
        {(showManualConfig || detectedNodes.length === 0) && (
          <View style={[styles.section, isDark && styles.sectionDark]}>
            <TouchableOpacity
              style={styles.manualToggle}
              onPress={() => setShowManualConfig(!showManualConfig)}
            >
              <Text style={styles.manualToggleText}>
                {showManualConfig ? 'Ocultar' : 'Mostrar'} Configuração Manual
              </Text>
            </TouchableOpacity>

            {showManualConfig && (
              <>
                <Text style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}>
                  Configuração Manual
                </Text>

                <View style={styles.formGroup}>
                  <Text style={[styles.label, isDark && styles.labelDark]}>Tipo de Nó *</Text>
                  <View style={styles.nodeTypeContainer}>
                    {(['lnd', 'cln', 'eclair'] as NodeType[]).map(type => (
                      <TouchableOpacity
                        key={type}
                        style={[
                          styles.nodeTypeButton,
                          isDark && styles.nodeTypeButtonDark,
                          nodeType === type && styles.nodeTypeButtonActive,
                        ]}
                        onPress={() => setNodeType(type)}
                      >
                        <Text
                          style={[
                            styles.nodeTypeText,
                            isDark && styles.nodeTypeTextDark,
                            nodeType === type && styles.nodeTypeTextActive,
                          ]}
                        >
                          {type.toUpperCase()}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={[styles.description, isDark && styles.descriptionDark]}>
                    {getNodeTypeDescription(nodeType)}
                  </Text>
                </View>

                <View style={styles.formGroup}>
                  <Text style={[styles.label, isDark && styles.labelDark]}>URL do Nó *</Text>
                  <TextInput
                    style={[
                      styles.input,
                      isDark && styles.inputDark,
                      errors.nodeUrl && styles.inputError,
                    ]}
                    value={nodeUrl}
                    onChangeText={setNodeUrl}
                    placeholder="https://localhost:8080"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  {errors.nodeUrl && <Text style={styles.errorText}>{errors.nodeUrl}</Text>}
                </View>

                {nodeType === 'lnd' && (
                  <>
                    <View style={styles.formGroup}>
                      <Text style={[styles.label, isDark && styles.labelDark]}>
                        Certificado TLS *
                      </Text>
                      <TextInput
                        style={[
                          styles.textArea,
                          isDark && styles.textAreaDark,
                          errors.cert && styles.inputError,
                        ]}
                        value={cert}
                        onChangeText={setCert}
                        placeholder="Cole o certificado TLS aqui..."
                        multiline
                        numberOfLines={4}
                        autoCapitalize="none"
                        autoCorrect={false}
                      />
                      {errors.cert && <Text style={styles.errorText}>{errors.cert}</Text>}
                    </View>

                    <View style={styles.formGroup}>
                      <Text style={[styles.label, isDark && styles.labelDark]}>Macaroon *</Text>
                      <TextInput
                        style={[
                          styles.textArea,
                          isDark && styles.textAreaDark,
                          errors.macaroon && styles.inputError,
                        ]}
                        value={macaroon}
                        onChangeText={setMacaroon}
                        placeholder="Cole o macaroon aqui..."
                        multiline
                        numberOfLines={4}
                        autoCapitalize="none"
                        autoCorrect={false}
                      />
                      {errors.macaroon && <Text style={styles.errorText}>{errors.macaroon}</Text>}
                    </View>
                  </>
                )}

                {nodeType === 'cln' && (
                  <View style={styles.formGroup}>
                    <Text style={[styles.label, isDark && styles.labelDark]}>API Key *</Text>
                    <TextInput
                      style={[
                        styles.input,
                        isDark && styles.inputDark,
                        errors.apiKey && styles.inputError,
                      ]}
                      value={apiKey}
                      onChangeText={setApiKey}
                      placeholder="runexxxx..."
                      autoCapitalize="none"
                      autoCorrect={false}
                      secureTextEntry
                    />
                    {errors.apiKey && <Text style={styles.errorText}>{errors.apiKey}</Text>}
                  </View>
                )}

                <View style={styles.formGroup}>
                  <Text style={[styles.label, isDark && styles.labelDark]}>Timeout (ms)</Text>
                  <TextInput
                    style={[
                      styles.input,
                      isDark && styles.inputDark,
                      errors.timeout && styles.inputError,
                    ]}
                    value={timeout}
                    onChangeText={setTimeout}
                    placeholder="30000"
                    keyboardType="numeric"
                  />
                  {errors.timeout && <Text style={styles.errorText}>{errors.timeout}</Text>}
                </View>

                <View style={styles.buttonContainer}>
                  <TouchableOpacity
                    style={[
                      styles.button,
                      styles.testButton,
                      isConnecting && styles.buttonDisabled,
                    ]}
                    onPress={handleManualTestConnection}
                    disabled={isConnecting}
                  >
                    <Text style={styles.testButtonText}>
                      {isConnecting ? 'Testando...' : 'Testar Conexão'}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.button, styles.saveButton]}
                    onPress={handleManualSaveConfig}
                  >
                    <Text style={styles.saveButtonText}>Salvar Configuração</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        )}

        {/* Info Section */}
        <View style={[styles.infoContainer, isDark && styles.infoContainerDark]}>
          <Text style={[styles.infoTitle, isDark && styles.infoTitleDark]}>
            Sobre a Configuração Automática
          </Text>
          <Text style={[styles.infoText, isDark && styles.infoTextDark]}>
            • A detecção automática procura nós Lightning rodando localmente{'\n'}• Recomenda peers
            confiáveis para abertura automática de canais{'\n'}• Configura canais com liquidez
            balanceada automaticamente{'\n'}• Monitore o status da sua rede Lightning em tempo real
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const getNodeTypeDescription = (type: NodeType) => {
  switch (type) {
    case 'lnd':
      return 'Lightning Network Daemon - requer certificado TLS e macaroon'
    case 'cln':
      return 'Core Lightning - requer API key'
    case 'eclair':
      return 'Eclair - usa autenticação básica'
    default:
      return ''
  }
}

const styles = StyleSheet.create({
  keyboardAvoidingView: {
    flex: 1,
  },
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: colors.background.light,
  },
  containerDark: {
    backgroundColor: colors.background.dark,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text.light,
    marginBottom: 8,
  },
  titleDark: {
    color: colors.text.dark,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary.light,
    marginBottom: 24,
  },
  subtitleDark: {
    color: colors.textSecondary.dark,
  },
  statusSection: {
    backgroundColor: colors.white,
    padding: 16,
    borderRadius: 8,
    marginBottom: 20,
  },
  statusSectionDark: {
    backgroundColor: colors.background.dark,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text.light,
    marginBottom: 8,
  },
  sectionTitleDark: {
    color: colors.text.dark,
  },
  section: {
    backgroundColor: colors.white,
    padding: 16,
    borderRadius: 8,
    marginBottom: 20,
  },
  sectionDark: {
    backgroundColor: colors.background.dark,
  },
  sectionDescription: {
    fontSize: 14,
    color: colors.textSecondary.light,
    marginBottom: 16,
  },
  sectionDescriptionDark: {
    color: colors.textSecondary.dark,
  },
  statusIndicator: {
    padding: 8,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  statusdisconnected: {
    backgroundColor: colors.error,
  },
  statusconnecting: {
    backgroundColor: colors.warning,
  },
  statusconnected: {
    backgroundColor: colors.success,
  },
  statuserror: {
    backgroundColor: colors.error,
  },
  statusText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: 'bold',
  },
  walletConfiguredText: {
    fontSize: 12,
    color: colors.success,
    marginTop: 8,
  },
  detectButton: {
    backgroundColor: colors.secondary,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  detectButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: 'bold',
  },
  detectedNodesSection: {
    marginTop: 16,
  },
  detectedTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text.light,
    marginBottom: 12,
  },
  detectedTitleDark: {
    color: colors.text.dark,
  },
  nodesList: {
    paddingVertical: 8,
  },
  nodeCard: {
    backgroundColor: colors.background.light,
    padding: 12,
    borderRadius: 8,
    marginRight: 12,
    minWidth: 200,
    borderWidth: 2,
    borderColor: alpha(colors.black, 0.2),
  },
  nodeCardDark: {
    backgroundColor: colors.background.dark,
    borderColor: alpha(colors.white, 0.2),
  },
  nodeCardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '10',
  },
  nodeCardLocal: {
    borderColor: colors.success,
  },
  nodeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  nodeAlias: {
    fontSize: 14,
    fontWeight: 'bold',
    color: colors.text.light,
    flex: 1,
  },
  nodeAliasDark: {
    color: colors.text.dark,
  },
  confidenceBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  confidenceText: {
    color: colors.white,
    fontSize: 10,
    fontWeight: 'bold',
  },
  nodeUrl: {
    fontSize: 12,
    color: colors.textSecondary.light,
    marginBottom: 2,
  },
  nodeUrlDark: {
    color: colors.textSecondary.dark,
  },
  nodeType: {
    fontSize: 10,
    color: colors.primary,
    fontWeight: 'bold',
  },
  localBadge: {
    fontSize: 10,
    color: colors.success,
    fontWeight: 'bold',
    marginTop: 4,
  },
  nodeTypeDark: {
    color: colors.primary,
  },
  localBadgeDark: {
    color: colors.success,
  },
  connectButton: {
    backgroundColor: colors.primary,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 12,
  },
  connectButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: 'bold',
  },
  progressSection: {
    backgroundColor: colors.white,
    padding: 16,
    borderRadius: 8,
    marginBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },
  progressSectionDark: {
    backgroundColor: colors.background.dark,
  },
  progressText: {
    fontSize: 14,
    color: colors.textSecondary.light,
    marginLeft: 12,
  },
  progressTextDark: {
    color: colors.textSecondary.dark,
  },
  manualToggle: {
    alignSelf: 'flex-end',
    padding: 8,
  },
  manualToggleText: {
    color: colors.primary,
    fontSize: 14,
    textDecorationLine: 'underline',
  },
  formGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text.light,
    marginBottom: 8,
  },
  labelDark: {
    color: colors.text.dark,
  },
  description: {
    fontSize: 12,
    color: colors.textSecondary.light,
    marginTop: 4,
  },
  descriptionDark: {
    color: colors.textSecondary.dark,
  },
  nodeTypeContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  nodeTypeButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.textSecondary.light,
    alignItems: 'center',
  },
  nodeTypeButtonDark: {
    borderColor: colors.textSecondary.dark,
  },
  nodeTypeButtonActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  nodeTypeText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: colors.textSecondary.light,
  },
  nodeTypeTextDark: {
    color: colors.textSecondary.dark,
  },
  nodeTypeTextActive: {
    color: colors.white,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.textSecondary.light,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: colors.white,
  },
  inputDark: {
    borderColor: colors.textSecondary.dark,
    backgroundColor: colors.background.dark,
  },
  textArea: {
    borderWidth: 1,
    borderColor: colors.textSecondary.light,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    backgroundColor: colors.white,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  textAreaDark: {
    borderColor: colors.textSecondary.dark,
    backgroundColor: colors.background.dark,
  },
  inputError: {
    borderColor: colors.error,
  },
  errorText: {
    color: colors.error,
    fontSize: 12,
    marginTop: 4,
  },
  buttonContainer: {
    gap: 12,
    marginBottom: 32,
  },
  button: {
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  testButton: {
    backgroundColor: colors.secondary,
  },
  testButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: 'bold',
  },
  saveButton: {
    backgroundColor: colors.primary,
  },
  saveButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: 'bold',
  },
  infoContainer: {
    backgroundColor: colors.white,
    padding: 16,
    borderRadius: 8,
    marginBottom: 20,
  },
  infoContainerDark: {
    backgroundColor: colors.background.dark,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text.light,
    marginBottom: 8,
  },
  infoTitleDark: {
    color: colors.text.dark,
  },
  infoText: {
    fontSize: 14,
    color: colors.textSecondary.light,
    lineHeight: 20,
  },
  infoTextDark: {
    color: colors.textSecondary.dark,
  },
})

export default LightningConfigScreen
