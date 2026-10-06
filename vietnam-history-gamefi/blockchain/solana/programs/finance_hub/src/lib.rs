#![allow(unexpected_cfgs)]

use anchor_lang::prelude::*;
use anchor_lang::system_program::{self, Transfer};

declare_id!("C4Ys1SQk5PXcPD5GfLP1RL7FdiL54A4mhv49cDf7rYW6");

const MIN_TERM: i64 = 60;
const MAX_TERM: i64 = 365 * 24 * 60 * 60;
const MAX_INTEREST_BPS: u64 = 2_500;

#[program]
pub mod finance_hub {
    use super::*;

    pub fn open_saving(ctx: Context<OpenSaving>, amount: u64, term_seconds: i64) -> Result<()> {
        require!(amount > 0, FinanceError::InvalidAmount);
        check_term(term_seconds)?;
        let now = Clock::get()?.unix_timestamp;
        system_program::transfer(
            CpiContext::new(ctx.accounts.system_program.to_account_info(), Transfer {
                from: ctx.accounts.owner.to_account_info(),
                to: ctx.accounts.saving.to_account_info(),
            }),
            amount,
        )?;
        let saving = &mut ctx.accounts.saving;
        saving.owner = ctx.accounts.owner.key();
        saving.principal = amount;
        saving.unlock_at = now.checked_add(term_seconds).ok_or(FinanceError::Overflow)?;
        saving.bump = ctx.bumps.saving;
        Ok(())
    }

    pub fn withdraw_saving(ctx: Context<WithdrawSaving>) -> Result<()> {
        let saving = &ctx.accounts.saving;
        require!(Clock::get()?.unix_timestamp >= saving.unlock_at, FinanceError::StillLocked);
        move_lamports(&saving.to_account_info(), &ctx.accounts.owner.to_account_info(), saving.principal)?;
        Ok(())
    }

    pub fn create_loan(
        ctx: Context<CreateLoan>,
        nonce: u64,
        principal: u64,
        interest: u64,
        term_seconds: i64,
    ) -> Result<()> {
        require!(principal > 0, FinanceError::InvalidAmount);
        require_keys_neq!(ctx.accounts.lender.key(), ctx.accounts.borrower.key(), FinanceError::SameWallet);
        check_term(term_seconds)?;
        require!(
            (interest as u128) * 10_000 <= (principal as u128) * (MAX_INTEREST_BPS as u128),
            FinanceError::InterestTooHigh
        );
        principal.checked_add(interest).ok_or(FinanceError::Overflow)?;
        system_program::transfer(
            CpiContext::new(ctx.accounts.system_program.to_account_info(), Transfer {
                from: ctx.accounts.lender.to_account_info(),
                to: ctx.accounts.loan.to_account_info(),
            }),
            principal,
        )?;
        let loan = &mut ctx.accounts.loan;
        loan.lender = ctx.accounts.lender.key();
        loan.borrower = ctx.accounts.borrower.key();
        loan.nonce = nonce;
        loan.principal = principal;
        loan.interest = interest;
        loan.term_seconds = term_seconds;
        loan.due_at = 0;
        loan.status = LoanStatus::Funded as u8;
        loan.bump = ctx.bumps.loan;
        Ok(())
    }

    pub fn cancel_loan(ctx: Context<CancelLoan>) -> Result<()> {
        require!(ctx.accounts.loan.status == LoanStatus::Funded as u8, FinanceError::WrongLoanState);
        move_lamports(&ctx.accounts.loan.to_account_info(), &ctx.accounts.lender.to_account_info(), ctx.accounts.loan.principal)?;
        Ok(())
    }

    pub fn draw_loan(ctx: Context<DrawLoan>) -> Result<()> {
        let loan = &mut ctx.accounts.loan;
        require!(loan.status == LoanStatus::Funded as u8, FinanceError::WrongLoanState);
        loan.due_at = Clock::get()?.unix_timestamp.checked_add(loan.term_seconds).ok_or(FinanceError::Overflow)?;
        loan.status = LoanStatus::Drawn as u8;
        move_lamports(&loan.to_account_info(), &ctx.accounts.borrower.to_account_info(), loan.principal)?;
        Ok(())
    }

