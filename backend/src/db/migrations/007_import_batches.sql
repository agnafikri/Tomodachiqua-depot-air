-- Migrasi 007: catatan impor Excel. Tiap impor = satu batch; baris yang diimpor menandai asalnya
-- (import_batch_id) sehingga satu impor bisa dibatalkan seluruhnya.
CREATE TABLE import_batches (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind       TEXT        NOT NULL CHECK (kind IN ('CUSTOMERS', 'ORDERS', 'EXPENSES')),
  file_name  TEXT        NOT NULL,
  file_hash  TEXT        NOT NULL,                      -- SHA-256 isi berkas: berkas yang sama tidak diimpor dua kali
  row_count  INTEGER     NOT NULL,
  summary    JSONB       NOT NULL DEFAULT '{}',
  created_by BIGINT      NOT NULL REFERENCES users (id),
  created_at TIMESTAMPTZ NOT NULL,
  voided_at  TIMESTAMPTZ,
  voided_by  BIGINT      REFERENCES users (id)
);

-- Berkas yang sama baru boleh diimpor lagi setelah impor sebelumnya dibatalkan.
CREATE UNIQUE INDEX import_batches_hash_uniq ON import_batches (file_hash) WHERE voided_at IS NULL;

ALTER TABLE customers ADD COLUMN import_batch_id BIGINT REFERENCES import_batches (id);
ALTER TABLE orders    ADD COLUMN import_batch_id BIGINT REFERENCES import_batches (id);
ALTER TABLE payments  ADD COLUMN import_batch_id BIGINT REFERENCES import_batches (id);
ALTER TABLE expenses  ADD COLUMN import_batch_id BIGINT REFERENCES import_batches (id);

CREATE INDEX orders_import_batch_idx   ON orders (import_batch_id)   WHERE import_batch_id IS NOT NULL;
CREATE INDEX expenses_import_batch_idx ON expenses (import_batch_id) WHERE import_batch_id IS NOT NULL;
