# iHodl - Bitcoin Wallet Documentation

## Overview

iHodl is an open-source Bitcoin wallet application built with React Native and Expo. It provides robust functionality for managing Bitcoin wallets, supporting both standard online wallets and cold storage (offline) wallets for enhanced security.

## Key Features

- **Multiple Wallet Types**: Support for online and offline (cold) wallets
- **BIP Standard Compliance**: Implements BIP32, BIP49, and BIP84 for hierarchical deterministic wallets
- **SegWit Support**: Native support for SegWit addresses (P2WPKH, P2TR)
- **Transaction Management**: View and manage Bitcoin transactions
- **Enhanced Security**: Cold wallet support for keeping private keys offline
- **Bitcoin RPC Integration**: Connect to Bitcoin nodes via RPC

## Technical Architecture

### Wallet Core (wallet)

The Wallet class is the central component that manages wallet creation and access:

### Key Management (key)

Handles all cryptographic key operations:

- **createPublicKey**: Derives public keys from private keys
- **deriveFromPath**: Derives keys using BIP32 paths
- **privateKeyToWIF**: Converts private keys to WIF format
- **serializePublicKeyForSegWit**: Generates SegWit addresses

### Address Management (payment)

Provides functions for creating different Bitcoin address types:

- **p2pkh**: Pay-to-Public-Key-Hash scripts
- **p2sh**: Pay-to-Script-Hash scripts
- **p2wpkh**: Pay-to-Witness-Public-Key-Hash scripts
- **p2sh_p2wpkh**: P2SH-wrapped SegWit addresses

### Account Management (account)

Handles account discovery and balance management:

- **discover**: Discovers accounts and addresses
- **getBalance**: Gets balance for a specific address
- **getBalancesPerAddress**: Gets balances for multiple addresses

### Bitcoin RPC (rpc)

Provides interface to interact with Bitcoin nodes:

- **BitcoinRPC**: Class for making RPC calls to Bitcoin nodes
- Methods include: getBalance, listReceivedByAddress, createWallet, etc.

### Transactions (transaction)

Handles creating and managing transactions:

- **Transaction**: Class for creating and serializing Bitcoin transactions
- Supports SegWit transaction formats

## UI Components

### Wallet Creation

CreateWallet component allows users to:

- Create new wallets with custom names
- Toggle offline mode for cold wallet creation

### Wallet Details

WalletDetails component displays:

- Current wallet balance
- Send/Receive buttons
- Transaction history

### Transaction List

WalletTransactions component shows:

- List of transactions with dates, amounts, and addresses
- Transaction types (P2PKH, P2WPKH, P2TR)
- Network type (on-chain or Lightning Network)

## Data Management

- **WalletProvider**: React Context for wallet state
- **storage**: Secure storage using MMKV with encryption

## Implementation Details

### BIP Standards Support

The wallet implements:

- **BIP32**: Hierarchical Deterministic Wallets
- **BIP39**: Mnemonic code for generating deterministic keys
- **BIP49**: Derivation scheme for P2WPKH-nested-in-P2SH addresses
- **BIP84**: Derivation scheme for native SegWit addresses

### Address Types

The wallet supports:

- Legacy addresses (P2PKH)
- SegWit-compatible addresses (P2SH-P2WPKH)
- Native SegWit addresses (P2WPKH)
- Taproot addresses (P2TR) - in transaction display

### Security Features

- Cold wallet support for offline key generation and storage
- Encrypted local storage for wallet data
- No private key exposure in transaction signing

## Getting Started

To create a new wallet:

1. Navigate to the wallet screen
2. Select "Create New Wallet"
3. Enter a wallet name
4. Toggle "Offline mode" if you want a cold wallet
5. Press "Create wallet" button

## Development

The codebase is organized as:

- **app**: Application routes and screens
- **features**: Feature-specific components and logic
- **shared**: Shared utilities, Bitcoin library, and UI components

### Key Dependencies

- React Native with Expo
- Noble hashes for cryptographic operations
- MMKV for secure storage
- Secp256k1 for elliptic curve operations
- Bech32 for address encoding

## Future Development

Potential areas for enhancement:

- Lightning Network integration (partial support already visible in UI)
- Multi-signature wallet support
- Hardware wallet integration
- Enhanced transaction fee management