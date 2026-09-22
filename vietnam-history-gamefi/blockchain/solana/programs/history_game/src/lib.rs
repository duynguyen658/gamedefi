#![allow(unexpected_cfgs)] // Anchor 0.30 macros emit legacy Solana cfg names on newer Rust.

use anchor_lang::prelude::*;

declare_id!("8qUBTgX99v5EhxbAaxuqS94rgfRhnLrTgW66Gh9BvLKN");

pub mod instructions;
use instructions::*;

#[program]
pub mod history_game {
    use super::*;

    pub fn mint_faction(
        ctx: Context<MintFaction>,
        faction_id: String,
        metadata_uri: String,
    ) -> Result<()> {
        mint::create(
            &mut ctx.accounts.proof,
            ctx.accounts.owner.key(),
            faction_id,
            metadata_uri,
        )
    }
}

// One non-transferable faction proof per wallet, not a Metaplex/SPL token.
#[derive(Accounts)]
pub struct MintFaction<'info> {
    #[account(init, payer = owner, space = AssetProof::SPACE,
        seeds = [b"faction", owner.key().as_ref()], bump)]
    pub proof: Account<'info, AssetProof>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct AssetProof {
    pub owner: Pubkey,
    pub kind: String,
    pub reference_id: String,
    pub metadata_uri: String,
}
impl AssetProof {
    pub const SPACE: usize = 8 + 32 + 4 + 16 + 4 + 64 + 4 + 200;
}

#[cfg(test)]
mod tests {
    use super::*;
    use anchor_lang::{Discriminator, InstructionData};

    #[test]
    fn faction_wire_format_matches_clients() {
        let proof = AssetProof {
            owner: Pubkey::new_from_array([7; 32]),
            kind: "faction".into(),
            reference_id: "5".into(),
            metadata_uri: "".into(),
        };
        let mut serialized = Vec::new();
        proof.try_serialize(&mut serialized).unwrap();
        let mut expected = AssetProof::DISCRIMINATOR.to_vec();
        expected.extend([7; 32]);
        expected.extend([7, 0, 0, 0]);
        expected.extend(b"faction");
        expected.extend([1, 0, 0, 0, b'5', 0, 0, 0, 0]);
        assert_eq!(serialized, expected);
        assert!(serialized.len() <= AssetProof::SPACE);
        let data = crate::instruction::MintFaction {
            faction_id: "5".into(),
            metadata_uri: "".into(),
        }
        .data();
        assert_eq!(&data[8..], &[1, 0, 0, 0, b'5', 0, 0, 0, 0]);
    }
}
