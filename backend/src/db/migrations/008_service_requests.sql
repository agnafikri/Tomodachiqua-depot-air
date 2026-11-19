-- Migrasi 008: permintaan layanan (pemasangan/service depot) dari formulir di landing page publik.
CREATE TABLE service_requests (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name              TEXT        NOT NULL,
  phone             TEXT        NOT NULL,                      -- format 628xxxxxxxxxx (siap untuk wa.me)
  area              TEXT        NOT NULL CHECK (area IN ('BANDUNG', 'CIMAHI', 'LAINNYA')),
  service_type      TEXT        NOT NULL CHECK (service_type IN ('PASANG', 'SERVICE', 'PERBAIKAN', 'KONSULTASI')),
  address           TEXT,
  message           TEXT,
  status            TEXT        NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW', 'CONTACTED', 'SURVEY', 'DONE', 'CANCELLED')),
  internal_note     TEXT,                                      -- catatan internal, tidak tampil ke pengunjung
  ip_hash           TEXT,                                      -- hash singkat IP (untuk melacak spam), bukan IP asli
  client_request_id UUID        UNIQUE,                        -- mencegah kiriman ganda dari satu formulir
  created_at        TIMESTAMPTZ NOT NULL,
  updated_at        TIMESTAMPTZ NOT NULL,
  contacted_at      TIMESTAMPTZ,
  updated_by        BIGINT      REFERENCES users (id)
);

CREATE INDEX service_requests_status_created_idx ON service_requests (status, created_at DESC);
