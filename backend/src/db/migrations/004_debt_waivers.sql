-- Migrasi 004: keringanan utang. Pemilik boleh menganggap lunas sisa utang yang kurang
-- (mis. utang Rp 6.000, dibayar Rp 5.000) dengan catatan alasan.
-- Keringanan BUKAN uang masuk: payments tetap hanya mencatat uang yang benar-benar diterima.
CREATE TABLE debt_waivers (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id    BIGINT      NOT NULL REFERENCES orders (id),
  customer_id BIGINT      REFERENCES customers (id),     -- NULL = pelanggan umum
  amount      INTEGER     NOT NULL CHECK (amount > 0),
  note        TEXT        NOT NULL,
  batch_id    UUID        NOT NULL,                      -- sama dengan batch pembayaran yang menyertainya
  created_by  BIGINT      NOT NULL REFERENCES users (id),
  created_at  TIMESTAMPTZ NOT NULL,
  voided_at   TIMESTAMPTZ
);

CREATE UNIQUE INDEX debt_waivers_batch_order_uniq ON debt_waivers (batch_id, order_id);
CREATE INDEX debt_waivers_order_id_idx    ON debt_waivers (order_id);
CREATE INDEX debt_waivers_customer_id_idx ON debt_waivers (customer_id);
