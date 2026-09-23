function toNumber(value) {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : 0;
}

function sumValues(values) {
  return values.reduce((acc, item) => acc + toNumber(item), 0);
}

export function convertAmountToCrc(amount, currency = "CRC", exchangeRate = 1) {
  const normalizedAmount = toNumber(amount);
  const normalizedRate = toNumber(exchangeRate);

  if (currency === "USD") {
    return normalizedAmount * normalizedRate;
  }

  return normalizedAmount;
}

export function calculateMonthTotals(month) {
  const fixed = toNumber(month.incomes?.fixedSalary);
  const variableIncome = sumValues((month.incomes?.variable || []).map((entry) => entry.amount));

  const expenseAmounts = (month.expenses || []).map((entry) => toNumber(entry.amount));
  const totalExpenses = sumValues(expenseAmounts);

  const paidExpenses = sumValues(
    (month.expenses || [])
      .filter((entry) => Boolean(entry.isPaid))
      .map((entry) => entry.amount)
  );

  const totalQuincena1 = sumValues(
    (month.expenses || [])
      .filter((entry) => entry.quincena !== "Q2")
      .map((entry) => entry.amount)
  );
  const totalQuincena2 = sumValues(
    (month.expenses || [])
      .filter((entry) => entry.quincena === "Q2")
      .map((entry) => entry.amount)
  );

  const totalIncome = fixed + variableIncome;
  const pendingExpenses = Math.max(totalExpenses - paidExpenses, 0);

  return {
    totalIncome,
    totalExpenses,
    totalPaid: paidExpenses,
    totalPending: pendingExpenses,
    netBalance: totalIncome - totalExpenses,
    realAvailable: totalIncome - paidExpenses,
    totalQuincena1,
    totalQuincena2
  };
}

export function calculateGlobalTotals(state) {
  const monthTotals = (state.months || []).map((month) => calculateMonthTotals(month));
  const totals = monthTotals.reduce(
    (acc, item) => ({
      totalIncome: acc.totalIncome + item.totalIncome,
      totalExpenses: acc.totalExpenses + item.totalExpenses,
      totalPaid: acc.totalPaid + item.totalPaid,
      totalPending: acc.totalPending + item.totalPending,
      netBalance: acc.netBalance + item.netBalance,
      realAvailable: acc.realAvailable + item.realAvailable
    }),
    {
      totalIncome: 0,
      totalExpenses: 0,
      totalPaid: 0,
      totalPending: 0,
      netBalance: 0,
      realAvailable: 0
    }
  );

  return {
    byMonth: monthTotals,
    summary: totals
  };
}

function parseDdMmYyyy(input) {
  if (typeof input !== "string") {
    return null;
  }

  const match = input.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) {
    return null;
  }

  const [, dd, mm, yyyy] = match;
  const day = Number(dd);
  const month = Number(mm);
  const year = Number(yyyy);

  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

function diffDays(fromDate, toDate) {
  const msPerDay = 1000 * 60 * 60 * 24;
  const from = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate());
  const to = new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate());
  return Math.round((to.getTime() - from.getTime()) / msPerDay);
}

export function getUpcomingAlerts(state, today = new Date()) {
  const daysLimit = Number(state.settings?.reminderDaysBefore || 3);
  const alerts = [];

  for (const card of state.cards || []) {
    const due = parseDdMmYyyy(card.dueDate);
    if (!due) {
      continue;
    }

    const days = diffDays(today, due);
    if (days >= 0 && days <= daysLimit) {
      alerts.push({
        type: "card",
        title: card.name || "Tarjeta",
        dueDate: card.dueDate,
        daysLeft: days
      });
    }
  }

  for (const financing of state.financings || []) {
    const due = parseDdMmYyyy(financing.nextPaymentDate);
    if (!due) {
      continue;
    }

    const days = diffDays(today, due);
    if (days >= 0 && days <= daysLimit) {
      alerts.push({
        type: "financing",
        title: financing.entity || "Extrafinanciamiento",
        dueDate: financing.nextPaymentDate,
        daysLeft: days
      });
    }
  }

  const carDue = parseDdMmYyyy(state.carLoan?.nextPaymentDate);
  if (carDue) {
    const days = diffDays(today, carDue);
    if (days >= 0 && days <= daysLimit) {
      alerts.push({
        type: "car",
        title: "Pago de carro",
        dueDate: state.carLoan.nextPaymentDate,
        daysLeft: days
      });
    }
  }

  const conapeDue = parseDdMmYyyy(state.conapeLoan?.nextPaymentDate);
  if (conapeDue) {
    const days = diffDays(today, conapeDue);
    if (days >= 0 && days <= daysLimit) {
      alerts.push({
        type: "conape",
        title: "Pago de Conape",
        dueDate: state.conapeLoan.nextPaymentDate,
        daysLeft: days
      });
    }
  }

  return alerts;
}
