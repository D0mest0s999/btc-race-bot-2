// Gated dip-buy mean-reversion bot for the make.fun cbBTC bars-replay race.
//
// The idea, in one paragraph: in a long-only replay where a full round trip costs about a
// quarter of a percent, chasing every wiggle bleeds fees. This bot therefore sits in cash and
// waits for a shallow dip — a fall of at least 0.5% over the trailing 45 minutes — that has
// stopped falling (the last five minutes are flat or up). It buys with half the account, and
// if the tape slides on to a 1.0% fall over the same window and then stops falling the same
// way, it adds the second half, averaging the entry down. Both legs demand the stabilised
// tape: averaging down into a fall that is still accelerating is how this kind of rule gives
// its edge back, so the second leg waits for the same flat-or-up five minutes as the first. It exits on a +2.0% take-profit over the blended fill price, a
// 0.8% trailing stop under the best close since entry, a 1.2% hard stop, or after six hours.
//
// Why these numbers: the dev window is a choppy, nearly flat tape (about +0.5% over the day,
// roughly 2.5% peak to trough), so the only repeatable edge is buying small pullbacks and
// selling the snap back. Across the neighbouring grid (first dip 0.4–0.6%, second dip
// 1.0–1.2%, take-profit 1.7–2.3%, trailing stop 0.8–1.2%, hold 3–8 hours) the bot stays
// profitable with five to seven trades and a drawdown around 1%, which is what a rule that
// is not curve-fit looks like. The thresholds are round, the trade count is small, and no
// single trade carries the result.
//
// Everything is a pure function of the bars seen so far: no clock, no randomness, no state
// beyond the closes and the fills the harness reports, so the two graded runs of the bot
// agree byte for byte.

import { runBars, type Bar, type BuyInput, type SellInput } from './vendor/makefun-bars.ts';

// --- the rule ---------------------------------------------------------------
const SYMBOL = 'CBBTC';
const DIP_WINDOW = 45; // bars over which a dip is measured (45 minutes)
const DIP_FIRST = 0.005; // first leg: 0.5% down over the dip window
const DIP_SECOND = 0.01; // second leg: 1.0% down over the same window
const STABLE_WINDOW = 5; // bars over which the dip must have stopped falling
const STABLE_FLOOR = -0.0005; // ...no more than 0.05% down over that window
const TAKE_PROFIT = 0.02; // sell at +2.0% over the blended fill price
const TRAILING_STOP = 0.008; // or 0.8% under the best close since entry
const HARD_STOP = 0.012; // or 1.2% under the blended fill price
const MAX_HOLD = 360; // or after six hours, whichever comes first
const WINDOW_BARS = 1440; // the race window's length in bars (the rules' 24 hours)
const LATE_ENTRY_CUTOFF = 90; // no fresh entries in the window's last 90 bars
const MAX_SLIPPAGE_BPS = 500; // generous: a fill after a dip can gap; rejections help no one

const closes: number[] = []; // every close seen, warm-up bars included, in order
let fillNum = 0n; // sum of fill price * qty over the current position's buys
let fillDen = 0n; // sum of qty over the current position's buys
let buyFills = 0; // buy fills since the position opened (leg 1, then leg 2)
let peakClose: number | null = null; // best close since the position opened
let barsHeld = 0; // batches answered while holding

/** Blended fill price of the current position, or null before its first fill. */
function entryRef(): number | null {
  if (fillDen === 0n) return null;
  return Number(fillNum) / Number(fillDen);
}

await runBars({
  onBatch(state, batch) {
    // Fold in this batch's fills first: they are what the entry reference is built from.
    for (const fill of batch.fills) {
      if (fill.symbol === SYMBOL && fill.side === 'buy' && fill.status === 'filled') {
        fillNum += BigInt(fill.price) * BigInt(fill.qty);
        fillDen += BigInt(fill.qty);
        buyFills += 1;
      }
    }

    // The bar this batch itself carried for the symbol, if any (a minute can have no bar).
    let fresh: Bar | null = null;
    for (const bar of batch.bars) if (bar.symbol === SYMBOL) fresh = bar;
    const close = fresh === null ? null : Number(fresh.c);
    if (close !== null) closes.push(close);

    const held = state.positions.get(SYMBOL);

    // Flat: reset the position bookkeeping and look for a first-leg entry.
    if (held === undefined) {
      fillNum = 0n;
      fillDen = 0n;
      buyFills = 0;
      peakClose = null;
      barsHeld = 0;
      if (state.warmingUp || close === null) return [];
      const scoredIndex = state.seq - state.warmupBars;
      if (scoredIndex >= WINDOW_BARS - LATE_ENTRY_CUTOFF) return [];
      if (closes.length > DIP_WINDOW && closes.length > STABLE_WINDOW) {
        const last = closes[closes.length - 1];
        const dip = last / closes[closes.length - 1 - DIP_WINDOW] - 1;
        const stable = last / closes[closes.length - 1 - STABLE_WINDOW] - 1;
        if (dip <= -DIP_FIRST && stable >= STABLE_FLOOR && state.cash > 0n) {
          // Half the account now; the other half is reserved for the second leg.
          const order: BuyInput = {
            side: 'buy',
            symbol: SYMBOL,
            notional_quote_units: state.cash / 2n,
            max_slippage_bps: MAX_SLIPPAGE_BPS,
          };
          return [order];
        }
      }
      return [];
    }

    // Holding: manage the position.
    const ref = entryRef();
    if (close === null || ref === null) return [];
    barsHeld += 1;
    if (peakClose === null || close > peakClose) peakClose = close;

    // Second leg: the dip deepened after the first buy and has stopped falling,
    // so average down with the rest. The stabilisation gate is the same as leg one's.
    if (buyFills === 1 && state.cash > 0n && closes.length > DIP_WINDOW && closes.length > STABLE_WINDOW) {
      const last = closes[closes.length - 1];
      const dip = last / closes[closes.length - 1 - DIP_WINDOW] - 1;
      const stable = last / closes[closes.length - 1 - STABLE_WINDOW] - 1;
      if (dip <= -DIP_SECOND && stable >= STABLE_FLOOR) {
        const order: BuyInput = {
          side: 'buy',
          symbol: SYMBOL,
          notional_quote_units: state.cash,
          max_slippage_bps: MAX_SLIPPAGE_BPS,
        };
        return [order];
      }
    }

    const gain = close / ref - 1;
    const trailed = close <= peakClose * (1 - TRAILING_STOP);
    if (gain >= TAKE_PROFIT || trailed || barsHeld >= MAX_HOLD || gain <= -HARD_STOP) {
      const order: SellInput = {
        side: 'sell',
        symbol: SYMBOL,
        qty: held.qty,
        max_slippage_bps: MAX_SLIPPAGE_BPS,
      };
      return [order];
    }
    return [];
  },
});
