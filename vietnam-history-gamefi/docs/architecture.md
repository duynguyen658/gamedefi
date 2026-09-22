# Architecture

Product north star: transparent, safe, accessible DeFi (payments, savings, lending, DEX, treasury, DAO). Game identity (`Player -> Faction NFT`) remains the onboarding path. Combat stays off-chain. Money movement and governance stay on-chain via `BlockchainAdapter`.

`Player -> Faction -> Army -> Battle -> Reward` is the game-domain path. DeFi modules sit beside it, not inside the battle engine. Both stay in FastAPI services and PostgreSQL. `BlockchainAdapter` is a port beneath the domain; `SolanaAdapter` is the only location where chain RPC semantics belong. Frontend wallets sign only user-owned messages/transactions. The backend determines battle outcomes, reward eligibility, and (later) DeFi eligibility — never private keys.

See `docs/defi.md` for module principles.
