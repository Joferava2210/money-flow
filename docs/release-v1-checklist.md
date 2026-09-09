# Money Flow - Release v1 Checklist (Etapa 10)

## 1. Flujo mensual (3 meses)

- [x] Puedo editar salario fijo en cada mes.
- [x] Puedo agregar, editar y eliminar ingresos variables.
- [ ] Puedo agregar, editar y eliminar gastos.
- [x] El check de pagado cambia los totales del mes.
- [x] Fechas invalidas no se aceptan (DD/MM/YYYY).

## 2. Modulos de deuda

- [ ] Tarjetas: CRUD completo y resumen actualizado.
- [ ] Extrafinanciamientos: CRUD completo y resumen actualizado.
- [x] Carro: campos editables, avance y estado por fecha.
- [x] Conape: campos editables, avance y estado por fecha.

## 3. Reportes

- [x] Indicadores del mes actual visibles.
- [x] Tendencia de gastos visible.
- [x] Top gastos acumulados visible.
- [x] Control de consistencia sin errores esperados.

## 4. Datos y respaldo

- [ ] Exportar JSON descarga archivo correcto.
- [ ] Importar JSON restaura estado.
- [x] El indicador de guardado muestra estado actualizado.
- [x] El estado persiste despues de recargar la pagina.

## 5. Responsive y UX

- [ ] Vista usable en desktop.
- [ ] Vista usable en movil.
- [ ] Mensajes de error claros en validaciones.
- [x] Campos invalidos quedan resaltados.

## 6. Criterio de salida v1

- [x] No hay errores en el workspace.
- [x] Flujo diario (registrar pagos y revisar pendientes) funciona sin bloqueos.
- [x] Resumen general y reportes reflejan datos reales despues de cambios.

## Notas de verificacion

- Los checks marcados se validaron con prueba de humo automatizada en DOM simulado.
- Quedan pendientes de validacion manual en navegador real: descarga/subida de archivos JSON, usabilidad visual desktop/movil y confirmar CRUD completo de tarjetas, extrafinanciamientos y gastos con eliminacion manual.