    pub fn repay_loan(ctx: Context<RepayLoan>) -> Result<()> {
        let loan = &mut ctx.accounts.loan;
        require!(loan.status == LoanStatus::Drawn as u8, FinanceError::WrongLoanState);
        let amount = loan.principal.checked_add(loan.interest).ok_or(FinanceError::Overflow)?;
        system_program::transfer(
            CpiContext::new(ctx.accounts.system_program.to_account_info(), Transfer {
                from: ctx.accounts.borrower.to_account_info(),
                to: loan.to_account_info(),
            }),
            amount,
        )?;
        loan.status = LoanStatus::Repaid as u8;
        Ok(())
    }

    pub fn claim_repayment(ctx: Context<ClaimRepayment>) -> Result<()> {
        let loan = &ctx.accounts.loan;
        require!(loan.status == LoanStatus::Repaid as u8, FinanceError::WrongLoanState);
        let amount = loan.principal.checked_add(loan.interest).ok_or(FinanceError::Overflow)?;
        move_lamports(&loan.to_account_info(), &ctx.accounts.lender.to_account_info(), amount)?;
        Ok(())
    }

    pub fn initialize_treasury(ctx: Context<InitializeTreasury>) -> Result<()> {
        ctx.accounts.treasury.bump = ctx.bumps.treasury;
        Ok(())
    }

    pub fn deposit_treasury(ctx: Context<DepositTreasury>, amount: u64) -> Result<()> {
        require!(amount > 0, FinanceError::InvalidAmount);
        let next = ctx.accounts.treasury.available.checked_add(amount).ok_or(FinanceError::Overflow)?;
        system_program::transfer(
            CpiContext::new(ctx.accounts.system_program.to_account_info(), Transfer {
                from: ctx.accounts.depositor.to_account_info(),
                to: ctx.accounts.treasury.to_account_info(),
            }),
            amount,
        )?;
        ctx.accounts.treasury.available = next;
        Ok(())
    }

    pub fn stake_sol(ctx: Context<StakeSol>, amount: u64) -> Result<()> {
        require!(amount > 0, FinanceError::InvalidAmount);
        let next_stake = ctx.accounts.stake.amount.checked_add(amount).ok_or(FinanceError::Overflow)?;
        let next_total = ctx.accounts.treasury.total_staked.checked_add(amount).ok_or(FinanceError::Overflow)?;
        system_program::transfer(
            CpiContext::new(ctx.accounts.system_program.to_account_info(), Transfer {
                from: ctx.accounts.owner.to_account_info(),
                to: ctx.accounts.stake.to_account_info(),
            }),
            amount,
        )?;
        let stake = &mut ctx.accounts.stake;
        stake.owner = ctx.accounts.owner.key();
        stake.amount = next_stake;
        stake.bump = ctx.bumps.stake;
        ctx.accounts.treasury.total_staked = next_total;
        Ok(())
    }

    pub fn unstake_sol(ctx: Context<UnstakeSol>, amount: u64) -> Result<()> {
        require!(amount > 0, FinanceError::InvalidAmount);
        let stake = &mut ctx.accounts.stake;
        require!(Clock::get()?.unix_timestamp >= stake.locked_until, FinanceError::StillLocked);
        stake.amount = stake.amount.checked_sub(amount).ok_or(FinanceError::InvalidAmount)?;
        ctx.accounts.treasury.total_staked = ctx.accounts.treasury.total_staked
            .checked_sub(amount).ok_or(FinanceError::Overflow)?;
        move_lamports(&stake.to_account_info(), &ctx.accounts.owner.to_account_info(), amount)?;
        Ok(())
    }

    pub fn create_proposal(
        ctx: Context<CreateProposal>,
        nonce: u64,
        amount: u64,
        voting_seconds: i64,
    ) -> Result<()> {
        check_term(voting_seconds)?;
        require!(ctx.accounts.stake.amount > 0, FinanceError::NoVotingPower);
        require!(amount > 0 && amount <= ctx.accounts.treasury.available, FinanceError::InvalidAmount);
        let proposal = &mut ctx.accounts.proposal;
        proposal.proposer = ctx.accounts.proposer.key();
        proposal.recipient = ctx.accounts.recipient.key();
        proposal.nonce = nonce;
        proposal.amount = amount;
        proposal.ends_at = Clock::get()?.unix_timestamp.checked_add(voting_seconds).ok_or(FinanceError::Overflow)?;
        proposal.quorum = (ctx.accounts.treasury.total_staked / 5).max(1);
        proposal.yes_votes = 0;
        proposal.no_votes = 0;
        proposal.executed = false;
        proposal.bump = ctx.bumps.proposal;
        Ok(())
    }

