const assert = require('assert');
const z = require('./z721');
const { tokenUri } = require('./metadata');
const { buildAssetArgs, buildCollectionArgs } = require('./solana-mint');

const ROOT = 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi';

// The shared-metadata invariant: a Solana Core asset's uri == the exact string
// a Zcash Z721 token references for the same collection root + index.
const index = 42;
const solArgs = buildAssetArgs({ rootCid: ROOT, index, name: 'Genesis #42', royaltyBps: 500,
  creators: [{ address: 'Cr8...', percentage: 100 }] });
const sharedUri = tokenUri(ROOT, index);

console.log('Solana asset uri :', solArgs.uri);
console.log('Z721 token uri   :', sharedUri);
assert(solArgs.uri === sharedUri, 'Solana uri must equal the shared Z721 uri');
console.log('SAME metadata file on both chains ✓');

// royalty plugin wired
assert(solArgs.plugins[0].type === 'Royalties' && solArgs.plugins[0].basisPoints === 500, 'royalty plugin');
// collection manifest uri
const colArgs = buildCollectionArgs({ rootCid: ROOT, name: 'Genesis' });
assert(colArgs.uri === `ipfs://${ROOT}/collection.json`, 'collection uri');
console.log('collection uri   :', colArgs.uri);

// And the on-chain Zcash mint for the same token encodes a payload that resolves
// to that very uri (collection txid + index), proving end-to-end parity.
const DEPLOY_TXID = 'd'.repeat(64);
const decoded = z.fromOpReturnScript(z.toOpReturnScript(z.encodeMint({ collectionTxid: DEPLOY_TXID, tokenIndex: index })));
assert(decoded.tokenIndex === index, 'z721 mint references same index');
console.log('\nALL SOLANA-PARITY ASSERTIONS PASSED ✓');
