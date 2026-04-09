const STRATEGY_DATA = [
  {
    id: 'long-call',
    name: 'Long Call',
    category: 'single',
    outlook: 'Bullish',
    outlookIcon: 'fa-arrow-up',
    outlookColor: '#089981',
    riskProfile: 'Limited Risk / Unlimited Reward',
    maxProfit: 'Unlimited',
    maxLoss: 'Premium paid',
    breakeven: 'Strike + Premium paid',
    legs: [
      { label: 'Buy 1 Call', type: 'call', position: 'long', strikeDesc: 'ATM or OTM' }
    ],
    description: 'The most basic bullish options strategy. You purchase a call option expecting the underlying to rise above the strike price before expiration. Profits grow dollar-for-dollar above the breakeven point.',
    idealEntry: 'Enter when you expect a significant move upward. Best when IV is relatively low (options are cheap). Look for catalysts like earnings, product launches, or technical breakouts.',
    idealExit: 'Take profit at 50-100% of premium paid. Cut losses at 50% of premium. Close before expiration if deep OTM to salvage remaining time value.',
    payoff: { type: 'long_call', strike: 100, premium: 5 }
  },
  {
    id: 'long-put',
    name: 'Long Put',
    category: 'single',
    outlook: 'Bearish',
    outlookIcon: 'fa-arrow-down',
    outlookColor: '#f23645',
    riskProfile: 'Limited Risk / High Reward',
    maxProfit: 'Strike - Premium (if stock goes to 0)',
    maxLoss: 'Premium paid',
    breakeven: 'Strike - Premium paid',
    legs: [
      { label: 'Buy 1 Put', type: 'put', position: 'long', strikeDesc: 'ATM or OTM' }
    ],
    description: 'The most basic bearish options strategy. You purchase a put option expecting the underlying to fall below the strike price. Functions as portfolio insurance or a directional bet on downside.',
    idealEntry: 'Enter when you expect a significant move downward. Best when IV is low. Look for deteriorating fundamentals, technical breakdowns, or macro headwinds.',
    idealExit: 'Take profit at 50-100% of premium paid. Consider rolling down if the stock drops significantly. Close before expiration to avoid pin risk.',
    payoff: { type: 'long_put', strike: 100, premium: 5 }
  },
  {
    id: 'naked-short-call',
    name: 'Naked Short Call',
    category: 'single',
    outlook: 'Bearish / Neutral',
    outlookIcon: 'fa-arrow-down',
    outlookColor: '#f23645',
    riskProfile: 'Unlimited Risk / Limited Reward',
    maxProfit: 'Premium received',
    maxLoss: 'Unlimited',
    breakeven: 'Strike + Premium received',
    legs: [
      { label: 'Sell 1 Call', type: 'call', position: 'short', strikeDesc: 'OTM' }
    ],
    description: 'An aggressive income strategy with unlimited upside risk. You sell a call option, collecting premium, betting the stock stays below the strike. Requires high margin and careful risk management.',
    idealEntry: 'Enter when IV is elevated (overpriced options). Best after a spike in volatility or when you have strong conviction the stock will not rally. Use OTM strikes for margin of safety.',
    idealExit: 'Buy back at 50-75% of max profit. Always have a stop-loss plan. Close immediately if the stock threatens the strike price. Never hold through earnings or major events.',
    payoff: { type: 'short_call', strike: 100, premium: 5 }
  },
  {
    id: 'naked-short-put',
    name: 'Naked Short Put',
    category: 'single',
    outlook: 'Bullish / Neutral',
    outlookIcon: 'fa-arrow-up',
    outlookColor: '#089981',
    riskProfile: 'High Risk / Limited Reward',
    maxProfit: 'Premium received',
    maxLoss: 'Strike - Premium (if stock goes to 0)',
    breakeven: 'Strike - Premium received',
    legs: [
      { label: 'Sell 1 Put', type: 'put', position: 'short', strikeDesc: 'OTM' }
    ],
    description: 'A popular premium-selling strategy. You sell a put option, collecting premium, betting the stock stays above the strike. Often used as a way to get paid to wait for a stock at a lower price.',
    idealEntry: 'Enter when IV is elevated and you are bullish or neutral. Sell puts at strike prices where you would be willing to own the stock. Best on strong companies after a pullback.',
    idealExit: 'Buy back at 50-75% of max profit. Roll down and out if challenged. Close before ex-dividend dates. If assigned, be prepared to own the shares.',
    payoff: { type: 'short_put', strike: 100, premium: 5 }
  },
  {
    id: 'short-put-spread',
    name: 'Short Put Spread (Bull Put)',
    category: 'vertical',
    outlook: 'Bullish / Neutral',
    outlookIcon: 'fa-arrow-up',
    outlookColor: '#089981',
    riskProfile: 'Limited Risk / Limited Reward',
    maxProfit: 'Net premium received',
    maxLoss: 'Width of strikes - Premium received',
    breakeven: 'Short strike - Net premium received',
    legs: [
      { label: 'Sell 1 Put', type: 'put', position: 'short', strikeDesc: 'Higher strike (closer to ATM)' },
      { label: 'Buy 1 Put', type: 'put', position: 'long', strikeDesc: 'Lower strike (further OTM)' }
    ],
    description: 'A credit spread that profits when the stock stays above the short put strike. The long put limits downside risk. Popular strategy for consistent income with defined risk.',
    idealEntry: 'Enter when IV is elevated (higher premiums). Place short strike below support levels. Best with 30-45 DTE for optimal theta decay. Probability of profit typically 60-70%.',
    idealExit: 'Buy back at 50% of max profit. Close if the stock breaks below the short strike. Roll down if challenged with > 21 DTE remaining. Close at 21 DTE if not yet profitable.',
    payoff: { type: 'bull_put_spread', shortStrike: 95, longStrike: 90, premium: 2 }
  },
  {
    id: 'short-call-spread',
    name: 'Short Call Spread (Bear Call)',
    category: 'vertical',
    outlook: 'Bearish / Neutral',
    outlookIcon: 'fa-arrow-down',
    outlookColor: '#f23645',
    riskProfile: 'Limited Risk / Limited Reward',
    maxProfit: 'Net premium received',
    maxLoss: 'Width of strikes - Premium received',
    breakeven: 'Short strike + Net premium received',
    legs: [
      { label: 'Sell 1 Call', type: 'call', position: 'short', strikeDesc: 'Lower strike (closer to ATM)' },
      { label: 'Buy 1 Call', type: 'call', position: 'long', strikeDesc: 'Higher strike (further OTM)' }
    ],
    description: 'A credit spread that profits when the stock stays below the short call strike. The long call caps upside risk. Mirror image of the bull put spread for bearish outlook.',
    idealEntry: 'Enter when IV is elevated. Place short strike above resistance levels. Best with 30-45 DTE. Look for overbought conditions, failed breakouts, or downtrending stocks.',
    idealExit: 'Buy back at 50% of max profit. Close if the stock breaks above the short strike. Roll up if challenged with time remaining. Manage at 21 DTE.',
    payoff: { type: 'bear_call_spread', shortStrike: 105, longStrike: 110, premium: 2 }
  },
  {
    id: 'long-call-spread',
    name: 'Long Call Spread (Bull Call)',
    category: 'vertical',
    outlook: 'Moderately Bullish',
    outlookIcon: 'fa-arrow-up',
    outlookColor: '#089981',
    riskProfile: 'Limited Risk / Limited Reward',
    maxProfit: 'Width of strikes - Net debit paid',
    maxLoss: 'Net debit paid',
    breakeven: 'Long strike + Net debit paid',
    legs: [
      { label: 'Buy 1 Call', type: 'call', position: 'long', strikeDesc: 'Lower strike (ATM or slightly OTM)' },
      { label: 'Sell 1 Call', type: 'call', position: 'short', strikeDesc: 'Higher strike (further OTM)' }
    ],
    description: 'A debit spread that reduces the cost of a long call by selling a higher-strike call. Caps upside potential but makes the trade more affordable. Best for moderate bullish moves.',
    idealEntry: 'Enter when IV is moderate to low. Best when expecting a move to the short strike by expiration. Use 30-60 DTE. Place short strike at your target price for the underlying.',
    idealExit: 'Close at 50-75% of max profit. Let run to expiration only if deep ITM. Close early if the bullish thesis is invalidated. Roll the short strike higher if the stock surges.',
    payoff: { type: 'bull_call_spread', longStrike: 100, shortStrike: 105, premium: 3 }
  },
  {
    id: 'long-put-spread',
    name: 'Long Put Spread (Bear Put)',
    category: 'vertical',
    outlook: 'Moderately Bearish',
    outlookIcon: 'fa-arrow-down',
    outlookColor: '#f23645',
    riskProfile: 'Limited Risk / Limited Reward',
    maxProfit: 'Width of strikes - Net debit paid',
    maxLoss: 'Net debit paid',
    breakeven: 'Long strike - Net debit paid',
    legs: [
      { label: 'Buy 1 Put', type: 'put', position: 'long', strikeDesc: 'Higher strike (ATM or slightly OTM)' },
      { label: 'Sell 1 Put', type: 'put', position: 'short', strikeDesc: 'Lower strike (further OTM)' }
    ],
    description: 'A debit spread that reduces the cost of a long put by selling a lower-strike put. Caps downside profit but lowers cost basis. Best for moderate bearish moves to a specific target.',
    idealEntry: 'Enter when IV is moderate to low. Best when expecting a decline to the short strike. Use 30-60 DTE. Place short strike at your downside target level.',
    idealExit: 'Close at 50-75% of max profit. Close early if bearish thesis weakens. Do not hold to expiration if only slightly ITM due to pin risk.',
    payoff: { type: 'bear_put_spread', longStrike: 100, shortStrike: 95, premium: 3 }
  },
  {
    id: 'short-iron-condor',
    name: 'Short Iron Condor',
    category: 'iron',
    outlook: 'Neutral / Low Volatility',
    outlookIcon: 'fa-arrows-alt-h',
    outlookColor: '#6c5ce7',
    riskProfile: 'Limited Risk / Limited Reward',
    maxProfit: 'Net premium received',
    maxLoss: 'Width of widest spread - Net premium',
    breakeven: 'Short put - Premium / Short call + Premium',
    legs: [
      { label: 'Buy 1 Put', type: 'put', position: 'long', strikeDesc: 'Lowest strike (OTM wing)' },
      { label: 'Sell 1 Put', type: 'put', position: 'short', strikeDesc: 'Lower-middle strike (OTM)' },
      { label: 'Sell 1 Call', type: 'call', position: 'short', strikeDesc: 'Upper-middle strike (OTM)' },
      { label: 'Buy 1 Call', type: 'call', position: 'long', strikeDesc: 'Highest strike (OTM wing)' }
    ],
    description: 'The quintessential neutral strategy. Combines a bull put spread and bear call spread. Profits when the stock stays within a range. The most popular multi-leg premium-selling strategy.',
    idealEntry: 'Enter when IV rank is above 50% (IV is elevated relative to its range). Use 30-45 DTE. Place short strikes at 1 standard deviation OTM (~16 delta). Collect at least 1/3 of the width.',
    idealExit: 'Buy back at 50% of max profit. Close if either short strike is breached. Roll the tested side away from the stock. Manage at 21 DTE if not yet profitable.',
    payoff: { type: 'iron_condor', putWing: 85, putShort: 90, callShort: 110, callWing: 115, premium: 3 }
  },
  {
    id: 'long-iron-condor',
    name: 'Long Iron Condor',
    category: 'iron',
    outlook: 'High Volatility / Big Move Expected',
    outlookIcon: 'fa-expand-arrows-alt',
    outlookColor: '#e67e22',
    riskProfile: 'Limited Risk / Limited Reward',
    maxProfit: 'Width of spread - Net debit paid',
    maxLoss: 'Net debit paid',
    breakeven: 'Long put - Debit / Long call + Debit',
    legs: [
      { label: 'Sell 1 Put', type: 'put', position: 'short', strikeDesc: 'Lowest strike (OTM wing)' },
      { label: 'Buy 1 Put', type: 'put', position: 'long', strikeDesc: 'Lower-middle strike (OTM)' },
      { label: 'Buy 1 Call', type: 'call', position: 'long', strikeDesc: 'Upper-middle strike (OTM)' },
      { label: 'Sell 1 Call', type: 'call', position: 'short', strikeDesc: 'Highest strike (OTM wing)' }
    ],
    description: 'The inverse of a short iron condor. A debit strategy that profits when the stock makes a big move in either direction. Combines a bear put spread and a bull call spread.',
    idealEntry: 'Enter when IV is low and you expect a significant upcoming move (earnings, FDA decision, etc.). Use shorter DTE (7-21 days) to reduce time decay drag.',
    idealExit: 'Take profit when one side reaches 50-75% of max profit. Close the losing side early. This strategy requires a big move, so do not hold passively — manage actively.',
    payoff: { type: 'long_iron_condor', putWing: 85, putLong: 90, callLong: 110, callWing: 115, premium: 3 }
  },
  {
    id: 'short-iron-butterfly',
    name: 'Short Iron Butterfly',
    category: 'iron',
    outlook: 'Neutral / Pin to Strike',
    outlookIcon: 'fa-bullseye',
    outlookColor: '#6c5ce7',
    riskProfile: 'Limited Risk / Limited Reward',
    maxProfit: 'Net premium received',
    maxLoss: 'Width of wing - Net premium',
    breakeven: 'Center - Premium / Center + Premium',
    legs: [
      { label: 'Buy 1 Put', type: 'put', position: 'long', strikeDesc: 'Lower wing (OTM)' },
      { label: 'Sell 1 Put', type: 'put', position: 'short', strikeDesc: 'Center strike (ATM)' },
      { label: 'Sell 1 Call', type: 'call', position: 'short', strikeDesc: 'Center strike (ATM)' },
      { label: 'Buy 1 Call', type: 'call', position: 'long', strikeDesc: 'Upper wing (OTM)' }
    ],
    description: 'A concentrated version of the iron condor where both short options are at the same ATM strike. Collects more premium but has a narrower profit zone. Best when expecting minimal movement.',
    idealEntry: 'Enter when IV is very high and you expect the stock to stay near current price. Use 30-45 DTE. Place the center strike ATM. Best on range-bound stocks with strong support/resistance.',
    idealExit: 'Buy back at 25-50% of max profit (tighter profit zone means faster management). Close if the stock moves 1 standard deviation from center. Do not hold to expiration.',
    payoff: { type: 'iron_butterfly', wing: 10, center: 100, premium: 7 }
  },
  {
    id: 'long-iron-butterfly',
    name: 'Long Iron Butterfly',
    category: 'iron',
    outlook: 'Big Move Expected',
    outlookIcon: 'fa-expand-arrows-alt',
    outlookColor: '#e67e22',
    riskProfile: 'Limited Risk / Limited Reward',
    maxProfit: 'Width of wing - Net debit paid',
    maxLoss: 'Net debit paid',
    breakeven: 'Center - (Wing - Debit) / Center + (Wing - Debit)',
    legs: [
      { label: 'Sell 1 Put', type: 'put', position: 'short', strikeDesc: 'Lower wing (OTM)' },
      { label: 'Buy 1 Put', type: 'put', position: 'long', strikeDesc: 'Center strike (ATM)' },
      { label: 'Buy 1 Call', type: 'call', position: 'long', strikeDesc: 'Center strike (ATM)' },
      { label: 'Sell 1 Call', type: 'call', position: 'short', strikeDesc: 'Upper wing (OTM)' }
    ],
    description: 'The inverse of a short iron butterfly. A debit strategy that profits from a large move in either direction. Cheaper than a straddle due to the sold wings, but capped profit potential.',
    idealEntry: 'Enter when IV is low and a big move is expected. Best before binary events. Use wider wings for more potential profit. Short DTE (7-21 days) works best.',
    idealExit: 'Take profit when the stock moves beyond a wing strike. Close the losing side early. Requires active management — do not hold passively.',
    payoff: { type: 'long_iron_butterfly', wing: 10, center: 100, premium: 4 }
  },
  {
    id: 'long-straddle',
    name: 'Long Straddle',
    category: 'volatility',
    outlook: 'Big Move Expected (Either Direction)',
    outlookIcon: 'fa-expand-arrows-alt',
    outlookColor: '#e67e22',
    riskProfile: 'Limited Risk / Unlimited Reward',
    maxProfit: 'Unlimited (upside) / Substantial (downside)',
    maxLoss: 'Total premium paid (both legs)',
    breakeven: 'Strike ± Total premium paid',
    legs: [
      { label: 'Buy 1 Call', type: 'call', position: 'long', strikeDesc: 'ATM strike' },
      { label: 'Buy 1 Put', type: 'put', position: 'long', strikeDesc: 'ATM strike (same as call)' }
    ],
    description: 'Buy both a call and put at the same ATM strike. Profits from a big move in either direction. One of the purest volatility plays — you are buying volatility itself.',
    idealEntry: 'Enter when IV is low (cheap options) and you expect a major move. Best before earnings, FDA decisions, or macro events. Use 30-60 DTE to give the trade time to work.',
    idealExit: 'Take profit when total position reaches 25-50% gain. Close the winning side and hold the losing side as a lottery ticket. Cut losses at 25-30% of total premium paid.',
    payoff: { type: 'long_straddle', strike: 100, premium: 8 }
  },
  {
    id: 'short-straddle',
    name: 'Short Straddle',
    category: 'volatility',
    outlook: 'Neutral / Low Volatility',
    outlookIcon: 'fa-minus',
    outlookColor: '#6c5ce7',
    riskProfile: 'Unlimited Risk / Limited Reward',
    maxProfit: 'Total premium received',
    maxLoss: 'Unlimited',
    breakeven: 'Strike ± Total premium received',
    legs: [
      { label: 'Sell 1 Call', type: 'call', position: 'short', strikeDesc: 'ATM strike' },
      { label: 'Sell 1 Put', type: 'put', position: 'short', strikeDesc: 'ATM strike (same as call)' }
    ],
    description: 'Sell both a call and put at the same ATM strike. Collects maximum premium but has unlimited risk. Profits when the stock stays near the strike through expiration.',
    idealEntry: 'Enter when IV rank is very high (>70%). Best on stocks with high IV that tends to mean-revert. Use 30-45 DTE. Requires margin and careful position sizing.',
    idealExit: 'Buy back at 25-50% of max profit. Close if the stock moves beyond 1.5x the premium received from the strike. Use strict stop-losses. Never hold through earnings.',
    payoff: { type: 'short_straddle', strike: 100, premium: 8 }
  },
  {
    id: 'long-strangle',
    name: 'Long Strangle',
    category: 'volatility',
    outlook: 'Big Move Expected (Either Direction)',
    outlookIcon: 'fa-expand-arrows-alt',
    outlookColor: '#e67e22',
    riskProfile: 'Limited Risk / Unlimited Reward',
    maxProfit: 'Unlimited (upside) / Substantial (downside)',
    maxLoss: 'Total premium paid',
    breakeven: 'Put strike - Premium / Call strike + Premium',
    legs: [
      { label: 'Buy 1 Call', type: 'call', position: 'long', strikeDesc: 'OTM call (above current price)' },
      { label: 'Buy 1 Put', type: 'put', position: 'long', strikeDesc: 'OTM put (below current price)' }
    ],
    description: 'Similar to a straddle but uses OTM options, making it cheaper. Requires a bigger move to profit but costs less upfront. Popular before known binary events.',
    idealEntry: 'Enter when IV is low. Cheaper than a straddle, but needs a bigger move. Best before major catalysts. Place strikes ~1 standard deviation OTM. Use 30-45 DTE.',
    idealExit: 'Take profit at 25-50% gain on total position. The winning side must overcome both premiums. Cut losses at 50% of total debit paid. Close early if the catalyst passes without a move.',
    payoff: { type: 'long_strangle', callStrike: 105, putStrike: 95, premium: 4 }
  },
  {
    id: 'short-strangle',
    name: 'Short Strangle',
    category: 'volatility',
    outlook: 'Neutral / Range-Bound',
    outlookIcon: 'fa-arrows-alt-h',
    outlookColor: '#6c5ce7',
    riskProfile: 'Unlimited Risk / Limited Reward',
    maxProfit: 'Total premium received',
    maxLoss: 'Unlimited',
    breakeven: 'Put strike - Premium / Call strike + Premium',
    legs: [
      { label: 'Sell 1 Call', type: 'call', position: 'short', strikeDesc: 'OTM call (above current price)' },
      { label: 'Sell 1 Put', type: 'put', position: 'short', strikeDesc: 'OTM put (below current price)' }
    ],
    description: 'Sell both an OTM call and OTM put. Wider profit zone than a short straddle but collects less premium. One of the most popular premium-selling strategies for experienced traders.',
    idealEntry: 'Enter when IV rank is above 50%. Use 30-45 DTE. Place short strikes at ~16 delta (1 SD OTM). Best on liquid underlyings with high IV that tends to contract.',
    idealExit: 'Buy back at 50% of max profit. Close if either strike is breached. Roll the tested side out in time. Use mechanical rules — do not let emotions drive decisions.',
    payoff: { type: 'short_strangle', callStrike: 105, putStrike: 95, premium: 4 }
  },
  {
    id: 'calendar-call-spread',
    name: 'Calendar Call Spread',
    category: 'calendar',
    outlook: 'Neutral to Slightly Bullish',
    outlookIcon: 'fa-calendar-alt',
    outlookColor: '#3498db',
    riskProfile: 'Limited Risk / Limited Reward',
    maxProfit: 'Depends on IV and time differential',
    maxLoss: 'Net debit paid',
    breakeven: 'Varies with IV and time to expiration',
    legs: [
      { label: 'Sell 1 Call (near-term)', type: 'call', position: 'short', strikeDesc: 'Same strike, shorter DTE' },
      { label: 'Buy 1 Call (far-term)', type: 'call', position: 'long', strikeDesc: 'Same strike, longer DTE' }
    ],
    description: 'Exploit time decay differential by selling a near-term call and buying a longer-term call at the same strike. The short call decays faster, creating profit. Also benefits from IV increases.',
    idealEntry: 'Enter when IV is low (benefits from IV expansion). Place at ATM strike for maximum theta differential. Use 7-14 DTE for short leg and 30-60 DTE for long leg.',
    idealExit: 'Close before the short leg expires. Take profit at 25-50% of debit paid. Close if the stock moves significantly away from the strike. Roll the short leg if profitable.',
    payoff: { type: 'calendar', strike: 100, netDebit: 3, isCall: true }
  },
  {
    id: 'calendar-put-spread',
    name: 'Calendar Put Spread',
    category: 'calendar',
    outlook: 'Neutral to Slightly Bearish',
    outlookIcon: 'fa-calendar-alt',
    outlookColor: '#3498db',
    riskProfile: 'Limited Risk / Limited Reward',
    maxProfit: 'Depends on IV and time differential',
    maxLoss: 'Net debit paid',
    breakeven: 'Varies with IV and time to expiration',
    legs: [
      { label: 'Sell 1 Put (near-term)', type: 'put', position: 'short', strikeDesc: 'Same strike, shorter DTE' },
      { label: 'Buy 1 Put (far-term)', type: 'put', position: 'long', strikeDesc: 'Same strike, longer DTE' }
    ],
    description: 'Put version of the calendar spread. Sell a near-term put and buy a longer-term put at the same strike. Profits from time decay and IV expansion, similar to the call calendar.',
    idealEntry: 'Enter when IV is low. Place at ATM or slightly OTM put strike. Best when you expect the stock to stay near the strike price through the short expiration.',
    idealExit: 'Close before short expiration. Take profit at 25-50% of debit. The position profits most when the stock is at the strike at short expiration.',
    payoff: { type: 'calendar', strike: 100, netDebit: 3, isCall: false }
  },
  {
    id: 'diagonal-call-spread',
    name: 'Diagonal Call Spread',
    category: 'calendar',
    outlook: 'Moderately Bullish',
    outlookIcon: 'fa-arrow-up',
    outlookColor: '#089981',
    riskProfile: 'Limited Risk / Limited Reward',
    maxProfit: 'Depends on IV and time/strike differential',
    maxLoss: 'Net debit paid',
    breakeven: 'Varies with IV and time to expiration',
    legs: [
      { label: 'Sell 1 Call (near-term)', type: 'call', position: 'short', strikeDesc: 'Higher strike, shorter DTE' },
      { label: 'Buy 1 Call (far-term)', type: 'call', position: 'long', strikeDesc: 'Lower strike, longer DTE' }
    ],
    description: 'A calendar spread with different strikes. Combines directional bias with time decay. The long call is deeper ITM/ATM with more DTE, while the short call is OTM with less DTE.',
    idealEntry: 'Enter when IV is low to moderate. Buy the long call ITM or ATM with 45-90 DTE. Sell the short call OTM with 7-21 DTE. Creates a "poor man\'s covered call" effect.',
    idealExit: 'Close the short call at 50-75% profit, then sell another short call (roll). Close entire position at 25-50% of debit paid. Roll the short call to the next expiration cycle.',
    payoff: { type: 'diagonal', longStrike: 95, shortStrike: 105, netDebit: 4, isCall: true }
  },
  {
    id: 'diagonal-put-spread',
    name: 'Diagonal Put Spread',
    category: 'calendar',
    outlook: 'Moderately Bearish',
    outlookIcon: 'fa-arrow-down',
    outlookColor: '#f23645',
    riskProfile: 'Limited Risk / Limited Reward',
    maxProfit: 'Depends on IV and time/strike differential',
    maxLoss: 'Net debit paid',
    breakeven: 'Varies with IV and time to expiration',
    legs: [
      { label: 'Sell 1 Put (near-term)', type: 'put', position: 'short', strikeDesc: 'Lower strike, shorter DTE' },
      { label: 'Buy 1 Put (far-term)', type: 'put', position: 'long', strikeDesc: 'Higher strike, longer DTE' }
    ],
    description: 'Put version of the diagonal spread. Combines bearish bias with time decay. Buy an ITM/ATM long put with more DTE and sell an OTM short put with less DTE.',
    idealEntry: 'Enter when IV is low to moderate and you are moderately bearish. Buy the long put ATM or slightly ITM with 45-90 DTE. Sell the short put OTM with 7-21 DTE.',
    idealExit: 'Close the short put at 50-75% profit and sell another (roll). Close entire position at 25-50% profit. Manage if stock rallies significantly above the long put strike.',
    payoff: { type: 'diagonal', longStrike: 105, shortStrike: 95, netDebit: 4, isCall: false }
  },
  {
    id: 'double-calendar',
    name: 'Double Calendar',
    category: 'calendar',
    outlook: 'Neutral / Low Volatility Expected',
    outlookIcon: 'fa-arrows-alt-h',
    outlookColor: '#6c5ce7',
    riskProfile: 'Limited Risk / Limited Reward',
    maxProfit: 'Depends on IV expansion and time decay',
    maxLoss: 'Net debit paid',
    breakeven: 'Two breakeven zones around each strike',
    legs: [
      { label: 'Sell 1 Put (near)', type: 'put', position: 'short', strikeDesc: 'Lower strike, shorter DTE' },
      { label: 'Buy 1 Put (far)', type: 'put', position: 'long', strikeDesc: 'Lower strike, longer DTE' },
      { label: 'Sell 1 Call (near)', type: 'call', position: 'short', strikeDesc: 'Higher strike, shorter DTE' },
      { label: 'Buy 1 Call (far)', type: 'call', position: 'long', strikeDesc: 'Higher strike, longer DTE' }
    ],
    description: 'Two calendar spreads (one put, one call) at different strikes. Creates two profit peaks. Benefits from IV expansion and time decay. A more flexible version of the iron condor using time.',
    idealEntry: 'Enter when IV is low (will benefit from IV expansion). Place put and call strikes equidistant from current price. Use 7-14 DTE for short legs and 30-60 DTE for long legs.',
    idealExit: 'Close before short legs expire. Take profit at 10-25% of debit. Best outcome is stock stays between the two strikes and IV increases. Close if stock moves outside the strikes.',
    payoff: { type: 'double_calendar', putStrike: 95, callStrike: 105, netDebit: 5 }
  },
  {
    id: 'double-diagonal',
    name: 'Double Diagonal',
    category: 'calendar',
    outlook: 'Neutral with Directional Flexibility',
    outlookIcon: 'fa-arrows-alt-h',
    outlookColor: '#6c5ce7',
    riskProfile: 'Limited Risk / Limited Reward',
    maxProfit: 'Depends on IV and time/strike differentials',
    maxLoss: 'Net debit paid',
    breakeven: 'Two breakeven zones',
    legs: [
      { label: 'Sell 1 Put (near)', type: 'put', position: 'short', strikeDesc: 'Lower strike, shorter DTE' },
      { label: 'Buy 1 Put (far)', type: 'put', position: 'long', strikeDesc: 'Slightly higher strike, longer DTE' },
      { label: 'Sell 1 Call (near)', type: 'call', position: 'short', strikeDesc: 'Higher strike, shorter DTE' },
      { label: 'Buy 1 Call (far)', type: 'call', position: 'long', strikeDesc: 'Slightly lower strike, longer DTE' }
    ],
    description: 'Two diagonal spreads (one put, one call). Combines the characteristics of a double calendar with different strikes for the near and far expirations. Maximum flexibility and complexity.',
    idealEntry: 'Enter when IV is low. Long legs slightly more ATM than short legs for directional flexibility. Near-term legs 7-14 DTE, far-term legs 30-60 DTE.',
    idealExit: 'Close before short legs expire. Take profit at 10-25% of debit. Roll short legs to next cycle if profitable. Close if stock makes a very large move outside the range.',
    payoff: { type: 'double_diagonal', putShort: 90, putLong: 95, callShort: 110, callLong: 105, netDebit: 5 }
  }
];

