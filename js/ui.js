import { calculateGlobalTotals, calculateMonthTotals } from "./calculations.js";

function formatAmount(value) {
  const numberValue = Number(value) || 0;
  return numberValue.toFixed(2).replace(".", ",");
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function parseDdMmYyyy(text) {
  const value = String(text || "").trim();
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
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

function calculateConsistencyWarnings(state) {
  const warnings = [];

  for (const month of state.months || []) {
    const totalExpenses = (month.expenses || []).reduce((acc, item) => acc + (Number(item.amount) || 0), 0);
    const paidExpenses = (month.expenses || [])
      .filter((item) => Boolean(item.isPaid))
      .reduce((acc, item) => acc + (Number(item.amount) || 0), 0);

    if (paidExpenses > totalExpenses + 0.0001) {
      warnings.push(`Mes ${month.label}: pagado mayor al total de gastos.`);
    }
  }

  const loanChecks = [
    ["Carro", state.carLoan],
    ["Conape", state.conapeLoan]
  ];

  for (const [name, loan] of loanChecks) {
    const paid = Number(loan?.installmentsPaid) || 0;
    const total = Number(loan?.installmentsTotal) || 0;
    if (total > 0 && paid > total) {
      warnings.push(`${name}: cuotas pagadas mayores que cuotas totales.`);
    }
  }

  return warnings;
}

function diffDays(fromDate, toDate) {
  const msPerDay = 1000 * 60 * 60 * 24;
  const from = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate());
  const to = new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate());
  return Math.round((to.getTime() - from.getTime()) / msPerDay);
}

function getExpenseStatus(expense, reminderDaysBefore = 3, today = new Date()) {
  if (expense.isPaid) {
    return { code: "paid", label: "Pagado" };
  }

  const dueDate = parseDdMmYyyy(expense.paidDate);
  if (!dueDate) {
    return { code: "pending", label: "Pendiente" };
  }

  const days = diffDays(today, dueDate);
  if (days < 0) {
    return { code: "overdue", label: "Vencido" };
  }

  if (days <= reminderDaysBefore) {
    return { code: "soon", label: `Por vencer (${days}d)` };
  }

  return { code: "pending", label: "Pendiente" };
}

function summarizeExpenseAlerts(month, reminderDaysBefore) {
  let overdue = 0;
  let soon = 0;

  for (const expense of month.expenses || []) {
    const status = getExpenseStatus(expense, reminderDaysBefore);
    if (status.code === "overdue") {
      overdue += 1;
    }
    if (status.code === "soon") {
      soon += 1;
    }
  }

  return { overdue, soon };
}

function renderMonthAlertStrip(month, reminderDaysBefore) {
  const summary = summarizeExpenseAlerts(month, reminderDaysBefore);

  if (!summary.overdue && !summary.soon) {
    return "";
  }

  const parts = [];
  if (summary.overdue) {
    parts.push(`<span class="alert-pill alert-overdue">${summary.overdue} vencido(s)</span>`);
  }
  if (summary.soon) {
    parts.push(`<span class="alert-pill alert-soon">${summary.soon} por vencer</span>`);
  }

  return `<div class="alert-strip">${parts.join("")}</div>`;
}

function renderGlobalSummary(state) {
  const container = document.getElementById("global-summary");
  if (!container) {
    return;
  }

  const totals = calculateGlobalTotals(state).summary;
  const cards = [
    ["Total ingresos", totals.totalIncome],
    ["Total gastos", totals.totalExpenses],
    ["Total pagado", totals.totalPaid],
    ["Total pendiente", totals.totalPending],
    ["Balance neto", totals.netBalance],
    ["Disponible real", totals.realAvailable]
  ];

  container.innerHTML = cards
    .map(
      ([label, value]) => `
        <article class="global-card">
          <span class="label">${label}</span>
          <span class="value" data-global-total="${label}">${formatAmount(value)}</span>
        </article>
      `
    )
    .join("");
}

function getCardDueStatus(card, reminderDaysBefore = 3, today = new Date()) {
  const dueDate = parseDdMmYyyy(card.dueDate);
  if (!dueDate) {
    return { code: "pending", label: "Sin fecha" };
  }

  const days = diffDays(today, dueDate);
  if (days < 0) {
    return { code: "overdue", label: "Vencida" };
  }

  if (days <= reminderDaysBefore) {
    return { code: "soon", label: `Vence en ${days}d` };
  }

  return { code: "pending", label: "Al dia" };
}

