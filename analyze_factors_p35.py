#!/usr/bin/env python3
"""Factor analysis of AnyColor-P35 run (108 trades).
Computes entry-time factors from SPX 1-min bars and correlates with W/L + premium.
"""
import os, csv, json, pickle, sys
import requests
import pandas as pd
import numpy as np

CACHE = 'backtest_results/spx_1min_cache.pkl'
API = os.environ['POLYGON_API_KEY']
IDS = ['20260809_033233_4135877f', '20260809_033233_1a488e92']

# ── load trades ──────────────────────────────────────────────
rows = []
for i in IDS:
    rows += list(csv.DictReader(open(f'backtest_results/trade_log_{i}.csv')))
trades = pd.DataFrame(rows)
for c in ['underlying_price', 'pnl', 'net_premium_entry', 'leg1_strike']:
    trades[c] = trades[c].astype(float)
trades['win'] = trades['pnl'] > 0
print(f"trades: {len(trades)}, wins {trades.win.sum()}, losses {(~trades.win).sum()}")

# ── fetch/cache SPX 1-min bars ───────────────────────────────
if os.path.exists(CACHE):
    df = pickle.load(open(CACHE, 'rb'))
else:
    url = f"https://api.polygon.io/v2/aggs/ticker/I:SPX/range/1/minute/2024-08-01/2026-08-07?adjusted=true&sort=asc&limit=50000&apiKey={API}"
    all_r = []
    while url:
        j = requests.get(url, timeout=60).json()
        all_r += j.get('results', [])
        url = j.get('next_url')
        if url: url += f"&apiKey={API}"
        print('fetched', len(all_r))
    df = pd.DataFrame(all_r)
    df['ts'] = pd.to_datetime(df['t'], unit='ms', utc=True).dt.tz_convert('America/New_York')
    df = df.rename(columns={'o':'open','h':'high','l':'low','c':'close'})[['ts','open','high','low','close']]
    pickle.dump(df, open(CACHE, 'wb'))
print('bars:', len(df))

df['date'] = df['ts'].dt.strftime('%Y-%m-%d')
df['hm'] = df['ts'].dt.strftime('%H:%M')
by_day = {d: g.reset_index(drop=True) for d, g in df.groupby('date')}

def rsi(closes, n=14):
    d = np.diff(closes)
    if len(d) < n: return np.nan
    g = np.where(d > 0, d, 0.0); l = np.where(d < 0, -d, 0.0)
    ag = g[:n].mean(); al = l[:n].mean()
    for i in range(n, len(d)):
        ag = (ag*(n-1)+g[i])/n; al = (al*(n-1)+l[i])/n
    return 100.0 if al == 0 else 100 - 100/(1+ag/al)

feat = []
for _, t in trades.iterrows():
    d = t['entry_date']; g = by_day.get(d)
    if g is None: feat.append({}); continue
    g = g[g['hm'] <= '15:58'].reset_index(drop=True)   # completed bars before 15:59 entry
    if len(g) < 60: feat.append({}); continue
    cl = g['close'].values
    last = g.iloc[-1]; prev = g.iloc[-2]
    f = {}
    f['dist_strike'] = t['underlying_price'] - t['leg1_strike']       # entry px - short strike
    f['last_color'] = 'G' if last['close'] > last['open'] else 'R'
    f['prev_color'] = 'G' if prev['close'] > prev['open'] else 'R'
    f['n_green_last5'] = sum(g.iloc[-5:]['close'].values > g.iloc[-5:]['open'].values)
    f['last_range'] = last['high'] - last['low']
    # 5-min bar: 15:55-15:59 forming; its open vs previous 5-min (15:50-15:54) close
    g5o = g[g['hm'] == '15:55']; g5pc = g[g['hm'] == '15:54']
    f['open5_vs_prev5close'] = (g5o.iloc[0]['open'] - g5pc.iloc[0]['close']) if len(g5o) and len(g5pc) else np.nan
    f['vel5'] = (cl[-1]/cl[-6]-1)*100 if len(cl) >= 6 else np.nan
    f['vel15'] = (cl[-1]/cl[-16]-1)*100 if len(cl) >= 16 else np.nan
    f['vel30'] = (cl[-1]/cl[-31]-1)*100 if len(cl) >= 31 else np.nan
    f['vs_ma20'] = cl[-1] - cl[-20:].mean()
    f['vs_ma50'] = cl[-1] - cl[-50:].mean()
    f['vs_vwap_day'] = cl[-1] - g['close'].mean()   # approx (no volume for index)
    f['rsi14'] = rsi(cl[-40:])
    f['day_chg'] = (cl[-1]/g.iloc[0]['open']-1)*100
    f['day_range_pct'] = (g['high'].max()-g['low'].min())/cl[-1]*100
    f['close_pos_in_range'] = (cl[-1]-g['low'].min())/max(g['high'].max()-g['low'].min(), 1e-9)
    # gap: today's open vs prev day close
    dates = sorted(by_day)
    pi = dates.index(d)-1
    if pi >= 0:
        pc = by_day[dates[pi]]
        pc = pc[pc['hm'] <= '16:00']
        f['gap_pct'] = (g.iloc[0]['open']/pc.iloc[-1]['close']-1)*100 if len(pc) else np.nan
    feat.append(f)

F = pd.concat([trades.reset_index(drop=True), pd.DataFrame(feat)], axis=1)
F.to_csv('backtest_results/p35_factors.csv', index=False)

num_cols = ['dist_strike','n_green_last5','last_range','open5_vs_prev5close','vel5','vel15','vel30',
            'vs_ma20','vs_ma50','vs_vwap_day','rsi14','day_chg','day_range_pct','close_pos_in_range','gap_pct',
            'net_premium_entry']
print('\n── mean by outcome ──')
print(F.groupby('win')[num_cols].mean().T.round(3))
print('\n── losses detail ──')
print(F[~F.win][['entry_date','pnl','net_premium_entry','dist_strike','vel15','vs_ma20','vs_ma50','rsi14','day_chg','close_pos_in_range','gap_pct','last_color','n_green_last5']].to_string(index=False))
