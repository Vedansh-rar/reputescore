import { useState, useEffect } from 'react'
import {
  connectWallet, endorse, revoke, getProfile,
  getEndorsement, getReceivedFrom, getGivenTo,
  checkHasEndorsed, getTotalEndorsements,
  xlm, short, CONTRACT_ID,
} from './lib/stellar'

// ── Score ring ─────────────────────────────────────────────────────────────
function ScoreRing({ score, maxScore = 500_000_000 }) {
  const r    = 54
  const circ = 2 * Math.PI * r
  const pct  = Math.min(1, Number(score) / maxScore)
  const dash = pct * circ
  const scoreXlm = Number(score) / 10_000_000

  const tier = scoreXlm >= 100 ? 'tier-gold'
    : scoreXlm >= 25  ? 'tier-silver'
    : scoreXlm >= 5   ? 'tier-bronze'
    : 'tier-none'

  return (
    <div className={`score-ring ${tier}`}>
      <svg width="124" height="124" viewBox="0 0 124 124">
        <circle cx="62" cy="62" r={r} fill="none"
          stroke="rgba(255,255,255,0.06)" strokeWidth="8"/>
        <circle cx="62" cy="62" r={r} fill="none"
          stroke="currentColor" strokeWidth="8" strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          strokeDashoffset={circ * 0.25}
          style={{ transition: 'stroke-dasharray 0.7s ease' }}
        />
      </svg>
      <div className="sr-inner">
        <div className="sr-score">{scoreXlm.toFixed(1)}</div>
        <div className="sr-unit">XLM REP</div>
      </div>
    </div>
  )
}

// ── Endorser row ───────────────────────────────────────────────────────────
function EndorserRow({ fromAddr, wallet, targetAddr, onRevoke }) {
  const [detail, setDetail] = useState(null)
  const [busy,   setBusy]   = useState(false)
  const isOwn = wallet && fromAddr === wallet

  useEffect(() => {
    getEndorsement(fromAddr, targetAddr).then(setDetail)
  }, [fromAddr, targetAddr])

  return (
    <div className="endorser-row">
      <div className="er-addr">{short(fromAddr)}</div>
      {detail && (
        <>
          <div className="er-stake">+{xlm(detail.stake)} XLM</div>
          {detail.note && <div className="er-note">"{detail.note}"</div>}
        </>
      )}
      {isOwn && (
        <button className="btn-revoke-small" disabled={busy}
          onClick={async () => {
            setBusy(true)
            try { await onRevoke() } finally { setBusy(false) }
          }}>
          {busy ? '…' : 'Revoke'}
        </button>
      )}
    </div>
  )
}