function calculateCardsSummary(state) {
  const reminderDaysBefore = Number(state.settings?.reminderDaysBefore || 3);
  const usdToCrcRate = Number(state.settings?.usdToCrcRate || 1);
  let totalBalance = 0;
  let totalMinimum = 0;
  let upcoming = 0;
  let overdue = 0;

  for (const card of state.cards || []) {
    const balance = card.currency === "USD" ? Number(card.currentBalance) * usdToCrcRate : Number(card.currentBalance) || 0;
    const minimum = card.currency === "USD" ? Number(card.minimumPayment) * usdToCrcRate : Number(card.minimumPayment) || 0;
    totalBalance += balance;
    totalMinimum += minimum;
    const dueStatus = getCardDueStatus(card, reminderDaysBefore);
    if (dueStatus.code === "soon") {
      upcoming += 1;
    }
    if (dueStatus.code === "overdue") {
      overdue += 1;
    }
  }

  return {
    totalBalance,
    totalMinimum,
    upcoming,
    overdue,
    count: (state.cards || []).length
  };
}

function renderCardsSummary(state) {
  const container = document.getElementById("cards-summary");
  if (!container) {
    return;
  }

  const summary = calculateCardsSummary(state);
  const cards = [
    ["Total saldo tarjetas", summary.totalBalance],
    ["Total pago minimo", summary.totalMinimum],
    ["Tarjetas registradas", summary.count, true],
    ["Vencimientos proximos", summary.upcoming, true],
    ["Vencidas", summary.overdue, true]
  ];

  container.innerHTML = cards
    .map(
      ([label, value, plain]) => `
      <article class="global-card">
        <span class="label">${label}</span>
        <span class="value">${plain ? value : formatAmount(value)}</span>
      </article>
      `
    )
    .join("");
}

function renderCards(state) {
  const container = document.getElementById("cards-overview");
  if (!container) {
    return;
  }

  if (!(state.cards || []).length) {
    container.innerHTML = '<div class="empty-row">Aun no hay tarjetas. Usa "Agregar tarjeta" para empezar.</div>';
    return;
  }

  const reminderDaysBefore = Number(state.settings?.reminderDaysBefore || 3);
  container.innerHTML = (state.cards || [])
    .map((card) => {
      const dueStatus = getCardDueStatus(card, reminderDaysBefore);
      const statusClass = `status-${dueStatus.code}`;
      return `
      <article class="card-item">
        <header class="card-item-head">
          <h3>Tarjeta</h3>
          <span class="expense-status ${statusClass}">${dueStatus.label}</span>
        </header>
        <div class="card-item-grid">
          <div class="field-col">
            <label>Banco / Nombre</label>
            <input type="text" data-action="update-card-name" data-card-id="${card.id}" value="${escapeHtml(card.name)}" placeholder="Ej: Banco X Visa" />
          </div>
          <div class="field-col">
            <label>Moneda</label>
            <select data-action="update-card-currency" data-card-id="${card.id}">
              <option value="CRC" ${card.currency === "CRC" ? "selected" : ""}>CRC</option>
              <option value="USD" ${card.currency === "USD" ? "selected" : ""}>USD</option>
            </select>
          </div>
          <div class="field-col">
            <label>Saldo actual</label>
            <input type="text" data-action="update-card-balance" data-card-id="${card.id}" value="${formatAmount(card.currentBalance)}" inputmode="decimal" />
          </div>
          <div class="field-col">
            <label>Pago minimo</label>
            <input type="text" data-action="update-card-minimum" data-card-id="${card.id}" value="${formatAmount(card.minimumPayment)}" inputmode="decimal" />
          </div>
          <div class="field-col">
            <label>Fecha corte</label>
            <input type="text" data-action="update-card-cutoff" data-card-id="${card.id}" value="${escapeHtml(card.cutoffDate || "")}" placeholder="DD/MM/YYYY" />
          </div>
          <div class="field-col">
            <label>Fecha limite pago</label>
            <input type="text" data-action="update-card-due" data-card-id="${card.id}" value="${escapeHtml(card.dueDate || "")}" placeholder="DD/MM/YYYY" />
          </div>
          <div class="field-col">
            <label>Tasa interes (%)</label>
            <input type="text" data-action="update-card-rate" data-card-id="${card.id}" value="${formatAmount(card.interestRate)}" inputmode="decimal" />
          </div>
        </div>
        <div class="card-item-actions">
          <button type="button" class="btn-remove" data-action="remove-card" data-card-id="${card.id}">Eliminar</button>
        </div>
      </article>
      `;
    })
    .join("");
}

function getFinancingDueStatus(financing, reminderDaysBefore = 3, today = new Date()) {
  const dueDate = parseDdMmYyyy(financing.nextPaymentDate);
  if (!dueDate) {
    return { code: "pending", label: "Sin fecha" };
  }

  const days = diffDays(today, dueDate);
  if (days < 0) {
    return { code: "overdue", label: "Vencido" };
  }

  if (days <= reminderDaysBefore) {
    return { code: "soon", label: `Vence en ${days}d` };
  }

  return { code: "pending", label: "Al dia" };
}

