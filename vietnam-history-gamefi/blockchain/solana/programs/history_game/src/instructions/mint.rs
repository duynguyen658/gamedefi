use crate::AssetProof;
use anchor_lang::prelude::*;
pub fn create(
    proof: &mut Account<AssetProof>,
    owner: Pubkey,
    faction_id: String,
    metadata_uri: String,
) -> Result<()> {
    validate(&faction_id, &metadata_uri)?;
    proof.owner = owner;
    proof.kind = "faction".into();
    proof.reference_id = faction_id;
    proof.metadata_uri = metadata_uri;
    Ok(())
}

pub fn validate(faction_id: &str, metadata_uri: &str) -> Result<()> {
    require!(
        matches!(faction_id, "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8"),
        ErrorCode::UnknownFaction
    );
    require!(
        faction_id.len() <= 64 && metadata_uri.len() <= 200,
        ErrorCode::MetadataTooLong
    );
    Ok(())
}
#[error_code]
pub enum ErrorCode {
    #[msg("Field exceeds allocated account space")]
    MetadataTooLong,
    #[msg("Unknown faction")]
    UnknownFaction,
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn accepts_only_catalog_ids_and_bounded_metadata() {
        for id in 1..=8 {
            assert!(validate(&id.to_string(), "").is_ok());
        }
        for id in ["0", "9", "01", "-1", ""] {
            assert!(validate(id, "").is_err());
        }
        assert!(validate("5", &"x".repeat(200)).is_ok());
        assert!(validate("5", &"x".repeat(201)).is_err());
    }
}