// ── Profile view ───────────────────────────────────────────────────────────
function ProfileView({ address, wallet, onEndorse, onRevoke, onRefresh }) {
  const [profile,   setProfile]   = useState(null)
  const [endorsers, setEndorsers] = useState([])
  const [given,     setGiven]     = useState([])
  const [endorsed,  setEndorsed]  = useState(false)
  const [loading,   setLoading]   = useState(true)

  const load = async () => {
    setLoading(true)
    const [p, from, to] = await Promise.all([
      getProfile(address),
      getReceivedFrom(address),
      getGivenTo(address),
    ])
    setProfile(p); setEndorsers(from); setGiven(to)
    if (wallet && wallet !== address) {
      const has = await checkHasEndorsed(wallet, address)
      setEndorsed(has)
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [address, wallet])

  const isSelf = wallet && wallet === address

  const scoreXlm = Number(profile?.score || 0) / 10_000_000
  const tier = scoreXlm >= 100 ? { label: 'Gold', cls: 'tier-gold' }
    : scoreXlm >= 25  ? { label: 'Silver', cls: 'tier-silver' }
    : scoreXlm >= 5   ? { label: 'Bronze', cls: 'tier-bronze' }
    : { label: 'Unrated', cls: 'tier-none' }

  if (loading) return <div className="loading-msg">Loading profile…</div>

  return (
    <div className="profile-view">
      <div className="pv-top">
        <div className="pv-avatar">{address.slice(1,3).toUpperCase()}</div>
        <div className="pv-info">
          <div className="pv-addr">{address}</div>
          <div className="pv-tier-badge" data-tier={tier.cls}>{tier.label}</div>
        </div>
        <ScoreRing score={profile?.score || 0} />
      </div>

      <div className="pv-stats">
        <div className="pvs"><span className="pvs-n">{endorsers.length}</span><span className="pvs-l">endorsers</span></div>
        <div className="pvs-div"/>
        <div className="pvs"><span className="pvs-n">{xlm(profile?.score || 0)}</span><span className="pvs-l">XLM backing</span></div>
        <div className="pvs-div"/>
        <div className="pvs"><span className="pvs-n">{given.length}</span><span className="pvs-l">endorsed</span></div>
      </div>

      {!isSelf && wallet && (
        <div className="pv-action">
          {endorsed
            ? <button className="btn-revoke-endorse"
                onClick={() => onRevoke(address, load)}>
                Revoke Endorsement
              </button>
            : <button className="btn-endorse-them"
                onClick={() => onEndorse(address, load)}>
                + Endorse This Wallet
              </button>
          }
        </div>
      )}

      {endorsers.length > 0 && (
        <div className="pv-section">
          <div className="pvs-title">ENDORSED BY</div>
          <div className="endorsers-list">
            {endorsers.map(a => (
              <EndorserRow key={a} fromAddr={a} wallet={wallet}
                targetAddr={address}
                onRevoke={() => onRevoke(address, load)} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Endorse modal ──────────────────────────────────────────────────────────
function EndorseModal({ target, onDone, onCancel }) {
  const [stake, setStake] = useState('1')
  const [note,  setNote]  = useState('')
  const [busy,  setBusy]  = useState(false)
  const [err,   setErr]   = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setBusy(true); setErr('')
    try {
      // wallet is passed via onDone closure
      await onDone(parseFloat(stake), note)
    } catch (e) { setErr(e.message); setBusy(false) }
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onCancel}>×</button>
        <div className="modal-title">Endorse Wallet</div>
        <div className="modal-target">{short(target)}</div>
        <p className="modal-sub">
          Stake XLM behind this endorsement. Your stake is locked until you revoke.
          The target's score rises by your stake amount.
        </p>
        <form onSubmit={handleSubmit}>
          <div className="mf-field">
            <label>STAKE (XLM)</label>
            <div className="mf-presets">
              {['0.5','1','5','10','25'].map(v => (
                <button key={v} type="button"
                  className={`mfp-btn ${stake === v ? 'mfp-active' : ''}`}
                  onClick={() => setStake(v)}>{v}</button>
              ))}
            </div>
            <input type="number" min="0.1" step="0.1"
              value={stake} onChange={e => setStake(e.target.value)}
              className="mf-input" required disabled={busy} />
            <span className="mf-unit">XLM</span>
          </div>
          <div className="mf-field">
            <label>NOTE (optional)</label>
            <input value={note} onChange={e => setNote(e.target.value)}
              placeholder="Why are you endorsing them?"
              maxLength={100} disabled={busy} className="mf-input-wide" />
          </div>
          {err && <p className="mf-err">{err}</p>}
          <button type="submit" className="btn-modal-endorse"
            disabled={busy || !stake}>
            {busy ? 'Signing…' : `Stake ${stake} XLM · Endorse`}
          </button>
        </form>
      </div>
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────
export default function App() {
  const [wallet,      setWallet]      = useState(null)
  const [tab,         setTab]         = useState('profile')
  const [viewAddr,    setViewAddr]    = useState(null)
  const [lookupInput, setLookupInput] = useState('')
  const [totalE,      setTotalE]      = useState(0)
  const [toast,       setToast]       = useState(null)
  const [modal,       setModal]       = useState(null)  // { target, refresh }

  useEffect(() => { getTotalEndorsements().then(setTotalE) }, [])
  useEffect(() => { if (wallet && !viewAddr) setViewAddr(wallet) }, [wallet])

  const handleConnect = async () => {
    try {
      const addr = await connectWallet()
      setWallet(addr)
      setViewAddr(addr)
      setTab('profile')
    } catch (e) { showToast(false, e.message) }
  }

  const showToast = (ok, msg, hash) => {
    setToast({ ok, msg, hash })
    setTimeout(() => setToast(null), 6000)
  }

  const handleEndorseAction = (target, refreshFn) => {
    setModal({
      target,
      onDone: async (stakeXlm, note) => {
        const hash = await endorse(wallet, target, stakeXlm, note)
        showToast(true, `Endorsed ${short(target)} with ${stakeXlm} XLM!`, hash)
        setModal(null)
        getTotalEndorsements().then(setTotalE)
        refreshFn()
      }
    })
  }

  const handleRevokeAction = async (target, refreshFn) => {
    try {
      const hash = await revoke(wallet, target)
      showToast(true, `Endorsement revoked. XLM returned.`, hash)
      getTotalEndorsements().then(setTotalE)
      refreshFn()
    } catch (e) { showToast(false, e.message) }
  }

  const handleLookup = (e) => {
    e.preventDefault()
    if (lookupInput.trim().length > 0) {
      setViewAddr(lookupInput.trim())
      setLookupInput('')
      setTab('profile')
    }
  }

  return (
    <div className="app">
      {modal && (
        <EndorseModal
          target={modal.target}
          onDone={modal.onDone}
          onCancel={() => setModal(null)}
        />
      )}

      {/* ── Header ── */}
      <header className="header">
        <div className="brand">
          <div className="brand-hex">◆</div>
          <div>
            <div className="brand-name">ReputeScore</div>
            <div className="brand-tag">stake-weighted endorsements · stellar</div>
          </div>
        </div>

        <div className="header-center">
          <form className="header-search" onSubmit={handleLookup}>
            <input value={lookupInput} onChange={e => setLookupInput(e.target.value)}
              placeholder="G… — look up any wallet's score" className="hs-input" />
            <button type="submit" className="hs-btn">→</button>
          </form>
        </div>

        <div className="header-right">
          <div className="htotal">
            <span className="htotal-n">{totalE}</span>
            <span className="htotal-l">endorsements</span>
          </div>
          {wallet
            ? <div className="wallet-pill">
                <span className="wdot"/>
                {short(wallet)}
                <button className="btn-my-profile"
                  onClick={() => { setViewAddr(wallet); setTab('profile') }}>
                  My Profile
                </button>
              </div>
            : <button className="btn-connect" onClick={handleConnect}>Connect</button>
          }
        </div>
      </header>

      {/* ── Toast ── */}
      {toast && (
        <div className={`toast ${toast.ok ? 'toast-ok' : 'toast-err'}`}>
          <span>{toast.msg}</span>
          {toast.hash && (
            <a href={`https://stellar.expert/explorer/testnet/tx/${toast.hash}`}
              target="_blank" rel="noreferrer" className="toast-link">TX ↗</a>
          )}
        </div>
      )}

      <main className="main">
        {!viewAddr ? (
          <div className="landing">
            <div className="landing-icon">◆</div>
            <h1 className="landing-title">Reputation backed by XLM.</h1>
            <p className="landing-sub">
              Endorse wallets you trust by staking XLM behind them.
              Your score is the total XLM staked by others.
              Endorsers can revoke and get their stake back — so every endorsement is a live signal.
            </p>
            <div className="landing-steps">
              <div className="ls-step"><span>01</span><p>Connect your wallet</p></div>
              <div className="ls-step"><span>02</span><p>Search any wallet address</p></div>
              <div className="ls-step"><span>03</span><p>Stake XLM to endorse them</p></div>
              <div className="ls-step"><span>04</span><p>Your endorsement is live on-chain</p></div>
            </div>
            <button className="btn-connect-lg" onClick={handleConnect}>
              Connect Freighter to Start
            </button>
          </div>
        ) : (
          <div className="profile-page">
            <ProfileView
              address={viewAddr}
              wallet={wallet}
              onEndorse={handleEndorseAction}
              onRevoke={handleRevokeAction}
              onRefresh={() => {}}
            />
          </div>
        )}
      </main>

      <footer className="footer">
        <span>ReputeScore · Stellar Testnet · Soroban</span>
        <a href={`https://stellar.expert/explorer/testnet/contract/${CONTRACT_ID}`}
          target="_blank" rel="noreferrer">Contract ↗</a>
      </footer>
    </div>
  )
}
