const assert = require('assert');
const { Indexer } = require('./indexer');
const { FixtureChainSource } = require('./chainsource');
const { blocks, DEPLOY_TXID, ALICE } = require('./fixtures');
const { tokenUri } = require('./metadata');
const { ZcashAdapter, SolanaAdapter, UnifiedCatalog } = require('./unified');

(async () => {
  // --- Zcash side: real indexer over the fixture chain (Alice owns token #1) ---
  const ix = new Indexer(new FixtureChainSource(blocks));
  await ix.sync({ from: blocks[0].height });

  // mock IPFS metadata resolver (in prod: fetch ipfs:// via gateway, cached)
  const ROOT = ix.getCollection(DEPLOY_TXID).rootCid;
  const fakeIpfs = {
    [tokenUri(ROOT, 1)]: { name: 'Genesis #1', image: `ipfs://${ROOT}/1.png`, attributes: [{ trait_type: 'Tier', value: 'OG' }] },
  };
  const zcash = new ZcashAdapter(ix, { resolveMetadata: async (uri) => fakeIpfs[uri] || {} });

  // --- Solana side: mock DAS client returning one Core asset for a wallet,
  //     pointing at the SAME IPFS root (index 7) to show the shared layer ---
  const SOL_WALLET = 'So1Wa11et1111111111111111111111111111111111';
  const SOL_COLLECTION = 'C0LLeC7ion1111111111111111111111111111111111';
  const mockDas = {
    async getAssetsByOwner(owner) {
      assert(owner === SOL_WALLET, 'queried right wallet');
      return { items: [{
        interface: 'MplCoreAsset',
        id: 'AsSe7Pubkey111111111111111111111111111111111',
        content: { json_uri: tokenUri(ROOT, 7), metadata: { name: 'Genesis #7', attributes: [{ trait_type: 'Tier', value: 'Rare' }] }, links: { image: `ipfs://${ROOT}/7.png` } },
        ownership: { owner: SOL_WALLET },
        grouping: [{ group_key: 'collection', group_value: SOL_COLLECTION }],
        burnt: false,
      }, {
        interface: 'FungibleToken',  // should be filtered out
        id: 'fung1ble', content: {}, ownership: { owner: SOL_WALLET }, grouping: [],
      }] };
    },
  };
  const solana = new SolanaAdapter(mockDas);

  // --- Unified query: one user with a Zcash t-addr AND a Solana wallet ---
  const catalog = new UnifiedCatalog({ zcash, solana });
  const tokens = await catalog.tokensByOwner({ zcashAddr: ALICE, solanaAddr: SOL_WALLET });

  console.log('merged holdings:', tokens.length, 'tokens across', new Set(tokens.map(t => t.chain)).size, 'chains');
  for (const t of tokens) console.log(`  [${t.chain}] ${t.name}  uri=${t.uri}`);

  // fungible filtered, so exactly 2 NFTs: one per chain
  assert(tokens.length === 2, 'two NFTs (fungible filtered out)');
  const zt = tokens.find(t => t.chain === 'zcash');
  const st = tokens.find(t => t.chain === 'solana');

  // both normalized to the same shape with resolved name/image/uri
  assert(zt.name === 'Genesis #1' && zt.image === `ipfs://${ROOT}/1.png`, 'zcash metadata resolved');
  assert(st.name === 'Genesis #7' && st.standard === 'MplCoreAsset', 'solana normalized');

  // the shared-layer proof: both tokens address the SAME IPFS root
  assert(zt.uri.startsWith(`ipfs://${ROOT}/`) && st.uri.startsWith(`ipfs://${ROOT}/`), 'same IPFS root, both chains');
  console.log('\nboth chains resolve against the same IPFS root ✓');

  // cross-chain single-token lookup routes correctly
  const one = await catalog.getToken('zcash', DEPLOY_TXID, '1');
  assert(one.owner === ALICE && one.chain === 'zcash', 'routed zcash getToken');

  console.log('ALL UNIFIED-CATALOG ASSERTIONS PASSED ✓');
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