function calculateFinancingsSummary(state) {
  const reminderDaysBefore = Number(state.settings?.reminderDaysBefore || 3);
  const usdToCrcRate = Number(state.settings?.usdToCrcRate || 1);
  let totalBalance = 0;
  let totalMonthlyInstallment = 0;
  let totalPendingInstallments = 0;
  let upcoming = 0;
  let overdue = 0;

  for (const financing of state.financings || []) {
    const balance = financing.currency === "USD" ? Number(financing.totalBalance) * usdToCrcRate : Number(financing.totalBalance) || 0;
    const installment = financing.currency === "USD" ? Number(financing.monthlyInstallment) * usdToCrcRate : Number(financing.monthlyInstallment) || 0;
    totalBalance += balance;
    totalMonthlyInstallment += installment;
    totalPendingInstallments += Number(financing.pendingInstallments) || 0;
    const dueStatus = getFinancingDueStatus(financing, reminderDaysBefore);
    if (dueStatus.code === "soon") {
      upcoming += 1;
    }
    if (dueStatus.code === "overdue") {
      overdue += 1;
    }
  }

  return {
    totalBalance,
    totalMonthlyInstallment,
    totalPendingInstallments,
    upcoming,
    overdue,
    count: (state.financings || []).length
  };
}

function renderFinancingsSummary(state) {
  const container = document.getElementById("financings-summary");
  if (!container) {
    return;
  }

  const summary = calculateFinancingsSummary(state);
  const cards = [
    ["Saldo total", summary.totalBalance],
    ["Cuota mensual total", summary.totalMonthlyInstallment],
    ["Cuotas pendientes", summary.totalPendingInstallments, true],
    ["Registros activos", summary.count, true],
    ["Proximos vencimientos", summary.upcoming, true],
    ["Vencidos", summary.overdue, true]
  ];

  container.innerHTML = cards
    .map(
      ([label, value, plain]) => `
      <article class="global-card">
        <span class="label">${label}</span>
        <span class="value">${plain ? value : formatAmount(value)}</span>
      </article>
      `
    )
    .join("");
}

function renderFinancings(state) {
  const container = document.getElementById("financings-overview");
  if (!container) {
    return;
  }

  if (!(state.financings || []).length) {
    container.innerHTML = '<div class="empty-row">Aun no hay extrafinanciamientos. Usa "Agregar extrafinanciamiento" para empezar.</div>';
    return;
  }

  const reminderDaysBefore = Number(state.settings?.reminderDaysBefore || 3);
  container.innerHTML = (state.financings || [])
    .map((financing) => {
      const dueStatus = getFinancingDueStatus(financing, reminderDaysBefore);
      const statusClass = `status-${dueStatus.code}`;
      return `
      <article class="financing-item">
        <header class="financing-item-head">
          <h3>Extrafinanciamiento</h3>
          <span class="expense-status ${statusClass}">${dueStatus.label}</span>
        </header>
        <div class="financing-item-grid">
          <div class="field-col">
            <label>Entidad</label>
            <input type="text" data-action="update-financing-entity" data-financing-id="${financing.id}" value="${escapeHtml(financing.entity)}" placeholder="Ej: Financiera Y" />
          </div>
          <div class="field-col">
            <label>Moneda</label>
            <select data-action="update-financing-currency" data-financing-id="${financing.id}">
              <option value="CRC" ${financing.currency === "CRC" ? "selected" : ""}>CRC</option>
              <option value="USD" ${financing.currency === "USD" ? "selected" : ""}>USD</option>
            </select>
          </div>
          <div class="field-col">
            <label>Saldo total</label>
            <input type="text" data-action="update-financing-balance" data-financing-id="${financing.id}" value="${formatAmount(financing.totalBalance)}" inputmode="decimal" />
          </div>
          <div class="field-col">
            <label>Cuota mensual</label>
            <input type="text" data-action="update-financing-installment" data-financing-id="${financing.id}" value="${formatAmount(financing.monthlyInstallment)}" inputmode="decimal" />
          </div>
          <div class="field-col">
            <label>Cuotas pendientes</label>
            <input type="text" data-action="update-financing-pending" data-financing-id="${financing.id}" value="${escapeHtml(financing.pendingInstallments)}" inputmode="numeric" />
          </div>
          <div class="field-col">
            <label>Proximo pago</label>
            <input type="text" data-action="update-financing-next-date" data-financing-id="${financing.id}" value="${escapeHtml(financing.nextPaymentDate || "")}" placeholder="DD/MM/YYYY" />
          </div>
          <div class="field-col">
            <label>Tasa interes (%)</label>
            <input type="text" data-action="update-financing-rate" data-financing-id="${financing.id}" value="${formatAmount(financing.interestRate)}" inputmode="decimal" />
          </div>
        </div>
        <div class="financing-item-actions">
          <button type="button" class="btn-remove" data-action="remove-financing" data-financing-id="${financing.id}">Eliminar</button>
        </div>
      </article>
      `;
    })
    .join("");
}

