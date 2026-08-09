#!/usr/bin/env python3
"""
Sweep variants of the reference "Rsi" backtest (20260809_023101_634dedad).
Reference: 93 trades, 91.4% WR, 0.473 W/L, avg_win=$521, avg_loss=-$1103

Sweeps:
  W/L improvement  → add stop-loss at $500, $750, $1000 per trade
  W/L improvement  → narrow spread from $5-wide to $3-wide
  Trade count      → remove entry condition (enter every qualifying day)
  Combined         → no entry condition + $750 stop-loss
"""

import subprocess, json, os, sys, csv, tempfile, uuid
from datetime import datetime

# ── base config (copy of reference, with neutralised variants) ──────────────
BASE = {
    "backtest_name": "placeholder",
    "name": "placeholder",
    "symbol": "SPX",
    "dte": 0,
    "strategy": "Short Put Spread",
    "legs": [
        {
            "name": "Short Put",
            "type": "P",
            "position": "short",
            "config_type": "dollar_underlying",
            "params": {"direction": "below", "amount": 1, "strike_fallback": "or_less"}
        },
        {
            "name": "Long Put",
            "type": "P",
            "position": "long",
            "config_type": "dollar_leg",
            "params": {
                "reference": 0,
                "direction": "below",
                "amount": 5,          # ← swept in B variants
                "strike_fallback": "closest",
                "reference_leg": "Short Put"
            }
        }
    ],
    "start_date": "2024-08-08",
    "end_date": "2026-08-06",
    "entry_time": "15:59:00",
    "entry_time_max": "15:59:55",
    "initial_capital": 50000,
    "allocation_type": "contracts",
    "allocation_value": 11,
    "take_profit_pct": None,
    "take_profit_dollar": None,
    "stop_loss_pct": None,
    "stop_loss_dollar": None,       # ← swept in A variants
    "detection_bar_size": 1,
    "ten_second_data": True,
    "seconds_interval": 5,
    "net_premium_min": 0.2,
    "net_premium_max": None,
    "avoid_pdt": False,
    "concurrent_trades": False,
    "allow_synthetic": False,
    "allow_skewed_wings": False,
    "options_entry_type": "custom", # ← set to "none" in C variants
    "preset_condition": "",
    "preset_operator": ">",
    "preset_threshold": "",
    "velocity_lookback": "5",
    "price_conditions": [           # ← cleared in C variants
        {
            "metric": "current_candle",
            "ui_source": "current_price",
            "comparator": "compare_prev_candle",
            "operator": ">",
            "left": {
                "datapoint": "price",
                "candle_color": "either",
                "candle_type": "minute",
                "multiplier": 1,
                "day": "0"
            },
            "right": {
                "candle_type": "minute",
                "multiplier": 1,
                "day": "0",
                "datapoint": "close",
                "candle_color": "green"
            },
            "threshold": {"unit": "dollar", "value": 0, "low": 0, "high": 0}
        }
    ],
    "eod_action": "close",
    "trade_frequency": "daily",
    "entry_days": [],
    "expiry_close_time": "16:15"
}

import copy

VARIANTS = [
    # ── A: stop-loss variants (keep entry condition) ──────────────────────────
    # NOTE: stop_loss_dollar is PER CONTRACT (engine: pnl <= -SL/100 premium pts)
    {
        "label": "SL-50",
        "desc": "Stop-loss $50/contract (~$550/trade at 11x)",
        "overrides": {"stop_loss_dollar": 50}
    },
    {
        "label": "SL-100",
        "desc": "Stop-loss $100/contract (~$1100/trade at 11x)",
        "overrides": {"stop_loss_dollar": 100}
    },
    # ── B: narrower spread (keep entry condition, no SL) ─────────────────────
    {
        "label": "Spread-3",
        "desc": "$3-wide spread instead of $5 (keep momentum filter)",
        "overrides": {"_spread_width": 3}
    },
    # ── C: no entry condition (enter every day) ───────────────────────────────
    {
        "label": "No-Condition",
        "desc": "Remove momentum filter → enter every qualifying day",
        "overrides": {"_no_condition": True}
    },
    # ── C2: relaxed filter — drop green-candle requirement, keep momentum ────
    {
        "label": "AnyColor",
        "desc": "Current price > prev close, prev candle any color",
        "overrides": {"_any_color": True}
    },
    {
        "label": "AnyColor-P35",
        "desc": "AnyColor + min premium $0.35",
        "overrides": {"_any_color": True, "net_premium_min": 0.35}
    },
    # ── D: combined best bets ─────────────────────────────────────────────────
    {
        "label": "NoCond-SL50",
        "desc": "No momentum filter + $50/contract stop-loss",
        "overrides": {"_no_condition": True, "stop_loss_dollar": 50}
    },
]


def make_config(overrides: dict) -> dict:
    cfg = copy.deepcopy(BASE)

    # Special: spread width
    if "_spread_width" in overrides:
        cfg["legs"][1]["params"]["amount"] = overrides.pop("_spread_width")

    # Special: relax green-candle requirement
    if overrides.pop("_any_color", False):
        cfg["price_conditions"][0]["right"]["candle_color"] = "either"

    # Special: remove entry condition
    if overrides.pop("_no_condition", False):
        cfg["options_entry_type"] = "none"
        cfg["price_conditions"] = []

    cfg.update(overrides)
    return cfg


