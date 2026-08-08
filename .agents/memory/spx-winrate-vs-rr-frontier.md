---
name: SPX win-rate vs reward/risk frontier
description: Why >75% win-rate AND avg-win/avg-loss>2 cannot both hold for mechanical TP/SL strategies; what is empirically achievable on SPX.
---

# Win-rate vs reward/risk is a locked tradeoff for barrier exits

For any strategy whose exits are fixed barriers (take-profit at +a%, stop-loss at -b%, ratio R=a/b), the win rate is governed by **WR ≈ 1/(1+R)** (the driftless barrier-crossing identity), plus a small market-drift bonus. Measured on SPX 1-min, 2023-2026 (a strong bull), the drift bonus was only ~+5-8 points at R≈2, growing larger only when the stop is so wide it is almost never hit (but then the rare losses are huge, crushing R).

**Consequence:** WR>75% forces R<~0.5, and R>2 forces WR<~50%. The two requirements live in opposite corners; the middle is ~50% WR @ R≈2. No entry edge tested (deeper dips, gap-downs, change-from-open) escapes it — deeper dips actually LOWER win rate (momentum continuation). The engine has **no trailing stop / partial exit / breakeven** mechanism, which is the only thing that could decouple avg-win from avg-loss.

## Empirically best SPX long dip-buy archetypes (3 yr, 278 trades, allow_consecutive=True)
- **Highest win rate:** TP 3% / SL 10% / 90-day max hold → ~82% WR, R~0.41, ~+320%.
- **Best reward/risk while profitable & frequent:** no fixed TP / SL 2% / 30-day hold → R~2.05, ~48% WR, ~+245%.
- **Clean TP/SL pair at R≈2:** TP 2% / SL 1% → R~2.0, ~41% WR.

**Bottom line for future "find a >75% WR AND >2:1 RR" requests:** it is not achievable with mechanical TP/SL on a long equity index. Report the frontier and let the user pick which axis matters most, rather than chasing an impossible point.

## Options engine variant (premium TP/SL barriers)
WR≈1/(1+R) roughly holds on option premium too, but theta shifts it: long options underperform the frontier (naive 1-DTE long call @ TP15/SL45 was only ~64% WR in Aug24–Jan25); SHORT premium beats it. Best found: **0DTE SPX short put 1% OTM, entry 10:00, TP 15% / SL 45% of credit, net_premium_min $0.50** → 78.9% WR, 223 trades, profitable in both halves of Aug 2024–Jul 2025 (71.6% / 85.1%). The premium floor is essential: in low-vol regimes (Feb–Jul 2024) far-OTM 0DTE credits are ~$0 and %-barriers are pure noise (WR collapses or trades are meaningless) — the filter correctly yields 0 trades there. Dip/momentum entry presets HURT options WR just as they do stocks. ITM long calls → EXPIRATION exits dominate, barriers stop governing, and runs get very slow (many contracts fetched).

## Defined-risk, no-TP/SL variant (spreads held to settlement)
For credit spreads with NO TP/SL, W/L ≈ credit/(width−credit) and WR ≈ P(short strike holds) — same locked frontier: 0DTE put spreads at 10:00 land ~breakeven exactly at 1:3 (15/25-pt strikes → 73% WR, W/L 0.33, ~$0 P&L). **1-DTE decouples it via overnight drift**: SPX put credit spread short $25 below / long $40 below spot, entry 10:00 daily (concurrent_trades true, eod_action hold, dollar_underlying strikes) → 78% WR, W/L 0.34-0.45, +$21k/yr on 1 contract, ~239 trades/yr, profitable in both halves of Aug 2024–Jul 2025. Enforcing a $1.00 minimum net credit retains all constraints: 120 trades/81.7% WR in Aug24-Jan25 and 119/74.8% in Feb-Jul, with every accepted entry at least $1 credit. With a $2 minimum credit, the narrower $25/$35 (10-wide) variant is the best found: 74/81.1% H1, 94/73.4% H2 (~168 trades/yr, ~77% WR, +$15k/yr, max loss ≈$800). $2-floor alternatives that FAIL 70% WR: call-side mirror (60%, negative), 0DTE/midday iron condors at any distance (60-70%), 2DTE spreads (double overnight gap exposure — crushed in the Feb-Apr 2025 tariff crash). Wide spreads (1%+ apart) fail the ratio badly (losses ≈ max width, W/L 0.04-0.22). Engine: 'No underlying expiration close' errors on holidays are benign per-day skips; multi-DTE runs are slow (~2-3 min per 6 months).

## 15:55-15:59 0DTE settlement window
Last-minutes 0DTE spread pricing is nearly actuarially fair: unconditional entries and ITM-short variants all land on WR≈1/(1+R) (ITM ATM shorts → ~50% WR at W/L 1.2-1.5). Only robust conditional edge found: **fade late-day down-momentum with a call credit spread** — SPX 0DTE short call ~ATM / long +$5, entry window 15:55-15:58, only when 30-min velocity < -0.15% (engine preset_condition '5', lookback 30). ~57 trades/yr, ~90% WR both halves of Aug 2024-Jul 2025, +$3.1k/yr per contract, W/L ~0.4 (fails 1:1.5 RR — WR and RR can't both be beaten here). Fragile knobs: threshold -0.10 and lookback 20 both go NEGATIVE out-of-sample; mirror-image put-spread-on-up-momentum loses. Underlying study: down 30-min momentum at 15:55 → only 35% close higher, mean -3.7 pts more downside.

## Day-trade variant (max_days=0 + empty exit_time → forced EOD close)
Same wall, even tighter. SPX intraday long day-trades (2024-2026, 274 trades) never reach 75% WR with mechanical rules — the forced end-of-day close adds losing days that no entry edge (dip, gap, change-from-open) removes:
- **With TP>SL** (stop is the nearer barrier, hit more often): max WR ~56% (e.g. TP 2% / SL 1.5%). R>2 only with a tiny ~0.25% stop, which crashes WR to ~33%.
- **With TP<SL** (only zone WR climbs): caps at ~66% WR but R drops to ~0.4-0.7.
- Returns are near break-even (single-digit % over 2 yrs, 1-share sizing) — no real intraday edge.

**How to apply:** if a user constrains to day-trades AND TP>SL AND high WR, explain it's structurally impossible (nearer barrier = stop) and that day-trade WR caps ~66% regardless. The engine labels the forced EOD close as exit_reason `max_days`.