    pub fn cast_vote(ctx: Context<CastVote>, approve: bool) -> Result<()> {
        let proposal = &mut ctx.accounts.proposal;
        require!(Clock::get()?.unix_timestamp < proposal.ends_at, FinanceError::VotingClosed);
        let weight = ctx.accounts.stake.amount;
        require!(weight > 0, FinanceError::NoVotingPower);
        if approve {
            proposal.yes_votes = proposal.yes_votes.checked_add(weight).ok_or(FinanceError::Overflow)?;
        } else {
            proposal.no_votes = proposal.no_votes.checked_add(weight).ok_or(FinanceError::Overflow)?;
        }
        ctx.accounts.stake.locked_until = ctx.accounts.stake.locked_until.max(proposal.ends_at);
        let record = &mut ctx.accounts.vote;
        record.voter = ctx.accounts.voter.key();
        record.proposal = proposal.key();
        record.weight = weight;
        record.approve = approve;
        Ok(())
    }

    pub fn execute_proposal(ctx: Context<ExecuteProposal>) -> Result<()> {
        let proposal = &mut ctx.accounts.proposal;
        require!(Clock::get()?.unix_timestamp >= proposal.ends_at, FinanceError::VotingOpen);
        require!(!proposal.executed, FinanceError::AlreadyExecuted);
        require!(
            proposal.yes_votes >= proposal.quorum && proposal.yes_votes > proposal.no_votes,
            FinanceError::ProposalRejected
        );
        let treasury = &mut ctx.accounts.treasury;
        treasury.available = treasury.available.checked_sub(proposal.amount).ok_or(FinanceError::InsufficientTreasury)?;
        proposal.executed = true;
        move_lamports(&treasury.to_account_info(), &ctx.accounts.recipient.to_account_info(), proposal.amount)?;
        Ok(())
    }
}

fn check_term(seconds: i64) -> Result<()> {
    require!((MIN_TERM..=MAX_TERM).contains(&seconds), FinanceError::InvalidTerm);
    Ok(())
}

fn move_lamports(from: &AccountInfo, to: &AccountInfo, amount: u64) -> Result<()> {
    let next_from = from.lamports().checked_sub(amount).ok_or(FinanceError::InvalidAmount)?;
    let next_to = to.lamports().checked_add(amount).ok_or(FinanceError::Overflow)?;
    **from.try_borrow_mut_lamports()? = next_from;
    **to.try_borrow_mut_lamports()? = next_to;
    Ok(())
}

#[derive(Accounts)]
pub struct OpenSaving<'info> {
    #[account(init, payer = owner, space = 8 + Saving::INIT_SPACE, seeds = [b"saving", owner.key().as_ref()], bump)]
    pub saving: Account<'info, Saving>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct WithdrawSaving<'info> {
    #[account(mut, close = owner, seeds = [b"saving", owner.key().as_ref()], bump = saving.bump, has_one = owner)]
    pub saving: Account<'info, Saving>,
    #[account(mut)]
    pub owner: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(nonce: u64)]
pub struct CreateLoan<'info> {
    #[account(init, payer = lender, space = 8 + Loan::INIT_SPACE, seeds = [b"loan", lender.key().as_ref(), &nonce.to_le_bytes()], bump)]
    pub loan: Account<'info, Loan>,
    #[account(mut)]
    pub lender: Signer<'info>,
    /// CHECK: Address is recorded as the sole borrower; it does not need to sign until draw.
    pub borrower: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CancelLoan<'info> {
    #[account(mut, close = lender, has_one = lender)]
    pub loan: Account<'info, Loan>,
    #[account(mut)]
    pub lender: Signer<'info>,
}

#[derive(Accounts)]
pub struct DrawLoan<'info> {
    #[account(mut, has_one = borrower)]
    pub loan: Account<'info, Loan>,
    #[account(mut)]
    pub borrower: Signer<'info>,
}

