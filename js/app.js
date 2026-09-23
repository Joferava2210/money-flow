import { getUpcomingAlerts } from "./calculations.js";
import {
  createCardItem,
  createExpenseItem,
  createFinancingItem,
  createId,
  createVariableIncomeItem
} from "./state.js";
import {
  exportStateAsJson,
  importStateFromJson,
  loadState,
  saveState
} from "./storage.js";
import { renderApp, updateComputedViews } from "./ui.js";

let state = loadState();

let saveIndicatorTimeoutId;

function parseAmount(input) {
  const raw = String(input || "").trim().replaceAll(" ", "");
  const normalized = raw.includes(",")
    ? raw.replaceAll(".", "").replace(",", ".")
    : raw;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatAmount(value) {
  const numberValue = Number(value) || 0;
  return numberValue.toFixed(2).replace(".", ",");
}

function formatInteger(value) {
  return String(Math.max(0, Math.trunc(Number(value) || 0)));
}

function isValidDateDdMmYyyy(value) {
  const text = String(value || "").trim();
  if (!text) {
    return true;
  }

  const match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) {
    return false;
  }

  const [, dd, mm, yyyy] = match;
  const date = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  return (
    !Number.isNaN(date.getTime()) &&
    date.getFullYear() === Number(yyyy) &&
    date.getMonth() === Number(mm) - 1 &&
    date.getDate() === Number(dd)
  );
}

const DECIMAL_ACTIONS = new Set([
  "update-fixed-salary",
  "update-variable-amount",
  "update-expense-amount",
  "update-card-balance",
  "update-card-minimum",
  "update-card-rate",
  "update-financing-balance",
  "update-financing-installment",
  "update-financing-rate",
  "update-car-monthly-payment",
  "update-car-estimated-balance",
  "update-conape-monthly-payment",
  "update-conape-estimated-balance"
]);

const INTEGER_ACTIONS = new Set([
  "update-financing-pending",
  "update-car-installments-paid",
  "update-car-installments-total",
  "update-conape-installments-paid",
  "update-conape-installments-total"
]);

const DATE_ACTIONS = new Set([
  "update-expense-date",
  "update-card-cutoff",
  "update-card-due",
  "update-financing-next-date",
  "update-car-next-date",
  "update-conape-next-date"
]);

const MONTH_ID_ACTIONS = new Set(["update-month-id"]);
const DECIMAL_SETTINGS_ACTIONS = new Set(["update-usd-to-crc-rate"]);

function isValidDecimalInput(value) {
  const text = String(value || "").trim();
  if (!text) {
    return true;
  }

  return /^(\d+)([.,]\d{1,2})?$/.test(text);
}

function isValidIntegerInput(value) {
  const text = String(value || "").trim();
  if (!text) {
    return true;
  }

  return /^\d+$/.test(text);
}

function formatMonthLabelFromId(monthId) {
  const match = String(monthId || "").match(/^(\d{4})-(\d{2})$/);
  if (!match) {
    return String(monthId || "");
  }

  const [, year, month] = match;
  const date = new Date(Number(year), Number(month) - 1, 1);
  return new Intl.DateTimeFormat("es-CR", {
    month: "long",
    year: "numeric"
  }).format(date);
}

function setFieldError(input, message) {
  if (!(input instanceof HTMLElement)) {
    return;
  }

  input.classList.add("is-invalid");
  input.title = message;
}

function clearFieldError(input) {
  if (!(input instanceof HTMLElement)) {
    return;
  }

  input.classList.remove("is-invalid");
  input.title = "";
}

function setFeedback(message, kind = "ok") {
  const feedback = document.getElementById("data-feedback");
  if (!feedback) {
    return;
  }

  feedback.textContent = message;
  feedback.classList.remove("feedback-ok", "feedback-error");
  feedback.classList.add(kind === "error" ? "feedback-error" : "feedback-ok");
}

