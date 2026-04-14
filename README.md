# ReputeScore

Stake-weighted reputation system on Stellar. Endorse any wallet by locking XLM behind your endorsement. The target's score equals the sum of all XLM staked by their endorsers. Endorsers can revoke at any time — they get their XLM back and the target's score drops immediately. Every endorsement is a live, revocable signal of trust.

## Live Links

| | |
|---|---|
| **Frontend** | `https://reputescore.vercel.app` |
| **Contract** | `https://stellar.expert/explorer/testnet/contract/CBEMWRSSPW76ZFM5P6F4U6DACUUPV3QTZNM3UEGUOK7EZ34II3U4UNR3` |

## Score Tiers

| Tier | Threshold |
|------|-----------|
| 🥇 Gold | 100+ XLM backing |
| 🥈 Silver | 25–99 XLM backing |
| 🥉 Bronze | 5–24 XLM backing |
| Unrated | < 5 XLM |

## How It Works

1. Connect wallet, search any Stellar address
2. Click "Endorse" — stake XLM behind the endorsement
3. Target's score increases by your stake amount
4. Revoke at any time — XLM returned, score reduced
5. Score is always live: `score = Σ(all active endorsement stakes)`

## Why This Project Matters

This project turns a familiar real-world workflow into a verifiable on-chain primitive on Stellar: transparent state transitions, user-authenticated actions, and deterministic outcomes.

## Architecture

- **Smart Contract Layer**: Soroban contract enforces business rules, authorization, and state transitions.
- **Client Layer**: React + Vite frontend handles wallet UX, transaction composition, and real-time status views.
- **Wallet/Auth Layer**: Freighter signs every state-changing action so operations are attributable and non-repudiable.
- **Infra Layer**: Stellar Testnet + Soroban RPC for execution; Vercel for frontend hosting.
## Contract Functions

```rust
endorse(from, to, stake: i128, note, xlm_token)
revoke(from, to, xlm_token)              // returns stake, reduces score
get_profile(addr) -> Profile             // includes score, endorser_count
get_endorsement(from, to) -> Option<Endorsement>
get_received_from(addr) -> Vec<Address>
get_given_to(addr) -> Vec<Address>
has_endorsed(from, to) -> bool
total_endorsements() -> u64
```

## Stack

| Layer | Tech |
|---|---|
| Contract | Rust + Soroban SDK v22 |
| Network | Stellar Testnet |
| Frontend | React 18 + Vite |
| Wallet | Freighter API 6.0.1 |
| Stellar SDK | 14.6.1 |
| Hosting | Vercel |

## Run Locally

```bash
chmod +x scripts/deploy.sh && ./scripts/deploy.sh
cd frontend && npm install && npm run dev
```


