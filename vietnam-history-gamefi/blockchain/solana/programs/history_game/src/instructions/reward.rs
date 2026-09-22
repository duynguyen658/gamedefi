use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked},
};

pub const REWARD_CONFIG_SEED: &[u8] = b"reward-config";
pub const REWARD_RECEIPT_SEED: &[u8] = b"reward";

pub fn initialize(
    ctx: Context<InitializeRewardDistributor>,
    distributor: Pubkey,
    max_reward_amount: u64,
) -> Result<()> {
    validate_settings(distributor, max_reward_amount)?;
    let config = &mut ctx.accounts.config;
    config.admin = ctx.accounts.admin.key();
    config.distributor = distributor;
    config.mint = ctx.accounts.mint.key();
    config.vault = ctx.accounts.vault.key();
    config.bump = ctx.bumps.config;
    config.paused = false;
    config.max_reward_amount = max_reward_amount;
    config.total_distributed = 0;
    config.claims_count = 0;
    emit!(RewardDistributorInitialized {
        admin: config.admin,
        distributor,
        mint: config.mint,
        vault: config.vault,
        max_reward_amount,
    });
    Ok(())
}

pub fn fund(ctx: Context<FundRewardVault>, amount: u64) -> Result<()> {
    require!(amount > 0, RewardError::InvalidAmount);
    transfer_checked(
        ctx.accounts.token_program.to_account_info(),
        ctx.accounts.source.to_account_info(),
        ctx.accounts.mint.to_account_info(),
        ctx.accounts.vault.to_account_info(),
        ctx.accounts.funder.to_account_info(),
        amount,
        ctx.accounts.mint.decimals,
        None,
    )?;
    emit!(RewardVaultFunded {
        funder: ctx.accounts.funder.key(),
        amount,
    });
    Ok(())
}

pub fn distribute(ctx: Context<DistributeReward>, claim_id: [u8; 32], amount: u64) -> Result<()> {
    validate_distribution(
        ctx.accounts.config.paused,
        amount,
        ctx.accounts.config.max_reward_amount,
        ctx.accounts.vault.amount,
    )?;

    let signer_seeds: &[&[u8]] = &[REWARD_CONFIG_SEED, &[ctx.accounts.config.bump]];
    transfer_checked(
        ctx.accounts.token_program.to_account_info(),
        ctx.accounts.vault.to_account_info(),
        ctx.accounts.mint.to_account_info(),
        ctx.accounts.recipient_token_account.to_account_info(),
        ctx.accounts.config.to_account_info(),
        amount,
        ctx.accounts.mint.decimals,
        Some(&[signer_seeds]),
    )?;

    let config = &mut ctx.accounts.config;
    config.total_distributed = config
        .total_distributed
        .checked_add(amount)
        .ok_or(RewardError::ArithmeticOverflow)?;
    config.claims_count = config
        .claims_count
        .checked_add(1)
        .ok_or(RewardError::ArithmeticOverflow)?;

    let receipt = &mut ctx.accounts.receipt;
    receipt.claim_id = claim_id;
    receipt.recipient = ctx.accounts.recipient.key();
    receipt.amount = amount;
    receipt.slot = Clock::get()?.slot;
    receipt.bump = ctx.bumps.receipt;

    emit!(RewardDistributed {
        claim_id,
        recipient: receipt.recipient,
        amount,
        receipt: receipt.key(),
    });
    Ok(())
}

pub fn update(
    ctx: Context<AdministerRewardDistributor>,
    distributor: Pubkey,
    max_reward_amount: u64,
    paused: bool,
) -> Result<()> {
    validate_settings(distributor, max_reward_amount)?;
    let config = &mut ctx.accounts.config;
    config.distributor = distributor;
    config.max_reward_amount = max_reward_amount;
    config.paused = paused;
    emit!(RewardDistributorUpdated {
        distributor,
        max_reward_amount,
        paused,
    });
    Ok(())
}