function generatePayoffSVG(payoff, width = 360, height = 200) {
  const pad = { top: 20, right: 20, bottom: 35, left: 45 };
  const w = width - pad.left - pad.right;
  const h = height - pad.top - pad.bottom;
  const center = 100;
  const range = 25;
  const steps = 100;

  function calcPnL(price) {
    const p = payoff;
    switch (p.type) {
      case 'long_call':
        return Math.max(0, price - p.strike) - p.premium;
      case 'long_put':
        return Math.max(0, p.strike - price) - p.premium;
      case 'short_call':
        return p.premium - Math.max(0, price - p.strike);
      case 'short_put':
        return p.premium - Math.max(0, p.strike - price);
      case 'bull_put_spread':
        return (p.premium - Math.max(0, p.shortStrike - price)) + Math.max(0, p.longStrike - price);
      case 'bear_call_spread':
        return (p.premium - Math.max(0, price - p.shortStrike)) + Math.max(0, price - p.longStrike);
      case 'bull_call_spread':
        return Math.max(0, price - p.longStrike) - Math.max(0, price - p.shortStrike) - p.premium;
      case 'bear_put_spread':
        return Math.max(0, p.longStrike - price) - Math.max(0, p.shortStrike - price) - p.premium;
      case 'iron_condor':
        return p.premium - Math.max(0, p.putShort - price) + Math.max(0, p.putWing - price) - Math.max(0, price - p.callShort) + Math.max(0, price - p.callWing);
      case 'long_iron_condor':
        return -p.premium + Math.max(0, p.putLong - price) - Math.max(0, p.putWing - price) + Math.max(0, price - p.callLong) - Math.max(0, price - p.callWing);
      case 'iron_butterfly': {
        const c = p.center, wing = p.wing;
        return p.premium - Math.max(0, c - price) + Math.max(0, (c - wing) - price) - Math.max(0, price - c) + Math.max(0, price - (c + wing));
      }
      case 'long_iron_butterfly': {
        const c = p.center, wing = p.wing;
        return -p.premium + Math.max(0, c - price) - Math.max(0, (c - wing) - price) + Math.max(0, price - c) - Math.max(0, price - (c + wing));
      }
      case 'long_straddle':
        return Math.max(0, price - p.strike) + Math.max(0, p.strike - price) - p.premium;
      case 'short_straddle':
        return p.premium - Math.max(0, price - p.strike) - Math.max(0, p.strike - price);
      case 'long_strangle':
        return Math.max(0, price - p.callStrike) + Math.max(0, p.putStrike - price) - p.premium;
      case 'short_strangle':
        return p.premium - Math.max(0, price - p.callStrike) - Math.max(0, p.putStrike - price);
      case 'calendar':
      case 'diagonal':
      case 'double_calendar':
      case 'double_diagonal':
        return generateTimeSpreadPnL(p, price);
      default:
        return 0;
    }
  }

  function generateTimeSpreadPnL(p, price) {
    switch (p.type) {
      case 'calendar': {
        const dist = Math.abs(price - p.strike);
        const sigma = 7;
        const rawPeak = p.netDebit * 2.5;
        return rawPeak * Math.exp(-0.5 * (dist / sigma) ** 2) - p.netDebit;
      }
      case 'diagonal': {
        const shortS = p.shortStrike;
        const dist = price - shortS;
        const sigma = 7;
        const skew = p.isCall ? 3 : -3;
        const rawPeak = p.netDebit * 2.2;
        return rawPeak * Math.exp(-0.5 * ((dist - skew) / sigma) ** 2) - p.netDebit;
      }
      case 'double_calendar': {
        const sigma = 5;
        const rawPeak = p.netDebit * 2.4;
        const pnl1 = rawPeak * Math.exp(-0.5 * ((price - p.putStrike) / sigma) ** 2);
        const pnl2 = rawPeak * Math.exp(-0.5 * ((price - p.callStrike) / sigma) ** 2);
        return Math.max(pnl1, pnl2) - p.netDebit;
      }
      case 'double_diagonal': {
        const sigma = 5;
        const rawPeak = p.netDebit * 2.2;
        const mid1 = p.putShort;
        const mid2 = p.callShort;
        const pnl1 = rawPeak * Math.exp(-0.5 * ((price - mid1) / sigma) ** 2);
        const pnl2 = rawPeak * Math.exp(-0.5 * ((price - mid2) / sigma) ** 2);
        return Math.max(pnl1, pnl2) - p.netDebit;
      }
      default: return 0;
    }
  }

  const points = [];
  for (let i = 0; i <= steps; i++) {
    const price = center - range + (2 * range * i / steps);
    points.push({ price, pnl: calcPnL(price) });
  }

  const minPnl = Math.min(...points.map(p => p.pnl));
  const maxPnl = Math.max(...points.map(p => p.pnl));
  const pnlRange = Math.max(maxPnl - minPnl, 1);
  const pnlPad = pnlRange * 0.15;
  const yMin = minPnl - pnlPad;
  const yMax = maxPnl + pnlPad;

  function sx(price) { return pad.left + ((price - (center - range)) / (2 * range)) * w; }
  function sy(pnl) { return pad.top + h - ((pnl - yMin) / (yMax - yMin)) * h; }

  const zeroY = sy(0);
  let pathAbove = '';
  let pathBelow = '';
  let mainPath = '';

  for (let i = 0; i < points.length; i++) {
    const x = sx(points[i].price);
    const y = sy(points[i].pnl);
    mainPath += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1);
  }

  let fillAbove = `M${sx(points[0].price).toFixed(1)},${zeroY.toFixed(1)}`;
  let fillBelow = `M${sx(points[0].price).toFixed(1)},${zeroY.toFixed(1)}`;
  for (let i = 0; i < points.length; i++) {
    const x = sx(points[i].price);
    const y = sy(points[i].pnl);
    const clampedAbove = Math.min(y, zeroY);
    const clampedBelow = Math.max(y, zeroY);
    fillAbove += `L${x.toFixed(1)},${clampedAbove.toFixed(1)}`;
    fillBelow += `L${x.toFixed(1)},${clampedBelow.toFixed(1)}`;
  }
  fillAbove += `L${sx(points[points.length - 1].price).toFixed(1)},${zeroY.toFixed(1)}Z`;
  fillBelow += `L${sx(points[points.length - 1].price).toFixed(1)},${zeroY.toFixed(1)}Z`;

  const gridLines = 5;
  let gridSvg = '';
  for (let i = 0; i <= gridLines; i++) {
    const val = yMin + (yMax - yMin) * i / gridLines;
    const y = sy(val);
    gridSvg += `<line x1="${pad.left}" y1="${y.toFixed(1)}" x2="${width - pad.right}" y2="${y.toFixed(1)}" stroke="#2a2e39" stroke-width="0.5"/>`;
    gridSvg += `<text x="${pad.left - 5}" y="${(y + 4).toFixed(1)}" text-anchor="end" fill="#787b86" font-size="10">${val >= 0 ? '+' : ''}${val.toFixed(1)}</text>`;
  }

  const priceLabels = [center - 15, center - 5, center, center + 5, center + 15];
  let xLabels = '';
  for (const p of priceLabels) {
    if (p >= center - range && p <= center + range) {
      xLabels += `<text x="${sx(p).toFixed(1)}" y="${(height - 5).toFixed(1)}" text-anchor="middle" fill="#787b86" font-size="10">$${p}</text>`;
    }
  }

  return `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;">
    <rect width="${width}" height="${height}" fill="#131722" rx="8"/>
    ${gridSvg}
    <line x1="${pad.left}" y1="${zeroY.toFixed(1)}" x2="${width - pad.right}" y2="${zeroY.toFixed(1)}" stroke="#d1d4dc" stroke-width="1.2" stroke-dasharray="6,4"/>
    <text x="${pad.left - 5}" y="${(zeroY + 4).toFixed(1)}" text-anchor="end" fill="#d1d4dc" font-size="10" font-weight="600">0</text>
    <path d="${fillAbove}" fill="rgba(8,153,129,0.15)"/>
    <path d="${fillBelow}" fill="rgba(242,54,69,0.15)"/>
    <path d="${mainPath}" fill="none" stroke="url(#grad-${payoff.type})" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    <defs>
      <linearGradient id="grad-${payoff.type}" x1="0" y1="${sy(maxPnl).toFixed(1)}" x2="0" y2="${sy(minPnl).toFixed(1)}" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#089981"/>
        <stop offset="100%" stop-color="#f23645"/>
      </linearGradient>
    </defs>
    ${xLabels}
    <text x="${width / 2}" y="${height - 18}" text-anchor="middle" fill="#545b6a" font-size="9">${['calendar','diagonal','double_calendar','double_diagonal'].includes(payoff.type) ? 'Underlying Price (at near expiration)' : 'Underlying Price at Expiration'}</text>
    <text x="12" y="${height / 2}" text-anchor="middle" fill="#545b6a" font-size="9" transform="rotate(-90 12 ${height / 2})">P/L</text>
  </svg>`;
}

