#!/usr/bin/env bash
set -e
GREEN='\033[0;32m'; CYAN='\033[0;36m'; NC='\033[0m'

echo -e "${CYAN}REPUTESCORE — DEPLOY${NC}"

for KEY in alice bob carol; do
  stellar keys generate --global ${KEY} --network testnet 2>/dev/null || true
done
stellar keys fund alice --network testnet
stellar keys fund bob   --network testnet
stellar keys fund carol --network testnet
ALICE=$(stellar keys address alice)
BOB=$(stellar keys address bob)
CAROL=$(stellar keys address carol)
XLM_TOKEN=$(stellar contract id asset --asset native --network testnet)
echo -e "${GREEN}✓ Alice: ${ALICE}${NC}"
echo -e "${GREEN}✓ Bob  : ${BOB}${NC}"
echo -e "${GREEN}✓ Carol: ${CAROL}${NC}"

cd contract
cargo build --target wasm32-unknown-unknown --release
WASM="target/wasm32-unknown-unknown/release/reputescore.wasm"
cd ..

WASM_HASH=$(stellar contract upload --network testnet --source alice --wasm contract/${WASM})
CONTRACT_ID=$(stellar contract deploy --network testnet --source alice --wasm-hash ${WASM_HASH})
echo -e "${GREEN}✓ CONTRACT_ID: ${CONTRACT_ID}${NC}"

# Alice endorses Bob with 5 XLM
stellar contract invoke --network testnet --source alice --id ${XLM_TOKEN} \
  -- approve --from ${ALICE} --spender ${CONTRACT_ID} \
  --amount 100000000 --expiration_ledger 3110400 2>&1 || true

TX_RESULT=$(stellar contract invoke \
  --network testnet --source alice --id ${CONTRACT_ID} \
  -- endorse \
  --from ${ALICE} \
  --to ${BOB} \
  --stake 50000000 \
  --note '"Excellent Soroban developer. Highly recommended."' \
  --xlm_token ${XLM_TOKEN} 2>&1)

TX_HASH=$(echo "$TX_RESULT" | grep -oP '[0-9a-f]{64}' | head -1)
echo -e "${GREEN}✓ Proof TX: ${TX_HASH}${NC}"

# Bob endorses Carol
stellar contract invoke --network testnet --source bob --id ${XLM_TOKEN} \
  -- approve --from ${BOB} --spender ${CONTRACT_ID} \
  --amount 50000000 --expiration_ledger 3110400 2>&1 || true

stellar contract invoke --network testnet --source bob --id ${CONTRACT_ID} \
  -- endorse --from ${BOB} --to ${CAROL} \
  --stake 20000000 --note '"Great team player."' \
  --xlm_token ${XLM_TOKEN} 2>&1 || true

cat > frontend/.env << EOF
VITE_CONTRACT_ID=${CONTRACT_ID}
VITE_XLM_TOKEN=${XLM_TOKEN}
VITE_NETWORK_PASSPHRASE=Test SDF Network ; September 2015
VITE_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
EOF

echo ""
echo -e "${CYAN}CONTRACT : ${CONTRACT_ID}${NC}"
echo -e "${CYAN}PROOF TX : ${TX_HASH}${NC}"
echo -e "${CYAN}EXPLORER : https://stellar.expert/explorer/testnet/contract/${CONTRACT_ID}${NC}"
echo "Next: cd frontend && npm install && npm run dev"
