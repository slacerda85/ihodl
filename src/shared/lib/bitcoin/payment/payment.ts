import { hash160, op } from '@/shared/lib/bitcoin/crypto'

/**
 * Cria um script P2PKH (Pay-to-Public-Key-Hash)
 * @param publicKeyHash - O hash da chave pública (20 bytes)
 * @returns Buffer contendo o script P2PKH
 */
export function p2pkh(publicKeyHash: Buffer): Buffer {
  // P2PKH script structure:
  // OP_DUP OP_HASH160 <publicKeyHash> OP_EQUALVERIFY OP_CHECKSIG
  return Buffer.concat([
    op.OP_DUP, // Duplica o valor no topo da pilha (a assinatura será verificada com a chave pública)
    op.OP_HASH160, // Hasha os próximos 20 bytes com RIPEMD-160 após SHA-256
    Buffer.from([publicKeyHash.length]), // Push o tamanho da hash
    publicKeyHash, // The hash of the public key
    op.OP_EQUALVERIFY, // Verifica se o hash da chave pública fornecida é igual ao que está no script
    op.OP_CHECKSIG, // Verifica a assinatura com a chave pública
  ])
}

/**
 * Cria um script P2SH (Pay-to-Script-Hash)
 * @param redeemScriptHash - O hash do script de resgate (20 bytes)
 * @returns Buffer contendo o script P2SH
 */
export function p2sh(redeemScriptHash: Buffer): Buffer {
  // P2SH script structure:
  // OP_HASH160 <redeemScriptHash> OP_EQUAL
  return Buffer.concat([
    op.OP_HASH160, // Hasha os próximos 20 bytes com RIPEMD-160
    Buffer.from([redeemScriptHash.length]), // Push o tamanho do hash do script de resgate
    redeemScriptHash, // The hash of the redeem script
    op.OP_EQUAL, // Verifica se o hash do script fornecido é igual ao que está no script
  ])
}

/**
 * Cria um script P2WPKH (Pay-to-Witness-Public-Key-Hash)
 * @param publicKeyHash - O hash da chave pública (20 bytes)
 * @returns Buffer contendo o script P2WPKH
 */
export function p2wpkh(publicKeyHash: Buffer): Buffer {
  // P2WPKH script structure:
  // 0 <publicKeyHash> (Note: This is a bit different from P2PKH due to SegWit)
  return Buffer.concat([
    op.OP_0, // Version byte for P2WPKH, indicating this is a SegWit output
    Buffer.from([20]), // Push the length of the public key hash
    publicKeyHash, // The hash of the public key
  ])
}

// Note: P2SH-wrapped P2WPKH (SegWit compatibility for older wallets) would look like this:
// export function p2sh_p2wpkh(publicKeyHash: Buffer): Buffer {
//   const witnessScript = p2wpkh(publicKeyHash);
//   const redeemScriptHash = hash160(witnessScript); // Hash the witness script
//   return p2sh(redeemScriptHash);
// }

// Adicionando um exemplo de como usar a função p2sh_p2wpkh, já que é uma variante comum:

/**
 * Cria um script P2SH que envolve um script P2WPKH (para compatibilidade com wallets antigas)
 * @param publicKeyHash - O hash da chave pública (20 bytes)
 * @returns Buffer contendo o script P2SH-wrapped P2WPKH
 */
export function p2sh_p2wpkh(publicKeyHash: Buffer): Buffer {
  const witnessScript = p2wpkh(publicKeyHash)
  const redeemScriptHash = hash160(witnessScript)
  return p2sh(redeemScriptHash)
}
