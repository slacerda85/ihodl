import {
  createChecksum,
  hash160,
  hmacSeed,
  hmacSHA512,
  toBase58,
  uint8ArrayToHex,
} from '@/shared/lib/bitcoin/crypto'
import { bech32 } from 'bech32'
import { entropyToMnemonic, mnemonicToSeedSync } from '@/shared/lib/bitcoin/bip39'
import wordList from 'bip39/src/wordlists/english.json'
import { hmac } from '@noble/hashes/hmac'
import secp256k1 from 'secp256k1'

export function toMnemonic(entropy: Uint8Array): string {
  // check if nBytes is a valid length of 128, 160, 192, 224, or 256 bits
  if (entropy.length % 4 !== 0 || entropy.length < 16 || entropy.length > 32) {
    throw new Error('Invalid mnemonic length')
  }
  return entropyToMnemonic(uint8ArrayToHex(entropy), wordList)
}

export function fromMnemonic(mnemonic: string): Uint8Array {
  const seed = mnemonicToSeedSync(mnemonic)
  return seed
}

// bip32 master key creation
export function createMasterKey(entropy: Uint8Array): {
  masterKey: Uint8Array
  chainCode: Uint8Array
} {
  const extendedSeed = hmacSeed(entropy)
  const masterKey = extendedSeed.subarray(0, 32)

  if (!secp256k1.privateKeyVerify(masterKey)) {
    throw new Error('This entropy cannot generate a valid ECDSA private key')
  }

  const chainCode = extendedSeed.subarray(32)

  return { masterKey, chainCode }
}

export function createPublicKey(privateKey: Uint8Array): Uint8Array {
  // check if the private key is valid
  if (!secp256k1.privateKeyVerify(privateKey)) {
    throw new Error('Invalid private key')
  }

  let publicKey

  do {
    publicKey = secp256k1.publicKeyCreate(privateKey)
  } while (!secp256k1.publicKeyVerify(publicKey))

  return publicKey
}

/* function deriveChildPrivateKeyOld(privateKey: Buffer, chainCode: Buffer, index: number) {
  const isHardened = index >= 0x80000000;
  const n = BigInt(
    "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141"
  );

  // mount the data to be hashed
  const privateKeyPadding = Buffer.allocUnsafe(1);
  privateKeyPadding.writeUInt8(0, 0);

  const indexBuffer = Buffer.allocUnsafe(4);
  indexBuffer.writeUInt32BE(index, 0);

  const key = isHardened
    ? Buffer.concat([privateKeyPadding, privateKey])
    : createPublicKey(privateKey);

  const data = Buffer.concat([key, indexBuffer]);
  const hmac = createHmac("sha512", chainCode).update(data).digest();
  const derivedKey = hmac.subarray(0, 32);
  const childChainCode = hmac.subarray(32);
  const parse256IL = BigInt(`0x${derivedKey.toString("hex")}`);
  if (parse256IL >= n) {
    throw new Error(
      "Derived key is invalid (greater or equal to curve order)."
    );
  }

  const kpar = BigInt(`0x${privateKey.toString("hex")}`);
  const ki = (parse256IL + kpar) % n;

  if (ki === BigInt(0)) {
    throw new Error("Derived key is invalid (zero value).");
  }

  const childKey = Buffer.from(ki.toString(16).padStart(64, "0"), "hex");

  return { childKey, childChainCode };
} */

function deriveChildPrivateKey(privateKey: Uint8Array, chainCode: Uint8Array, index: number) {
  const isHardened = index >= 0x80000000
  const n = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141')

  // mount the data to be hashed
  const privateKeyPadding = new Uint8Array(1)
  const paddingView = new DataView(privateKeyPadding.buffer)
  paddingView.setUint8(0, 0)

  const indexBuffer = new Uint8Array(4)
  const indexView = new DataView(indexBuffer.buffer)
  indexView.setUint32(0, index, false) // false for big-endian

  // Create key for HMAC
  const key = isHardened
    ? new Uint8Array([...privateKeyPadding, ...privateKey])
    : createPublicKey(privateKey)

  // Combine key and index
  const data = new Uint8Array(key.length + indexBuffer.length)
  data.set(key)
  data.set(indexBuffer, key.length)

  // Generate HMAC
  const hmac = hmacSHA512(chainCode, data) // createHmac("sha512", chainCode).update(data).digest();
  const derivedKey = hmac.subarray(0, 32)
  const childChainCode = hmac.subarray(32)

  // Convert derived key to hex string then to BigInt
  const derivedHex = Array.from(derivedKey)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
  const parse256IL = BigInt(`0x${derivedHex}`)

  if (parse256IL >= n) {
    throw new Error('Derived key is invalid (greater or equal to curve order).')
  }

  // Convert private key to hex string then to BigInt
  const privateKeyHex = Array.from(privateKey)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
  const kpar = BigInt(`0x${privateKeyHex}`)
  const ki = (parse256IL + kpar) % n

  if (ki === BigInt(0)) {
    throw new Error('Derived key is invalid (zero value).')
  }

  // Convert result back to Uint8Array
  const childKeyHex = ki.toString(16).padStart(64, '0')
  const childKey = new Uint8Array(childKeyHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)))

  return { childKey, childChainCode }
}

