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

## Day-trade variant (max_days=0 + empty exit_time → forced EOD close)
Same wall, even tighter. SPX intraday long day-trades (2024-2026, 274 trades) never reach 75% WR with mechanical rules — the forced end-of-day close adds losing days that no entry edge (dip, gap, change-from-open) removes:
- **With TP>SL** (stop is the nearer barrier, hit more often): max WR ~56% (e.g. TP 2% / SL 1.5%). R>2 only with a tiny ~0.25% stop, which crashes WR to ~33%.
- **With TP<SL** (only zone WR climbs): caps at ~66% WR but R drops to ~0.4-0.7.
- Returns are near break-even (single-digit % over 2 yrs, 1-share sizing) — no real intraday edge.

**How to apply:** if a user constrains to day-trades AND TP>SL AND high WR, explain it's structurally impossible (nearer barrier = stop) and that day-trade WR caps ~66% regardless. The engine labels the forced EOD close as exit_reason `max_days`.
