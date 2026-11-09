-- Migrasi 005: pengeluaran usaha. Uang = integer rupiah. Tidak pernah dihapus, hanya ditandai batal.
CREATE TABLE expenses (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  spent_date        DATE        NOT NULL,                 -- tanggal pengeluaran (zona Jakarta), boleh tanggal lampau
  category          TEXT        NOT NULL,
  amount            INTEGER     NOT NULL CHECK (amount > 0),
  note              TEXT,
  created_by        BIGINT      NOT NULL REFERENCES users (id),
  created_at        TIMESTAMPTZ NOT NULL,
  client_request_id UUID        UNIQUE,                   -- mencegah pencatatan ganda saat tombol terketuk dua kali
  voided_at         TIMESTAMPTZ
);

CREATE INDEX expenses_spent_date_idx ON expenses (spent_date);