function getCarDueStatus(carLoan, reminderDaysBefore = 3, today = new Date()) {
  const dueDate = parseDdMmYyyy(carLoan.nextPaymentDate);
  if (!dueDate) {
    return { code: "pending", label: "Sin fecha" };
  }

  const days = diffDays(today, dueDate);
  if (days < 0) {
    return { code: "overdue", label: "Vencido" };
  }

  if (days <= reminderDaysBefore) {
    return { code: "soon", label: `Vence en ${days}d` };
  }

  return { code: "pending", label: "Al dia" };
}

function calculateCarLoanSummary(state) {
  const carLoan = state.carLoan || {};
  const usdToCrcRate = Number(state.settings?.usdToCrcRate || 1);
  const installmentsTotal = Math.max(0, Number(carLoan.installmentsTotal) || 0);
  const installmentsPaid = Math.max(0, Number(carLoan.installmentsPaid) || 0);
  const installmentsRemaining = Math.max(installmentsTotal - installmentsPaid, 0);
  const progress = installmentsTotal > 0
    ? Math.min((installmentsPaid / installmentsTotal) * 100, 100)
    : 0;

  return {
    monthlyPayment: carLoan.currency === "USD" ? (Number(carLoan.monthlyPayment) || 0) * usdToCrcRate : (Number(carLoan.monthlyPayment) || 0),
    estimatedBalance: carLoan.currency === "USD" ? (Number(carLoan.estimatedBalance) || 0) * usdToCrcRate : (Number(carLoan.estimatedBalance) || 0),
    installmentsTotal,
    installmentsPaid,
    installmentsRemaining,
    progress
  };
}

function renderCarSummary(state) {
  const container = document.getElementById("car-summary");
  if (!container) {
    return;
  }

  const summary = calculateCarLoanSummary(state);
  const cards = [
    ["Cuota mensual", summary.monthlyPayment],
    ["Saldo estimado", summary.estimatedBalance],
    ["Cuotas pagadas", summary.installmentsPaid, true],
    ["Cuotas totales", summary.installmentsTotal, true],
    ["Cuotas faltantes", summary.installmentsRemaining, true]
  ];

  const cardHtml = cards
    .map(
      ([label, value, plain]) => `
      <article class="global-card">
        <span class="label">${label}</span>
        <span class="value">${plain ? value : formatAmount(value)}</span>
      </article>
      `
    )
    .join("");

  const progressHtml = `
    <article class="global-card car-progress-card">
      <span class="label">Avance del plan</span>
      <span class="value">${formatAmount(summary.progress)}%</span>
      <div class="car-progress-track" aria-hidden="true">
        <span class="car-progress-bar" style="width:${summary.progress.toFixed(2)}%"></span>
      </div>
    </article>
  `;

  container.innerHTML = cardHtml + progressHtml;
}

function renderCarLoan(state) {
  const container = document.getElementById("car-overview");
  if (!container) {
    return;
  }

  const reminderDaysBefore = Number(state.settings?.reminderDaysBefore || 3);
  const carLoan = state.carLoan || {};
  const dueStatus = getCarDueStatus(carLoan, reminderDaysBefore);
  const statusClass = `status-${dueStatus.code}`;

  container.innerHTML = `
    <article class="car-item">
      <header class="car-item-head">
        <h3>Financiamiento del carro</h3>
        <span class="expense-status ${statusClass}">${dueStatus.label}</span>
      </header>
      <div class="car-item-grid">
        <div class="field-col">
          <label>Moneda</label>
          <select data-action="update-car-currency">
            <option value="USD" ${carLoan.currency === "USD" ? "selected" : ""}>USD</option>
            <option value="CRC" ${carLoan.currency === "CRC" ? "selected" : ""}>CRC</option>
          </select>
        </div>
        <div class="field-col">
          <label>Cuota mensual</label>
          <input type="text" data-action="update-car-monthly-payment" value="${formatAmount(carLoan.monthlyPayment)}" inputmode="decimal" />
        </div>
        <div class="field-col">
          <label>Cuotas pagadas</label>
          <input type="text" data-action="update-car-installments-paid" value="${escapeHtml(carLoan.installmentsPaid)}" inputmode="numeric" />
        </div>
        <div class="field-col">
          <label>Cuotas totales</label>
          <input type="text" data-action="update-car-installments-total" value="${escapeHtml(carLoan.installmentsTotal)}" inputmode="numeric" />
        </div>
        <div class="field-col">
          <label>Saldo estimado</label>
          <input type="text" data-action="update-car-estimated-balance" value="${formatAmount(carLoan.estimatedBalance)}" inputmode="decimal" />
        </div>
        <div class="field-col">
          <label>Proximo pago</label>
          <input type="text" data-action="update-car-next-date" value="${escapeHtml(carLoan.nextPaymentDate || "")}" placeholder="DD/MM/YYYY" />
        </div>
      </div>
    </article>
  `;
}