pub fn withdraw(ctx: Context<WithdrawRewardTokens>, amount: u64) -> Result<()> {
    require!(amount > 0, RewardError::InvalidAmount);
    require!(
        amount <= ctx.accounts.vault.amount,
        RewardError::InsufficientVaultBalance
    );
    let signer_seeds: &[&[u8]] = &[REWARD_CONFIG_SEED, &[ctx.accounts.config.bump]];
    transfer_checked(
        ctx.accounts.token_program.to_account_info(),
        ctx.accounts.vault.to_account_info(),
        ctx.accounts.mint.to_account_info(),
        ctx.accounts.destination.to_account_info(),
        ctx.accounts.config.to_account_info(),
        amount,
        ctx.accounts.mint.decimals,
        Some(&[signer_seeds]),
    )?;
    emit!(RewardTokensWithdrawn {
        admin: ctx.accounts.admin.key(),
        destination: ctx.accounts.destination.key(),
        amount,
    });
    Ok(())
}

fn transfer_checked<'info>(
    token_program: AccountInfo<'info>,
    from: AccountInfo<'info>,
    mint: AccountInfo<'info>,
    to: AccountInfo<'info>,
    authority: AccountInfo<'info>,
    amount: u64,
    decimals: u8,
    signer_seeds: Option<&[&[&[u8]]]>,
) -> Result<()> {
    let accounts = TransferChecked {
        from,
        mint,
        to,
        authority,
    };
    let context = match signer_seeds {
        Some(seeds) => CpiContext::new_with_signer(token_program, accounts, seeds),
        None => CpiContext::new(token_program, accounts),
    };
    token_interface::transfer_checked(context, amount, decimals)
}

fn validate_settings(distributor: Pubkey, max_reward_amount: u64) -> Result<()> {
    require_keys_neq!(
        distributor,
        Pubkey::default(),
        RewardError::InvalidDistributor
    );
    require!(max_reward_amount > 0, RewardError::InvalidMaxReward);
    Ok(())
}

fn validate_distribution(paused: bool, amount: u64, max_amount: u64, balance: u64) -> Result<()> {
    require!(!paused, RewardError::DistributorPaused);
    require!(amount > 0, RewardError::InvalidAmount);
    require!(amount <= max_amount, RewardError::RewardTooLarge);
    require!(amount <= balance, RewardError::InsufficientVaultBalance);
    Ok(())
}

#[derive(Accounts)]
pub struct InitializeRewardDistributor<'info> {
    #[account(
        init,
        payer = admin,
        space = RewardConfig::SPACE,
        seeds = [REWARD_CONFIG_SEED],
        bump
    )]
    pub config: Account<'info, RewardConfig>,
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(
        init,
        payer = admin,
        associated_token::mint = mint,
        associated_token::authority = config,
        associated_token::token_program = token_program
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct FundRewardVault<'info> {
    #[account(
        seeds = [REWARD_CONFIG_SEED],
        bump = config.bump,
        has_one = mint,
        has_one = vault
    )]
    pub config: Account<'info, RewardConfig>,
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(mut, token::mint = mint, token::authority = config)]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, token::mint = mint, token::authority = funder)]
    pub source: InterfaceAccount<'info, TokenAccount>,
    pub funder: Signer<'info>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