function markSavedState(status = "saved") {
  const indicator = document.getElementById("save-indicator");
  if (!indicator) {
    return;
  }

  if (saveIndicatorTimeoutId) {
    clearTimeout(saveIndicatorTimeoutId);
    saveIndicatorTimeoutId = undefined;
  }

  if (status === "saving") {
    indicator.textContent = "Guardando...";
    indicator.classList.add("is-saving");
    return;
  }

  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  indicator.textContent = `Guardado ${hh}:${mm}`;
  indicator.classList.remove("is-saving");
}

function validateInputByAction(target) {
  const action = target.dataset.action;
  if (!action) {
    return true;
  }

  if (DECIMAL_ACTIONS.has(action) && !isValidDecimalInput(target.value)) {
    setFieldError(target, "Monto invalido. Usa solo numeros y opcionalmente dos decimales.");
    return false;
  }

  if (INTEGER_ACTIONS.has(action) && !isValidIntegerInput(target.value)) {
    setFieldError(target, "Valor invalido. Debe ser un numero entero.");
    return false;
  }

  if (DATE_ACTIONS.has(action) && !isValidDateDdMmYyyy(target.value)) {
    setFieldError(target, "Fecha invalida. Usa DD/MM/YYYY.");
    return false;
  }

  if (MONTH_ID_ACTIONS.has(action) && !/^\d{4}-(0[1-9]|1[0-2])$/.test(target.value.trim())) {
    setFieldError(target, "ID invalido. Usa formato YYYY-MM, por ejemplo 2026-08.");
    return false;
  }

  if (DECIMAL_SETTINGS_ACTIONS.has(action) && !isValidDecimalInput(target.value)) {
    setFieldError(target, "Tipo de cambio invalido. Usa solo numeros y opcionalmente dos decimales.");
    return false;
  }

  clearFieldError(target);
  return true;
}

function findMonth(monthId) {
  return (state.months || []).find((month) => month.id === monthId);
}

function findCard(cardId) {
  return (state.cards || []).find((card) => card.id === cardId);
}

function findFinancing(financingId) {
  return (state.financings || []).find((financing) => financing.id === financingId);
}

function persistState() {
  markSavedState("saving");
  state = saveState(state);
  markSavedState("saved");
}

