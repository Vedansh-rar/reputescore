#!/usr/bin/env bash
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
gh repo create reputescore --public \
  --description "ReputeScore — Stake XLM to endorse wallets. Score = sum of stakes. On-chain trust graph. Stellar Soroban." \
  --source "${ROOT}" --remote origin --push
ENV="${ROOT}/frontend/.env"
CONTRACT_ID=$(grep VITE_CONTRACT_ID "$ENV" | cut -d= -f2 | tr -d '[:space:]')
XLM_TOKEN=$(grep VITE_XLM_TOKEN "$ENV" | cut -d= -f2 | tr -d '[:space:]')
USER=$(gh api user -q .login)
gh secret set VITE_CONTRACT_ID --body "$CONTRACT_ID" --repo "$USER/reputescore"
gh secret set VITE_XLM_TOKEN   --body "$XLM_TOKEN"   --repo "$USER/reputescore"
cd "${ROOT}/frontend" && vercel --prod --yes
echo "✓ ReputeScore published!"
