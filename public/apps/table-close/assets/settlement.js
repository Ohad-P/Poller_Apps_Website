/**
 * Pure settlement rules. All monetary values in this module are integer agorot.
 * Keeping this file free of browser APIs makes it reusable and easy to test.
 */

export const EXACT_SEARCH_LIMIT = 11;
export const MAX_AMOUNT_CENTS = 1_000_000_000;
export const TABLE_CASH_ID = '__table_cash__';

/**
 * Parse a user-entered non-negative ILS amount into agorot.
 * Both `12.50` and `12,50` are accepted; formulas and excess precision are not.
 *
 * @param {string | number} rawValue
 * @param {{ blankIsZero?: boolean }} options
 * @returns {number | null}
 */
export function parseMoneyToCents(rawValue, { blankIsZero = false } = {}) {
  const value = String(rawValue ?? '').trim();

  if (value === '') {
    return blankIsZero ? 0 : null;
  }

  if (!/^\d+(?:[.,]\d{1,2})?$/.test(value)) {
    return null;
  }

  const [wholePart, fractionPart = ''] = value.replace(',', '.').split('.');
  const cents = Number(wholePart) * 100 + Number(fractionPart.padEnd(2, '0'));

  return Number.isSafeInteger(cents) && cents <= MAX_AMOUNT_CENTS ? cents : null;
}

/**
 * Add a quick-select amount to an existing money input. Returning null keeps
 * invalid manual input visible so the user can correct it rather than losing it.
 *
 * @param {string | number} rawValue
 * @param {number} incrementCents
 * @returns {number | null}
 */
export function addMoneyPreset(rawValue, incrementCents) {
  if (!Number.isSafeInteger(incrementCents) || incrementCents <= 0) {
    return null;
  }

  const currentCents = parseMoneyToCents(rawValue, { blankIsZero: true });
  if (currentCents === null) {
    return null;
  }

  const totalCents = currentCents + incrementCents;
  return Number.isSafeInteger(totalCents) && totalCents <= MAX_AMOUNT_CENTS
    ? totalCents
    : null;
}

/**
 * Calculate pot totals and each player's net balance.
 * Positive balances receive money; negative balances pay money.
 *
 * @param {Array<{ id: string, name: string, buyInCents: number, cashOutCents: number, paidCents: number, receivedCents: number }>} players
 */
export function summarizeSession(players) {
  if (!Array.isArray(players)) {
    throw new TypeError('Players must be an array.');
  }

  let totalBuyInCents = 0;
  let totalCashOutCents = 0;
  let totalPaidCents = 0;
  let totalReceivedCents = 0;
  const playerIds = new Set();
  const playerNames = new Set();

  const balances = players.map((player) => {
    const id = String(player.id ?? '');
    const name = String(player.name ?? '').trim();
    assertMoney(player.buyInCents, 'buy-in');
    assertMoney(player.cashOutCents, 'cash-out');
    assertMoney(player.paidCents, 'paid-to-table');
    assertMoney(player.receivedCents, 'received-from-table');

    if (!id || !name) {
      throw new TypeError('Each player needs an id and a name.');
    }
    if (id === TABLE_CASH_ID || playerIds.has(id)) {
      throw new TypeError('Each player needs a unique, non-reserved id.');
    }
    const normalizedName = name.toLowerCase();
    if (playerNames.has(normalizedName)) {
      throw new TypeError('Each player needs a unique name.');
    }
    playerIds.add(id);
    playerNames.add(normalizedName);
    if (player.receivedCents > player.cashOutCents) {
      throw new RangeError('A player cannot receive more than their cash-out.');
    }

    totalBuyInCents += player.buyInCents;
    totalCashOutCents += player.cashOutCents;
    totalPaidCents += player.paidCents;
    totalReceivedCents += player.receivedCents;

    if (
      !Number.isSafeInteger(totalBuyInCents)
      || !Number.isSafeInteger(totalCashOutCents)
      || !Number.isSafeInteger(totalPaidCents)
      || !Number.isSafeInteger(totalReceivedCents)
    ) {
      throw new RangeError('Session total is too large.');
    }

    return {
      id,
      name,
      amountCents: player.cashOutCents
        - player.receivedCents
        - player.buyInCents
        + player.paidCents,
    };
  });

  return {
    balances,
    totalBuyInCents,
    totalCashOutCents,
    totalPaidCents,
    totalReceivedCents,
    tableCashCents: totalPaidCents - totalReceivedCents,
    differenceCents: totalCashOutCents - totalBuyInCents,
  };
}

