const MONTH_LABEL = new Intl.DateTimeFormat("es-CR", {
  month: "long",
  year: "numeric"
});

export function createId(prefix = "id") {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 9)}`;
}

export function createVariableIncomeItem() {
  return {
    id: createId("inc"),
    name: "",
    amount: 0
  };
}

export function createExpenseItem() {
  return {
    id: createId("exp"),
    name: "",
    amount: 0,
    isPaid: false,
    paidDate: ""
  };
}

export function createCardItem() {
  return {
    id: createId("card"),
    name: "",
    currentBalance: 0,
    minimumPayment: 0,
    currency: "CRC",
    cutoffDate: "",
    dueDate: "",
    interestRate: 0
  };
}

export function createFinancingItem() {
  return {
    id: createId("fin"),
    entity: "",
    totalBalance: 0,
    monthlyInstallment: 0,
    pendingInstallments: 0,
    nextPaymentDate: "",
    interestRate: 0,
    currency: "CRC"
  };
}

export function createMonthKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function getRelativeMonth(baseDate, offset) {
  return new Date(baseDate.getFullYear(), baseDate.getMonth() + offset, 1);
}

export function createMonthRecord(date) {
  return {
    id: createMonthKey(date),
    label: MONTH_LABEL.format(date),
    incomes: {
      fixedSalary: 0,
      variable: []
    },
    expenses: [],
    notes: ""
  };
}

export function createInitialState(baseDate = new Date()) {
  const previousMonth = createMonthRecord(getRelativeMonth(baseDate, -1));
  const currentMonth = createMonthRecord(getRelativeMonth(baseDate, 0));
  const nextMonth = createMonthRecord(getRelativeMonth(baseDate, 1));

  return {
    version: 1,
    settings: {
      currency: "CRC",
      locale: "es-CR",
      decimalSeparator: ",",
      thousandsSeparator: "",
      dateFormat: "DD/MM/YYYY",
      reminderDaysBefore: 3,
      usdToCrcRate: 500
    },
    expenseTemplate: [],
    months: [previousMonth, currentMonth, nextMonth],
    cards: [],
    financings: [],
    carLoan: {
      monthlyPayment: 0,
      installmentsPaid: 0,
      installmentsTotal: 0,
      estimatedBalance: 0,
      nextPaymentDate: "",
      currency: "USD"
    },
    conapeLoan: {
      monthlyPayment: 0,
      installmentsPaid: 0,
      installmentsTotal: 0,
      estimatedBalance: 0,
      nextPaymentDate: "",
      currency: "CRC"
    },
    metadata: {
      createdAtIso: new Date().toISOString(),
      updatedAtIso: new Date().toISOString()
    }
  };
}
