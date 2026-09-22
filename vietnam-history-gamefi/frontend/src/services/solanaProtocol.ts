import { PublicKey } from '@solana/web3.js';

const encoder = new TextEncoder();
export async function discriminator(namespace: string, name: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(`${namespace}:${name}`))).slice(0, 8);
}

export function factionAddress(owner: PublicKey, program: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([encoder.encode('faction'), owner.toBytes()], program)[0];
}

function borshString(value: string): Uint8Array {
  const bytes = encoder.encode(value);
  const result = new Uint8Array(4 + bytes.length);
  new DataView(result.buffer).setUint32(0, bytes.length, true);
  result.set(bytes, 4);
  return result;
}

export async function encodeMintFaction(factionId: number): Promise<Uint8Array> {
  if (!Number.isInteger(factionId) || factionId < 1 || factionId > 8) throw new Error('Faction không hợp lệ.');
  const prefix = await discriminator('global', 'mint_faction');
  const reference = borshString(String(factionId));
  const metadata = borshString('');
  const result = new Uint8Array(prefix.length + reference.length + metadata.length);
  result.set(prefix); result.set(reference, prefix.length); result.set(metadata, prefix.length + reference.length);
  return result;
}

export async function readFactionProof(data: Uint8Array, owner: PublicKey): Promise<number | null> {
  if (data.length < 44) return null;
  const tag = await discriminator('account', 'AssetProof');
  if (!tag.every((b, i) => data[i] === b) || !owner.toBytes().every((b, i) => data[i + 8] === b)) return null;
  let offset = 40;
  const read = () => {
    if (offset + 4 > data.length) throw new Error('Truncated proof');
    const length = new DataView(data.buffer, data.byteOffset + offset, 4).getUint32(0, true);
    offset += 4;
    if (offset + length > data.length) throw new Error('Truncated proof');
    const value = new TextDecoder('utf-8', { fatal: true }).decode(data.slice(offset, offset + length));
    offset += length;
    return value;
  };
  try {
    const kind = read(), reference = read();
    read(); // Metadata field must also be present and well-formed.
    return kind === 'faction' && /^[1-8]$/.test(reference) ? Number(reference) : null;
  } catch { return null; }
}
