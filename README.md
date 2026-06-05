# Z721 — reference implementation

A BRC-721-style NFT standard for the **transparent** Zcash layer. On-chain data
is a tiny pointer; art + metadata live on IPFS. Ownership is a real UTXO, so
trades can be made trustless. See `SPEC.md` for the protocol.

## Modules

| File | Role |
|------|------|
| `z721.js` | Codec — encode/decode the OP_RETURN payload (DEPLOY / MINT). |
| `rpc.js` | Minimal zcashd JSON-RPC client. |
| `chainsource.js` | Pluggable block feed: `RpcChainSource` (live node) or `FixtureChainSource` (tests). |
| `indexer.js` | The protocol brain — Section 4 state machine + reorg journal + REST API. |
| `minter.js` | Builds/signs/broadcasts Zcash DEPLOY & MINT txs; pure `assembleTx`. |
| `metadata.js` | Shared off-chain layer — the URI/metadata convention both chains use. |
| `solana-mint.js` | Solana mint path (Metaplex Core); `uri` = same IPFS metadata. |
| `das.js` | Solana DAS API client + asset normalizer. |
| `unified.js` | Unified catalog — merges Z721 indexer + DAS behind one normalized API. |
| `fixtures.js` | Deterministic chain exercising every rule. |
| `test-indexer.js`, `test-minter.js`, `demo.js` | Runnable checks. |

## Run the tests (no node required)

```bash
npm install
node demo.js           # codec: payloads fit under 80B, round-trip
node test-indexer.js   # deploy→mint→transfer→duplicate-reject→burn + reorg rollback
node test-minter.js    # coin selection, carrier value, change, data round-trip
node test-solana.js    # Solana Core uri == shared Z721 uri (same metadata file)
node test-unified.js   # merge Zcash + Solana holdings into one normalized list
```

## Point the indexer at a real zcashd

```js
const { ZcashRpc } = require('./rpc');
const { RpcChainSource } = require('./chainsource');
const { Indexer, createServer } = require('./indexer');

const rpc = new ZcashRpc({ url: 'http://127.0.0.1:8232', user: 'rpcuser', pass: 'rpcpass' });
const ix = new Indexer(new RpcChainSource(rpc));
await ix.sync({ from: GENESIS_HEIGHT, onBlock: b => console.log('indexed', b.height) });
createServer(ix).listen(3000);   // GET /collections, /collections/:txid/tokens/:i, /owners/:addr
```

zcashd needs `-rpcuser/-rpcpassword` and `-datacarrier=1` (default). Run your own
node so OP_RETURN txs relay regardless of peer policy.

## Mint (against a node)

```js
const { Minter } = require('./minter');
const m = new Minter(rpc);
const { txid: collection } = await m.deploy({ maxSupply: 1000, rootCid, fundingAddr });
await m.mint({ collectionTxid: collection, tokenIndex: 0, ownerAddr, fundingAddr });
```

Signing goes through the node (`signrawtransaction`) so the **ZIP-243** sighash
is computed correctly — a Bitcoin signer would produce invalid signatures.

## Status

- [x] Spec (draft v0.1)
- [x] Codec
- [x] Indexer (state machine, reorg rollback, REST API)
- [x] Minter (assembly + RPC orchestration; IPFS pinner is an integration point)
- [x] Multi-chain: Solana mint path (Metaplex Core) + unified catalog API
- [ ] Marketplace — order book + ZIP-243 atomic-swap signing (next)
- [ ] Production storage (swap `MemoryStore` for SQLite/Postgres)
- [ ] IPFS pinning wired to a real service + permaweb mirror (`SPEC.md` §7)
```
