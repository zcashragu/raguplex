'use strict';
/**
 * Unified catalog — one normalized interface over both chains.
 *
 * Common token shape (every adapter returns this):
 *   { chain, collectionId, tokenId, owner, name, image, uri, attributes, status }
 *
 * Zcash data comes from the Z721 indexer (which only knows collection+index+owner),
 * so names/images are resolved from the shared IPFS metadata. Solana data comes
 * from DAS, which already carries names/images. The catalog hides that asymmetry.
 */

const { tokenUri } = require('./metadata');
const { normalizeDasAsset, isNftAsset } = require('./das');

// ---- Zcash adapter (wraps the Z721 indexer) -------------------------------
class ZcashAdapter {
  /**
   * @param {Indexer} indexer
   * @param {object} opts { resolveMetadata }  resolveMetadata: async (uri) => {name,image,attributes}
   *        In prod, resolveMetadata fetches the IPFS JSON via a gateway (with caching).
   */
  constructor(indexer, { resolveMetadata } = {}) {
    this.indexer = indexer;
    this.resolveMetadata = resolveMetadata || (async () => ({}));
  }

  async _normalize(token) {
    const col = this.indexer.getCollection(token.collection);
    const uri = col ? tokenUri(col.rootCid, token.index) : null;
    let meta = {};
    if (uri) { try { meta = await this.resolveMetadata(uri); } catch (_) { meta = {}; } }
    return {
      chain: 'zcash',
      collectionId: token.collection,
      tokenId: String(token.index),
      owner: token.owner,
      name: meta.name || null,
      image: meta.image || null,
      uri,
      attributes: meta.attributes || [],
      status: token.burned ? 'burned' : 'active',
      standard: 'Z721',
    };
  }

  async getToken(collectionId, tokenId) {
    const t = this.indexer.getToken(collectionId, Number(tokenId));
    return t ? this._normalize(t) : null;
  }
  async getTokensByOwner(address) {
    return Promise.all(this.indexer.tokensByOwner(address).map(t => this._normalize(t)));
  }
  async listCollections() {
    return this.indexer.listCollections().map(c => ({
      chain: 'zcash', collectionId: c.txid, rootCid: c.rootCid,
      maxSupply: c.maxSupply, minted: c.minted,
    }));
  }
}

// ---- Solana adapter (wraps DAS) -------------------------------------------
class SolanaAdapter {
  constructor(dasClient) { this.das = dasClient; }

  async getToken(_collectionId, tokenId) {
    const a = await this.das.getAsset(tokenId);
    return a ? normalizeDasAsset(a) : null;
  }
  async getTokensByOwner(address) {
    const res = await this.das.getAssetsByOwner(address);
    const items = (res && res.items) || [];
    return items.filter(isNftAsset).map(normalizeDasAsset);
  }
  async getCollectionTokens(collectionId) {
    const res = await this.das.getAssetsByGroup(collectionId);
    const items = (res && res.items) || [];
    return items.filter(isNftAsset).map(normalizeDasAsset);
  }
}

// ---- Unified catalog -------------------------------------------------------
class UnifiedCatalog {
  constructor({ zcash, solana } = {}) {
    this.adapters = { zcash, solana };
  }

  /**
   * Merge a user's holdings across chains. Accepts per-chain addresses since
   * address formats differ. Returns one normalized list.
   */
  async tokensByOwner({ zcashAddr, solanaAddr } = {}) {
    const out = [];
    if (zcashAddr && this.adapters.zcash) out.push(...await this.adapters.zcash.getTokensByOwner(zcashAddr));
    if (solanaAddr && this.adapters.solana) out.push(...await this.adapters.solana.getTokensByOwner(solanaAddr));
    return out;
  }

  async getToken(chain, collectionId, tokenId) {
    const a = this.adapters[chain];
    if (!a) throw new Error('unknown chain ' + chain);
    return a.getToken(collectionId, tokenId);
  }

  async listCollections() {
    const out = [];
    if (this.adapters.zcash) out.push(...await this.adapters.zcash.listCollections());
    // Solana collections are discovered per-query via DAS groups; listing all
    // would require a known set of collection pubkeys (config-driven in prod).
    return out;
  }
}

// ---- REST gateway ----------------------------------------------------------
function createServer(catalog) {
  const express = require('express');
  const app = express();
  app.get('/health', (_req, res) => res.json({ ok: true }));
  app.get('/catalog/collections', async (_req, res) => res.json(await catalog.listCollections()));
  app.get('/catalog/tokens/:chain/:collection/:id', async (req, res) => {
    try {
      const t = await catalog.getToken(req.params.chain, req.params.collection, req.params.id);
      if (!t) return res.status(404).json({ error: 'not found' });
      res.json(t);
    } catch (e) { res.status(400).json({ error: e.message }); }
  });
  // GET /catalog/owners?zcash=t1...&solana=Sol...
  app.get('/catalog/owners', async (req, res) => {
    const tokens = await catalog.tokensByOwner({ zcashAddr: req.query.zcash, solanaAddr: req.query.solana });
    res.json({ count: tokens.length, tokens });
  });
  return app;
}

module.exports = { ZcashAdapter, SolanaAdapter, UnifiedCatalog, createServer };
