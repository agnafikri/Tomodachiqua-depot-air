# CLAUDE.md — Konfigurasi Claude Code

## Project Context
**App:** Tomodachiqua Depot — Web App Manajemen Depot Air Isi Ulang
**Stack:** React + Vite + Tailwind CSS • Node.js + Express (`.mjs`) • PostgreSQL (Neon)
**Stage:** MVP Development

## Directives
1. **Master Plan:** Baca `AGENTS.md` terlebih dahulu untuk phase dan tugas aktif.
2. **Dokumentasi:** Lihat `agent_docs/` untuk detail.
3. **Plan-First:** Usulkan rencana, tunggu persetujuan, lalu bangun.
4. **Incremental:** Satu fitur per sesi; uji sebelum lanjut.
5. **Aturan wajib:** file backend `.mjs`, `backend/` dan `frontend/` terpisah, role `ADMIN`/`PEMILIK`, entry `server.mjs`.
6. **PostgreSQL:** pemilik belum berpengalaman; jelaskan dan konfirmasi tiap langkah database.
7. Perbarui `AGENTS.md` (Current State, Roadmap) setelah tiap fitur.

## Commands
- `cd backend && npm run dev` • `npm test` • `npm run migrate` • `npm run seed`
- `cd frontend && npm run dev` • `npm run build` • `npm run lint`