function applyFieldUpdate(target) {
  const action = target.dataset.action;
  const monthId = target.dataset.monthId;
  const entryId = target.dataset.entryId;
  const cardId = target.dataset.cardId;
  const financingId = target.dataset.financingId;
  const month = findMonth(monthId);

  if (cardId && action?.startsWith("update-card")) {
    const card = findCard(cardId);
    if (!card) {
      return false;
    }

    switch (action) {
      case "update-card-name":
        card.name = target.value;
        return false;
      case "update-card-balance":
        card.currentBalance = parseAmount(target.value);
        return true;
      case "update-card-minimum":
        card.minimumPayment = parseAmount(target.value);
        return true;
      case "update-card-currency":
        card.currency = target.value === "USD" ? "USD" : "CRC";
        return true;
      case "update-card-cutoff":
        card.cutoffDate = target.value;
        return true;
      case "update-card-due":
        card.dueDate = target.value;
        return true;
      case "update-card-rate":
        card.interestRate = parseAmount(target.value);
        return true;
      default:
        return false;
    }
  }

  if (financingId && action?.startsWith("update-financing")) {
    const financing = findFinancing(financingId);
    if (!financing) {
      return false;
    }

    switch (action) {
      case "update-financing-entity":
        financing.entity = target.value;
        return false;
      case "update-financing-balance":
        financing.totalBalance = parseAmount(target.value);
        return true;
      case "update-financing-installment":
        financing.monthlyInstallment = parseAmount(target.value);
        return true;
      case "update-financing-pending":
        financing.pendingInstallments = Math.max(0, Math.trunc(parseAmount(target.value)));
        return true;
      case "update-financing-next-date":
        financing.nextPaymentDate = target.value;
        return true;
      case "update-financing-rate":
        financing.interestRate = parseAmount(target.value);
        return true;
      case "update-financing-currency":
        financing.currency = target.value === "USD" ? "USD" : "CRC";
        return true;
      default:
        return false;
    }
  }

  if (action?.startsWith("update-car-")) {
    const carLoan = state.carLoan;
    if (!carLoan) {
      return false;
    }

    switch (action) {
      case "update-car-monthly-payment":
        carLoan.monthlyPayment = parseAmount(target.value);
        return true;
      case "update-car-currency":
        carLoan.currency = target.value === "USD" ? "USD" : "CRC";
        return true;
      case "update-car-installments-paid":
        carLoan.installmentsPaid = Math.max(0, Math.trunc(parseAmount(target.value)));
        return true;
      case "update-car-installments-total":
        carLoan.installmentsTotal = Math.max(0, Math.trunc(parseAmount(target.value)));
        return true;
      case "update-car-estimated-balance":
        carLoan.estimatedBalance = parseAmount(target.value);
        return true;
      case "update-car-next-date":
        carLoan.nextPaymentDate = target.value;
        return true;
      default:
        return false;
    }
  }

  if (action?.startsWith("update-conape-")) {
    const conapeLoan = state.conapeLoan;
    if (!conapeLoan) {
      return false;
    }

    switch (action) {
      case "update-conape-monthly-payment":
        conapeLoan.monthlyPayment = parseAmount(target.value);
        return true;
      case "update-conape-installments-paid":
        conapeLoan.installmentsPaid = Math.max(0, Math.trunc(parseAmount(target.value)));
        return true;
      case "update-conape-installments-total":
        conapeLoan.installmentsTotal = Math.max(0, Math.trunc(parseAmount(target.value)));
        return true;
      case "update-conape-estimated-balance":
        conapeLoan.estimatedBalance = parseAmount(target.value);
        return true;
      case "update-conape-next-date":
        conapeLoan.nextPaymentDate = target.value;
        return true;
      default:
        return false;
    }
  }

  if (action === "update-usd-to-crc-rate") {
    state.settings.usdToCrcRate = parseAmount(target.value);
    return true;
  }

  if (!month || !action) {
    return false;
  }

  switch (action) {
    case "update-fixed-salary": {
      month.incomes.fixedSalary = parseAmount(target.value);
      return true;
    }
    case "update-month-label": {
      month.label = target.value.trim() || month.id;
      return false;
    }
    case "update-month-id": {
      const nextId = target.value.trim();
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(nextId)) {
        setFieldError(target, "Selecciona un mes valido.");
        return false;
      }

      const duplicateMonth = (state.months || []).find((item) => item.id === nextId && item.id !== monthId);
      if (duplicateMonth) {
        setFieldError(target, "Este mes ya existe en otro bloque.");
        return false;
      }

      const previousLabel = month.label?.trim() || "";
      const previousIdLabel = formatMonthLabelFromId(month.id);
      month.id = nextId;

      if (!previousLabel || previousLabel === previousIdLabel) {
        month.label = formatMonthLabelFromId(nextId);
      }

      return false;
    }
    case "update-variable-name": {
      const entry = month.incomes.variable.find((item) => item.id === entryId);
      if (!entry) {
        return false;
      }
      entry.name = target.value;
      return false;
    }
    case "update-variable-amount": {
      const entry = month.incomes.variable.find((item) => item.id === entryId);
      if (!entry) {
        return false;
      }
      entry.amount = parseAmount(target.value);
      return true;
    }
    case "update-expense-name": {
      const entry = month.expenses.find((item) => item.id === entryId);
      if (!entry) {
        return false;
      }
      entry.name = target.value;
      return false;
    }
    case "update-expense-amount": {
      const entry = month.expenses.find((item) => item.id === entryId);
      if (!entry) {
        return false;
      }
      entry.amount = parseAmount(target.value);
      return true;
    }
    case "update-expense-date": {
      const entry = month.expenses.find((item) => item.id === entryId);
      if (!entry) {
        return false;
      }
      entry.paidDate = target.value;
      return false;
    }
    case "update-expense-paid": {
      const entry = month.expenses.find((item) => item.id === entryId);
      if (!entry) {
        return false;
      }
      entry.isPaid = Boolean(target.checked);
      return true;
    }
    case "update-expense-quincena": {
      const entry = month.expenses.find((item) => item.id === entryId);
      if (!entry) {
        return false;
      }
      entry.quincena = target.value === "Q2" ? "Q2" : "Q1";
      return true;
    }
    default:
      return false;
  }
}

