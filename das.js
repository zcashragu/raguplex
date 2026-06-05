'use strict';
/**
 * Solana Digital Asset Standard (DAS) API client.
 *
 * This is why the Solana side needs no custom indexer: DAS already indexes all
 * Solana NFTs (including Metaplex Core assets) behind a standard JSON-RPC
 * surface. Use a DAS-capable RPC endpoint (Helius, Triton, QuickNode, etc.).
 */

class DasClient {
  constructor({ endpoint } = {}) {
    this.endpoint = endpoint || process.env.SOLANA_DAS_URL || process.env.SOLANA_RPC_URL;
    this._id = 0;
  }
  async _rpc(method, params) {
    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++this._id, method, params }),
    });
    const json = await res.json();
    if (json.error) throw new Error(`DAS ${method}: ${json.error.message || JSON.stringify(json.error)}`);
    return json.result;
  }
  getAsset(id) { return this._rpc('getAsset', { id }); }
  getAssetsByOwner(ownerAddress, { page = 1, limit = 1000 } = {}) {
    return this._rpc('getAssetsByOwner', { ownerAddress, page, limit });
  }
  getAssetsByGroup(groupValue, { page = 1, limit = 1000 } = {}) {
    return this._rpc('getAssetsByGroup', { groupKey: 'collection', groupValue, page, limit });
  }
}

/** Normalize a DAS asset into the unified token shape. Defensive about shape. */
function normalizeDasAsset(asset) {
  const content = asset.content || {};
  const meta = content.metadata || {};
  const links = content.links || {};
  const grouping = Array.isArray(asset.grouping) ? asset.grouping : [];
  const collection = grouping.find(g => g.group_key === 'collection');
  return {
    chain: 'solana',
    collectionId: collection ? collection.group_value : null,
    tokenId: asset.id,
    owner: asset.ownership ? asset.ownership.owner : null,
    name: meta.name || null,
    image: links.image || null,
    uri: content.json_uri || null,
    attributes: meta.attributes || [],
    status: asset.burnt ? 'burned' : 'active',
    standard: asset.interface || null,
  };
}

/** Keep only NFT-like assets (Core / Token Metadata NFTs), skip fungibles. */
function isNftAsset(asset) {
  const i = asset.interface;
  return i === 'MplCoreAsset' || i === 'V1_NFT' || i === 'ProgrammableNFT' || i === 'LEGACY_NFT';
}

module.exports = { DasClient, normalizeDasAsset, isNftAsset };
