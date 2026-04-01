#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short,
    Address, Env, String, Vec, token,
};

// Wallets endorse each other by staking XLM behind an endorsement.
// Your reputation score = sum of XLM staked by all wallets endorsing you.
// Endorsers can revoke — they get their XLM back, target loses that score.
// Each endorser can only endorse a given target once (update via revoke+re-endorse).
// Prevents self-endorsement.

const MIN_STAKE: i128 = 1_000_000; // 0.1 XLM minimum per endorsement
const MAX_NOTE:  u32  = 100;

#[contracttype]
#[derive(Clone)]
pub struct Endorsement {
    pub from:       Address,
    pub to:         Address,
    pub stake:      i128,
    pub note:       String,
    pub created_at: u32,
}

#[contracttype]
#[derive(Clone)]
pub struct Profile {
    pub address:         Address,
    pub score:           i128,   // total XLM staked by others
    pub endorser_count:  u32,
    pub endorsee_count:  u32,    // how many they've endorsed
}

#[contracttype]
pub enum DataKey {
    Endorsement(Address, Address),  // (from, to) → Endorsement
    Profile(Address),
    TotalEndorsements,
    // Received list for a target
    ReceivedFrom(Address),          // Vec<Address> who endorsed this wallet
    // Given list for an endorser
    GivenTo(Address),               // Vec<Address> who this wallet endorsed
}

fn remove_addr(v: &mut Vec<Address>, a: &Address) {
    let mut i = 0u32;
    while i < v.len() {
        if v.get(i).unwrap() == *a { v.remove(i); return; }
        i += 1;
    }
}

fn has_addr(v: &Vec<Address>, a: &Address) -> bool {
    for i in 0..v.len() { if v.get(i).unwrap() == *a { return true; } }
    false
}

#[contract]
pub struct ReputeScoreContract;

#[contractimpl]
impl ReputeScoreContract {
    /// Endorse a wallet — stake XLM behind the endorsement
    pub fn endorse(
        env: Env,
        from: Address,
        to: Address,
        stake: i128,
        note: String,
        xlm_token: Address,
    ) {
        from.require_auth();
        assert!(from != to, "Cannot self-endorse");
        assert!(stake >= MIN_STAKE, "Min stake 0.1 XLM");
        assert!(note.len() <= MAX_NOTE, "Note max 100 chars");
        assert!(
            !env.storage().persistent().has(&DataKey::Endorsement(from.clone(), to.clone())),
            "Already endorsed — revoke first to update"
        );

        let token_client = token::Client::new(&env, &xlm_token);
        token_client.transfer(&from, &env.current_contract_address(), &stake);

        let endorsement = Endorsement {
            from: from.clone(), to: to.clone(), stake, note,
            created_at: env.ledger().sequence(),
        };
        env.storage().persistent().set(&DataKey::Endorsement(from.clone(), to.clone()), &endorsement);

        // Update target profile
        let mut to_profile: Profile = env.storage().persistent()
            .get(&DataKey::Profile(to.clone()))
            .unwrap_or(Profile { address: to.clone(), score: 0, endorser_count: 0, endorsee_count: 0 });
        to_profile.score          += stake;
        to_profile.endorser_count += 1;
        env.storage().persistent().set(&DataKey::Profile(to.clone()), &to_profile);

        // Update endorser profile
        let mut from_profile: Profile = env.storage().persistent()
            .get(&DataKey::Profile(from.clone()))
            .unwrap_or(Profile { address: from.clone(), score: 0, endorser_count: 0, endorsee_count: 0 });
        from_profile.endorsee_count += 1;
        env.storage().persistent().set(&DataKey::Profile(from.clone()), &from_profile);

        // Track received/given lists
        let mut received: Vec<Address> = env.storage().persistent()
            .get(&DataKey::ReceivedFrom(to.clone())).unwrap_or(Vec::new(&env));
        received.push_back(from.clone());
        env.storage().persistent().set(&DataKey::ReceivedFrom(to.clone()), &received);

        let mut given: Vec<Address> = env.storage().persistent()
            .get(&DataKey::GivenTo(from.clone())).unwrap_or(Vec::new(&env));
        given.push_back(to.clone());
        env.storage().persistent().set(&DataKey::GivenTo(from.clone()), &given);

        let total: u64 = env.storage().instance()
            .get(&DataKey::TotalEndorsements).unwrap_or(0u64);
        env.storage().instance().set(&DataKey::TotalEndorsements, &(total + 1));

        env.events().publish((symbol_short!("endorse"),), (from, to, stake));
    }