function handleEditorInput(event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) {
    return;
  }

  if (!("dataset" in target) || !target.dataset.action) {
    return;
  }

  if (!validateInputByAction(target)) {
    return;
  }

  const shouldRefreshTotals = applyFieldUpdate(target);
  persistState();

  const requiresFullRerender =
    (target.dataset.action === "update-card-due" ||
      target.dataset.action === "update-financing-next-date" ||
      target.dataset.action === "update-car-next-date" ||
      target.dataset.action === "update-conape-next-date" ||
      target.dataset.action === "update-expense-date" ||
      target.dataset.action === "update-expense-paid" ||
      target.dataset.action === "update-expense-name" ||
      target.dataset.action === "update-month-id") &&
    event.type === "change";

  if (requiresFullRerender) {
    renderApp(state);
    return;
  }

  if (
    event.type === "change" &&
    (DECIMAL_ACTIONS.has(target.dataset.action) || INTEGER_ACTIONS.has(target.dataset.action) || DECIMAL_SETTINGS_ACTIONS.has(target.dataset.action))
  ) {
    target.value = INTEGER_ACTIONS.has(target.dataset.action)
      ? formatInteger(target.value)
      : formatAmount(parseAmount(target.value));
  }

  if (shouldRefreshTotals) {
    updateComputedViews(state);
  }
}

