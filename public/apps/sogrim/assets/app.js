import {
  addMoneyPreset,
  MAX_AMOUNT_CENTS,
  parseMoneyToCents,
  settleSession,
  summarizeSession,
  TABLE_CASH_ID,
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

let state = loadSession(true);
let friends = loadFriends(true);
let history = loadHistory(true);
let currentResult = null;
let settlementPending = false;
let deferredInstallPrompt = null;
let toastTimeout;
let activePlayerId = state.players[0]?.id ?? null;

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
  if (input.dataset.field === 'received') {
    player.receivedMode = 'custom';
  } else if (input.dataset.field === 'cashOut' && player.receivedMode === 'full') {
    player.received = input.value;
    card.querySelector('[data-field="received"]').value = input.value;
  }
  if (input.dataset.field === 'name') {
    card.querySelector('.buy-in-presets').setAttribute(
      'aria-label',
      `Quick add to buy-in for ${input.value.trim() || `player ${card.querySelector('.player-number').textContent}`}`,
    );
  }
  invalidateResult();
  saveSession();
  updatePlayerCard(card, player);
  updateSessionSummary();
});

elements.playerList.addEventListener('focusout', (event) => {
  const input = event.target.closest('[data-field="cashBuyIn"], [data-field="creditBuyIn"], [data-field="cashOut"], [data-field="extraPaid"], [data-field="received"]');
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
  if (input.dataset.field === 'cashOut' && player.receivedMode === 'full') {
    player.received = input.value;
    card.querySelector('[data-field="received"]').value = input.value;
  }
  saveSession();
  updatePlayerCard(card, player);
  updateSessionSummary();
});

