import {
  addMoneyPreset,
  MAX_AMOUNT_CENTS,
  parseMoneyToCents,
  settleSession,
  summarizeSession,
} from './settlement.js';

const STORAGE_KEY = 'table-close/session/v1';
const FRIENDS_KEY = 'table-close/friends/v1';
const HISTORY_KEY = 'table-close/history/v1';
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 30;
const MAX_FRIENDS = 50;
const MAX_HISTORY = 50;
const currencyFormatter = new Intl.NumberFormat('en-IL', {
  style: 'currency',
  currency: 'ILS',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const elements = {
  form: document.querySelector('#sessionForm'),
  playerList: document.querySelector('#playerList'),
  playerTemplate: document.querySelector('#playerTemplate'),
  playerCount: document.querySelector('#playerCount'),
  friendsList: document.querySelector('#friendsList'),
  friendsEmpty: document.querySelector('#friendsEmpty'),
  addPlayerButton: document.querySelector('#addPlayerButton'),
  addPlayerWideButton: document.querySelector('#addPlayerWideButton'),
  settleButton: document.querySelector('#settleButton'),
  settleHint: document.querySelector('#settleHint'),
  potCheck: document.querySelector('#potCheck'),
  balanceStamp: document.querySelector('#balanceStamp'),
  buyInTotal: document.querySelector('#buyInTotal'),
  cashOutTotal: document.querySelector('#cashOutTotal'),
  differenceTotal: document.querySelector('#differenceTotal'),
  tableCashTotal: document.querySelector('#tableCashTotal'),
  potMessage: document.querySelector('#potMessage'),
  resultsSection: document.querySelector('#resultsSection'),
  resultsSummary: document.querySelector('#resultsSummary'),
  planBadge: document.querySelector('#planBadge'),
  paymentList: document.querySelector('#paymentList'),
  copyButton: document.querySelector('#copyButton'),
  shareButton: document.querySelector('#shareButton'),
  newGameButton: document.querySelector('#newGameButton'),
  newGameDialog: document.querySelector('#newGameDialog'),
  confirmNewGameButton: document.querySelector('#confirmNewGameButton'),
  installButton: document.querySelector('#installButton'),
  installDialog: document.querySelector('#installDialog'),
  connectionStatus: document.querySelector('#connectionStatus'),
  historyList: document.querySelector('#historyList'),
  historyEmpty: document.querySelector('#historyEmpty'),
  historyCount: document.querySelector('#historyCount'),
  toast: document.querySelector('#toast'),
};

let state = loadSession();
let friends = loadFriends();
let history = loadHistory();
let currentResult = null;
let deferredInstallPrompt = null;
let toastTimeout;

renderPlayers();
renderFriends();
renderHistory();
updateSessionSummary();
initializeInstallExperience();
initializeConnectivity();
initializeStorageSync();
registerServiceWorker();

elements.addPlayerButton.addEventListener('click', addPlayer);
elements.addPlayerWideButton.addEventListener('click', addPlayer);

elements.playerList.addEventListener('input', (event) => {
  const input = event.target.closest('[data-field]');
  const card = event.target.closest('.player-card');
  if (!input || !card) {
    return;
  }

  const player = state.players.find(({ id }) => id === card.dataset.playerId);
  if (!player) {
    return;
  }

  player[input.dataset.field] = input.value;
  if (input.dataset.field === 'name') {
    card.querySelector('.buy-in-presets').setAttribute(
      'aria-label',
      `Quick add to buy-in for ${input.value.trim() || `player ${card.querySelector('.player-number').textContent}`}`,
    );
  }
  currentResult = null;
  elements.resultsSection.hidden = true;
  saveSession();
  updatePlayerCard(card, player);
  updateRememberButton(card, player);
  updateSessionSummary();
});

elements.playerList.addEventListener('focusout', (event) => {
  const input = event.target.closest('[data-field="buyIn"], [data-field="cashOut"], [data-field="paid"], [data-field="received"]');
  const card = event.target.closest('.player-card');
  if (!input || !card || input.value.trim() === '') {
    return;
  }

  const cents = parseMoneyToCents(input.value);
  if (cents === null) {
    return;
  }

  input.value = formatInputMoney(cents);
  const player = state.players.find(({ id }) => id === card.dataset.playerId);
  player[input.dataset.field] = input.value;
  saveSession();
  updatePlayerCard(card, player);
  updateSessionSummary();
});

elements.playerList.addEventListener('click', (event) => {
  const modeButton = event.target.closest('[data-buy-in-mode]');
  if (modeButton) {
    setBuyInMode(modeButton);
    return;
  }

  const presetButton = event.target.closest('[data-buy-in-preset]');
  if (presetButton) {
    applyBuyInPreset(presetButton);
    return;
  }

  const receivedButton = event.target.closest('[data-received-action]');
  if (receivedButton) {
    applyReceivedAction(receivedButton);
    return;
  }

  const rememberButton = event.target.closest('.remember-player');
  if (rememberButton) {
    toggleRememberedPlayer(rememberButton);
    return;
  }

  const removeButton = event.target.closest('.remove-player');
  if (!removeButton) {
    return;
  }

  const card = removeButton.closest('.player-card');
  state.players = state.players.filter(({ id }) => id !== card.dataset.playerId);
  currentResult = null;
  elements.resultsSection.hidden = true;
  saveSession();
  renderPlayers();
  updateSessionSummary();
});

elements.friendsList.addEventListener('click', (event) => {
  const removeButton = event.target.closest('[data-remove-friend]');
  if (removeButton) {
    removeFriend(removeButton.dataset.removeFriend);
    return;
  }

  const friendButton = event.target.closest('[data-friend-name]');
  if (friendButton) {
    addRememberedFriend(friendButton.dataset.friendName);
  }
});

elements.historyList.addEventListener('click', async (event) => {
  const actionButton = event.target.closest('[data-history-action]');
  if (!actionButton) {
    return;
  }

  const entry = history.find(({ id }) => id === actionButton.dataset.historyId);
  if (!entry) {
    return;
  }

  if (actionButton.dataset.historyAction === 'copy') {
    const copied = await copyText(createShareText(entry));
    showToast(copied ? 'Saved payment plan copied.' : 'Could not copy the saved plan.');
  } else if (actionButton.dataset.historyAction === 'reuse') {
    reuseHistoryEntry(entry);
  } else if (actionButton.dataset.historyAction === 'delete') {
    deleteHistoryEntry(entry.id);
  }
});

elements.form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const validation = validatePlayers();
  applyValidation(validation);

  if (!validation.ready) {
    showToast('Finish the highlighted details before settling.');
    return;
  }

  currentResult = settleSession(validation.normalizedPlayers);
  await saveHistoryEntry(currentResult, validation.normalizedPlayers);
  renderResults(currentResult);
  elements.resultsSection.hidden = false;
  elements.resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

elements.copyButton.addEventListener('click', async () => {
  if (!currentResult) {
    return;
  }

  const copied = await copyText(createShareText(currentResult));
  showToast(copied ? 'Payment plan copied.' : 'Could not copy the payment plan.');
});

elements.shareButton.addEventListener('click', async () => {
  if (!currentResult) {
    return;
  }

  const text = createShareText(currentResult);
  if (navigator.share) {
    try {
      await navigator.share({ title: 'Poker payment plan', text });
      return;
    } catch (error) {
      if (error.name === 'AbortError') {
        return;
      }
    }
  }

  const copied = await copyText(text);
  showToast(copied ? 'Payment plan copied for sharing.' : 'Sharing is not available here.');
});

elements.newGameButton.addEventListener('click', () => {
  if (hasEnteredData()) {
    elements.newGameDialog.showModal();
    return;
  }

  resetSession();
});

elements.confirmNewGameButton.addEventListener('click', resetSession);

function addPlayer() {
  if (state.players.length >= MAX_PLAYERS) {
    showToast(`A table is limited to ${MAX_PLAYERS} players.`);
    return;
  }

  const player = createEmptyPlayer();
  state.players.push(player);
  saveSession();
  renderPlayers();
  updateSessionSummary();
  document.querySelector(`[data-player-id="${player.id}"] [data-field="name"]`)?.focus();
}

async function toggleRememberedPlayer(button) {
  const card = button.closest('.player-card');
  const player = state.players.find(({ id }) => id === card?.dataset.playerId);
  const name = player?.name.trim();
  if (!card || !player || !name) {
    showToast('Enter a player name before remembering them.');
    return;
  }

  let remembered;
  await withStorageLock(FRIENDS_KEY, () => {
    friends = loadFriends();
    const existingIndex = friends.findIndex(
      (friend) => friend.name.toLowerCase() === name.toLowerCase(),
    );
    if (existingIndex >= 0) {
      friends.splice(existingIndex, 1);
      remembered = false;
    } else {
      if (friends.length >= MAX_FRIENDS) {
        return;
      }
      friends.push({ id: createId(), name });
      friends.sort((left, right) => left.name.localeCompare(right.name));
      remembered = true;
    }
    saveFriends();
  });

  if (remembered === undefined) {
    showToast(`You can remember up to ${MAX_FRIENDS} friends.`);
    return;
  }
  showToast(remembered
    ? `${name} remembered on this device.`
    : `${name} removed from remembered friends.`);
  renderFriends();
  updateAllRememberButtons();
}

function addRememberedFriend(name) {
  if (state.players.some((player) => player.name.trim().toLowerCase() === name.toLowerCase())) {
    showToast(`${name} is already at this table.`);
    return;
  }

  let player = state.players.find(isPlayerEmpty);
  if (!player) {
    if (state.players.length >= MAX_PLAYERS) {
      showToast(`A table is limited to ${MAX_PLAYERS} players.`);
      return;
    }
    player = createEmptyPlayer();
    state.players.push(player);
  }

  player.name = name;
  saveSession();
  renderPlayers();
  updateSessionSummary();
  document.querySelector(`[data-player-id="${player.id}"] [data-field="buyIn"]`)?.focus();
}

async function removeFriend(friendId) {
  await withStorageLock(FRIENDS_KEY, () => {
    friends = loadFriends().filter(({ id }) => id !== friendId);
    saveFriends();
  });
  renderFriends();
  updateAllRememberButtons();
}

function renderFriends() {
  elements.friendsList.replaceChildren();
  elements.friendsEmpty.hidden = friends.length > 0;

  for (const friend of friends) {
    const chip = document.createElement('span');
    chip.className = 'friend-chip';

    const addButton = document.createElement('button');
    addButton.type = 'button';
    addButton.dataset.friendName = friend.name;
    addButton.textContent = friend.name;
    addButton.setAttribute('aria-label', `Add ${friend.name} to this table`);

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'forget-friend';
    removeButton.dataset.removeFriend = friend.id;
    removeButton.textContent = '×';
    removeButton.setAttribute('aria-label', `Forget ${friend.name}`);

    chip.append(addButton, removeButton);
    elements.friendsList.append(chip);
  }
}

function updateRememberButton(card, player) {
  const button = card.querySelector('.remember-player');
  const name = player.name.trim();
  const remembered = Boolean(name) && friends.some(
    (friend) => friend.name.toLowerCase() === name.toLowerCase(),
  );
  button.disabled = !name;
  button.classList.toggle('is-remembered', remembered);
  button.setAttribute('aria-pressed', String(remembered));
  button.textContent = remembered ? 'Saved' : 'Remember';
  button.setAttribute('aria-label', `${remembered ? 'Forget' : 'Remember'} ${name || 'this player'}`);
}

function updateAllRememberButtons() {
  for (const card of elements.playerList.querySelectorAll('.player-card')) {
    const player = state.players.find(({ id }) => id === card.dataset.playerId);
    if (player) {
      updateRememberButton(card, player);
    }
  }
}

function isPlayerEmpty(player) {
  return !player.name && !player.buyIn && !player.cashOut && !player.paid && !player.received;
}

function applyBuyInPreset(button) {
  const card = button.closest('.player-card');
  const player = state.players.find(({ id }) => id === card?.dataset.playerId);
  if (!card || !player) {
    return;
  }

  const incrementCents = Number(button.dataset.buyInPreset);
  const totalCents = addMoneyPreset(player.buyIn, incrementCents);
  const totalPaidCents = player.buyInMode === 'cash'
    ? addMoneyPreset(player.paid, incrementCents)
    : parseMoneyToCents(player.paid, { blankIsZero: true });
  if (totalCents === null || totalPaidCents === null) {
    showToast('Correct the current buy-in before using a quick-add button.');
    return;
  }

  player.buyIn = formatInputMoney(totalCents);
  if (player.buyInMode === 'cash') {
    player.paid = formatInputMoney(totalPaidCents);
  }
  card.querySelector('[data-field="buyIn"]').value = player.buyIn;
  card.querySelector('[data-field="paid"]').value = player.paid;
  currentResult = null;
  elements.resultsSection.hidden = true;
  saveSession();
  updatePlayerCard(card, player);
  updateSessionSummary();

  button.classList.remove('is-applied');
  requestAnimationFrame(() => {
    button.classList.add('is-applied');
    window.setTimeout(() => button.classList.remove('is-applied'), 180);
  });
}

function setBuyInMode(button) {
  const card = button.closest('.player-card');
  const player = state.players.find(({ id }) => id === card?.dataset.playerId);
  if (!card || !player) {
    return;
  }

  player.buyInMode = button.dataset.buyInMode;
  saveSession();
  updateBuyInModeButtons(card, player);
}

function applyReceivedAction(button) {
  const card = button.closest('.player-card');
  const player = state.players.find(({ id }) => id === card?.dataset.playerId);
  if (!card || !player) {
    return;
  }

  const receivedCents = button.dataset.receivedAction === 'all'
    ? parseMoneyToCents(player.cashOut, { blankIsZero: true })
    : 0;
  if (receivedCents === null) {
    showToast('Correct the cash-out before marking what was taken.');
    return;
  }

  player.received = formatInputMoney(receivedCents);
  card.querySelector('[data-field="received"]').value = player.received;
  currentResult = null;
  elements.resultsSection.hidden = true;
  saveSession();
  updatePlayerCard(card, player);
  updateSessionSummary();
}

function renderPlayers() {
  elements.playerList.replaceChildren();

  for (const [index, player] of state.players.entries()) {
    const fragment = elements.playerTemplate.content.cloneNode(true);
    const card = fragment.querySelector('.player-card');
    const removeButton = fragment.querySelector('.remove-player');
    const rememberButton = fragment.querySelector('.remember-player');
    const presetGroup = fragment.querySelector('.buy-in-presets');
    card.dataset.playerId = player.id;
    fragment.querySelector('.player-number').textContent = String(index + 1).padStart(2, '0');
    fragment.querySelector('[data-field="name"]').value = player.name;
    fragment.querySelector('[data-field="buyIn"]').value = player.buyIn;
    fragment.querySelector('[data-field="cashOut"]').value = player.cashOut;
    fragment.querySelector('[data-field="paid"]').value = player.paid;
    fragment.querySelector('[data-field="received"]').value = player.received;
    removeButton.setAttribute('aria-label', `Remove player ${index + 1}`);
    rememberButton.setAttribute('aria-label', `Remember player ${index + 1}`);
    presetGroup.setAttribute(
      'aria-label',
      `Quick add to buy-in for ${player.name.trim() || `player ${index + 1}`}`,
    );
    elements.playerList.append(fragment);
    updatePlayerCard(card, player);
    updateBuyInModeButtons(card, player);
    updateRememberButton(card, player);
  }

  const atLimit = state.players.length >= MAX_PLAYERS;
  elements.playerCount.textContent = `${state.players.length} ${state.players.length === 1 ? 'player' : 'players'}`;
  elements.addPlayerButton.disabled = atLimit;
  elements.addPlayerWideButton.disabled = atLimit;
}

function updatePlayerCard(card, player) {
  const buyInCents = parseMoneyToCents(player.buyIn);
  const cashOutCents = parseMoneyToCents(player.cashOut, { blankIsZero: true });
  const paidCents = parseMoneyToCents(player.paid, { blankIsZero: true });
  const receivedCents = parseMoneyToCents(player.received, { blankIsZero: true });
  const output = card.querySelector('.player-net');
  const creditOutput = card.querySelector('.credit-amount');
  const contributionOutput = card.querySelector('.table-contribution');

  if (buyInCents === null || cashOutCents === null || paidCents === null || receivedCents === null) {
    output.textContent = '—';
    output.className = 'player-net';
    creditOutput.textContent = '—';
    contributionOutput.textContent = '—';
    return;
  }

  const netCents = cashOutCents - receivedCents - buyInCents + paidCents;
  output.textContent = formatSignedMoney(netCents);
  output.className = `player-net ${netCents > 0 ? 'is-positive' : netCents < 0 ? 'is-negative' : ''}`;
  creditOutput.textContent = formatMoney(Math.max(buyInCents - paidCents, 0));
  contributionOutput.textContent = formatSignedMoney(paidCents - receivedCents, false);
}

function updateBuyInModeButtons(card, player) {
  for (const button of card.querySelectorAll('[data-buy-in-mode]')) {
    const selected = button.dataset.buyInMode === player.buyInMode;
    button.classList.toggle('is-selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  }
}

function updateSessionSummary() {
  const validation = validatePlayers();
  const {
    totalBuyInCents,
    totalCashOutCents,
    totalPaidCents,
    totalReceivedCents,
  } = validation.draftTotals;
  const differenceCents = totalCashOutCents - totalBuyInCents;
  const tableCashCents = totalPaidCents - totalReceivedCents;

  elements.buyInTotal.textContent = formatMoney(totalBuyInCents);
  elements.cashOutTotal.textContent = formatMoney(totalCashOutCents);
  elements.differenceTotal.textContent = formatSignedMoney(differenceCents, false);
  elements.differenceTotal.className = differenceCents === 0 ? '' : 'has-difference';
  elements.tableCashTotal.textContent = formatSignedMoney(tableCashCents, false);
  elements.tableCashTotal.className = tableCashCents < 0 ? 'has-difference' : '';
  elements.settleButton.disabled = !validation.ready;
  applyValidation(validation);

  if (validation.errors.size > 0) {
    setPotStatus('invalid', 'Check details', 'Complete or correct the highlighted player details.');
    elements.settleHint.textContent = 'Every player needs a name and valid buy-in.';
    return;
  }

  if (validation.normalizedPlayers.length < 2) {
    setPotStatus('waiting', 'Not ready', 'Add at least two completed players to check the pot.');
    elements.settleHint.textContent = 'Add at least two completed players.';
    return;
  }

  if (differenceCents < 0) {
    setPotStatus(
      'unbalanced',
      'Pot is short',
      `${formatMoney(Math.abs(differenceCents))} of cash-out is still unaccounted for.`,
    );
    elements.settleHint.textContent = 'Cash-outs must equal the total buy-ins.';
    return;
  }

  if (differenceCents > 0) {
    setPotStatus(
      'unbalanced',
      'Over the pot',
      `Cash-outs exceed the buy-ins by ${formatMoney(differenceCents)}.`,
    );
    elements.settleHint.textContent = 'Cash-outs cannot exceed the total pot.';
    return;
  }

  if (tableCashCents < 0) {
    setPotStatus(
      'unbalanced',
      'Cash mismatch',
      `Players took ${formatMoney(Math.abs(tableCashCents))} more cash than was put on the table.`,
    );
    elements.settleHint.textContent = 'Correct the paid or received money amounts.';
    return;
  }

  setPotStatus(
    'balanced',
    'Balanced',
    `${formatMoney(tableCashCents)} is physically on the table and included in the payment plan.`,
  );
  elements.settleHint.textContent = 'The numbers balance. Generate the payment plan.';
}

function validatePlayers() {
  const errors = new Map();
  const normalizedPlayers = [];
  const names = new Map();
  let totalBuyInCents = 0;
  let totalCashOutCents = 0;
  let totalPaidCents = 0;
  let totalReceivedCents = 0;

  for (const player of state.players) {
    const name = player.name.trim();
    const buyInValue = player.buyIn.trim();
    const cashOutValue = player.cashOut.trim();
    const paidValue = player.paid.trim();
    const receivedValue = player.received.trim();
    const isEmpty = !name && !buyInValue && !cashOutValue && !paidValue && !receivedValue;

    if (isEmpty) {
      continue;
    }

    const playerErrors = [];
    const buyInCents = parseMoneyToCents(buyInValue);
    const cashOutCents = parseMoneyToCents(cashOutValue, { blankIsZero: true });
    const paidCents = parseMoneyToCents(paidValue, { blankIsZero: true });
    const receivedCents = parseMoneyToCents(receivedValue, { blankIsZero: true });

    if (!name) {
      playerErrors.push('Add a player name.');
    }
    if (buyInCents === null || buyInCents === 0) {
      playerErrors.push('Buy-in must be greater than zero with no more than 2 decimals.');
    }
    if (cashOutCents === null) {
      playerErrors.push('Cash-out must be zero or more with no more than 2 decimals.');
    }
    if (paidCents === null) {
      playerErrors.push('Paid-to-table must be zero or more with no more than 2 decimals.');
    }
    if (receivedCents === null) {
      playerErrors.push('Received-from-table must be zero or more with no more than 2 decimals.');
    }
    if (cashOutCents !== null && receivedCents !== null && receivedCents > cashOutCents) {
      playerErrors.push('Received-from-table cannot exceed this player’s cash-out.');
    }

    if (buyInCents !== null) {
      totalBuyInCents += buyInCents;
    }
    if (cashOutCents !== null) {
      totalCashOutCents += cashOutCents;
    }
    if (paidCents !== null) {
      totalPaidCents += paidCents;
    }
    if (receivedCents !== null) {
      totalReceivedCents += receivedCents;
    }

    if (playerErrors.length === 0) {
      normalizedPlayers.push({
        id: player.id,
        name,
        buyInCents,
        cashOutCents,
        paidCents,
        receivedCents,
      });

      const normalizedName = name.toLowerCase();
      const existingId = names.get(normalizedName);
      if (existingId) {
        errors.set(existingId, ['Use a unique name for each player.']);
        playerErrors.push('Use a unique name for each player.');
      } else {
        names.set(normalizedName, player.id);
      }
    }

    if (playerErrors.length > 0) {
      errors.set(player.id, playerErrors);
    }
  }

  const differenceCents = totalCashOutCents - totalBuyInCents;

  return {
    errors,
    normalizedPlayers,
    draftTotals: {
      totalBuyInCents,
      totalCashOutCents,
      totalPaidCents,
      totalReceivedCents,
    },
    ready: errors.size === 0
      && normalizedPlayers.length >= 2
      && differenceCents === 0
      && totalPaidCents >= totalReceivedCents,
  };
}

function applyValidation(validation) {
  for (const card of elements.playerList.querySelectorAll('.player-card')) {
    const messages = validation.errors.get(card.dataset.playerId) ?? [];
    const errorElement = card.querySelector('.player-error');
    card.classList.toggle('is-invalid', messages.length > 0);
    errorElement.hidden = messages.length === 0;
    errorElement.textContent = messages.join(' ');
  }
}

function setPotStatus(status, stamp, message) {
  elements.potCheck.dataset.status = status;
  elements.balanceStamp.textContent = stamp;
  elements.potMessage.textContent = message;
}

function renderResults(result) {
  elements.paymentList.replaceChildren();
  elements.resultsSummary.textContent = `${result.balances.length} players · ${formatMoney(result.totalBuyInCents)} total pot`;
  elements.planBadge.textContent = result.strategy === 'minimum'
    ? 'Minimum payments'
    : 'Efficient payment plan';

  if (result.transactions.length === 0) {
    const message = document.createElement('p');
    message.className = 'even-message';
    message.textContent = 'No payments needed. Everyone finished even.';
    elements.paymentList.append(message);
    return;
  }

  for (const [index, transaction] of result.transactions.entries()) {
    const payment = document.createElement('article');
    payment.className = 'payment-row';

    const number = document.createElement('span');
    number.className = 'payment-number';
    number.textContent = String(index + 1).padStart(2, '0');

    const route = document.createElement('div');
    route.className = 'payment-route';

    const payer = document.createElement('strong');
    payer.textContent = transaction.payerName;
    const direction = document.createElement('span');
    direction.textContent = 'pays';
    const payee = document.createElement('strong');
    payee.textContent = transaction.payeeName;
    route.append(payer, direction, payee);

    const amount = document.createElement('strong');
    amount.className = 'payment-amount';
    amount.textContent = formatMoney(transaction.amountCents);

    payment.append(number, route, amount);
    elements.paymentList.append(payment);
  }
}

async function saveHistoryEntry(result, players) {
  const entry = {
    id: state.sessionId,
    closedAt: new Date().toISOString(),
    players: players.map((player) => ({ ...player })),
    balances: result.balances.map((balance) => ({ ...balance })),
    totalBuyInCents: result.totalBuyInCents,
    totalCashOutCents: result.totalCashOutCents,
    totalPaidCents: result.totalPaidCents,
    totalReceivedCents: result.totalReceivedCents,
    tableCashCents: result.tableCashCents,
    strategy: result.strategy,
    transactions: result.transactions.map((transaction) => ({ ...transaction })),
  };

  await withStorageLock(HISTORY_KEY, () => {
    const latestHistory = loadHistory();
    history = [entry, ...latestHistory.filter(({ id }) => id !== entry.id)].slice(0, MAX_HISTORY);
    saveHistory();
  });
  renderHistory();
}

function renderHistory() {
  elements.historyList.replaceChildren();
  elements.historyEmpty.hidden = history.length > 0;
  elements.historyCount.textContent = `${history.length} ${history.length === 1 ? 'game' : 'games'}`;

  for (const entry of history) {
    const details = document.createElement('details');
    details.className = 'history-card';

    const summary = document.createElement('summary');
    const heading = document.createElement('span');
    heading.className = 'history-card-heading';
    const title = document.createElement('strong');
    title.textContent = formatHistoryDate(entry.closedAt);
    const meta = document.createElement('small');
    meta.textContent = `${entry.players.length} players · ${formatMoney(entry.totalBuyInCents)} pot`;
    heading.append(title, meta);
    const count = document.createElement('span');
    count.className = 'history-payment-count';
    count.textContent = `${entry.transactions.length} ${entry.transactions.length === 1 ? 'payment' : 'payments'}`;
    summary.append(heading, count);

    const content = document.createElement('div');
    content.className = 'history-content';
    const cashLine = document.createElement('p');
    cashLine.className = 'history-cash-line';
    cashLine.textContent = `${formatMoney(entry.tableCashCents)} was on the table at close.`;
    content.append(cashLine);

    const payments = document.createElement('div');
    payments.className = 'history-payments';
    if (entry.transactions.length === 0) {
      const settled = document.createElement('p');
      settled.textContent = 'No remaining payments were needed.';
      payments.append(settled);
    } else {
      for (const transaction of entry.transactions) {
        const payment = document.createElement('p');
        const route = document.createElement('span');
        route.textContent = `${transaction.payerName} pays ${transaction.payeeName}`;
        const amount = document.createElement('strong');
        amount.textContent = formatMoney(transaction.amountCents);
        payment.append(route, amount);
        payments.append(payment);
      }
    }
    content.append(payments);

    const actions = document.createElement('div');
    actions.className = 'history-actions';
    actions.append(
      createHistoryButton(entry.id, 'reuse', 'Use as new game'),
      createHistoryButton(entry.id, 'copy', 'Copy plan'),
      createHistoryButton(entry.id, 'delete', 'Delete'),
    );
    content.append(actions);
    details.append(summary, content);
    elements.historyList.append(details);
  }
}

function createHistoryButton(historyId, action, label) {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.historyId = historyId;
  button.dataset.historyAction = action;
  button.textContent = label;
  return button;
}

function reuseHistoryEntry(entry) {
  state = {
    sessionId: createId(),
    players: entry.players.map((player) => ({
      id: createId(),
      name: player.name,
      buyIn: formatInputMoney(player.buyInCents),
      cashOut: formatInputMoney(player.cashOutCents),
      paid: formatInputMoney(player.paidCents),
      received: formatInputMoney(player.receivedCents),
      buyInMode: 'credit',
    })),
  };
  currentResult = null;
  elements.resultsSection.hidden = true;
  saveSession();
  renderPlayers();
  updateSessionSummary();
  document.querySelector('#main-content').scrollIntoView({ behavior: 'smooth' });
  showToast('Saved players and amounts loaded as a new game.');
}

async function deleteHistoryEntry(historyId) {
  if (!window.confirm('Delete this saved game from this device?')) {
    return;
  }
  await withStorageLock(HISTORY_KEY, () => {
    history = loadHistory().filter(({ id }) => id !== historyId);
    saveHistory();
  });
  renderHistory();
}

function formatHistoryDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Saved game';
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function createShareText(result) {
  const heading = `Poker settlement · ${formatMoney(result.totalBuyInCents)} pot`;
  if (result.transactions.length === 0) {
    return `${heading}\nNo payments needed. Everyone finished even.`;
  }

  const payments = result.transactions.map(
    (transaction) => `${transaction.payerName} pays ${transaction.payeeName} ${formatMoney(transaction.amountCents)}`,
  );
  return [heading, '', ...payments, '', 'Calculated with Table Close'].join('\n');
}

function formatMoney(cents) {
  return currencyFormatter.format(cents / 100).replace(/\s/g, '');
}

function formatSignedMoney(cents, includePlus = true) {
  if (cents === 0) {
    return formatMoney(0);
  }
  const sign = cents > 0 && includePlus ? '+' : cents < 0 ? '−' : '';
  return `${sign}${formatMoney(Math.abs(cents))}`;
}

function formatInputMoney(cents) {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}

function createEmptyPlayer() {
  return {
    id: createId(),
    name: '',
    buyIn: '',
    cashOut: '',
    paid: '',
    received: '',
    buyInMode: 'credit',
  };
}

function createInitialSession() {
  return {
    sessionId: createId(),
    players: [createEmptyPlayer(), createEmptyPlayer()],
  };
}

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `item-${Date.now()}-${Math.random()}`;
}

function loadSession() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!Array.isArray(saved?.players) || saved.players.length > MAX_PLAYERS) {
      return createInitialSession();
    }

    const usedIds = new Set();
    const players = saved.players.map((player) => {
      let id = String(player.id || createEmptyPlayer().id);
      if (usedIds.has(id)) {
        id = createEmptyPlayer().id;
      }
      usedIds.add(id);

      return {
        id,
        name: String(player.name ?? '').slice(0, 40),
        buyIn: String(player.buyIn ?? ''),
        cashOut: String(player.cashOut ?? ''),
        paid: String(player.paid ?? ''),
        received: String(player.received ?? ''),
        buyInMode: player.buyInMode === 'cash' ? 'cash' : 'credit',
      };
    });
    return {
      sessionId: String(saved.sessionId || createId()),
      players: players.length > 0 ? players : createInitialSession().players,
    };
  } catch {
    return createInitialSession();
  }
}

