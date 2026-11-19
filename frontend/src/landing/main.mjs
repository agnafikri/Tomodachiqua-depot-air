import './landing.css';
import { initForm } from './form.mjs';

initForm({ apiBase: (import.meta.env.VITE_API_URL || '').replace(/\/$/, '') });
