-- Migrasi 003: pembayaran utang terbagi (batch), stok toren, dan konsumsi pribadi.

-- Satu pembayaran utang bisa terbagi ke beberapa order (order tertua dulu); baris-barisnya
-- berbagi batch_id agar tampil sebagai satu pembayaran dan bisa dibatalkan bersama.
ALTER TABLE payments ADD COLUMN batch_id UUID;
CREATE INDEX payments_batch_id_idx ON payments (batch_id);
CREATE UNIQUE INDEX payments_batch_order_uniq ON payments (batch_id, order_id) WHERE batch_id IS NOT NULL;

INSERT INTO settings (key, value) VALUES ('tank_capacity_liters', '6000')
ON CONFLICT (key) DO NOTHING;

-- Air masuk ke toren. occurred_at = kapan kejadiannya (hari ini = saat dicatat, tanggal lampau = pukul 12.00 WIB).
CREATE TABLE tank_refills (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  refill_date       DATE        NOT NULL,
  occurred_at       TIMESTAMPTZ NOT NULL,
  liters            INTEGER     NOT NULL CHECK (liters > 0),
  note              TEXT,
  created_by        BIGINT      NOT NULL REFERENCES users (id),
  created_at        TIMESTAMPTZ NOT NULL,
  client_request_id UUID        UNIQUE,
  voided_at         TIMESTAMPTZ
);
CREATE INDEX tank_refills_occurred_at_idx ON tank_refills (occurred_at);

-- Koreksi stok: "sisa sekarang X liter" menjadi titik awal hitungan. Tidak bisa dibatalkan, hanya diganti koreksi baru.
CREATE TABLE tank_adjustments (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  adjusted_at       TIMESTAMPTZ NOT NULL,
  liters_after      INTEGER     NOT NULL CHECK (liters_after >= 0),
  note              TEXT,
  created_by        BIGINT      NOT NULL REFERENCES users (id),
  created_at        TIMESTAMPTZ NOT NULL,
  client_request_id UUID        UNIQUE
);
CREATE INDEX tank_adjustments_adjusted_at_idx ON tank_adjustments (adjusted_at);

-- Konsumsi pribadi: mengurangi stok, tidak masuk pendapatan.
CREATE TABLE personal_use (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  use_date          DATE        NOT NULL,
  occurred_at       TIMESTAMPTZ NOT NULL,
  gallons           INTEGER     NOT NULL CHECK (gallons > 0),
  note              TEXT,
  created_by        BIGINT      NOT NULL REFERENCES users (id),
  created_at        TIMESTAMPTZ NOT NULL,
  client_request_id UUID        UNIQUE,
  voided_at         TIMESTAMPTZ
);
CREATE INDEX personal_use_occurred_at_idx ON personal_use (occurred_at);
