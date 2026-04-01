import * as StellarSdk from '@stellar/stellar-sdk'
import { isConnected, getPublicKey, signTransaction } from '@stellar/freighter-api'

const CONTRACT_ID = (import.meta.env.VITE_CONTRACT_ID       || '').trim()
const XLM_TOKEN   = (import.meta.env.VITE_XLM_TOKEN         || '').trim()
const NET         = (import.meta.env.VITE_NETWORK_PASSPHRASE || 'Test SDF Network ; September 2015').trim()
const RPC_URL     = (import.meta.env.VITE_SOROBAN_RPC_URL   || 'https://soroban-testnet.stellar.org').trim()
const DUMMY       = 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN'

export const rpc = new StellarSdk.rpc.Server(RPC_URL)

export async function connectWallet() {
  if (!(await isConnected())) throw new Error('Freighter not installed.')
  return await getPublicKey()
}

async function sendTx(publicKey, op) {
  const account = await rpc.getAccount(publicKey)
  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: StellarSdk.BASE_FEE, networkPassphrase: NET,
  }).addOperation(op).setTimeout(60).build()
  const sim = await rpc.simulateTransaction(tx)
  if (StellarSdk.rpc.Api.isSimulationError(sim)) throw new Error(sim.error)
  const prepared = StellarSdk.rpc.assembleTransaction(tx, sim).build()
  const signedXdr = await signTransaction(prepared.toXDR(), { networkPassphrase: NET, network: 'TESTNET' })
  const signed = StellarSdk.TransactionBuilder.fromXDR(signedXdr, NET)
  const sent = await rpc.sendTransaction(signed)
  return pollTx(sent.hash)
}

async function pollTx(hash) {
  for (let i = 0; i < 30; i++) {
    const r = await rpc.getTransaction(hash)
    if (r.status === 'SUCCESS') return hash
    if (r.status === 'FAILED')  throw new Error('Transaction failed on-chain')
    await new Promise(r => setTimeout(r, 2000))
  }
  throw new Error('Transaction timed out')
}

async function readContract(op) {
  const dummy = new StellarSdk.Account(DUMMY, '0')
  const tx = new StellarSdk.TransactionBuilder(dummy, {
    fee: StellarSdk.BASE_FEE, networkPassphrase: NET,
  }).addOperation(op).setTimeout(30).build()
  const sim = await rpc.simulateTransaction(tx)
  return StellarSdk.scValToNative(sim.result.retval)
}

async function approveXlm(publicKey, stroops) {
  return sendTx(publicKey, new StellarSdk.Contract(XLM_TOKEN).call(
    'approve',
    StellarSdk.Address.fromString(publicKey).toScVal(),
    StellarSdk.Address.fromString(CONTRACT_ID).toScVal(),
    new StellarSdk.XdrLargeInt('i128', BigInt(stroops)).toI128(),
    StellarSdk.xdr.ScVal.scvU32(3_110_400),
  ))
}

const tc = () => new StellarSdk.Contract(CONTRACT_ID)

export async function endorse(from, to, stakeXlm, note) {
  const stroops = Math.ceil(stakeXlm * 10_000_000)
  if (from === to) throw new Error('Cannot self-endorse.')
  const already = await readContract(tc().call(
    'has_endorsed',
    StellarSdk.Address.fromString(from).toScVal(),
    StellarSdk.Address.fromString(to).toScVal(),
  ))
  if (already) throw new Error('You already endorsed this wallet. Revoke first to change stake/note.')
  await approveXlm(from, stroops)
  return sendTx(from, tc().call(
    'endorse',
    StellarSdk.Address.fromString(from).toScVal(),
    StellarSdk.Address.fromString(to).toScVal(),
    new StellarSdk.XdrLargeInt('i128', BigInt(stroops)).toI128(),
    StellarSdk.xdr.ScVal.scvString(note),
    StellarSdk.Address.fromString(XLM_TOKEN).toScVal(),
  ))
}

export async function revoke(from, to) {
  return sendTx(from, tc().call(
    'revoke',
    StellarSdk.Address.fromString(from).toScVal(),
    StellarSdk.Address.fromString(to).toScVal(),
    StellarSdk.Address.fromString(XLM_TOKEN).toScVal(),
  ))
}

export async function getProfile(addr) {
  try {
    return await readContract(tc().call(
      'get_profile',
      StellarSdk.Address.fromString(addr).toScVal(),
    ))
  } catch { return null }
}

export async function getEndorsement(from, to) {
  try {
    return await readContract(tc().call(
      'get_endorsement',
      StellarSdk.Address.fromString(from).toScVal(),
      StellarSdk.Address.fromString(to).toScVal(),
    ))
  } catch { return null }
}

export async function getReceivedFrom(addr) {
  try {
    const list = await readContract(tc().call(
      'get_received_from',
      StellarSdk.Address.fromString(addr).toScVal(),
    ))
    return Array.isArray(list) ? list.map(a => a.toString()) : []
  } catch { return [] }
}

export async function getGivenTo(addr) {
  try {
    const list = await readContract(tc().call(
      'get_given_to',
      StellarSdk.Address.fromString(addr).toScVal(),
    ))
    return Array.isArray(list) ? list.map(a => a.toString()) : []
  } catch { return [] }
}

export async function checkHasEndorsed(from, to) {
  try {
    return await readContract(tc().call(
      'has_endorsed',
      StellarSdk.Address.fromString(from).toScVal(),
      StellarSdk.Address.fromString(to).toScVal(),
    ))
  } catch { return false }
}

export async function getTotalEndorsements() {
  try { return Number(await readContract(tc().call('total_endorsements'))) }
  catch { return 0 }
}

export const xlm   = s => (Number(s) / 10_000_000).toFixed(2)
export const short = a => a ? `${a.toString().slice(0,5)}…${a.toString().slice(-4)}` : '—'
export { CONTRACT_ID }