function loadFriends() {
  try {
    const saved = JSON.parse(localStorage.getItem(FRIENDS_KEY));
    if (!Array.isArray(saved)) {
      return [];
    }

    const ids = new Set();
    const names = new Set();
    return saved
      .map((friend) => ({
        id: String(friend.id || createId()),
        name: String(friend.name ?? '').trim().slice(0, 40),
      }))
      .filter((friend) => {
        const key = friend.name.toLowerCase();
        if (!friend.name || names.has(key)) {
          return false;
        }
        if (ids.has(friend.id)) {
          friend.id = createId();
        }
        ids.add(friend.id);
        names.add(key);
        return true;
      })
      .slice(0, MAX_FRIENDS);
  } catch {
    return [];
  }
}

function saveFriends() {
  try {
    localStorage.setItem(FRIENDS_KEY, JSON.stringify(friends));
  } catch {
    showToast('This browser could not save remembered friends.');
  }
}

function loadHistory() {
  try {
    const saved = JSON.parse(localStorage.getItem(HISTORY_KEY));
    if (!Array.isArray(saved)) {
      return [];
    }

    const usedIds = new Set();
    return saved
      .map((entry) => normalizeHistoryEntry(entry, usedIds))
      .filter(Boolean)
      .slice(0, MAX_HISTORY);
  } catch {
    return [];
  }
}