/**
 * Settle a normalized session. An unbalanced pot intentionally returns no
 * payments because any plan would leave at least one player underpaid.
 *
 * @param {Array<{ id: string, name: string, buyInCents: number, cashOutCents: number, paidCents: number, receivedCents: number }>} players
 */
export function settleSession(players) {
  if (!Array.isArray(players) || players.length < 2) {
    throw new RangeError('A session needs at least two players.');
  }
  const summary = summarizeSession(players);

  if (summary.differenceCents !== 0) {
    return {
      ...summary,
      status: 'unbalanced',
      strategy: null,
      transactions: [],
    };
  }

  if (summary.tableCashCents < 0) {
    return {
      ...summary,
      status: 'table-overdrawn',
      strategy: null,
      transactions: [],
    };
  }

  const settlementBalances = [...summary.balances];
  if (summary.tableCashCents > 0) {
    settlementBalances.push({
      id: TABLE_CASH_ID,
      name: 'Table cash',
      amountCents: -summary.tableCashCents,
    });
  }
  const plan = createSettlementPlan(settlementBalances);

  return {
    ...summary,
    status: 'settled',
    strategy: plan.strategy,
    transactions: plan.transactions,
  };
}

/**
 * Create a valid direct debtor-to-creditor payment plan. For up to eleven
 * active balances (ten players plus table cash), an exhaustive, pruned search
 * finds the fewest transactions. Larger games use a deterministic greedy plan.
 *
 * @param {Array<{ id: string, name: string, amountCents: number }>} balances
 */
export function createSettlementPlan(balances) {
  const activeBalances = balances
    .filter((balance) => balance.amountCents !== 0)
    .map((balance) => ({ ...balance }));

  const balanceIds = new Set();
  for (const balance of activeBalances) {
    if (!balance.id || !String(balance.name).trim() || !Number.isSafeInteger(balance.amountCents)) {
      throw new TypeError('Balances must have an id, name, and integer amount.');
    }
    if (balanceIds.has(balance.id)) {
      throw new TypeError('Balances must have unique ids.');
    }
    balanceIds.add(balance.id);
  }

  let total = 0;
  for (const balance of activeBalances) {
    total += balance.amountCents;
    if (!Number.isSafeInteger(total)) {
      throw new RangeError('Balance total exceeds the safe integer range.');
    }
  }
  if (total !== 0) {
    throw new RangeError('Cannot create a payment plan for unbalanced amounts.');
  }

  if (activeBalances.length === 0) {
    return { strategy: 'minimum', transactions: [] };
  }

  if (activeBalances.length <= EXACT_SEARCH_LIMIT) {
    return {
      strategy: 'minimum',
      transactions: findMinimumSettlement(activeBalances),
    };
  }

  return {
    strategy: 'efficient',
    transactions: createGreedySettlement(activeBalances),
  };
}

function assertMoney(value, label) {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_AMOUNT_CENTS) {
    throw new TypeError(`Player ${label} must be a non-negative integer amount within the supported range.`);
  }
}

