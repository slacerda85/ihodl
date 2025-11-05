// Test script for Lightning Network client implementations
import { createLightningClient, LightningClientConfig } from './src/lib/lightning'

async function testLightningClients() {
  console.log('Testing Lightning Network client implementations...\n')

  // Test configurations for different node types
  const configs: { [key: string]: LightningClientConfig } = {
    lnd: {
      url: 'http://localhost:8080',
      auth: {
        macaroon: 'mock-macaroon',
      },
      type: 'lnd',
      timeout: 5000,
    },
    cln: {
      url: 'http://localhost:9737',
      auth: {
        apiKey: 'mock-api-key',
      },
      type: 'cln',
      timeout: 5000,
    },
    eclair: {
      url: 'http://localhost:8081',
      auth: {},
      type: 'eclair',
      timeout: 5000,
    },
  }

  for (const [nodeType, config] of Object.entries(configs)) {
    console.log(`Testing ${nodeType.toUpperCase()} client...`)

    try {
      const client = createLightningClient(config)
      console.log(`✓ ${nodeType.toUpperCase()} client created successfully`)

      // Test getInfo (will fail due to no real node, but should not throw implementation errors)
      try {
        await client.getInfo()
      } catch (error: any) {
        if (error.message.includes('not implemented')) {
          console.log(`✗ ${nodeType.toUpperCase()} getInfo not implemented`)
        } else {
          console.log(
            `✓ ${nodeType.toUpperCase()} getInfo implemented (expected connection error: ${error.message.split(':')[0]})`,
          )
        }
      }

      // Test createInvoice
      try {
        await client.createInvoice({
          amount: 1000,
          description: 'Test invoice',
        })
      } catch (error: any) {
        if (error.message.includes('not implemented')) {
          console.log(`✗ ${nodeType.toUpperCase()} createInvoice not implemented`)
        } else {
          console.log(
            `✓ ${nodeType.toUpperCase()} createInvoice implemented (expected connection error: ${error.message.split(':')[0]})`,
          )
        }
      }
    } catch (error) {
      console.log(`✗ ${nodeType.toUpperCase()} client creation failed:`, error)
    }

    console.log()
  }

  console.log('Lightning Network client testing completed!')
}

// Run the test
testLightningClients().catch(console.error)