function createHardenedIndex(index: number): number {
  const HARDENED_OFFSET = 0x80000000 // This is 2^31 in hexadecimal
  return index + HARDENED_OFFSET
}

/* function getParentFingerprint(publicKey: Buffer): number {
  const hash = hash160(publicKey);
  const parentFingerprint = Buffer.from(hash.subarray(0, 4)).readUInt32BE(0);

  return parentFingerprint;
} */

function getParentFingerprint(publicKey: Uint8Array): number {
  const hash = hash160(publicKey)
  // Convert first 4 bytes to a number using DataView
  const view = new DataView(hash.buffer, 0, 4)
  const parentFingerprint = view.getUint32(0)
  return parentFingerprint
}

function convertPathToArray(path: string) {
  const pathArray: number[] = []
  const segments = path.split('/')
  // check if first segment is "m" and remove it]
  if (segments[0] === 'm') {
    segments.shift()
  }

  segments.forEach(segment => {
    if (segment.endsWith("'")) {
      pathArray.push(createHardenedIndex(parseInt(segment.slice(0, -1), 10)))
    } else {
      pathArray.push(parseInt(segment, 10))
    }
  })

  return pathArray
}

export function deriveFromPath(
  privateKey: Uint8Array,
  chainCode: Uint8Array,
  path: string,
): {
  derivedKey: Uint8Array
  derivedChainCode: Uint8Array
  childIndex: number
  parentFingerprint: number
  depth: number
} {
  if (privateKey.length !== 32) {
    throw new Error('Invalid master key')
  }
  /* const pathArray = path.split("/");
  if (pathArray[0] !== "m") {
    throw new Error("Invalid path");
  } */
  if (path === 'm') {
    return {
      derivedKey: privateKey,
      derivedChainCode: chainCode,
      childIndex: 0,
      parentFingerprint: 0,
      depth: 0,
    }
  }
  // split the path into segments
  const segments = convertPathToArray(path)
  let privKey = privateKey
  let chain = chainCode
  let parentFingerprint = 0
  let childNumber = 0
  let depth = 0

  // iterate over the path segments of bip32
  for (let i = 0; i < segments.length; i++) {
    const index = segments[i]
    const { childKey, childChainCode } = deriveChildPrivateKey(privKey, chain, index)
    const parentPublicKey = createPublicKey(privKey)
    parentFingerprint = getParentFingerprint(parentPublicKey)
    privKey = childKey
    chain = childChainCode
    childNumber = index
    depth++
  }

  return {
    derivedKey: privKey,
    derivedChainCode: chain,
    childIndex: childNumber,
    parentFingerprint,
    depth,
  }
}

export function serializePrivateKey(
  privateKey: Uint8Array,
  chainCode: Uint8Array,
  depth: number = 0,
  parentFingerprint: number = 0,
  childIndex: number = 0,
  version: Uint8Array,
): Uint8Array {
  // check valid private key
  if (!secp256k1.privateKeyVerify(privateKey)) {
    throw new Error('Invalid private key')
  }
  // check valid chain code
  if (chainCode.length !== 32) {
    throw new Error('Invalid chain code')
  }
  // check valid depth
  if (depth > 255) {
    throw new Error('Invalid depth')
  }
  // check valid parent fingerprint
  if (parentFingerprint > 0xffffffff) {
    throw new Error('Invalid parent fingerprint')
  }
  // check valid child index
  if (childIndex > 0xffffffff) {
    throw new Error('Invalid child index')
  }

  // serialize private key
  // mount private key buffer (78 bytes)
  const privateKeyBuffer = new Uint8Array(78)
  const view = new DataView(privateKeyBuffer.buffer)

  // version number (4 bytes)
  const versionHex = Array.from(version)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
  const versionNumber = parseInt(versionHex, 16)
  view.setUint32(0, versionNumber, false) // false for big-endian

  // depth (1 byte)
  view.setUint8(4, depth)

  // parent fingerprint (4 bytes)
  view.setUint32(5, parentFingerprint, false)

  // child index (4 bytes)
  view.setUint32(9, childIndex, false)

  // chain code (32 bytes)
  privateKeyBuffer.set(chainCode, 13)

  // 0x00 padding (1 byte)
  view.setUint8(45, 0)

  // private key (32 bytes)
  privateKeyBuffer.set(privateKey, 46)

  // create checksum (4 bytes)
  const checksum = createChecksum(privateKeyBuffer)

  // combine everything
  const finalKey = new Uint8Array(82) // 78 + 4 bytes
  finalKey.set(privateKeyBuffer)
  finalKey.set(checksum, 78)

  return finalKey
}

