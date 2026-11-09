import { z } from 'zod';
import { jakartaDate } from '../services/clock.mjs';
import { isCalendarDate } from '../services/dates.mjs';
import { PERIODS } from '../services/period.mjs';

// Tanggal acuan periode: tanggal kalender valid dan tidak di masa depan. Kosong = hari ini (jam server).
export const periodQuery = z.object({
  period: z.enum(PERIODS).default('daily'),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal YYYY-MM-DD.')
    .refine(isCalendarDate, 'Tanggal tidak valid.')
    .refine((d) => d <= jakartaDate(), 'Tanggal tidak boleh di masa depan.')
    .optional(),
});