function getConapeDueStatus(conapeLoan, reminderDaysBefore = 3, today = new Date()) {
  const dueDate = parseDdMmYyyy(conapeLoan.nextPaymentDate);
  if (!dueDate) {
    return { code: "pending", label: "Sin fecha" };
  }

  const days = diffDays(today, dueDate);
  if (days < 0) {
    return { code: "overdue", label: "Vencido" };
  }

  if (days <= reminderDaysBefore) {
    return { code: "soon", label: `Vence en ${days}d` };
  }

  return { code: "pending", label: "Al dia" };
}

function calculateConapeSummary(state) {
  const conapeLoan = state.conapeLoan || {};
  const installmentsTotal = Math.max(0, Number(conapeLoan.installmentsTotal) || 0);
  const installmentsPaid = Math.max(0, Number(conapeLoan.installmentsPaid) || 0);
  const installmentsRemaining = Math.max(installmentsTotal - installmentsPaid, 0);
  const progress = installmentsTotal > 0
    ? Math.min((installmentsPaid / installmentsTotal) * 100, 100)
    : 0;

  return {
    monthlyPayment: Number(conapeLoan.monthlyPayment) || 0,
    estimatedBalance: Number(conapeLoan.estimatedBalance) || 0,
    installmentsTotal,
    installmentsPaid,
    installmentsRemaining,
    progress
  };
}

function renderConapeSummary(state) {
  const container = document.getElementById("conape-summary");
  if (!container) {
    return;
  }

  const summary = calculateConapeSummary(state);
  const cards = [
    ["Cuota mensual", summary.monthlyPayment],
    ["Saldo estimado", summary.estimatedBalance],
    ["Cuotas pagadas", summary.installmentsPaid, true],
    ["Cuotas totales", summary.installmentsTotal, true],
    ["Cuotas faltantes", summary.installmentsRemaining, true]
  ];

  const cardHtml = cards
    .map(
      ([label, value, plain]) => `
      <article class="global-card">
        <span class="label">${label}</span>
        <span class="value">${plain ? value : formatAmount(value)}</span>
      </article>
      `
    )
    .join("");

  const progressHtml = `
    <article class="global-card conape-progress-card">
      <span class="label">Avance del plan</span>
      <span class="value">${formatAmount(summary.progress)}%</span>
      <div class="conape-progress-track" aria-hidden="true">
        <span class="conape-progress-bar" style="width:${summary.progress.toFixed(2)}%"></span>
      </div>
    </article>
  `;

  container.innerHTML = cardHtml + progressHtml;
}

function renderConapeLoan(state) {
  const container = document.getElementById("conape-overview");
  if (!container) {
    return;
  }

  const reminderDaysBefore = Number(state.settings?.reminderDaysBefore || 3);
  const conapeLoan = state.conapeLoan || {};
  const dueStatus = getConapeDueStatus(conapeLoan, reminderDaysBefore);
  const statusClass = `status-${dueStatus.code}`;

  container.innerHTML = `
    <article class="conape-item">
      <header class="conape-item-head">
        <h3>Credito Conape</h3>
        <span class="expense-status ${statusClass}">${dueStatus.label}</span>
      </header>
      <div class="conape-item-grid">
        <div class="field-col">
          <label>Cuota mensual</label>
          <input type="text" data-action="update-conape-monthly-payment" value="${formatAmount(conapeLoan.monthlyPayment)}" inputmode="decimal" />
        </div>
        <div class="field-col">
          <label>Cuotas pagadas</label>
          <input type="text" data-action="update-conape-installments-paid" value="${escapeHtml(conapeLoan.installmentsPaid)}" inputmode="numeric" />
        </div>
        <div class="field-col">
          <label>Cuotas totales</label>
          <input type="text" data-action="update-conape-installments-total" value="${escapeHtml(conapeLoan.installmentsTotal)}" inputmode="numeric" />
        </div>
        <div class="field-col">
          <label>Saldo estimado</label>
          <input type="text" data-action="update-conape-estimated-balance" value="${formatAmount(conapeLoan.estimatedBalance)}" inputmode="decimal" />
        </div>
        <div class="field-col">
          <label>Proximo pago</label>
          <input type="text" data-action="update-conape-next-date" value="${escapeHtml(conapeLoan.nextPaymentDate || "")}" placeholder="DD/MM/YYYY" />
        </div>
      </div>
    </article>
  `;
}