function normalizeHistoryEntry(entry, usedIds) {
  if (!entry || typeof entry.closedAt !== 'string' || Number.isNaN(Date.parse(entry.closedAt))) {
    return null;
  }
  if (!Array.isArray(entry.players)
    || entry.players.length < MIN_PLAYERS
    || entry.players.length > MAX_PLAYERS) {
    return null;
  }

  const usedPlayerIds = new Set();
  const usedNames = new Set();
  const players = [];
  for (const [index, player] of entry.players.entries()) {
    const name = String(player?.name ?? '').replace(/\s+/g, ' ').trim();
    const nameKey = name.toLowerCase();
    const buyInCents = normalizeStoredMoney(player?.buyInCents);
    const cashOutCents = normalizeStoredMoney(player?.cashOutCents);
    const paidCents = normalizeStoredMoney(player?.paidCents ?? 0);
    const receivedCents = normalizeStoredMoney(player?.receivedCents ?? 0);
    if (!name || name.length > 40 || usedNames.has(nameKey)
      || buyInCents === null || cashOutCents === null
      || paidCents === null || receivedCents === null
      || receivedCents > cashOutCents) {
      return null;
    }

    let id = typeof player.id === 'string' && player.id
      ? player.id
      : `history-player-${index + 1}`;
    if (usedPlayerIds.has(id)) {
      id = `${id}-${index + 1}`;
    }
    usedPlayerIds.add(id);
    usedNames.add(nameKey);
    players.push({ id, name, buyInCents, cashOutCents, paidCents, receivedCents });
  }

  const result = settleSession(players);
  if (result.status !== 'settled') {
    return null;
  }

  let id = typeof entry.id === 'string' && entry.id ? entry.id : createId();
  if (usedIds.has(id)) {
    id = createId();
  }
  usedIds.add(id);
  return {
    id,
    closedAt: new Date(entry.closedAt).toISOString(),
    players,
    totalBuyInCents: result.totalBuyInCents,
    totalCashOutCents: result.totalCashOutCents,
    tableCashCents: result.tableCashCents,
    balances: result.balances,
    transactions: result.transactions,
    strategy: result.strategy,
  };
}

