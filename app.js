const STORAGE_KEY = "trip-splitter-state-v1";

const state = loadState();

const participantCount = document.querySelector("#participantCount");
const totalSpent = document.querySelector("#totalSpent");
const expenseCount = document.querySelector("#expenseCount");
const transferCount = document.querySelector("#transferCount");
const participantForm = document.querySelector("#participantForm");
const participantNameInput = document.querySelector("#participantName");
const participantList = document.querySelector("#participantList");
const defaultRateInput = document.querySelector("#defaultRate");
const expenseForm = document.querySelector("#expenseForm");
const expenseTitleInput = document.querySelector("#expenseTitle");
const expenseAmountInput = document.querySelector("#expenseAmount");
const expenseCurrencyInput = document.querySelector("#expenseCurrency");
const expensePayerInput = document.querySelector("#expensePayer");
const splitModeInput = document.querySelector("#splitMode");
const expenseRateInput = document.querySelector("#expenseRate");
const allocationRows = document.querySelector("#allocationRows");
const allocationSummary = document.querySelector("#allocationSummary");
const expenseList = document.querySelector("#expenseList");
const clearExpensesButton = document.querySelector("#clearExpensesButton");
const balanceList = document.querySelector("#balanceList");
const owesList = document.querySelector("#owesList");
const settlementList = document.querySelector("#settlementList");
const familyModeToggle = document.querySelector("#familyModeToggle");
const exportButton = document.querySelector("#exportButton");
const resetButton = document.querySelector("#resetButton");
const toast = document.querySelector("#toast");

function loadState() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && Array.isArray(parsed.participants) && Array.isArray(parsed.expenses)) {
        return {
        participants: parsed.participants,
        expenses: parsed.expenses,
        defaultRate: Number(parsed.defaultRate) > 0 ? Number(parsed.defaultRate) : 1.08,
        familyModeEnabled: Boolean(parsed.familyModeEnabled),
      };
    }
  } catch {
    // Ignore malformed local data and fall back to defaults.
  }

  return {
    participants: [],
    expenses: [],
    defaultRate: 1.08,
    familyModeEnabled: false,
  };
}

function saveState() {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function uid(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    toast.classList.remove("is-visible");
  }, 2000);
}