function calculateReports(state) {
  const months = state.months || [];
  const monthTotals = months.map((month) => ({
    id: month.id,
    label: month.label,
    ...calculateMonthTotals(month)
  }));

  const current = monthTotals[1] || monthTotals[0] || {
    label: "Mes actual",
    totalIncome: 0,
    totalExpenses: 0,
    totalPaid: 0,
    totalPending: 0,
    netBalance: 0,
    realAvailable: 0
  };

  const previous = monthTotals[0] || current;
  const next = monthTotals[2] || current;

  const expenseTrend = current.totalExpenses - previous.totalExpenses;
  const pendingTrend = next.totalPending - current.totalPending;

  const expenseMap = new Map();
  for (const month of months) {
    for (const expense of month.expenses || []) {
      const key = (expense.name || "Sin nombre").trim() || "Sin nombre";
      const value = Number(expense.amount) || 0;
      expenseMap.set(key, (expenseMap.get(key) || 0) + value);
    }
  }

  const topExpenses = [...expenseMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, amount]) => ({ name, amount }));

  const usdToCrcRate = Number(state.settings?.usdToCrcRate || 1);
  const totalDebt =
    (state.cards || []).reduce((acc, item) => acc + ((item.currency === "USD" ? (Number(item.currentBalance) || 0) * usdToCrcRate : (Number(item.currentBalance) || 0))), 0) +
    (state.financings || []).reduce((acc, item) => acc + ((item.currency === "USD" ? (Number(item.totalBalance) || 0) * usdToCrcRate : (Number(item.totalBalance) || 0))), 0) +
    ((state.carLoan?.currency === "USD" ? (Number(state.carLoan?.estimatedBalance) || 0) * usdToCrcRate : (Number(state.carLoan?.estimatedBalance) || 0))) +
    ((state.conapeLoan?.currency === "USD" ? (Number(state.conapeLoan?.estimatedBalance) || 0) * usdToCrcRate : (Number(state.conapeLoan?.estimatedBalance) || 0)));

  return {
    current,
    previous,
    next,
    expenseTrend,
    pendingTrend,
    topExpenses,
    totalDebt
  };
}

function renderReports(state) {
  const container = document.getElementById("reports-overview");
  if (!container) {
    return;
  }

  const reports = calculateReports(state);
  const expenseTrendLabel = reports.expenseTrend > 0
    ? `Subio ${formatAmount(Math.abs(reports.expenseTrend))}`
    : reports.expenseTrend < 0
      ? `Bajo ${formatAmount(Math.abs(reports.expenseTrend))}`
      : "Sin cambio";

  const pendingTrendLabel = reports.pendingTrend > 0
    ? `Sube ${formatAmount(Math.abs(reports.pendingTrend))}`
    : reports.pendingTrend < 0
      ? `Baja ${formatAmount(Math.abs(reports.pendingTrend))}`
      : "Sin cambio";

  const topExpensesHtml = reports.topExpenses.length
    ? reports.topExpenses
      .map(
        (item, index) => `
        <div class="report-line-item">
          <span>${index + 1}. ${escapeHtml(item.name)}</span>
          <strong>${formatAmount(item.amount)}</strong>
        </div>
      `
      )
      .join("")
    : '<div class="empty-row">Aun no hay gastos registrados para analizar.</div>';

  const warnings = calculateConsistencyWarnings(state);
  const warningsHtml = warnings.length
    ? warnings
      .map((line) => `<div class="report-warning-item">${escapeHtml(line)}</div>`)
      .join("")
    : '<div class="report-warning-item ok">Sin inconsistencias detectadas.</div>';

  container.innerHTML = `
    <article class="report-card">
      <h3>Indicadores del mes actual (${escapeHtml(reports.current.label)})</h3>
      <div class="report-line-item"><span>Balance neto</span><strong>${formatAmount(reports.current.netBalance)}</strong></div>
      <div class="report-line-item"><span>Disponible real</span><strong>${formatAmount(reports.current.realAvailable)}</strong></div>
      <div class="report-line-item"><span>Total pendiente</span><strong>${formatAmount(reports.current.totalPending)}</strong></div>
    </article>

    <article class="report-card">
      <h3>Tendencia 3 meses</h3>
      <div class="report-line-item"><span>Gastos vs mes pasado</span><strong>${expenseTrendLabel}</strong></div>
      <div class="report-line-item"><span>Pendiente proximo mes</span><strong>${pendingTrendLabel}</strong></div>
      <div class="report-line-item"><span>Deuda total estimada</span><strong>${formatAmount(reports.totalDebt)}</strong></div>
    </article>

    <article class="report-card report-card-wide">
      <h3>Top gastos (acumulado 3 meses)</h3>
      <div class="report-list">${topExpensesHtml}</div>
    </article>

    <article class="report-card report-card-wide">
      <h3>Control de consistencia</h3>
      <div class="report-warning-list">${warningsHtml}</div>
    </article>
  `;
}