function normalizeStoredMoney(value) {
  return Number.isSafeInteger(value) && value >= 0 && value <= MAX_AMOUNT_CENTS
    ? value
    : null;
}

function withStorageLock(key, callback) {
  if (navigator.locks?.request) {
    return navigator.locks.request(`table-close:${key}`, callback);
  }
  return Promise.resolve(callback());
}

function initializeStorageSync() {
  window.addEventListener('storage', (event) => {
    if (event.storageArea !== localStorage) {
      return;
    }
    if (event.key === HISTORY_KEY) {
      history = loadHistory();
      renderHistory();
      return;
    }
    if (event.key === FRIENDS_KEY) {
      friends = loadFriends();
      renderFriends();
      renderPlayers();
      return;
    }
    if (event.key === STORAGE_KEY) {
      state = loadSession();
      currentResult = null;
      elements.resultsSection.hidden = true;
      renderPlayers();
      updateSessionSummary();
      showToast('Draft updated from another tab.');
    }
  });
}

function saveHistory() {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {
    showToast('This browser could not save game history.');
  }
}

function saveSession() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    showToast('This browser could not save the draft.');
  }
}

function resetSession() {
  state = createInitialSession();
  currentResult = null;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    showToast('The browser could not remove the saved draft.');
  }
  elements.resultsSection.hidden = true;
  renderPlayers();
  updateSessionSummary();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function hasEnteredData() {
  return state.players.some(
    (player) => player.name || player.buyIn || player.cashOut || player.paid || player.received,
  );
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.className = 'clipboard-helper';
    document.body.append(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    textarea.remove();
    return copied;
  }
}

