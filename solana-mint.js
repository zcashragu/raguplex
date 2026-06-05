'use strict';
/**
 * Solana mint path — Metaplex Core (the recommended Solana NFT standard).
 *
 * The whole point: a Core asset's `uri` is set to the SAME ipfs:// string a
 * Zcash Z721 token references. One metadata file, two chains.
 *
 * Unlike the Zcash side, there is almost no protocol to implement here —
 * ownership, transfers, and indexing are handled by the Core program and the
 * DAS API. We just create assets.
 *
 * Pure arg-builders (buildAssetArgs / buildCollectionArgs) are testable without
 * a node; the Minter methods do the real on-chain create.
 */

const { tokenUri, collectionUri } = require('./metadata');

/**
 * Pure: the create() args for a single Core asset, with uri pointing at the
 * shared IPFS metadata. `index` ties it to the same metadata file Z721 uses.
 */
function buildAssetArgs({ rootCid, index, name, collectionPubkey, royaltyBps, creators }) {
  const args = { name, uri: tokenUri(rootCid, index) };
  if (collectionPubkey) args.collection = collectionPubkey;
  if (royaltyBps != null) {
    args.plugins = [{
      type: 'Royalties',
      basisPoints: royaltyBps,
      creators: creators || [],
      ruleSet: { type: 'None' },
    }];
  }
  return args;
}

/** Pure: the createCollection() args, uri pointing at collection.json. */
function buildCollectionArgs({ rootCid, name, royaltyBps, creators }) {
  const args = { name, uri: collectionUri(rootCid) };
  if (royaltyBps != null) {
    args.plugins = [{
      type: 'Royalties', basisPoints: royaltyBps,
      creators: creators || [], ruleSet: { type: 'None' },
    }];
  }
  return args;
}

class SolanaMinter {
  /**
   * @param {object} cfg { endpoint, keypair }  keypair: Umi-compatible signer secret
   * Lazy-loads the SDK so the rest of the project runs without Solana deps present.
   */
  constructor({ endpoint, keypairSecret } = {}) {
    this.endpoint = endpoint || process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
    this._keypairSecret = keypairSecret;
    this._umi = null;
  }

  _umiInstance() {
    if (this._umi) return this._umi;
    const { createUmi } = require('@metaplex-foundation/umi-bundle-defaults');
    const { mplCore } = require('@metaplex-foundation/mpl-core');
    const { keypairIdentity, generateSigner } = require('@metaplex-foundation/umi');
    const umi = createUmi(this.endpoint).use(mplCore());
    if (this._keypairSecret) {
      const kp = umi.eddsa.createKeypairFromSecretKey(Uint8Array.from(this._keypairSecret));
      umi.use(keypairIdentity(kp));
    }
    this._umi = umi;
    this._generateSigner = generateSigner;
    return umi;
  }

  /** Create a Core collection. Returns the collection public key (string). */
  async deployCollection({ rootCid, name, royaltyBps, creators }) {
    const umi = this._umiInstance();
    const { createCollection } = require('@metaplex-foundation/mpl-core');
    const collection = this._generateSigner(umi);
    const args = buildCollectionArgs({ rootCid, name, royaltyBps, creators });
    await createCollection(umi, { collection, ...args }).sendAndConfirm(umi);
    return collection.publicKey.toString();
  }

  /** Mint one Core asset to `ownerPubkey`. Returns the asset public key (string). */
  async mint({ rootCid, index, name, collectionPubkey, ownerPubkey, royaltyBps, creators }) {
    const umi = this._umiInstance();
    const { create } = require('@metaplex-foundation/mpl-core');
    const asset = this._generateSigner(umi);
    const args = buildAssetArgs({ rootCid, index, name, collectionPubkey, royaltyBps, creators });
    if (ownerPubkey) args.owner = ownerPubkey;
    await create(umi, { asset, ...args }).sendAndConfirm(umi);
    return asset.publicKey.toString();
  }
}

module.exports = { SolanaMinter, buildAssetArgs, buildCollectionArgs };