function renderVariableIncomes(month) {
  if (!month.incomes.variable.length) {
    return '<div class="empty-row">Aun no hay ingresos variables.</div>';
  }

  return month.incomes.variable
    .map(
      (entry) => `
        <div class="line-item" data-entry-id="${entry.id}" data-month-id="${month.id}">
          <div class="field-col">
            <label>Detalle</label>
            <input type="text" data-action="update-variable-name" data-month-id="${month.id}" data-entry-id="${entry.id}" value="${escapeHtml(entry.name)}" placeholder="Ej: Horas extra" />
          </div>
          <div class="field-col">
            <label>Monto</label>
            <input type="text" data-action="update-variable-amount" data-month-id="${month.id}" data-entry-id="${entry.id}" value="${formatAmount(entry.amount)}" inputmode="decimal" />
          </div>
          <button type="button" class="btn-remove" data-action="remove-variable-income" data-month-id="${month.id}" data-entry-id="${entry.id}">Quitar</button>
        </div>
      `
    )
    .join("");
}

function renderExpenses(month, reminderDaysBefore) {
  if (!month.expenses.length) {
    return '<div class="empty-row">Aun no hay gastos. Agrega tus pagos del mes.</div>';
  }

  return month.expenses
    .map(
      (entry) => {
        const status = getExpenseStatus(entry, reminderDaysBefore);
        const stateClass = status.code === "paid" ? "state-paid" : status.code === "soon" ? "state-soon" : status.code === "overdue" ? "state-overdue" : "";

        return `
        <div class="line-item expense-item ${stateClass}" data-entry-id="${entry.id}" data-month-id="${month.id}">
          <div class="field-col expense-name">
            <label>Gasto</label>
            <input type="text" data-action="update-expense-name" data-month-id="${month.id}" data-entry-id="${entry.id}" value="${escapeHtml(entry.name)}" placeholder="Ej: Internet" />
          </div>
          <div class="field-col expense-amount">
            <label>Monto</label>
            <input type="text" data-action="update-expense-amount" data-month-id="${month.id}" data-entry-id="${entry.id}" value="${formatAmount(entry.amount)}" inputmode="decimal" />
          </div>
          <div class="field-col expense-quincena">
            <label>Quincena</label>
            <select data-action="update-expense-quincena" data-month-id="${month.id}" data-entry-id="${entry.id}">
              <option value="Q1" ${entry.quincena !== "Q2" ? "selected" : ""}>Quincena 1</option>
              <option value="Q2" ${entry.quincena === "Q2" ? "selected" : ""}>Quincena 2</option>
            </select>
          </div>
          <div class="paid-col expense-paid">
            <label>Pagado</label>
            <input type="checkbox" data-action="update-expense-paid" data-month-id="${month.id}" data-entry-id="${entry.id}" ${entry.isPaid ? "checked" : ""} />
            <span class="expense-status status-${status.code}" data-role="status-badge">${status.label}</span>
          </div>
          <div class="field-col expense-date">
            <label>Fecha pago</label>
            <input type="text" class="date-field" data-action="update-expense-date" data-month-id="${month.id}" data-entry-id="${entry.id}" value="${escapeHtml(entry.paidDate || "")}" placeholder="DD/MM/YYYY" />
          </div>
          <button type="button" class="btn-remove expense-remove" data-action="remove-expense" data-month-id="${month.id}" data-entry-id="${entry.id}">Quitar</button>
        </div>
      `;
      }
    )
    .join("");
}