#[derive(Accounts)]
pub struct RepayLoan<'info> {
    #[account(mut, has_one = borrower)]
    pub loan: Account<'info, Loan>,
    #[account(mut)]
    pub borrower: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClaimRepayment<'info> {
    #[account(mut, close = lender, has_one = lender)]
    pub loan: Account<'info, Loan>,
    #[account(mut)]
    pub lender: Signer<'info>,
}

#[derive(Accounts)]
pub struct InitializeTreasury<'info> {
    #[account(init, payer = payer, space = 8 + Treasury::INIT_SPACE, seeds = [b"treasury"], bump)]
    pub treasury: Account<'info, Treasury>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DepositTreasury<'info> {
    #[account(mut, seeds = [b"treasury"], bump = treasury.bump)]
    pub treasury: Account<'info, Treasury>,
    #[account(mut)]
    pub depositor: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct StakeSol<'info> {
    #[account(mut, seeds = [b"treasury"], bump = treasury.bump)]
    pub treasury: Account<'info, Treasury>,
    #[account(init_if_needed, payer = owner, space = 8 + Stake::INIT_SPACE, seeds = [b"stake", owner.key().as_ref()], bump)]
    pub stake: Account<'info, Stake>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UnstakeSol<'info> {
    #[account(mut, seeds = [b"treasury"], bump = treasury.bump)]
    pub treasury: Account<'info, Treasury>,
    #[account(mut, seeds = [b"stake", owner.key().as_ref()], bump = stake.bump, has_one = owner)]
    pub stake: Account<'info, Stake>,
    #[account(mut)]
    pub owner: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(nonce: u64)]
pub struct CreateProposal<'info> {
    #[account(seeds = [b"treasury"], bump = treasury.bump)]
    pub treasury: Account<'info, Treasury>,
    #[account(seeds = [b"stake", proposer.key().as_ref()], bump = stake.bump, constraint = stake.owner == proposer.key() @ FinanceError::NoVotingPower)]
    pub stake: Account<'info, Stake>,
    #[account(init, payer = proposer, space = 8 + Proposal::INIT_SPACE, seeds = [b"proposal", proposer.key().as_ref(), &nonce.to_le_bytes()], bump)]
    pub proposal: Account<'info, Proposal>,
    #[account(mut)]
    pub proposer: Signer<'info>,
    /// CHECK: Recipient can be any account and receives only SOL after DAO approval.
    pub recipient: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CastVote<'info> {
    #[account(mut)]
    pub proposal: Account<'info, Proposal>,
    #[account(mut, seeds = [b"stake", voter.key().as_ref()], bump = stake.bump, constraint = stake.owner == voter.key() @ FinanceError::NoVotingPower)]
    pub stake: Account<'info, Stake>,
    #[account(init, payer = voter, space = 8 + VoteRecord::INIT_SPACE, seeds = [b"vote", proposal.key().as_ref(), voter.key().as_ref()], bump)]
    pub vote: Account<'info, VoteRecord>,
    #[account(mut)]
    pub voter: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ExecuteProposal<'info> {
    #[account(mut, seeds = [b"treasury"], bump = treasury.bump)]
    pub treasury: Account<'info, Treasury>,
    #[account(mut, has_one = recipient)]
    pub proposal: Account<'info, Proposal>,
    /// CHECK: Address is fixed in the proposal account.
    #[account(mut)]
    pub recipient: UncheckedAccount<'info>,
}

#[account]
#[derive(InitSpace)]
pub struct Saving {
    pub owner: Pubkey,
    pub principal: u64,
    pub unlock_at: i64,
    pub bump: u8,
}

#[repr(u8)]
pub enum LoanStatus { Funded = 0, Drawn = 1, Repaid = 2 }

