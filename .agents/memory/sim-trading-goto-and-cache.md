---
name: Sim trading goto & rolling cache
description: Rules for date navigation and resolution switches in simulated trading scripts
---
- Polygon aggs `limit` counts BASE (1-sec) aggregates, not returned bars — `get_aggs` silently truncates multi-day seconds windows mid-day (~50k sec ≈ 2 RTH days). Use `list_aggs` (auto-pagination) for sub-minute fetches.
- Seconds mode uses a rolling fetch window **centered** on the anchor day (maxDaysForSecondsInterval: 3/5/7/14). Never request the full session range of sub-minute data — Polygon returns empty/times out.
- `gotoDateTime` must reload (loadSimulatedChart(null, targetTs)) when the target is outside cache bounds **in either direction**, or when the cache resolution is stale.
- Stale-cache detection: compare `simCacheBarSpacingMs` (recorded at load time in loadSimulatedChart) against expected spacing. **Why:** inferring from `bar[1]-bar[0]` breaks on day gaps/sparse data.
- goto searches the whole cache — the `simTradingStartMinuteIndex` floor applies only to prev/next step buttons. **Why:** the floor caused goto to silently snap to the trading-start bar for earlier dates.
- goto must bail while `simIsChangingResolution` is set — concurrent loads race on the same globals.
- Lightweight-charts v4: `localization.timeFormatter` only styles the crosshair label; the axis needs `timeScale.tickMarkFormatter` (ET) or ticks fall back to UTC.
- Root and static/js copies of simulated-trading-script.js must stay byte-identical (verify with md5sum diff).