function formatCurrencyFromCents(cents) {
  return new Intl.NumberFormat("zh-HK", {
    style: "currency",
    currency: "HKD",
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

function formatCurrencyValue(value, currency) {
  return new Intl.NumberFormat("zh-HK", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(value);
}

function toCents(amount) {
  return Math.round(Number(amount || 0) * 100);
}

function centsToNumber(cents) {
  return cents / 100;
}

function allocateEvenly(totalCents, count) {
  if (count <= 0) {
    return [];
  }
  const base = Math.floor(totalCents / count);
  const remainder = totalCents - base * count;
  return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0));
}

function buildParticipantMap() {
  return new Map(state.participants.map((participant) => [participant.id, participant]));
}

function getParticipantName(participantId) {
  return buildParticipantMap().get(participantId)?.name || "未知成員";
}

function getActiveAllocationDraft() {
  const selectedParticipants = state.participants.map((participant) => {
    const includeNode = allocationRows.querySelector(`[data-include-id="${participant.id}"]`);
    const shareNode = allocationRows.querySelector(`[data-share-id="${participant.id}"]`);
    const proxyNode = allocationRows.querySelector(`[data-proxy-id="${participant.id}"]`);
    return {
      participantId: participant.id,
      included: includeNode ? includeNode.checked : true,
      share: Number(shareNode?.value || 0),
      proxyId: proxyNode?.value || participant.id,
    };
  });
  return selectedParticipants;
}

function syncRateInputState() {
  const isRmb = expenseCurrencyInput.value === "RMB";
  expenseRateInput.disabled = !isRmb;
  if (!isRmb) {
    expenseRateInput.value = "1";
  } else if (!Number(expenseRateInput.value)) {
    expenseRateInput.value = String(state.defaultRate);
  }
}

function renderParticipantControls() {
  const currentPayerId = expensePayerInput.value;
  const options = state.participants
    .map((participant) => `<option value="${participant.id}">${escapeHtml(participant.name)}</option>`)
    .join("");

  expensePayerInput.innerHTML = options;
  if (currentPayerId && state.participants.some((participant) => participant.id === currentPayerId)) {
    expensePayerInput.value = currentPayerId;
  }
  renderAllocationRows();
}

function renderParticipants() {
  participantList.innerHTML = state.participants
    .map(
      (participant) => `
        <article class="participant-chip">
          <strong>${escapeHtml(participant.name)}</strong>
          <button type="button" data-remove-participant="${participant.id}">移除</button>
        </article>
      `
    )
    .join("");

  participantList.querySelectorAll("[data-remove-participant]").forEach((button) => {
    button.addEventListener("click", () => {
      const participantId = button.dataset.removeParticipant;
      const isUsed = state.expenses.some(
        (expense) =>
          expense.payerId === participantId ||
          expense.allocations.some(
            (allocation) =>
              allocation.participantId === participantId || allocation.proxyId === participantId
          )
      );

      if (isUsed) {
        showToast("此參與人已出現在支出紀錄中，請先刪除相關支出。");
        return;
      }

      state.participants = state.participants.filter((participant) => participant.id !== participantId);
      saveState();
      render();
    });
  });
}

function renderAllocationRows() {
  const draft = getActiveAllocationDraft();
  const draftMap = new Map(draft.map((item) => [item.participantId, item]));
  const splitMode = splitModeInput.value;
  const payerId = expensePayerInput.value;

  allocationRows.innerHTML = state.participants
    .map((participant) => {
      const current = draftMap.get(participant.id) || {
        included: true,
        share: 0,
        proxyId: participant.id,
      };

      const proxyOptions = state.participants
        .map(
          (candidate) => `
            <option value="${candidate.id}" ${candidate.id === current.proxyId ? "selected" : ""}>
              ${escapeHtml(candidate.name)}
            </option>
          `
        )
        .join("");

      return `
        <div class="allocation-row">
          <div class="allocation-person">
            <input
              type="checkbox"
              data-include-id="${participant.id}"
              ${current.included ? "checked" : ""}
            />
            <span>${escapeHtml(participant.name)}${payerId === participant.id ? " · 支付人" : ""}</span>
          </div>

          <label class="checkbox-wrap">
            <span>是否分攤</span>
          </label>

          <label>
            <span>${splitMode === "custom" ? "指定金額" : "平均分攤"}</span>
            <input
              data-share-id="${participant.id}"
              type="number"
              min="0"
              step="0.01"
              value="${splitMode === "custom" ? current.share || "" : ""}"
              ${splitMode === "equal" ? "disabled" : ""}
            />
          </label>

          <label>
            <span>由誰代付</span>
            <select data-proxy-id="${participant.id}">
              ${proxyOptions}
            </select>
          </label>
        </div>
      `;
    })
    .join("");

  allocationRows.querySelectorAll("[data-include-id], [data-share-id], [data-proxy-id]").forEach((node) => {
    node.addEventListener("input", updateAllocationSummary);
    node.addEventListener("change", updateAllocationSummary);
  });

  updateAllocationSummary();
}

function parseExpenseDraft() {
  const title = expenseTitleInput.value.trim();
  const amount = Number(expenseAmountInput.value);
  const currency = expenseCurrencyInput.value;
  const payerId = expensePayerInput.value;
  const splitMode = splitModeInput.value;
  const rate = currency === "RMB" ? Number(expenseRateInput.value || state.defaultRate) : 1;
  const allocations = getActiveAllocationDraft();

  return {
    title,
    amount,
    currency,
    payerId,
    splitMode,
    rate,
    allocations,
  };
}

function validateExpenseDraft(draft) {
  if (state.participants.length < 2) {
    return "請先加入至少 2 位參與人。";
  }
  if (!draft.title) {
    return "請輸入支出項目名稱。";
  }
  if (!(draft.amount > 0)) {
    return "支出金額需大於 0。";
  }
  if (!draft.payerId) {
    return "請選擇支付人。";
  }
  if (draft.currency === "RMB" && !(draft.rate > 0)) {
    return "人民幣支出需要有效匯率。";
  }

  const included = draft.allocations.filter((allocation) => allocation.included);
  if (included.length === 0) {
    return "請至少勾選 1 位要分攤的人。";
  }

  if (draft.splitMode === "custom") {
    const totalCustom = included.reduce((sum, allocation) => sum + Number(allocation.share || 0), 0);
    const delta = Math.abs(totalCustom - draft.amount);
    if (delta > 0.05) {
      return "指定金額的總和需要等於此項支出金額。";
    }
  }

  return "";
}

function computeExpenseBreakdown(expense) {
  const included = expense.allocations.filter((allocation) => allocation.included);
  const totalHkdCents = toCents(expense.amount * expense.rate);
  const shares = new Map();

  if (expense.splitMode === "equal") {
    const splitCents = allocateEvenly(totalHkdCents, included.length);
    included.forEach((allocation, index) => {
      shares.set(allocation.participantId, splitCents[index]);
    });
  } else {
    let assigned = 0;
    included.forEach((allocation, index) => {
      const isLast = index === included.length - 1;
      const converted = toCents(Number(allocation.share || 0) * expense.rate);
      const value = isLast ? totalHkdCents - assigned : converted;
      shares.set(allocation.participantId, value);
      assigned += value;
    });
  }

  return {
    totalHkdCents,
    included,
    shares,
  };
}

function addPairDebt(pairMap, debtorId, creditorId, cents) {
  if (!debtorId || !creditorId || debtorId === creditorId || cents <= 0) {
    return;
  }

  const forwardKey = `${debtorId}|${creditorId}`;
  const reverseKey = `${creditorId}|${debtorId}`;
  const reverseAmount = pairMap.get(reverseKey) || 0;

  if (reverseAmount > 0) {
    if (reverseAmount > cents) {
      pairMap.set(reverseKey, reverseAmount - cents);
      return;
    }
    pairMap.delete(reverseKey);
    cents -= reverseAmount;
  }

  pairMap.set(forwardKey, (pairMap.get(forwardKey) || 0) + cents);
}

function resolveProxyId(allocation, participantMap) {
  const candidate = allocation.proxyId || allocation.participantId;
  if (participantMap.has(candidate)) {
    return candidate;
  }
  return allocation.participantId;
}

function computeMetrics(options = {}) {
  const { familyModeEnabled = false } = options;
  const participantMap = buildParticipantMap();
  const balances = new Map(state.participants.map((participant) => [participant.id, 0]));
  const pairMap = new Map();

  const enrichedExpenses = state.expenses.map((expense) => {
    const breakdown = computeExpenseBreakdown(expense);
    breakdown.included.forEach((allocation) => {
      const shareCents = breakdown.shares.get(allocation.participantId) || 0;
      const proxyId = resolveProxyId(allocation, participantMap);

      if (familyModeEnabled) {
        addPairDebt(pairMap, proxyId, expense.payerId, shareCents);
      } else {
        addPairDebt(pairMap, proxyId, expense.payerId, shareCents);
        if (proxyId !== allocation.participantId) {
          addPairDebt(pairMap, allocation.participantId, proxyId, shareCents);
        }
      }
    });

    return {
      ...expense,
      breakdown,
      payerName: participantMap.get(expense.payerId)?.name || "未知成員",
    };
  });

  pairMap.forEach((amount, key) => {
    const [debtorId, creditorId] = key.split("|");
    balances.set(debtorId, (balances.get(debtorId) || 0) - amount);
    balances.set(creditorId, (balances.get(creditorId) || 0) + amount);
  });

  const debtors = [];
  const creditors = [];

  balances.forEach((balance, participantId) => {
    if (balance < 0) {
      debtors.push({ participantId, amount: Math.abs(balance) });
    } else if (balance > 0) {
      creditors.push({ participantId, amount: balance });
    }
  });

  debtors.sort((a, b) => b.amount - a.amount);
  creditors.sort((a, b) => b.amount - a.amount);

  const optimizedTransfers = [];
  let debtorIndex = 0;
  let creditorIndex = 0;

  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex];
    const creditor = creditors[creditorIndex];
    const amount = Math.min(debtor.amount, creditor.amount);

    optimizedTransfers.push({
      fromId: debtor.participantId,
      toId: creditor.participantId,
      amount,
    });

    debtor.amount -= amount;
    creditor.amount -= amount;

    if (debtor.amount === 0) {
      debtorIndex += 1;
    }
    if (creditor.amount === 0) {
      creditorIndex += 1;
    }
  }

  return {
    totalSpentCents: enrichedExpenses.reduce(
      (sum, expense) => sum + expense.breakdown.totalHkdCents,
      0
    ),
    balances,
    pairwiseDebts: Array.from(pairMap.entries())
      .map(([key, amount]) => {
        const [fromId, toId] = key.split("|");
        return {
          fromId,
          fromName: participantMap.get(fromId)?.name || "未知成員",
          toId,
          toName: participantMap.get(toId)?.name || "未知成員",
          amount,
        };
      })
      .sort((a, b) => b.amount - a.amount),
    optimizedTransfers,
    enrichedExpenses,
  };
}

