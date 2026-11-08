-- Migrasi 002: pelanggan, order, dan pembayaran.
-- Uang = integer rupiah. Order tidak pernah dihapus, hanya ditandai batal (voided_at).

CREATE TABLE customers (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name         TEXT        NOT NULL,
  phone        TEXT,
  address      TEXT,
  custom_price INTEGER     CHECK (custom_price > 0),
  bundle_buy   INTEGER,
  bundle_pay   INTEGER,
  is_active    BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Diskon paket: dua-duanya terisi atau dua-duanya kosong; "bayar" harus lebih kecil dari "beli".
  CONSTRAINT customers_bundle_chk CHECK (
    (bundle_buy IS NULL AND bundle_pay IS NULL)
    OR (bundle_buy > 0 AND bundle_pay > 0 AND bundle_pay < bundle_buy)
  )
);

CREATE UNIQUE INDEX customers_name_lower_idx ON customers (lower(name));

CREATE TABLE orders (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id       BIGINT      REFERENCES customers (id),   -- NULL = pelanggan umum
  qty               INTEGER     NOT NULL CHECK (qty > 0),
  is_delivered      BOOLEAN     NOT NULL,
  unit_price        INTEGER     NOT NULL CHECK (unit_price > 0),
  paid_qty          INTEGER     NOT NULL CHECK (paid_qty > 0),  -- galon yang dibayar setelah diskon paket
  total             INTEGER     NOT NULL CHECK (total > 0),
  ordered_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  note              TEXT,
  created_by        BIGINT      NOT NULL REFERENCES users (id),
  client_request_id UUID        UNIQUE,                       -- mencegah order ganda saat tombol terketuk dua kali
  voided_at         TIMESTAMPTZ,
  voided_by         BIGINT      REFERENCES users (id)
);

CREATE INDEX orders_ordered_at_idx  ON orders (ordered_at);
CREATE INDEX orders_customer_id_idx ON orders (customer_id);

CREATE TABLE payments (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id BIGINT      REFERENCES customers (id),          -- NULL = pelanggan umum
  order_id    BIGINT      REFERENCES orders (id),             -- NULL = pembayaran utang tidak terikat satu order
  amount      INTEGER     NOT NULL CHECK (amount > 0),
  paid_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  BIGINT      NOT NULL REFERENCES users (id),
  voided_at   TIMESTAMPTZ
);

CREATE INDEX payments_customer_id_idx ON payments (customer_id);
CREATE INDEX payments_order_id_idx    ON payments (order_id);
CREATE INDEX payments_paid_at_idx     ON payments (paid_at);