export function serializePublicKey(
  publicKey: Uint8Array,
  chainCode: Uint8Array,
  depth: number = 0,
  parentFingerprint: number = 0,
  childIndex: number = 0,
  version: Uint8Array,
): Uint8Array {
  // check valid public key
  if (!secp256k1.publicKeyVerify(publicKey)) {
    throw new Error('Invalid public key')
  }
  // check valid depth
  if (depth > 255) {
    throw new Error('Invalid depth')
  }
  // check valid parent fingerprint
  if (parentFingerprint > 0xffffffff) {
    throw new Error('Invalid parent fingerprint')
  }
  // check valid child index
  if (childIndex > 0xffffffff) {
    throw new Error('Invalid child index')
  }
  // serialize public key
  // mount public key buffer (78 bytes)
  const publicKeyBuffer = new Uint8Array(78)
  const view = new DataView(publicKeyBuffer.buffer)

  // version number (4 bytes)
  const versionHex = Array.from(version)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
  const versionNumber = parseInt(versionHex, 16)
  view.setUint32(0, versionNumber, false) // false for big-endian

  // depth (1 byte)
  view.setUint8(4, depth)

  // parent fingerprint (4 bytes)
  view.setUint32(5, parentFingerprint, false)

  // child index (4 bytes)
  view.setUint32(9, childIndex, false)

  // chain code (32 bytes)
  publicKeyBuffer.set(chainCode, 13)

  // public key (33 bytes)
  publicKeyBuffer.set(publicKey, 45)

  // create checksum (4 bytes)
  const checksum = createChecksum(publicKeyBuffer)

  // combine everything
  const finalKey = new Uint8Array(82) // 78 + 4 bytes
  finalKey.set(publicKeyBuffer)
  finalKey.set(checksum, 78)

  return finalKey
}

export function serializePublicKeyForSegWitOld(publicKey: Buffer, version: number = 0): string {
  // Check if the public key is valid
  if (!secp256k1.publicKeyVerify(publicKey)) {
    throw new Error('Invalid public key')
  }

  // Hash the public key using SHA256 and then RIPEMD160
  const hash = hash160(publicKey)

  // Convert the hash to words (5-bit groups)
  const programWords = bech32.toWords(hash)

  // Prepend the version byte to the words array
  const words = [version, ...programWords]

  // Encode using Bech32
  const segWitAddress = bech32.encode('bc', words)

  return segWitAddress
}

export function serializePublicKeyForSegWit(publicKey: Uint8Array, version: number = 0): string {
  // Check if the public key is valid
  if (!secp256k1.publicKeyVerify(publicKey)) {
    throw new Error('Invalid public key')
  }

  // Hash the public key using SHA256 and then RIPEMD160
  const hash = hash160(publicKey)

  // Convert the hash to words (5-bit groups)
  const programWords = bech32.toWords(hash)

  // Prepend the version byte to the words array
  const words = [version, ...programWords]

  // Encode using Bech32
  const segWitAddress = bech32.encode('bc', words)

  return segWitAddress
}

export function privateKeyToWIF(privateKey: Uint8Array, compressed: boolean = true): string {
  const version = new Uint8Array([0x80]) // Mainnet prefix
  const compressedFlag = compressed ? new Uint8Array([0x01]) : new Uint8Array(0)

  // Combine arrays
  const keyWithVersion = new Uint8Array(version.length + privateKey.length + compressedFlag.length)
  keyWithVersion.set(version)
  keyWithVersion.set(privateKey, version.length)
  keyWithVersion.set(compressedFlag, version.length + privateKey.length)

  // Create checksum
  const checksum = createChecksum(keyWithVersion)

  // Combine with checksum
  const wifBuffer = new Uint8Array(keyWithVersion.length + checksum.length)
  wifBuffer.set(keyWithVersion)
  wifBuffer.set(checksum, keyWithVersion.length)

  return toBase58(wifBuffer)
}