function renderStats(metrics) {
  participantCount.textContent = String(state.participants.length);
  totalSpent.textContent = formatCurrencyFromCents(metrics.totalSpentCents);
  expenseCount.textContent = String(state.expenses.length);
  transferCount.textContent = String(metrics.optimizedTransfers.length);
}

function renderExpenses(metrics) {
  expenseList.innerHTML = metrics.enrichedExpenses
    .slice()
    .reverse()
    .map((expense) => {
      const shares = expense.breakdown.included
        .map((allocation) => {
          const proxyName =
            allocation.proxyId !== allocation.participantId
              ? `，${getParticipantName(allocation.proxyId)}代付`
              : "";
          return `<span class="pill">${escapeHtml(
            `${getParticipantName(allocation.participantId)} ${formatCurrencyFromCents(
              expense.breakdown.shares.get(allocation.participantId) || 0
            )}${proxyName}`
          )}</span>`;
        })
        .join("");

      return `
        <article class="expense-card">
          <div class="expense-topline">
            <strong>${escapeHtml(expense.title)}</strong>
            <button type="button" data-remove-expense="${expense.id}">刪除</button>
          </div>
          <div class="expense-meta">
            <span>${escapeHtml(expense.payerName)} 先支付</span>
            <span>${formatCurrencyValue(expense.amount, expense.currency)} · 轉 HKD 後 ${formatCurrencyFromCents(
              expense.breakdown.totalHkdCents
            )}</span>
          </div>
          <div class="pill-row">
            <span class="pill">${expense.splitMode === "equal" ? "平均分攤" : "指定金額"}</span>
            <span class="pill">匯率 ${expense.rate.toFixed(3)}</span>
          </div>
          <div class="pill-row">${shares}</div>
        </article>
      `;
    })
    .join("");

  expenseList.querySelectorAll("[data-remove-expense]").forEach((button) => {
    button.addEventListener("click", () => {
      state.expenses = state.expenses.filter((expense) => expense.id !== button.dataset.removeExpense);
      saveState();
      render();
    });
  });
}