elements.playerList.addEventListener('click', (event) => {
  const toggleButton = event.target.closest('.player-toggle');
  if (toggleButton) {
    const card = toggleButton.closest('.player-card');
    activePlayerId = card.dataset.playerId;
    updateExpandedPlayer();
    requestAnimationFrame(() => card.querySelector('[data-field="name"]')?.focus());
    return;
  }

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

  const removeButton = event.target.closest('.remove-player');
  if (!removeButton) {
    return;
  }

  const card = removeButton.closest('.player-card');
  state.players = state.players.filter(({ id }) => id !== card.dataset.playerId);
  if (activePlayerId === card.dataset.playerId) {
    activePlayerId = state.players[0]?.id ?? null;
  }
  invalidateResult();
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
  if (settlementPending) {
    return;
  }
  const validation = validatePlayers();
  applyValidation(validation);

  if (!validation.ready) {
    showToast('Finish the highlighted details before settling.');
    return;
  }

  const result = settleSession(validation.normalizedPlayers);
  const sessionId = state.sessionId;
  const revision = state.revision;
  settlementPending = true;
  updateSessionSummary();
  try {
    await rememberCompletedPlayers(validation.normalizedPlayers, sessionId, revision);
    if (!isCurrentDraft(sessionId, revision)) {
      return;
    }
    await saveHistoryEntry(result, validation.normalizedPlayers, sessionId, revision);
    if (!isCurrentDraft(sessionId, revision)) {
      return;
    }
    currentResult = result;
    renderResults(result);
    elements.resultsSection.hidden = false;
    elements.resultsSection.focus({ preventScroll: true });
    elements.resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } finally {
    settlementPending = false;
    updateSessionSummary();
  }
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
  activePlayerId = player.id;
  invalidateResult();
  saveSession();
  renderPlayers();
  updateSessionSummary();
  findPlayerCard(player.id)?.querySelector('[data-field="name"]')?.focus();
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
  activePlayerId = player.id;
  invalidateResult();
  saveSession();
  renderPlayers();
  updateSessionSummary();
  findPlayerCard(player.id)?.querySelector('[data-buy-in-preset]')?.focus();
}

async function removeFriend(friendId) {
  await withStorageLock(FRIENDS_KEY, () => {
    const nextFriends = loadFriends().filter(({ id }) => id !== friendId);
    if (saveFriends(nextFriends)) {
      friends = nextFriends;
    }
  });
  renderFriends();
}

async function rememberCompletedPlayers(players, sessionId, revision) {
  await withStorageLock(FRIENDS_KEY, () => {
    if (!isCurrentDraft(sessionId, revision)) {
      return;
    }
    const latestFriends = loadFriends();
    const knownNames = new Set(latestFriends.map(({ name }) => name.toLowerCase()));
    const nextFriends = [...latestFriends];
    for (const player of players) {
      const name = normalizeName(player.name);
      if (!knownNames.has(name.toLowerCase()) && nextFriends.length < MAX_FRIENDS) {
        nextFriends.push({ id: createId(), name });
        knownNames.add(name.toLowerCase());
      }
    }
    nextFriends.sort((left, right) => left.name.localeCompare(right.name));
    if (saveFriends(nextFriends)) {
      friends = nextFriends;
    }
  });
  renderFriends();
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

function isPlayerEmpty(player) {
  return !player.name && !player.cashBuyIn && !player.creditBuyIn
    && !player.cashOut && !player.extraPaid && !player.received;
}

function findPlayerCard(playerId) {
  return [...elements.playerList.querySelectorAll('.player-card')]
    .find((card) => card.dataset.playerId === playerId);
}

function applyBuyInPreset(button) {
  const card = button.closest('.player-card');
  const player = state.players.find(({ id }) => id === card?.dataset.playerId);
  if (!card || !player) {
    return;
  }

  const incrementCents = Number(button.dataset.buyInPreset);
  const field = player.nextBuyInType === 'credit' ? 'creditBuyIn' : 'cashBuyIn';
  const totalCents = addMoneyPreset(player[field], incrementCents);
  if (totalCents === null) {
    showToast('Correct the buy-in totals under More options before adding another buy-in.');
    return;
  }

  player[field] = formatInputMoney(totalCents);
  card.querySelector(`[data-field="${field}"]`).value = player[field];
  invalidateResult();
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

  player.nextBuyInType = button.dataset.buyInMode;
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
  player.receivedMode = button.dataset.receivedAction === 'all' ? 'full' : 'none';
  card.querySelector('[data-field="received"]').value = player.received;
  invalidateResult();
  saveSession();
  updatePlayerCard(card, player);
  updateReceivedActionButtons(card, player);
  updateSessionSummary();
}

function renderPlayers() {
  elements.playerList.replaceChildren();

  if (!state.players.some(({ id }) => id === activePlayerId)) {
    activePlayerId = state.players[0]?.id ?? null;
  }

  for (const [index, player] of state.players.entries()) {
    const fragment = elements.playerTemplate.content.cloneNode(true);
    const card = fragment.querySelector('.player-card');
    const removeButton = fragment.querySelector('.remove-player');
    const presetGroup = fragment.querySelector('.buy-in-presets');
    const errorElement = fragment.querySelector('.player-error');
    card.dataset.playerId = player.id;
    fragment.querySelector('.player-number').textContent = String(index + 1).padStart(2, '0');
    const toggleButton = fragment.querySelector('.player-toggle');
    toggleButton.setAttribute('aria-label', `Edit player ${index + 1}`);
    fragment.querySelector('[data-field="name"]').value = player.name;
    fragment.querySelector('[data-field="cashBuyIn"]').value = player.cashBuyIn;
    fragment.querySelector('[data-field="creditBuyIn"]').value = player.creditBuyIn;
    fragment.querySelector('[data-field="cashOut"]').value = player.cashOut;
    fragment.querySelector('[data-field="extraPaid"]').value = player.extraPaid;
    fragment.querySelector('[data-field="received"]').value = player.received;
    removeButton.setAttribute('aria-label', `Remove player ${index + 1}`);
    errorElement.id = `player-error-${index + 1}`;
    for (const input of fragment.querySelectorAll('[data-field]')) {
      input.setAttribute('aria-describedby', errorElement.id);
    }
    presetGroup.setAttribute(
      'aria-label',
      `Quick add to buy-in for ${player.name.trim() || `player ${index + 1}`}`,
    );
    elements.playerList.append(fragment);
    updatePlayerCard(card, player);
    updateBuyInModeButtons(card, player);
    updateReceivedActionButtons(card, player);
  }

  updateExpandedPlayer();

  const atLimit = state.players.length >= MAX_PLAYERS;
  elements.playerCount.textContent = `${state.players.length} ${state.players.length === 1 ? 'player' : 'players'}`;
  elements.addPlayerButton.disabled = atLimit;
  elements.addPlayerWideButton.disabled = atLimit;
}

function updatePlayerCard(card, player) {
  const cashBuyInCents = parseMoneyToCents(player.cashBuyIn, { blankIsZero: true });
  const creditBuyInCents = parseMoneyToCents(player.creditBuyIn, { blankIsZero: true });
  const cashOutCents = parseMoneyToCents(player.cashOut, { blankIsZero: true });
  const extraPaidCents = parseMoneyToCents(player.extraPaid, { blankIsZero: true });
  const receivedCents = parseMoneyToCents(player.received, { blankIsZero: true });
  const output = card.querySelector('.player-net');
  const buyInOutput = card.querySelector('.buy-in-total');
  const cashOutput = card.querySelector('.cash-buy-in-total');
  const creditOutput = card.querySelector('.credit-buy-in-total');
  const summaryName = card.querySelector('.player-summary-name');
  const summaryBuyIn = card.querySelector('.player-summary-buy-in');
  const summaryCashOut = card.querySelector('.player-summary-cash-out');
  summaryName.textContent = player.name.trim() || `Player ${state.players.findIndex(({ id }) => id === player.id) + 1}`;

  if (cashBuyInCents === null || creditBuyInCents === null || cashOutCents === null
    || extraPaidCents === null || receivedCents === null) {
    output.textContent = '—';
    output.className = 'player-net';
    buyInOutput.textContent = '—';
    cashOutput.textContent = '—';
    creditOutput.textContent = '—';
    summaryBuyIn.textContent = '—';
    summaryCashOut.textContent = '—';
    return;
  }

  const buyInCents = cashBuyInCents + creditBuyInCents;
  const netCents = cashOutCents - receivedCents - creditBuyInCents + extraPaidCents;
  output.textContent = formatSignedMoney(netCents);
  output.className = `player-net ${netCents > 0 ? 'is-positive' : netCents < 0 ? 'is-negative' : ''}`;
  buyInOutput.textContent = formatMoney(buyInCents);
  cashOutput.textContent = formatMoney(cashBuyInCents);
  creditOutput.textContent = formatMoney(creditBuyInCents);
  summaryBuyIn.textContent = formatMoney(buyInCents);
  summaryCashOut.textContent = formatMoney(cashOutCents);
}

function updateExpandedPlayer() {
  for (const card of elements.playerList.querySelectorAll('.player-card')) {
    const isActive = card.dataset.playerId === activePlayerId;
    card.classList.toggle('is-active', isActive);
    card.querySelector('.player-toggle').setAttribute('aria-expanded', String(isActive));
  }
}

function updateBuyInModeButtons(card, player) {
  for (const button of card.querySelectorAll('[data-buy-in-mode]')) {
    const selected = button.dataset.buyInMode === player.nextBuyInType;
    button.classList.toggle('is-selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  }
}

function updateReceivedActionButtons(card, player) {
  for (const button of card.querySelectorAll('[data-received-action]')) {
    const mode = button.dataset.receivedAction === 'all' ? 'full' : 'none';
    const selected = mode === player.receivedMode;
    button.classList.toggle('is-selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  }
}

function invalidateResult() {
  state.revision = (state.revision ?? 0) + 1;
  currentResult = null;
  elements.resultsSection.hidden = true;
}

function isCurrentDraft(sessionId, revision) {
  return state.sessionId === sessionId && state.revision === revision;
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
  elements.settleButton.disabled = settlementPending || !validation.ready;
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
    const name = normalizeName(player.name);
    const cashBuyInValue = player.cashBuyIn.trim();
    const creditBuyInValue = player.creditBuyIn.trim();
    const cashOutValue = player.cashOut.trim();
    const extraPaidValue = player.extraPaid.trim();
    const receivedValue = player.received.trim();
    const isEmpty = !name && !cashBuyInValue && !creditBuyInValue
      && !cashOutValue && !extraPaidValue && !receivedValue;

    if (isEmpty) {
      continue;
    }

    const playerErrors = [];
    const cashBuyInCents = parseMoneyToCents(cashBuyInValue, { blankIsZero: true });
    const creditBuyInCents = parseMoneyToCents(creditBuyInValue, { blankIsZero: true });
    const cashOutCents = parseMoneyToCents(cashOutValue, { blankIsZero: true });
    const extraPaidCents = parseMoneyToCents(extraPaidValue, { blankIsZero: true });
    const receivedCents = parseMoneyToCents(receivedValue, { blankIsZero: true });
    const buyInCents = cashBuyInCents === null || creditBuyInCents === null
      ? null
      : cashBuyInCents + creditBuyInCents;
    const paidCents = cashBuyInCents === null || extraPaidCents === null
      ? null
      : cashBuyInCents + extraPaidCents;

    if (!name) {
      playerErrors.push('Add a player name.');
    }
    if (buyInCents === null || buyInCents === 0) {
      playerErrors.push('Add at least one valid cash or credit buy-in.');
    } else if (buyInCents > MAX_AMOUNT_CENTS) {
      playerErrors.push('Total buy-in is above the supported limit.');
    }
    if (cashOutCents === null) {
      playerErrors.push('Cash-out must be zero or more with no more than 2 decimals.');
    }
    if (extraPaidCents === null) {
      playerErrors.push('Extra cash paid must be zero or more with no more than 2 decimals.');
    } else if (paidCents > MAX_AMOUNT_CENTS) {
      playerErrors.push('Cash paid is above the supported limit.');
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
    for (const input of card.querySelectorAll('[data-field]')) {
      input.setAttribute('aria-invalid', String(messages.length > 0));
    }
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

async function saveHistoryEntry(result, players, sessionId, revision) {
  const entry = {
    id: sessionId,
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
    if (!isCurrentDraft(sessionId, revision)) {
      return;
    }
    const latestHistory = loadHistory();
    const nextHistory = [entry, ...latestHistory.filter(({ id }) => id !== entry.id)].slice(0, MAX_HISTORY);
    if (saveHistory(nextHistory)) {
      history = nextHistory;
    }
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
      createHistoryButton(entry.id, 'reuse', 'Start with these players'),
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
    players: entry.players.map((player) => createEmptyPlayer(player.name)),
  };
  currentResult = null;
  elements.resultsSection.hidden = true;
  saveSession();
  renderPlayers();
  updateSessionSummary();
  document.querySelector('#main-content').scrollIntoView({ behavior: 'smooth' });
  showToast('Players added to a fresh game.');
}

async function deleteHistoryEntry(historyId) {
  if (!window.confirm('Delete this saved game from this device?')) {
    return;
  }
  await withStorageLock(HISTORY_KEY, () => {
    const nextHistory = loadHistory().filter(({ id }) => id !== historyId);
    if (saveHistory(nextHistory)) {
      history = nextHistory;
    }
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
  return [heading, '', ...payments, '', 'Calculated with Sogrim'].join('\n');
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

function createEmptyPlayer(name = '') {
  return {
    id: createId(),
    name,
    cashBuyIn: '',
    creditBuyIn: '',
    cashOut: '',
    extraPaid: '',
    received: '',
    receivedMode: 'none',
    nextBuyInType: 'cash',
  };
}

function createInitialSession() {
  return {
    sessionId: createId(),
    revision: 0,
    players: [createEmptyPlayer(), createEmptyPlayer()],
  };
}

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `item-${Date.now()}-${Math.random()}`;
}

function normalizeId(value, usedIds) {
  let id = String(value ?? '');
  if (!/^[a-zA-Z0-9._:-]{1,128}$/.test(id) || id === TABLE_CASH_ID || usedIds.has(id)) {
    do {
      id = createId();
    } while (usedIds.has(id));
  }
  usedIds.add(id);
  return id;
}

function normalizeName(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function migratePlayer(player, id) {
  const name = normalizeName(player?.name).slice(0, 40);
  const cashOut = String(player?.cashOut ?? '');
  const received = String(player?.received ?? '');
  const cashOutCents = parseMoneyToCents(cashOut);
  const receivedCents = parseMoneyToCents(received);
  const explicitReceivedMode = ['none', 'full', 'custom'].includes(player?.receivedMode)
    ? player.receivedMode
    : null;
  const receivedMode = explicitReceivedMode
    ?? (received && cashOutCents !== null && receivedCents !== null && receivedCents === cashOutCents
      ? 'full'
      : !received ? 'none' : 'custom');
  const normalizedReceived = receivedMode === 'full' ? cashOut : received;

  if (player && typeof player === 'object'
    && ('cashBuyIn' in player || 'creditBuyIn' in player)) {
    return {
      id,
      name,
      cashBuyIn: String(player.cashBuyIn ?? ''),
      creditBuyIn: String(player.creditBuyIn ?? ''),
      cashOut,
      extraPaid: String(player.extraPaid ?? ''),
      received: normalizedReceived,
      receivedMode,
      nextBuyInType: player.nextBuyInType === 'credit' ? 'credit' : 'cash',
    };
  }

  const oldBuyInCents = parseMoneyToCents(player?.buyIn, { blankIsZero: true });
  const oldPaidCents = parseMoneyToCents(player?.paid, { blankIsZero: true });
  if (oldBuyInCents === null || oldPaidCents === null) {
    return {
      ...createEmptyPlayer(name),
      id,
      creditBuyIn: String(player?.buyIn ?? ''),
      extraPaid: String(player?.paid ?? ''),
      cashOut,
      received: normalizedReceived,
      receivedMode,
    };
  }

  const cashBuyInCents = Math.min(oldBuyInCents, oldPaidCents);
  return {
    id,
    name,
    cashBuyIn: cashBuyInCents ? formatInputMoney(cashBuyInCents) : '',
    creditBuyIn: oldBuyInCents > cashBuyInCents
      ? formatInputMoney(oldBuyInCents - cashBuyInCents)
      : '',
    cashOut,
    extraPaid: oldPaidCents > cashBuyInCents
      ? formatInputMoney(oldPaidCents - cashBuyInCents)
      : '',
    received: normalizedReceived,
    receivedMode,
    nextBuyInType: player?.buyInMode === 'credit' ? 'credit' : 'cash',
  };
}

function loadSession(persistRepair = false) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const saved = JSON.parse(raw);
    if (!Array.isArray(saved?.players) || saved.players.length > MAX_PLAYERS) {
      return createInitialSession();
    }

    const usedIds = new Set();
    const players = saved.players.map((player) => {
      const id = normalizeId(player?.id, usedIds);

      return migratePlayer(player, id);
    });
    const session = {
      sessionId: String(saved.sessionId || createId()),
      revision: Number.isSafeInteger(saved.revision) && saved.revision >= 0 ? saved.revision : 0,
      players: players.length > 0 ? players : createInitialSession().players,
    };
    persistRepairIfNeeded(STORAGE_KEY, raw, session, persistRepair);
    return session;
  } catch {
    return createInitialSession();
  }
}

function loadFriends(persistRepair = false) {
  try {
    const raw = localStorage.getItem(FRIENDS_KEY);
    const saved = JSON.parse(raw);
    if (!Array.isArray(saved)) {
      return [];
    }

    const ids = new Set();
    const names = new Set();
    const normalized = saved
      .map((friend, index) => ({
        id: String(friend?.id || `legacy-friend-${index + 1}`),
        name: normalizeName(friend?.name).slice(0, 40),
      }))
      .filter((friend) => {
        const key = friend.name.toLowerCase();
        if (!friend.name || names.has(key)) {
          return false;
        }
        if (ids.has(friend.id)) {
          friend.id = `${friend.id}-${ids.size + 1}`;
        }
        ids.add(friend.id);
        names.add(key);
        return true;
      })
      .slice(0, MAX_FRIENDS);
    persistRepairIfNeeded(FRIENDS_KEY, raw, normalized, persistRepair);
    return normalized;
  } catch {
    return [];
  }
}

function saveFriends(value = friends) {
  try {
    localStorage.setItem(FRIENDS_KEY, JSON.stringify(value));
    return true;
  } catch {
    showToast('This browser could not save remembered friends.');
    return false;
  }
}

function loadHistory(persistRepair = false) {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const saved = JSON.parse(raw);
    if (!Array.isArray(saved)) {
      return [];
    }

    const usedIds = new Set();
    const normalized = saved
      .map((entry, index) => normalizeHistoryEntry(entry, usedIds, index))
      .filter(Boolean)
      .slice(0, MAX_HISTORY);
    persistRepairIfNeeded(HISTORY_KEY, raw, normalized, persistRepair);
    return normalized;
  } catch {
    return [];
  }
}

function normalizeHistoryEntry(entry, usedIds, index) {
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
    const name = normalizeName(player?.name);
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

    const id = normalizeId(player?.id ?? `history-player-${index + 1}`, usedPlayerIds);
    usedNames.add(nameKey);
    players.push({ id, name, buyInCents, cashOutCents, paidCents, receivedCents });
  }

  const result = settleSession(players);
  if (result.status !== 'settled') {
    return null;
  }

  let id = typeof entry.id === 'string' && entry.id
    ? entry.id
    : `legacy-history-${index + 1}`;
  if (usedIds.has(id)) {
    id = `${id}-${usedIds.size + 1}`;
  }
  usedIds.add(id);
  return {
    id,
    closedAt: new Date(entry.closedAt).toISOString(),
    players,
    totalBuyInCents: result.totalBuyInCents,
    totalCashOutCents: result.totalCashOutCents,
    totalPaidCents: result.totalPaidCents,
    totalReceivedCents: result.totalReceivedCents,
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

function persistRepairIfNeeded(key, raw, value, shouldPersist) {
  if (!shouldPersist || raw === JSON.stringify(value)) {
    return;
  }
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // The in-memory migration still keeps the current page usable.
  }
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
      return;
    }
    if (event.key === STORAGE_KEY) {
      const activeInput = document.activeElement?.closest?.('[data-field]');
      const activeCard = activeInput?.closest('.player-card');
      const focusState = activeInput && activeCard
        ? {
            playerId: activeCard.dataset.playerId,
            field: activeInput.dataset.field,
            start: activeInput.selectionStart,
            end: activeInput.selectionEnd,
          }
        : null;
      state = loadSession();
      currentResult = null;
      elements.resultsSection.hidden = true;
      renderPlayers();
      updateSessionSummary();
      if (focusState) {
        const replacement = findPlayerCard(focusState.playerId)
          ?.querySelector(`[data-field="${focusState.field}"]`);
        replacement?.focus();
        replacement?.setSelectionRange(focusState.start, focusState.end);
      }
      showToast('Draft updated from another tab.');
    }
  });
}

function saveHistory(value = history) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(value));
    return true;
  } catch {
    showToast('This browser could not save game history.');
    return false;
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
  activePlayerId = state.players[0].id;
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
    (player) => player.name || player.cashBuyIn || player.creditBuyIn
      || player.cashOut || player.extraPaid || player.received,
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
    showToast('Sogrim is installed.');
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
    const registration = await navigator.serviceWorker.register(new URL('./service-worker.js', document.baseURI));
    const legacyScope = new URL('/apps/table-close/', window.location.origin).href;
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations
      .filter((candidate) => candidate !== registration && candidate.scope === legacyScope)
      .map((candidate) => candidate.unregister()));
  } catch {
    showToast('Offline mode could not be enabled.');
  }
}
