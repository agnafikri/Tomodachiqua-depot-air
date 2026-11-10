-- Migrasi 006: karyawan dan slip upah harian.
-- Tidak ada tarif tetap: nominal upah tiap hari ditentukan pemilik. Tidak ada upah bulanan.
CREATE TABLE employees (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name       TEXT        NOT NULL,
  phone      TEXT,
  is_active  BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX employees_name_lower_idx ON employees (lower(name));

-- Satu slip = upah satu karyawan pada satu tanggal, dibayar tunai di hari yang sama.
-- Slip yang dibatalkan (voided_at) tidak dihitung dan tanggalnya boleh dibuat ulang.
CREATE TABLE wage_slips (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id BIGINT      NOT NULL REFERENCES employees (id),
  wage_date   DATE        NOT NULL,                       -- tanggal upah (zona Jakarta)
  amount      INTEGER     NOT NULL CHECK (amount > 0),
  note        TEXT,
  batch_id    UUID        NOT NULL,                       -- satu ketukan "Simpan dan bayar" = satu batch
  created_by  BIGINT      NOT NULL REFERENCES users (id),
  created_at  TIMESTAMPTZ NOT NULL,
  voided_at   TIMESTAMPTZ
);
CREATE UNIQUE INDEX wage_slips_employee_date_uniq ON wage_slips (employee_id, wage_date) WHERE voided_at IS NULL;
CREATE UNIQUE INDEX wage_slips_batch_employee_uniq ON wage_slips (batch_id, employee_id);
CREATE INDEX wage_slips_wage_date_idx ON wage_slips (wage_date);