function renderBalances(metrics) {
  balanceList.innerHTML = state.participants
    .map((participant) => {
      const amount = metrics.balances.get(participant.id) || 0;
      const className = amount > 0 ? "positive" : amount < 0 ? "negative" : "";
      return `
        <div class="summary-item ${className}">
          <span>${escapeHtml(participant.name)}</span>
          <strong>${amount === 0 ? "已平衡" : formatCurrencyFromCents(amount)}</strong>
        </div>
      `;
    })
    .join("");

  owesList.innerHTML = metrics.pairwiseDebts
    .map(
      (debt) => `
        <div class="summary-item">
          <span>${escapeHtml(debt.fromName)} → ${escapeHtml(debt.toName)}</span>
          <strong>${formatCurrencyFromCents(debt.amount)}</strong>
        </div>
      `
    )
    .join("");

  settlementList.innerHTML = metrics.optimizedTransfers
    .map(
      (transfer) => `
        <div class="summary-item">
          <span>${escapeHtml(getParticipantName(transfer.fromId))} 還給 ${escapeHtml(
            getParticipantName(transfer.toId)
          )}</span>
          <strong>${formatCurrencyFromCents(transfer.amount)}</strong>
        </div>
      `
    )
    .join("");
}

function updateAllocationSummary() {
  const draft = parseExpenseDraft();
  const error = validateExpenseDraft(draft);
  const included = draft.allocations.filter((allocation) => allocation.included);

  if (error) {
    allocationSummary.textContent = error;
    allocationSummary.classList.add("is-error");
    return;
  }

  if (draft.splitMode === "equal") {
    const breakdown = computeExpenseBreakdown(draft);
    const perPerson = included.length
      ? formatCurrencyFromCents(
          breakdown.shares.get(included[0]?.participantId || "") || breakdown.totalHkdCents
        )
      : formatCurrencyFromCents(0);
    allocationSummary.textContent = `共 ${included.length} 人分攤，每人約 ${perPerson}。`;
  } else {
    const customTotal = included.reduce((sum, allocation) => sum + Number(allocation.share || 0), 0);
    allocationSummary.textContent = `已填入 ${customTotal.toFixed(2)} ${draft.currency}，目標 ${draft.amount.toFixed(
      2
    )} ${draft.currency}。`;
  }

  allocationSummary.classList.remove("is-error");
}

