# Money Flow - Modelo de Datos (Etapa 2)

Este documento define la estructura base del estado para la app de finanzas.

## Raiz del estado

```json
{
  "version": 1,
  "settings": {},
  "expenseTemplate": [],
  "months": [],
  "cards": [],
  "financings": [],
  "carLoan": {},
  "conapeLoan": {},
  "metadata": {}
}
```

## settings

- currency: string ("CRC")
- locale: string ("es-CR")
- decimalSeparator: string (",")
- thousandsSeparator: string ("")
- dateFormat: string ("DD/MM/YYYY")
- reminderDaysBefore: number (3)

## months[]

Cada mes representa una columna de trabajo (pasado, actual, siguiente).

```json
{
  "id": "2026-08",
  "label": "agosto de 2026",
  "incomes": {
    "fixedSalary": 0,
    "variable": [
      {
        "id": "inc-var-1",
        "name": "Horas extra",
        "amount": 0
      }
    ]
  },
  "expenses": [
    {
      "id": "exp-1",
      "name": "Internet",
      "amount": 0,
      "isPaid": false,
      "paidDate": ""
    }
  ],
  "notes": ""
}
```

## expenseTemplate[]

Plantilla reusable para gastos frecuentes, editable por mes.

```json
[
  {
    "id": "tpl-1",
    "name": "Alquiler",
    "defaultAmount": 0
  }
]
```

## cards[]

```json
[
  {
    "id": "card-1",
    "name": "Banco X Visa",
    "currentBalance": 0,
    "minimumPayment": 0,
    "cutoffDate": "",
    "dueDate": "",
    "interestRate": 0
  }
]
```

## financings[]

```json
[
  {
    "id": "fin-1",
    "entity": "Entidad Y",
    "totalBalance": 0,
    "monthlyInstallment": 0,
    "pendingInstallments": 0,
    "nextPaymentDate": "",
    "interestRate": 0
  }
]
```

## carLoan

```json
{
  "monthlyPayment": 0,
  "installmentsPaid": 0,
  "installmentsTotal": 0,
  "estimatedBalance": 0,
  "nextPaymentDate": ""
}
```

## conapeLoan

```json
{
  "monthlyPayment": 0,
  "installmentsPaid": 0,
  "installmentsTotal": 0,
  "estimatedBalance": 0,
  "nextPaymentDate": ""
}
```

## metadata

- createdAtIso: string ISO date
- updatedAtIso: string ISO date

## Notas de validacion

- Fechas en formato DD/MM/YYYY para campos visibles al usuario.
- Montos como number interno; visualizacion con coma decimal.
- El estado completo se guarda en LocalStorage y puede exportarse/importarse en JSON.
