'use strict';
/**
 * Shared off-chain layer (SPEC.md §5).
 *
 * This is the ONE thing both chains genuinely share: the metadata JSON and its
 * IPFS addressing. A Zcash Z721 mint references `tokenUri(root, i)`, and a
 * Solana Core asset's `uri` is set to the *same string*. Same CID, same file,
 * two chains. Keep this module the single source of truth for the convention.
 */

/** Canonical per-token metadata URI: ipfs://<rootCID>/<index>.json */
function tokenUri(rootCid, index) {
  if (!rootCid) throw new Error('rootCid required');
  return `ipfs://${rootCid}/${index}.json`;
}

/** Collection-level manifest URI: ipfs://<rootCID>/collection.json */
function collectionUri(rootCid) {
  if (!rootCid) throw new Error('rootCid required');
  return `ipfs://${rootCid}/collection.json`;
}

/** Standard token metadata JSON (works for both Z721 and Metaplex Core). */
function buildTokenMetadata({ name, description = '', image, attributes = [] }) {
  if (!name || !image) throw new Error('name and image required');
  return { name, description, image, attributes };
}

/** Resolve ipfs:// to an https gateway URL (for display, and for DAS json_uri). */
function toGateway(uri, gateway = 'https://ipfs.io/ipfs/') {
  if (!uri) return uri;
  if (uri.startsWith('ipfs://')) return gateway + uri.slice('ipfs://'.length);
  return uri;
}

module.exports = { tokenUri, collectionUri, buildTokenMetadata, toGateway };