function renderStrategyCard(strategy) {
  const svg = generatePayoffSVG(strategy.payoff);
  const legsHtml = strategy.legs.map(leg => {
    const posClass = leg.position === 'long' ? 'sg-leg-long' : 'sg-leg-short';
    const posIcon = leg.position === 'long' ? 'fa-plus-circle' : 'fa-minus-circle';
    return `<div class="sg-leg ${posClass}">
      <div class="sg-leg-header">
        <i class="fas ${posIcon}"></i>
        <span class="sg-leg-label">${leg.label}</span>
      </div>
      <div class="sg-leg-detail">
        <span class="sg-leg-type-badge sg-${leg.type}">${leg.type.toUpperCase()}</span>
        <span class="sg-leg-strike">${leg.strikeDesc}</span>
      </div>
    </div>`;
  }).join('');

  return `<div class="sg-card" data-category="${strategy.category}" data-id="${strategy.id}">
    <div class="sg-card-header">
      <div class="sg-card-title-row">
        <h3 class="sg-card-title">${strategy.name}</h3>
        <span class="sg-outlook" style="color:${strategy.outlookColor}">
          <i class="fas ${strategy.outlookIcon}"></i> ${strategy.outlook}
        </span>
      </div>
      <div class="sg-risk-badge">${strategy.riskProfile}</div>
    </div>
    <div class="sg-card-body">
      <div class="sg-payoff-diagram">${svg}</div>
      <div class="sg-description">${strategy.description}</div>
      <div class="sg-legs-section">
        <h4 class="sg-section-title"><i class="fas fa-layer-group me-1"></i>Leg Placement</h4>
        <div class="sg-legs-list">${legsHtml}</div>
      </div>
      <div class="sg-metrics">
        <div class="sg-metric"><span class="sg-metric-label">Max Profit</span><span class="sg-metric-value sg-profit">${strategy.maxProfit}</span></div>
        <div class="sg-metric"><span class="sg-metric-label">Max Loss</span><span class="sg-metric-value sg-loss">${strategy.maxLoss}</span></div>
        <div class="sg-metric"><span class="sg-metric-label">Breakeven</span><span class="sg-metric-value">${strategy.breakeven}</span></div>
      </div>
      <div class="sg-conditions">
        <div class="sg-condition">
          <h4 class="sg-section-title"><i class="fas fa-sign-in-alt me-1"></i>Ideal Entry</h4>
          <p>${strategy.idealEntry}</p>
        </div>
        <div class="sg-condition">
          <h4 class="sg-section-title"><i class="fas fa-sign-out-alt me-1"></i>Ideal Exit</h4>
          <p>${strategy.idealExit}</p>
        </div>
      </div>
    </div>
  </div>`;
}

