// Pembuat dan pembaca berkas Excel untuk tes.
import ExcelJS from 'exceljs';
import { KINDS } from '../src/services/excel/kinds.mjs';

// rows = array of array, urutan kolom sesuai template (atau sesuai headers bila diberikan).
export async function book(kind, rows, { headers, sheet } = {}) {
  const def = KINDS[kind];
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheet ?? def.sheet);
  ws.addRow(headers ?? def.columns.map((c) => c.header));
  for (const r of rows) ws.addRow(r);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function read(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  return wb;
}

// Nilai sel sebagai data biasa (rumus -> { formula, result }).
export const rowValues = (ws, n) => {
  const out = [];
  ws.getRow(n).eachCell({ includeEmpty: true }, (c, i) => {
    out[i - 1] = c.value;
  });
  return out;
};

// Lembar menjadi array objek berdasarkan judul kolom baris 1 (tanpa baris Total).
export function table(ws, { withTotal = false } = {}) {
  const headers = rowValues(ws, 1);
  const rows = [];
  for (let n = 2; n <= ws.rowCount; n += 1) {
    const vals = rowValues(ws, n);
    if (vals.every((v) => v === null || v === undefined)) continue;
    rows.push(Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? null])));
  }
  if (withTotal) return rows;
  return rows.filter((r) => r[headers[0]] !== 'Total');
}
