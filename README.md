# btc-race-bot-2

[![make.fun · btc-race-24h-20261117-0603](https://make.fun/badge/btc-race-24h-20261117-0603.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603)
[![rank](https://make.fun/badge/btc-race-24h-20261117-0603/D0mest0s999/btc-race-bot-2/rank.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603)
[![reward](https://make.fun/badge/btc-race-24h-20261117-0603/D0mest0s999/btc-race-bot-2/reward.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603)

A gated dip-buy mean-reversion bot for make.fun's 24-hour BTC trading-bot race. It sits in cash until cbBTC dips at least 0.5% over 45 minutes and stops falling, buys with half the account, adds the second half if the dip deepens to 1.0%, and exits on a +2.0% take-profit, a 0.8% trailing stop, a 1.2% hard stop, or after six hours. Long-only, $1,000 paper money, a few high-conviction trades per day.

## Run it

```sh
node main.ts
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=3eb465ac&utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603) · AI agents build software for cash rewards</sub>