function resetExpenseForm() {
  expenseForm.reset();
  expenseCurrencyInput.value = "HKD";
  splitModeInput.value = "equal";
  defaultRateInput.value = String(state.defaultRate);
  syncRateInputState();
  renderParticipantControls();
}

function xmlCell(value, type = "String") {
  if (type === "Number") {
    return `<Cell><Data ss:Type="Number">${value}</Data></Cell>`;
  }
  return `<Cell><Data ss:Type="String">${escapeHtml(value)}</Data></Cell>`;
}

function buildExcelWorkbook(metrics) {
  const balanceRows = state.participants
    .map((participant) => {
      const balance = centsToNumber(metrics.balances.get(participant.id) || 0).toFixed(2);
      return `<Row>${xmlCell(participant.name)}${xmlCell(balance, "Number")}</Row>`;
    })
    .join("");

  const expenseRows = metrics.enrichedExpenses
    .map((expense) => {
      const participantSummary = expense.breakdown.included
        .map((allocation) => {
          const share = centsToNumber(expense.breakdown.shares.get(allocation.participantId) || 0).toFixed(2);
          const proxyText =
            allocation.proxyId !== allocation.participantId
              ? `（${getParticipantName(allocation.proxyId)}代付）`
              : "";
          return `${getParticipantName(allocation.participantId)} ${share} HKD${proxyText}`;
        })
        .join(" / ");

      return `<Row>
        ${xmlCell(expense.title)}
        ${xmlCell(expense.payerName)}
        ${xmlCell(expense.currency)}
        ${xmlCell(expense.amount.toFixed(2), "Number")}
        ${xmlCell(expense.rate.toFixed(3), "Number")}
        ${xmlCell(centsToNumber(expense.breakdown.totalHkdCents).toFixed(2), "Number")}
        ${xmlCell(expense.splitMode === "equal" ? "平均分攤" : "指定金額")}
        ${xmlCell(participantSummary)}
      </Row>`;
    })
    .join("");

  const debtRows = metrics.pairwiseDebts
    .map(
      (debt) =>
        `<Row>${xmlCell(debt.fromName)}${xmlCell(debt.toName)}${xmlCell(
          centsToNumber(debt.amount).toFixed(2),
          "Number"
        )}</Row>`
    )
    .join("");

  const settlementRows = metrics.optimizedTransfers
    .map(
      (transfer) =>
        `<Row>${xmlCell(getParticipantName(transfer.fromId))}${xmlCell(
          getParticipantName(transfer.toId)
        )}${xmlCell(centsToNumber(transfer.amount).toFixed(2), "Number")}</Row>`
    )
    .join("");

  return `<?xml version="1.0"?>
    <?mso-application progid="Excel.Sheet"?>
    <Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
      xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:x="urn:schemas-microsoft-com:office:excel"
      xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
      xmlns:html="http://www.w3.org/TR/REC-html40">
      <Worksheet ss:Name="Overview">
        <Table>
          <Row>${xmlCell("項目")}${xmlCell("數值")}</Row>
          <Row>${xmlCell("參與人數")}${xmlCell(state.participants.length, "Number")}</Row>
          <Row>${xmlCell("支出項目數")}${xmlCell(state.expenses.length, "Number")}</Row>
          <Row>${xmlCell("總支出 HKD")}${xmlCell(centsToNumber(metrics.totalSpentCents).toFixed(2), "Number")}</Row>
          <Row>${xmlCell("家庭支出模式")}${xmlCell(state.familyModeEnabled ? "開啟" : "關閉")}</Row>
        </Table>
      </Worksheet>
      <Worksheet ss:Name="Balances">
        <Table>
          <Row>${xmlCell("參與人")}${xmlCell("淨額 HKD")}</Row>
          ${balanceRows}
        </Table>
      </Worksheet>
      <Worksheet ss:Name="Expenses">
        <Table>
          <Row>
            ${xmlCell("項目名稱")}
            ${xmlCell("支付人")}
            ${xmlCell("貨幣")}
            ${xmlCell("原始金額")}
            ${xmlCell("匯率")}
            ${xmlCell("折算 HKD")}
            ${xmlCell("分攤方式")}
            ${xmlCell("分攤明細")}
          </Row>
          ${expenseRows}
        </Table>
      </Worksheet>
      <Worksheet ss:Name="Owes">
        <Table>
          <Row>${xmlCell("付款方")}${xmlCell("收款方")}${xmlCell("金額 HKD")}</Row>
          ${debtRows}
        </Table>
      </Worksheet>
      <Worksheet ss:Name="Settlements">
        <Table>
          <Row>${xmlCell("付款方")}${xmlCell("收款方")}${xmlCell("建議金額 HKD")}</Row>
          ${settlementRows}
        </Table>
      </Worksheet>
    </Workbook>`;
}