function exportJsonBackup() {
  const json = exportStateAsJson(state);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 19).replaceAll(":", "-");
  anchor.href = url;
  anchor.download = `money-flow-backup-${stamp}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  setFeedback("Respaldo exportado correctamente.", "ok");
}

async function importJsonBackup(file) {
  if (!file) {
    return;
  }

  try {
    const text = await file.text();
    const importedState = importStateFromJson(text);
    state = importedState;
    persistState();
    renderApp(state);
    setFeedback("Respaldo importado correctamente.", "ok");
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo importar el respaldo.";
    setFeedback(message, "error");
  }
}

function handleEditorClick(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const actionNode = target.closest("[data-action]");
  if (!actionNode) {
    return;
  }

  const action = actionNode.dataset.action;
  const monthId = actionNode.dataset.monthId;
  const entryId = actionNode.dataset.entryId;
  const cardId = actionNode.dataset.cardId;
  const financingId = actionNode.dataset.financingId;
  const month = findMonth(monthId);

  if (action === "prefill-future-months") {
    const sourceMonth = (state.months || []).find((item) => item.id === "2026-09") || (state.months || [])[1] || (state.months || [])[0];
    if (!sourceMonth) {
      return;
    }

    const monthOrder = [...(state.months || [])].sort((a, b) => a.id.localeCompare(b.id));
    const sourceIndex = monthOrder.findIndex((item) => item.id === sourceMonth.id);
    const targetMonths = monthOrder.slice(sourceIndex + 1);

    for (const targetMonth of targetMonths) {
      if (targetMonth.expenses.length) {
        continue;
      }

      targetMonth.expenses = sourceMonth.expenses.map((entry) => ({
        ...entry,
        id: createId("exp"),
        name: entry.name,
        amount: Number(entry.amount) || 0,
        isPaid: Boolean(entry.isPaid),
        paidDate: entry.paidDate || "",
        quincena: entry.quincena === "Q2" ? "Q2" : "Q1"
      }));

      targetMonth.incomes = {
        fixedSalary: Number(sourceMonth.incomes?.fixedSalary) || 0,
        variable: (sourceMonth.incomes?.variable || []).map((entry) => ({
          ...entry,
          id: createId("inc"),
          name: entry.name,
          amount: Number(entry.amount) || 0
        }))
      };
    }

    persistState();
    renderApp(state);
    return;
  }

  if (action === "add-card") {
    state.cards.push(createCardItem());
    persistState();
    renderApp(state);
    return;
  }

  if (action === "remove-card") {
    state.cards = state.cards.filter((card) => card.id !== cardId);
    persistState();
    renderApp(state);
    return;
  }

  if (action === "add-financing") {
    state.financings.push(createFinancingItem());
    persistState();
    renderApp(state);
    return;
  }

  if (action === "remove-financing") {
    state.financings = state.financings.filter((financing) => financing.id !== financingId);
    persistState();
    renderApp(state);
    return;
  }

  if (!month || !action) {
    return;
  }

  switch (action) {
    case "add-variable-income": {
      month.incomes.variable.push(createVariableIncomeItem());
      break;
    }
    case "remove-variable-income": {
      month.incomes.variable = month.incomes.variable.filter((item) => item.id !== entryId);
      break;
    }
    case "add-expense": {
      month.expenses.push(createExpenseItem());
      break;
    }
    case "remove-expense": {
      month.expenses = month.expenses.filter((item) => item.id !== entryId);
      break;
    }
    default:
      return;
  }

  persistState();
  renderApp(state);
}

function bindUiEvents() {
  const monthsContainer = document.getElementById("months-overview");
  const cardsContainer = document.getElementById("cards-overview");
  const financingsContainer = document.getElementById("financings-overview");
  const carContainer = document.getElementById("car-overview");
  const conapeContainer = document.getElementById("conape-overview");
  const addCardButton = document.getElementById("add-card-btn");
  const addFinancingButton = document.getElementById("add-financing-btn");
  const prefillButton = document.getElementById("prefill-months-btn");
  const settingsContainer = document.getElementById("settings-panel");
  const exportButton = document.getElementById("export-json-btn");
  const importButton = document.getElementById("import-json-btn");
  const importInput = document.getElementById("import-json-input");

  if (!monthsContainer) {
    return;
  }

  monthsContainer.addEventListener("input", handleEditorInput);
  monthsContainer.addEventListener("change", handleEditorInput);
  monthsContainer.addEventListener("click", handleEditorClick);

  if (cardsContainer) {
    cardsContainer.addEventListener("input", handleEditorInput);
    cardsContainer.addEventListener("change", handleEditorInput);
    cardsContainer.addEventListener("click", handleEditorClick);
  }

  if (settingsContainer) {
    settingsContainer.addEventListener("input", handleEditorInput);
    settingsContainer.addEventListener("change", handleEditorInput);
  }

  if (financingsContainer) {
    financingsContainer.addEventListener("input", handleEditorInput);
    financingsContainer.addEventListener("change", handleEditorInput);
    financingsContainer.addEventListener("click", handleEditorClick);
  }

  if (carContainer) {
    carContainer.addEventListener("input", handleEditorInput);
    carContainer.addEventListener("change", handleEditorInput);
  }

  if (conapeContainer) {
    conapeContainer.addEventListener("input", handleEditorInput);
    conapeContainer.addEventListener("change", handleEditorInput);
  }

  if (addCardButton) {
    addCardButton.dataset.action = "add-card";
    addCardButton.addEventListener("click", handleEditorClick);
  }

  if (addFinancingButton) {
    addFinancingButton.dataset.action = "add-financing";
    addFinancingButton.addEventListener("click", handleEditorClick);
  }

  if (prefillButton) {
    prefillButton.dataset.action = "prefill-future-months";
    prefillButton.addEventListener("click", handleEditorClick);
  }

  if (exportButton) {
    exportButton.addEventListener("click", exportJsonBackup);
  }

  if (importButton && importInput instanceof HTMLInputElement) {
    importButton.addEventListener("click", () => importInput.click());
    importInput.addEventListener("change", async () => {
      const file = importInput.files?.[0];
      await importJsonBackup(file);
      importInput.value = "";
    });
  }
}

function boot() {
  bindUiEvents();
  const alerts = getUpcomingAlerts(state);
  console.info("Upcoming alerts", alerts);

  renderApp(state);
  persistState();
  setFeedback("Estado cargado correctamente.", "ok");
}

boot();