function showToast(message) {
  window.clearTimeout(toastTimeout);
  elements.toast.textContent = message;
  elements.toast.classList.add('is-visible');
  toastTimeout = window.setTimeout(() => elements.toast.classList.remove('is-visible'), 2600);
}

function initializeInstallExperience() {
  const standalone = window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);

  if (isIos && !standalone) {
    elements.installButton.hidden = false;
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    elements.installButton.hidden = false;
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    elements.installButton.hidden = true;
    showToast('Table Close is installed.');
  });

  elements.installButton.addEventListener('click', async () => {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      elements.installButton.hidden = true;
      return;
    }

    elements.installDialog.showModal();
  });
}

function initializeConnectivity() {
  function update() {
    elements.connectionStatus.textContent = navigator.onLine
      ? 'Private on this device'
      : 'Offline and ready';
  }

  window.addEventListener('online', update);
  window.addEventListener('offline', update);
  update();
}

async function registerServiceWorker() {
  const isProductionBuild = new URL(import.meta.url).pathname.includes('/assets/');
  if (!('serviceWorker' in navigator) || !isProductionBuild) {
    return;
  }

  try {
    await navigator.serviceWorker.register(new URL('./service-worker.js', document.baseURI));
  } catch {
    showToast('Offline mode could not be enabled.');
  }
}