#[account]
#[derive(InitSpace)]
pub struct Loan {
    pub lender: Pubkey,
    pub borrower: Pubkey,
    pub nonce: u64,
    pub principal: u64,
    pub interest: u64,
    pub term_seconds: i64,
    pub due_at: i64,
    pub status: u8,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Treasury {
    pub available: u64,
    pub total_staked: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Stake {
    pub owner: Pubkey,
    pub amount: u64,
    pub locked_until: i64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Proposal {
    pub proposer: Pubkey,
    pub recipient: Pubkey,
    pub nonce: u64,
    pub amount: u64,
    pub ends_at: i64,
    pub quorum: u64,
    pub yes_votes: u64,
    pub no_votes: u64,
    pub executed: bool,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct VoteRecord {
    pub voter: Pubkey,
    pub proposal: Pubkey,
    pub weight: u64,
    pub approve: bool,
}

#[error_code]
pub enum FinanceError {
    #[msg("Amount must be greater than zero")]
    InvalidAmount,
    #[msg("Term must be between 60 seconds and 365 days")]
    InvalidTerm,
    #[msg("Savings or DAO stake is still locked")]
    StillLocked,
    #[msg("Arithmetic overflow")]
    Overflow,
    #[msg("The two wallets must be different")]
    SameWallet,
    #[msg("Fixed interest exceeds 25 percent of principal")]
    InterestTooHigh,
    #[msg("Loan is in the wrong state")]
    WrongLoanState,
    #[msg("No SOL is staked for voting")]
    NoVotingPower,
    #[msg("Voting has ended")]
    VotingClosed,
    #[msg("Voting is still open")]
    VotingOpen,
    #[msg("Proposal has already been executed")]
    AlreadyExecuted,
    #[msg("Proposal did not pass")]
    ProposalRejected,
    #[msg("Treasury balance is insufficient")]
    InsufficientTreasury,
}

#[cfg(test)]
mod tests {
    use super::*;
    use anchor_lang::InstructionData;

    #[test]
    fn term_bounds() {
        assert!(check_term(59).is_err());
        assert!(check_term(60).is_ok());
        assert!(check_term(MAX_TERM).is_ok());
        assert!(check_term(MAX_TERM + 1).is_err());
    }

    #[test]
    fn account_sizes_and_client_offsets_match() {
        let saving = Saving { owner: Pubkey::new_from_array([1; 32]), principal: 42, unlock_at: 60, bump: 9 };
        let mut data = Vec::new();
        saving.try_serialize(&mut data).unwrap();
        assert_eq!(data.len(), 57);
        assert_eq!(u64::from_le_bytes(data[40..48].try_into().unwrap()), 42);
        assert_eq!(i64::from_le_bytes(data[48..56].try_into().unwrap()), 60);

        let loan = Loan {
            lender: Pubkey::new_from_array([1; 32]), borrower: Pubkey::new_from_array([2; 32]),
            nonce: 3, principal: 4, interest: 5, term_seconds: 60, due_at: 90,
            status: LoanStatus::Drawn as u8, bump: 7,
        };
        data.clear();
        loan.try_serialize(&mut data).unwrap();
        assert_eq!(data.len(), 114);
        assert_eq!(&data[8..40], &[1; 32]);
        assert_eq!(&data[40..72], &[2; 32]);
        assert_eq!(u64::from_le_bytes(data[80..88].try_into().unwrap()), 4);
        assert_eq!(data[112], LoanStatus::Drawn as u8);

        let treasury = Treasury { available: 10, total_staked: 20, bump: 1 };
        data.clear();
        treasury.try_serialize(&mut data).unwrap();
        assert_eq!(data.len(), 25);
        assert_eq!(u64::from_le_bytes(data[8..16].try_into().unwrap()), 10);
        assert_eq!(u64::from_le_bytes(data[16..24].try_into().unwrap()), 20);

        let proposal = Proposal {
            proposer: Pubkey::new_from_array([1; 32]), recipient: Pubkey::new_from_array([2; 32]),
            nonce: 1, amount: 2, ends_at: 3, quorum: 4, yes_votes: 5, no_votes: 6,
            executed: true, bump: 7,
        };
        data.clear();
        proposal.try_serialize(&mut data).unwrap();
        assert_eq!(data.len(), 122);
        assert_eq!(data[120], 1);
    }

    #[test]
    fn client_instruction_payloads_match_anchor() {
        let payload = crate::instruction::OpenSaving { amount: 1_000_000_000, term_seconds: 60 }.data();
        assert_eq!(payload.len(), 24);
        assert_eq!(u64::from_le_bytes(payload[8..16].try_into().unwrap()), 1_000_000_000);
        assert_eq!(i64::from_le_bytes(payload[16..24].try_into().unwrap()), 60);
        let vote = crate::instruction::CastVote { approve: true }.data();
        assert_eq!(vote.len(), 9);
        assert_eq!(vote[8], 1);
    }
}
