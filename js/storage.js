import { createInitialState } from "./state.js";

const STORAGE_KEY = "money-flow-state-v1";

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasRequiredRootFields(input) {
  return (
    isObject(input) &&
    Array.isArray(input.months) &&
    Array.isArray(input.cards) &&
    Array.isArray(input.financings) &&
    isObject(input.carLoan) &&
    isObject(input.settings)
  );
}

function toNumberOrZero(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toSafeString(value) {
  return typeof value === "string" ? value : "";
}

function normalizeVariableIncome(entry, index) {
  return {
    id: toSafeString(entry?.id) || `inc-${index + 1}`,
    name: toSafeString(entry?.name),
    amount: toNumberOrZero(entry?.amount)
  };
}

function normalizeExpense(entry, index) {
  return {
    id: toSafeString(entry?.id) || `exp-${index + 1}`,
    name: toSafeString(entry?.name),
    amount: toNumberOrZero(entry?.amount),
    isPaid: Boolean(entry?.isPaid),
    paidDate: toSafeString(entry?.paidDate),
    quincena: entry?.quincena === "Q2" ? "Q2" : "Q1"
  };
}

function normalizeCard(entry, index) {
  return {
    id: toSafeString(entry?.id) || `card-${index + 1}`,
    name: toSafeString(entry?.name),
    currentBalance: toNumberOrZero(entry?.currentBalance),
    minimumPayment: toNumberOrZero(entry?.minimumPayment),
    currency: entry?.currency === "USD" ? "USD" : "CRC",
    cutoffDate: toSafeString(entry?.cutoffDate),
    dueDate: toSafeString(entry?.dueDate),
    interestRate: toNumberOrZero(entry?.interestRate)
  };
}

function normalizeFinancing(entry, index) {
  return {
    id: toSafeString(entry?.id) || `fin-${index + 1}`,
    entity: toSafeString(entry?.entity),
    totalBalance: toNumberOrZero(entry?.totalBalance),
    monthlyInstallment: toNumberOrZero(entry?.monthlyInstallment),
    pendingInstallments: Math.max(0, Math.trunc(toNumberOrZero(entry?.pendingInstallments))),
    nextPaymentDate: toSafeString(entry?.nextPaymentDate),
    interestRate: toNumberOrZero(entry?.interestRate),
    currency: entry?.currency === "USD" ? "USD" : "CRC"
  };
}

function normalizeLoan(inputLoan, baseLoan) {
  return {
    ...baseLoan,
    ...inputLoan,
    monthlyPayment: toNumberOrZero(inputLoan?.monthlyPayment),
    installmentsPaid: Math.max(0, Math.trunc(toNumberOrZero(inputLoan?.installmentsPaid))),
    installmentsTotal: Math.max(0, Math.trunc(toNumberOrZero(inputLoan?.installmentsTotal))),
    estimatedBalance: toNumberOrZero(inputLoan?.estimatedBalance),
    nextPaymentDate: toSafeString(inputLoan?.nextPaymentDate),
    currency: inputLoan?.currency === "USD" ? "USD" : "CRC"
  };
}

function normalizeState(input) {
  const base = createInitialState();
  const months = Array.isArray(input.months) ? input.months : base.months;

  return {
    ...base,
    ...input,
    settings: {
      ...base.settings,
      ...(input.settings || {})
    },
    months: months.map((month, index) => {
      const fallback = base.months[index] || base.months[0];
      return {
        ...fallback,
        ...month,
        id: toSafeString(month?.id) || fallback.id,
        label: toSafeString(month?.label) || fallback.label,
        incomes: {
          ...fallback.incomes,
          ...(month.incomes || {}),
          fixedSalary: toNumberOrZero(month.incomes?.fixedSalary),
          variable: Array.isArray(month.incomes?.variable)
            ? month.incomes.variable.map(normalizeVariableIncome)
            : []
        },
        expenses: Array.isArray(month.expenses)
          ? month.expenses.map(normalizeExpense)
          : [],
        notes: toSafeString(month?.notes)
      };
    }),
    cards: Array.isArray(input.cards) ? input.cards.map(normalizeCard) : [],
    financings: Array.isArray(input.financings) ? input.financings.map(normalizeFinancing) : [],
    carLoan: normalizeLoan(input.carLoan, base.carLoan),
    conapeLoan: normalizeLoan(input.conapeLoan, base.conapeLoan),
    metadata: {
      ...base.metadata,
      ...(input.metadata || {})
    }
  };
}

export function saveState(state) {
  const nextState = {
    ...state,
    metadata: {
      ...state.metadata,
      updatedAtIso: new Date().toISOString()
    }
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
  return nextState;
}

export function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return createInitialState();
  }

  try {
    const parsed = JSON.parse(raw);
    if (!hasRequiredRootFields(parsed)) {
      return createInitialState();
    }

    return normalizeState(parsed);
  } catch {
    return createInitialState();
  }
}

export function exportStateAsJson(state) {
  return JSON.stringify(state, null, 2);
}

export function importStateFromJson(jsonText) {
  let parsed;

  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error("El archivo JSON no es valido.");
  }

  if (!hasRequiredRootFields(parsed)) {
    throw new Error("El JSON no tiene la estructura requerida.");
  }

  return normalizeState(parsed);
}