function formatMonthBlock(month, monthIndex, reminderDaysBefore) {
  const totals = calculateMonthTotals(month);
  const polarityClass = totals.netBalance >= 0 ? "is-positive" : "is-negative";

  return `
    <article class="month-card ${polarityClass}" style="--stagger:${monthIndex}" data-month-id="${month.id}">
      <header class="month-header">
        <input
          type="text"
          class="month-name-field"
          data-action="update-month-label"
          data-month-id="${month.id}"
          value="${escapeHtml(month.label)}"
          aria-label="Nombre del mes"
        />
        <input
          type="month"
          class="month-id-field"
          data-action="update-month-id"
          data-month-id="${month.id}"
          value="${escapeHtml(month.id)}"
          aria-label="Mes y año"
        />
      </header>

      ${renderMonthAlertStrip(month, reminderDaysBefore)}

      <section class="block">
        <div class="block-title">Ingreso fijo</div>
        <input
          type="text"
          class="salary-field"
          data-action="update-fixed-salary"
          data-month-id="${month.id}"
          value="${formatAmount(month.incomes.fixedSalary)}"
          inputmode="decimal"
        />
      </section>

      <section class="block">
        <div class="block-head">
          <span class="block-title">Ingresos variables</span>
          <button type="button" class="btn-inline" data-action="add-variable-income" data-month-id="${month.id}">Agregar</button>
        </div>
        <div class="row-list">
          ${renderVariableIncomes(month)}
        </div>
      </section>

      <section class="block">
        <div class="block-head">
          <span class="block-title">Gastos del mes</span>
          <button type="button" class="btn-inline" data-action="add-expense" data-month-id="${month.id}">Agregar</button>
        </div>
        <div class="row-list">
          ${renderExpenses(month, reminderDaysBefore)}
        </div>
      </section>

      <div class="month-meta">
        <div class="metric-chip">
          <span class="label">Total ingresos</span>
          <span class="value" data-month-total="totalIncome" data-month-id="${month.id}">${formatAmount(totals.totalIncome)}</span>
        </div>
        <div class="metric-chip">
          <span class="label">Total gastos</span>
          <span class="value" data-month-total="totalExpenses" data-month-id="${month.id}">${formatAmount(totals.totalExpenses)}</span>
        </div>
        <div class="metric-chip">
          <span class="label">Total pagado</span>
          <span class="value" data-month-total="totalPaid" data-month-id="${month.id}">${formatAmount(totals.totalPaid)}</span>
        </div>
        <div class="metric-chip">
          <span class="label">Total pendiente</span>
          <span class="value" data-month-total="totalPending" data-month-id="${month.id}">${formatAmount(totals.totalPending)}</span>
        </div>
        <div class="metric-chip">
          <span class="label">Balance neto</span>
          <span class="value" data-month-total="netBalance" data-month-id="${month.id}">${formatAmount(totals.netBalance)}</span>
        </div>
        <div class="metric-chip">
          <span class="label">Disponible real</span>
          <span class="value" data-month-total="realAvailable" data-month-id="${month.id}">${formatAmount(totals.realAvailable)}</span>
        </div>
        <div class="metric-chip">
          <span class="label">Quincena 1</span>
          <span class="value" data-month-total="totalQuincena1" data-month-id="${month.id}">${formatAmount(totals.totalQuincena1)}</span>
        </div>
        <div class="metric-chip">
          <span class="label">Quincena 2</span>
          <span class="value" data-month-total="totalQuincena2" data-month-id="${month.id}">${formatAmount(totals.totalQuincena2)}</span>
        </div>
      </div>
    </article>
  `;
}

function renderDebugState(state) {
  const preview = document.getElementById("state-preview");
  if (preview) {
    preview.textContent = JSON.stringify(state, null, 2);
  }
}

export function updateComputedViews(state) {
  for (const month of state.months || []) {
    const totals = calculateMonthTotals(month);
    for (const [metric, value] of Object.entries(totals)) {
      const target = document.querySelector(
        `[data-month-total="${metric}"][data-month-id="${month.id}"]`
      );
      if (target) {
        target.textContent = formatAmount(value);
      }
    }
  }

  renderGlobalSummary(state);
  renderCardsSummary(state);
  renderFinancingsSummary(state);
  renderCarSummary(state);
  renderConapeSummary(state);
  renderReports(state);
  renderDebugState(state);
}

export function renderSettingsPanel(state) {
  const container = document.getElementById("settings-panel");
  if (!container) {
    return;
  }

  const rate = Number(state.settings?.usdToCrcRate || 500);
  container.innerHTML = `
    <div class="field-col settings-rate-field">
      <label>Tipo de cambio USD → CRC</label>
      <input type="text" data-action="update-usd-to-crc-rate" value="${formatAmount(rate)}" inputmode="decimal" />
    </div>
  `;
}

export function renderApp(state) {
  const monthsContainer = document.getElementById("months-overview");

  if (!monthsContainer) {
    return;
  }

  const reminderDaysBefore = Number(state.settings?.reminderDaysBefore || 3);
  monthsContainer.innerHTML = (state.months || [])
    .map((month, index) => formatMonthBlock(month, index, reminderDaysBefore))
    .join("");
  renderSettingsPanel(state);
  renderGlobalSummary(state);
  renderCardsSummary(state);
  renderCards(state);
  renderFinancingsSummary(state);
  renderFinancings(state);
  renderCarSummary(state);
  renderCarLoan(state);
  renderConapeSummary(state);
  renderConapeLoan(state);
  renderReports(state);
  renderDebugState(state);
}