def run_variant(label: str, desc: str, cfg: dict) -> dict:
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    uid = uuid.uuid4().hex[:8]
    backtest_id = f"{ts}_{uid}"
    cfg["backtest_name"] = label
    cfg["name"] = label

    # write config to temp file
    tf = tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False)
    json.dump(cfg, tf)
    tf.close()

    env = os.environ.copy()
    env["POLYGON_API_KEY"] = os.environ.get("POLYGON_API_KEY", "")
    env["CURRENT_BACKTEST_ID"] = backtest_id

    script = os.path.join(os.path.dirname(__file__), "backtest_wrapper.py")
    print(f"\n{'='*60}")
    print(f"  [{label}] {desc}")
    print(f"  ID: {backtest_id}")
    print(f"{'='*60}")

    with open(f"/tmp/sweep_{label}.log", "w") as logf:
        proc = subprocess.Popen(
            ["python3", script, "--config", tf.name, "--id", backtest_id],
            env=env,
            stdout=logf,
            stderr=subprocess.STDOUT,
            text=True
        )
        proc.wait(timeout=900)
    os.unlink(tf.name)

    if proc.returncode != 0:
        print(f"  !! FAILED (exit {proc.returncode})")
        return {"label": label, "desc": desc, "id": backtest_id, "error": True}

    # read metadata
    meta_path = os.path.join("backtest_results", f"metadata_{backtest_id}.json")
    if not os.path.exists(meta_path):
        print("  !! metadata not found")
        return {"label": label, "desc": desc, "id": backtest_id, "error": True}

    with open(meta_path) as f:
        meta = json.load(f)
    s = meta.get("summary", {})

    result = {
        "label": label,
        "desc": desc,
        "id": backtest_id,
        "trades": s.get("total_trades", 0),
        "wr": s.get("win_rate", 0),
        "avg_win": s.get("avg_win", 0),
        "avg_loss": s.get("avg_loss", 0),
        "wl": abs(s["avg_win"] / s["avg_loss"]) if s.get("avg_loss") else 0,
        "total_pnl": s.get("total_pnl", 0),
        "profit_factor": s.get("profit_factor", 0),
        "max_dd": s.get("max_drawdown", 0),
    }
    print(f"\n  RESULT: trades={result['trades']} WR={result['wr']:.1f}% W/L={result['wl']:.3f} "
          f"avgW=${result['avg_win']:.0f} avgL=${result['avg_loss']:.0f} PnL=${result['total_pnl']:,.0f}")
    return result


def print_table(ref: dict, results: list):
    header = f"{'Label':<16} {'Trades':>7} {'WR%':>7} {'W/L':>7} {'AvgW':>8} {'AvgL':>9} {'PnL':>10} {'PF':>6} {'MaxDD%':>8}"
    sep = "-" * len(header)
    print(f"\n{'='*len(header)}")
    print("RESULTS SUMMARY")
    print(f"{'='*len(header)}")
    print(header)
    print(sep)

    def row(d):
        err = d.get("error")
        if err:
            return f"{d['label']:<16} {'ERROR':>7}"
        return (f"{d['label']:<16} {d['trades']:>7} {d['wr']:>7.1f} {d['wl']:>7.3f} "
                f"{d['avg_win']:>8.0f} {d['avg_loss']:>9.0f} {d['total_pnl']:>10,.0f} "
                f"{d['profit_factor']:>6.2f} {d['max_dd']:>8.2f}")

    print(row(ref) + "  ← REFERENCE")
    for r in results:
        delta_trades = f"  Δ{r['trades']-ref['trades']:+d}" if not r.get("error") else ""
        delta_wl = f" Δwl={r['wl']-ref['wl']:+.3f}" if not r.get("error") else ""
        print(row(r) + delta_trades + delta_wl)
    print(sep)


if __name__ == "__main__":
    REFERENCE = {
        "label": "REFERENCE",
        "desc": "Original Rsi run",
        "id": "20260809_023101_634dedad",
        "trades": 93,
        "wr": 91.4,
        "avg_win": 521.40,
        "avg_loss": -1102.75,
        "wl": 521.40 / 1102.75,
        "total_pnl": 35497.0,
        "profit_factor": 5.02,
        "max_dd": -6.59,
    }

    # Usage: sweep_rsi_variants.py <label> <start_date> <end_date>
    only = sys.argv[1]
    start = sys.argv[2]
    end = sys.argv[3]
    v = next(x for x in VARIANTS if x["label"] == only)
    cfg = make_config(v["overrides"].copy())
    cfg["start_date"] = start
    cfg["end_date"] = end
    r = run_variant(v["label"], v["desc"], cfg)
    # append run record
    with open("backtest_results/sweep_runs.jsonl", "a") as f:
        f.write(json.dumps({"label": only, "start": start, "end": end, "id": r["id"], "error": bool(r.get("error"))}) + "\n")