var _sgInitialized = false;
function initStrategyGuide() {
  console.log('Initializing Strategy Guide');
  const grid = document.getElementById('sgStrategiesGrid');
  if (!grid) return;

  if (_sgInitialized) return;
  _sgInitialized = true;

  grid.innerHTML = STRATEGY_DATA.map(s => renderStrategyCard(s)).join('');

  const searchInput = document.getElementById('sgSearchInput');
  const clearBtn = document.getElementById('sgSearchClear');
  const filterBtns = document.querySelectorAll('.sg-filter-btn');
  const countEl = document.getElementById('sgSearchCount');
  const noResults = document.getElementById('sgNoResults');

  let activeFilter = 'all';

  function applyFilters() {
    const query = (searchInput?.value || '').toLowerCase().trim();
    clearBtn.style.display = query ? 'flex' : 'none';
    const cards = grid.querySelectorAll('.sg-card');
    let visible = 0;

    cards.forEach(card => {
      const cat = card.dataset.category;
      const text = card.textContent.toLowerCase();
      const matchFilter = activeFilter === 'all' || cat === activeFilter;
      const matchSearch = !query || text.includes(query);
      const show = matchFilter && matchSearch;
      card.style.display = show ? '' : 'none';
      if (show) visible++;
    });

    if (countEl) {
      countEl.textContent = query || activeFilter !== 'all'
        ? `Showing ${visible} of ${STRATEGY_DATA.length} strategies`
        : '';
    }
    if (noResults) noResults.style.display = visible === 0 ? '' : 'none';
  }

  if (searchInput) {
    searchInput.addEventListener('input', applyFilters);
  }
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      applyFilters();
    });
  }

  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeFilter = btn.dataset.filter;
      applyFilters();
    });
  });

  const tabs = document.querySelectorAll('.sg-tab');
  const tabContents = document.querySelectorAll('.sg-tab-content');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tabContents.forEach(tc => tc.classList.remove('active'));
      tab.classList.add('active');
      const target = tab.dataset.tab;
      const targetEl = document.getElementById('sgTab' + target.charAt(0).toUpperCase() + target.slice(1));
      if (targetEl) targetEl.classList.add('active');
    });
  });

  document.querySelectorAll('.sg-sub-toggle').forEach(toggle => {
    const btns = toggle.querySelectorAll('.sg-sub-toggle-btn');
    btns.forEach(btn => {
      btn.addEventListener('click', () => {
        const tabContent = toggle.closest('.sg-tab-content');
        const subContents = tabContent.querySelectorAll('.sg-sub-content');
        btns.forEach(b => b.classList.remove('active'));
        subContents.forEach(sc => sc.classList.remove('active'));
        btn.classList.add('active');
        const subtab = btn.dataset.subtab;
        const map = {
          'bt-options': 'sgBtSubOptions',
          'bt-stock': 'sgBtSubStock',
          'res-options': 'sgResSubOptions',
          'res-stock': 'sgResSubStock',
          'sim-setup': 'sgSimSubSetup',
          'sim-active': 'sgSimSubActive',
          'sim-results': 'sgSimSubResults'
        };
        const target = document.getElementById(map[subtab]);
        if (target) target.classList.add('active');
        const searchInput = tabContent.querySelector('.sg-search-input');
        if (searchInput && searchInput.value) {
          searchInput.value = '';
          searchInput.dispatchEvent(new Event('input'));
        }
      });
    });
  });

  function setupRefSearch(inputId, clearId, containerSelectors) {
    const inp = document.getElementById(inputId);
    const clr = document.getElementById(clearId);
    if (!inp) return;
    const selectors = Array.isArray(containerSelectors) ? containerSelectors : [containerSelectors];
    const containers = selectors.map(s => document.querySelector(s)).filter(Boolean);
    if (containers.length === 0) return;
    let emptyEl = containers[0].parentElement.querySelector('.sg-ref-no-results');
    if (!emptyEl) {
      emptyEl = document.createElement('div');
      emptyEl.className = 'sg-no-results sg-ref-no-results';
      emptyEl.style.display = 'none';
      emptyEl.innerHTML = '<i class="fas fa-search"></i><h4>No matching sections</h4><p>Try a different search term</p>';
      containers[0].insertAdjacentElement('afterend', emptyEl);
    }
    inp.addEventListener('input', () => {
      const q = inp.value.toLowerCase().trim();
      if (clr) clr.style.display = q ? 'flex' : 'none';
      const activeContainer = containers.find(c => c.closest('.sg-sub-content.active')) || containers[0];
      let visible = 0;
      containers.forEach(container => {
        const isActive = container === activeContainer;
        const sections = container.querySelectorAll('.sg-bt-section');
        sections.forEach(sec => {
          if (!isActive) { sec.style.display = ''; return; }
          const match = !q || sec.textContent.toLowerCase().includes(q);
          sec.style.display = match ? '' : 'none';
          if (match) visible++;
        });
      });
      emptyEl.style.display = (q && visible === 0) ? '' : 'none';
    });
    if (clr) {
      clr.addEventListener('click', () => {
        inp.value = '';
        inp.dispatchEvent(new Event('input'));
      });
    }
  }

  setupRefSearch('sgBtSearchInput', 'sgBtSearchClear', ['#sgBtSections', '#sgStockBtSections']);
  setupRefSearch('sgResSearchInput', 'sgResSearchClear', ['#sgResSections', '#sgStockResSections']);
  setupRefSearch('sgSimSearchInput', 'sgSimSearchClear', ['#sgSimSetupSections', '#sgSimActiveSections', '#sgSimResultsSections']);

  const modeToggle = document.getElementById('sgSimModeToggle');
  if (modeToggle) {
    const modeBtns = modeToggle.querySelectorAll('.sg-mode-btn');
    modeBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        modeBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const mode = btn.dataset.simmode;
        const stockContent = document.getElementById('sgSimModeStock');
        const optionsContent = document.getElementById('sgSimModeOptions');
        if (stockContent) stockContent.classList.toggle('active', mode === 'stock');
        if (optionsContent) optionsContent.classList.toggle('active', mode === 'options');
      });
    });
  }

  console.log('Strategy Guide initialized with', STRATEGY_DATA.length, 'strategies');
}
