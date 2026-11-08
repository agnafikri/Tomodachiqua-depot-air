// Membuat (atau memperbarui) akun ADMIN dan PEMILIK dari backend/.env.
// Aman dijalankan berulang: username yang sama hanya diperbarui nama, peran, dan password-nya.
import '../config/env.mjs';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { pool } from './pool.mjs';

const accountSchema = z.object({
  name: z.string().min(1),
  username: z.string().min(3, 'username minimal 3 karakter'),
  password: z.string().min(8, 'password minimal 8 karakter'),
});

const accounts = [
  {
    role: 'ADMIN',
    name: process.env.SEED_ADMIN_NAME || 'Admin',
    username: process.env.SEED_ADMIN_USERNAME,
    password: process.env.SEED_ADMIN_PASSWORD,
  },
  {
    role: 'PEMILIK',
    name: process.env.SEED_PEMILIK_NAME || 'Pemilik',
    username: process.env.SEED_PEMILIK_USERNAME,
    password: process.env.SEED_PEMILIK_PASSWORD,
  },
];

async function main() {
  for (const acc of accounts) {
    const check = accountSchema.safeParse(acc);
    if (!check.success) {
      const detail = check.error.issues.map((i) => `${i.path[0]}: ${i.message}`).join('; ');
      throw new Error(
        `Data akun ${acc.role} belum lengkap di backend/.env (SEED_${acc.role}_USERNAME / SEED_${acc.role}_PASSWORD). ${detail}`,
      );
    }
  }

  for (const acc of accounts) {
    const hash = await bcrypt.hash(acc.password, 12);
    await pool.query(
      `INSERT INTO users (name, username, password_hash, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT ((lower(username)))
       DO UPDATE SET name = EXCLUDED.name,
                     password_hash = EXCLUDED.password_hash,
                     role = EXCLUDED.role,
                     is_active = TRUE`,
      [acc.name, acc.username, hash, acc.role],
    );
    console.log(`- ${acc.role}: akun "${acc.username}" siap dipakai`);
  }
  console.log('Seed selesai.');
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