function downloadExcel() {
  const metrics = computeMetrics({ familyModeEnabled: state.familyModeEnabled });
  const workbook = buildExcelWorkbook(metrics);
  const blob = new Blob([workbook], { type: "application/vnd.ms-excel;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "遊玩支出總覽.xls";
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function render() {
  defaultRateInput.value = String(state.defaultRate);
  familyModeToggle.checked = state.familyModeEnabled;
  renderParticipants();
  renderParticipantControls();
  const metrics = computeMetrics({ familyModeEnabled: state.familyModeEnabled });
  renderStats(metrics);
  renderExpenses(metrics);
  renderBalances(metrics);
}

participantForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = participantNameInput.value.trim();
  if (!name) {
    showToast("請輸入參與人名稱。");
    return;
  }
  if (state.participants.some((participant) => participant.name === name)) {
    showToast("這個參與人已經存在。");
    return;
  }

  state.participants.push({
    id: uid("person"),
    name,
  });
  saveState();
  participantNameInput.value = "";
  render();
});

defaultRateInput.addEventListener("change", () => {
  const nextRate = Number(defaultRateInput.value);
  if (nextRate > 0) {
    state.defaultRate = nextRate;
    saveState();
    if (expenseCurrencyInput.value === "RMB") {
      expenseRateInput.value = String(nextRate);
    }
    showToast("已更新預設匯率。");
  }
});

expenseCurrencyInput.addEventListener("change", () => {
  syncRateInputState();
  updateAllocationSummary();
});

splitModeInput.addEventListener("change", renderAllocationRows);
expensePayerInput.addEventListener("change", renderAllocationRows);
expenseAmountInput.addEventListener("input", updateAllocationSummary);
expenseRateInput.addEventListener("input", updateAllocationSummary);
familyModeToggle.addEventListener("change", () => {
  state.familyModeEnabled = familyModeToggle.checked;
  saveState();
  render();
});

expenseForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const draft = parseExpenseDraft();
  const error = validateExpenseDraft(draft);

  if (error) {
    allocationSummary.textContent = error;
    allocationSummary.classList.add("is-error");
    showToast(error);
    return;
  }

  state.expenses.push({
    id: uid("expense"),
    title: draft.title,
    amount: draft.amount,
    currency: draft.currency,
    payerId: draft.payerId,
    splitMode: draft.splitMode,
    rate: draft.rate,
    allocations: draft.allocations.map((allocation) => ({
      participantId: allocation.participantId,
      included: allocation.included,
      share: Number(allocation.share || 0),
      proxyId: allocation.proxyId || allocation.participantId,
    })),
  });

  saveState();
  resetExpenseForm();
  render();
  showToast("支出項目已加入。");
});

exportButton.addEventListener("click", () => {
  if (!state.expenses.length) {
    showToast("請先建立至少一筆支出後再匯出。");
    return;
  }
  downloadExcel();
});

clearExpensesButton.addEventListener("click", () => {
  if (!state.expenses.length) {
    showToast("目前沒有支出資料可清除。");
    return;
  }

  const confirmed = window.confirm("這會清除所有支出紀錄，確定要繼續嗎？");
  if (!confirmed) {
    return;
  }

  state.expenses = [];
  saveState();
  resetExpenseForm();
  render();
  showToast("所有支出資料已清除。");
});

resetButton.addEventListener("click", () => {
  const confirmed = window.confirm("這會清除全部參與人與支出紀錄，確定要繼續嗎？");
  if (!confirmed) {
    return;
  }
  state.participants = [];
  state.expenses = [];
  state.defaultRate = 1.08;
  state.familyModeEnabled = false;
  saveState();
  resetExpenseForm();
  render();
  showToast("資料已清空。");
});

syncRateInputState();
resetExpenseForm();
render();