    /// Revoke an endorsement — get XLM back, target loses the score
    pub fn revoke(
        env: Env,
        from: Address,
        to: Address,
        xlm_token: Address,
    ) {
        from.require_auth();

        let endorsement: Endorsement = env.storage().persistent()
            .get(&DataKey::Endorsement(from.clone(), to.clone()))
            .expect("No endorsement to revoke");

        let token_client = token::Client::new(&env, &xlm_token);
        token_client.transfer(&env.current_contract_address(), &from, &endorsement.stake);

        env.storage().persistent().remove(&DataKey::Endorsement(from.clone(), to.clone()));

        // Update target score
        let mut to_profile: Profile = env.storage().persistent()
            .get(&DataKey::Profile(to.clone())).expect("Profile missing");
        to_profile.score          -= endorsement.stake;
        to_profile.endorser_count -= 1;
        env.storage().persistent().set(&DataKey::Profile(to.clone()), &to_profile);

        // Update endorser count
        let mut from_profile: Profile = env.storage().persistent()
            .get(&DataKey::Profile(from.clone())).expect("Profile missing");
        from_profile.endorsee_count -= 1;
        env.storage().persistent().set(&DataKey::Profile(from.clone()), &from_profile);

        // Remove from lists
        let mut received: Vec<Address> = env.storage().persistent()
            .get(&DataKey::ReceivedFrom(to.clone())).unwrap_or(Vec::new(&env));
        remove_addr(&mut received, &from);
        env.storage().persistent().set(&DataKey::ReceivedFrom(to.clone()), &received);

        let mut given: Vec<Address> = env.storage().persistent()
            .get(&DataKey::GivenTo(from.clone())).unwrap_or(Vec::new(&env));
        remove_addr(&mut given, &to);
        env.storage().persistent().set(&DataKey::GivenTo(from.clone()), &given);

        let total: u64 = env.storage().instance()
            .get(&DataKey::TotalEndorsements).unwrap_or(0u64);
        env.storage().instance().set(&DataKey::TotalEndorsements, &total.saturating_sub(1));

        env.events().publish((symbol_short!("revoked"),), (from, to, endorsement.stake));
    }

    // ── Reads ──────────────────────────────────────────────────────────────
    pub fn get_profile(env: Env, addr: Address) -> Profile {
        env.storage().persistent()
            .get(&DataKey::Profile(addr.clone()))
            .unwrap_or(Profile { address: addr, score: 0, endorser_count: 0, endorsee_count: 0 })
    }

    pub fn get_endorsement(env: Env, from: Address, to: Address) -> Option<Endorsement> {
        env.storage().persistent().get(&DataKey::Endorsement(from, to))
    }

    pub fn get_received_from(env: Env, addr: Address) -> Vec<Address> {
        env.storage().persistent()
            .get(&DataKey::ReceivedFrom(addr))
            .unwrap_or(Vec::new(&env))
    }

    pub fn get_given_to(env: Env, addr: Address) -> Vec<Address> {
        env.storage().persistent()
            .get(&DataKey::GivenTo(addr))
            .unwrap_or(Vec::new(&env))
    }

    pub fn has_endorsed(env: Env, from: Address, to: Address) -> bool {
        env.storage().persistent().has(&DataKey::Endorsement(from, to))
    }

    pub fn total_endorsements(env: Env) -> u64 {
        env.storage().instance().get(&DataKey::TotalEndorsements).unwrap_or(0)
    }
}