#[instruction(claim_id: [u8; 32])]
pub struct DistributeReward<'info> {
    #[account(
        mut,
        seeds = [REWARD_CONFIG_SEED],
        bump = config.bump,
        has_one = mint,
        has_one = vault,
        constraint = config.distributor == distributor.key() @ RewardError::UnauthorizedDistributor
    )]
    pub config: Account<'info, RewardConfig>,
    #[account(
        init,
        payer = distributor,
        space = RewardReceipt::SPACE,
        seeds = [REWARD_RECEIPT_SEED, claim_id.as_ref()],
        bump
    )]
    pub receipt: Account<'info, RewardReceipt>,
    #[account(mut, token::mint = mint, token::authority = config)]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    pub mint: InterfaceAccount<'info, Mint>,
    pub recipient: SystemAccount<'info>,
    #[account(
        init_if_needed,
        payer = distributor,
        associated_token::mint = mint,
        associated_token::authority = recipient,
        associated_token::token_program = token_program
    )]
    pub recipient_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(mut)]
    pub distributor: Signer<'info>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AdministerRewardDistributor<'info> {
    #[account(
        mut,
        seeds = [REWARD_CONFIG_SEED],
        bump = config.bump,
        has_one = admin
    )]
    pub config: Account<'info, RewardConfig>,
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct WithdrawRewardTokens<'info> {
    #[account(
        seeds = [REWARD_CONFIG_SEED],
        bump = config.bump,
        has_one = admin,
        has_one = mint,
        has_one = vault
    )]
    pub config: Account<'info, RewardConfig>,
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(mut, token::mint = mint, token::authority = config)]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, token::mint = mint)]
    pub destination: InterfaceAccount<'info, TokenAccount>,
    pub admin: Signer<'info>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[account]
pub struct RewardConfig {
    pub admin: Pubkey,
    pub distributor: Pubkey,
    pub mint: Pubkey,
    pub vault: Pubkey,
    pub bump: u8,
    pub paused: bool,
    pub max_reward_amount: u64,
    pub total_distributed: u64,
    pub claims_count: u64,
}

impl RewardConfig {
    pub const SPACE: usize = 8 + (32 * 4) + 1 + 1 + (8 * 3);
}

#[account]
pub struct RewardReceipt {
    pub claim_id: [u8; 32],
    pub recipient: Pubkey,
    pub amount: u64,
    pub slot: u64,
    pub bump: u8,
}

impl RewardReceipt {
    pub const SPACE: usize = 8 + 32 + 32 + 8 + 8 + 1;
}

#[event]
pub struct RewardDistributorInitialized {
    pub admin: Pubkey,
    pub distributor: Pubkey,
    pub mint: Pubkey,
    pub vault: Pubkey,
    pub max_reward_amount: u64,
}

#[event]
pub struct RewardVaultFunded {
    pub funder: Pubkey,
    pub amount: u64,
}

#[event]
pub struct RewardDistributed {
    pub claim_id: [u8; 32],
    pub recipient: Pubkey,
    pub amount: u64,
    pub receipt: Pubkey,
}

#[event]
pub struct RewardDistributorUpdated {
    pub distributor: Pubkey,
    pub max_reward_amount: u64,
    pub paused: bool,
}

#[event]
pub struct RewardTokensWithdrawn {
    pub admin: Pubkey,
    pub destination: Pubkey,
    pub amount: u64,
}

#[error_code]
pub enum RewardError {
    #[msg("Reward amount must be greater than zero")]
    InvalidAmount,
    #[msg("Reward amount exceeds the configured per-claim limit")]
    RewardTooLarge,
    #[msg("Reward vault does not contain enough tokens")]
    InsufficientVaultBalance,
    #[msg("Reward distribution is paused")]
    DistributorPaused,
    #[msg("Signer is not the configured reward distributor")]
    UnauthorizedDistributor,
    #[msg("Distributor public key cannot be the default address")]
    InvalidDistributor,
    #[msg("Maximum reward amount must be greater than zero")]
    InvalidMaxReward,
    #[msg("Reward accounting overflowed")]
    ArithmeticOverflow,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_distribution_boundaries() {
        assert!(validate_distribution(false, 1, 10, 10).is_ok());
        assert!(validate_distribution(false, 10, 10, 10).is_ok());
        assert!(validate_distribution(true, 1, 10, 10).is_err());
        assert!(validate_distribution(false, 0, 10, 10).is_err());
        assert!(validate_distribution(false, 11, 10, 20).is_err());
        assert!(validate_distribution(false, 10, 10, 9).is_err());
    }

    #[test]
    fn account_sizes_include_discriminator_and_all_fields() {
        assert_eq!(RewardConfig::SPACE, 162);
        assert_eq!(RewardReceipt::SPACE, 89);
    }
}
