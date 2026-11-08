-- Migrasi 001: tabel dasar (users, settings).
-- Tabel lain ditambahkan pada fase yang memakainya.

CREATE TABLE users (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name          TEXT        NOT NULL,
  username      TEXT        NOT NULL,
  password_hash TEXT        NOT NULL,
  role          TEXT        NOT NULL CHECK (role IN ('ADMIN', 'PEMILIK')),
  is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Username tidak membedakan huruf besar/kecil.
CREATE UNIQUE INDEX users_username_lower_idx ON users (lower(username));

CREATE TABLE settings (
  key        TEXT        PRIMARY KEY,
  value      TEXT        NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO settings (key, value) VALUES
  ('liters_per_gallon', '19'),
  ('price_pickup',      '5000'),
  ('price_delivery',    '6000');
