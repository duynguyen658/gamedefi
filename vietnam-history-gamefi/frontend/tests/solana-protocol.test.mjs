import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PublicKey } from '@solana/web3.js';
import { encodeMintFaction, factionAddress, readFactionProof } from '../src/services/solanaProtocol.ts';
const vector = JSON.parse(readFileSync(new URL('../../blockchain/solana/tests/faction-vector.json', import.meta.url), 'utf8'));
const owner = new PublicKey(vector.wallet);

test('Solana PDA and Anchor instruction match the shared protocol vector', async () => {
  assert.equal(factionAddress(owner, new PublicKey(vector.program_id)).toBase58(), vector.proof_address);
  assert.equal(Buffer.from(await encodeMintFaction(5)).toString('hex'), vector.instruction_hex);
});
test('mint rejects invalid faction IDs before asking the wallet to sign', async () => {
  for (const id of [0, 9, -1, 1.5, NaN]) await assert.rejects(encodeMintFaction(id));
});
test('proof recovery validates discriminator, owner, and complete Borsh data', async () => {
  const data = Buffer.from(vector.proof_hex, 'hex');
  assert.equal(await readFactionProof(data, owner), 5);
  assert.equal(await readFactionProof(data, new PublicKey(vector.program_id)), null);
  assert.equal(await readFactionProof(Buffer.concat([Buffer.alloc(8), data.subarray(8)]), owner), null);
  assert.equal(await readFactionProof(data.subarray(0, -1), owner), null);
});