function findMinimumSettlement(balances) {
  const amounts = balances.map((balance) => balance.amountCents);
  let bestTransactions = createGreedySettlement(balances);
  const currentTransactions = [];
  const shortestPathByState = new Map();

  function search() {
    const firstIndex = amounts.findIndex((amount) => amount !== 0);

    if (firstIndex === -1) {
      if (currentTransactions.length < bestTransactions.length) {
        bestTransactions = currentTransactions.map((transaction) => ({ ...transaction }));
      }
      return;
    }

    const nonZeroCount = amounts.reduce(
      (count, amount) => count + Number(amount !== 0),
      0,
    );
    const optimisticRemaining = Math.ceil(nonZeroCount / 2);
    if (currentTransactions.length + optimisticRemaining >= bestTransactions.length) {
      return;
    }

    const stateKey = amounts.join(',');
    const shortestKnownPath = shortestPathByState.get(stateKey);
    if (shortestKnownPath !== undefined && shortestKnownPath <= currentTransactions.length) {
      return;
    }
    shortestPathByState.set(stateKey, currentTransactions.length);

    const firstAmount = amounts[firstIndex];
    const candidateIndexes = [];

    for (let index = firstIndex + 1; index < amounts.length; index += 1) {
      if (firstAmount * amounts[index] < 0) {
        candidateIndexes.push(index);
      }
    }

    candidateIndexes.sort((left, right) => {
      const leftExact = Math.abs(amounts[left]) === Math.abs(firstAmount);
      const rightExact = Math.abs(amounts[right]) === Math.abs(firstAmount);
      return Number(rightExact) - Number(leftExact);
    });

    const triedAmounts = new Set();

    for (const candidateIndex of candidateIndexes) {
      const candidateAmount = amounts[candidateIndex];
      if (triedAmounts.has(candidateAmount)) {
        continue;
      }
      triedAmounts.add(candidateAmount);

      const transferCents = Math.min(Math.abs(firstAmount), Math.abs(candidateAmount));
      const firstBefore = amounts[firstIndex];
      const candidateBefore = amounts[candidateIndex];
      const firstIsPayer = firstAmount < 0;
      const payer = balances[firstIsPayer ? firstIndex : candidateIndex];
      const payee = balances[firstIsPayer ? candidateIndex : firstIndex];

      amounts[firstIndex] += firstIsPayer ? transferCents : -transferCents;
      amounts[candidateIndex] += firstIsPayer ? -transferCents : transferCents;
      currentTransactions.push(makeTransaction(payer, payee, transferCents));

      search();

      currentTransactions.pop();
      amounts[firstIndex] = firstBefore;
      amounts[candidateIndex] = candidateBefore;
    }
  }

  search();
  return bestTransactions;
}

function createGreedySettlement(balances) {
  const debtors = balances
    .filter((balance) => balance.amountCents < 0)
    .map((balance) => ({ ...balance, remainingCents: -balance.amountCents }))
    .sort(compareLargestFirst);
  const creditors = balances
    .filter((balance) => balance.amountCents > 0)
    .map((balance) => ({ ...balance, remainingCents: balance.amountCents }))
    .sort(compareLargestFirst);
  const transactions = [];
  let debtorIndex = 0;
  let creditorIndex = 0;

  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex];
    const creditor = creditors[creditorIndex];
    const transferCents = Math.min(debtor.remainingCents, creditor.remainingCents);

    transactions.push(makeTransaction(debtor, creditor, transferCents));
    debtor.remainingCents -= transferCents;
    creditor.remainingCents -= transferCents;

    if (debtor.remainingCents === 0) {
      debtorIndex += 1;
    }
    if (creditor.remainingCents === 0) {
      creditorIndex += 1;
    }
  }

  return transactions;
}

function compareLargestFirst(left, right) {
  return right.remainingCents - left.remainingCents || left.name.localeCompare(right.name);
}

function makeTransaction(payer, payee, amountCents) {
  return {
    payerId: payer.id,
    payerName: payer.name,
    payeeId: payee.id,
    payeeName: payee.name,
    amountCents,
  };
}
