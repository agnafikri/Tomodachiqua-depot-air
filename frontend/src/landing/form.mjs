// Perilaku formulir permintaan di landing page (tanpa kerangka kerja, supaya halaman tetap ringan).
import { waLink } from '../lib/whatsapp.mjs';
import { AREAS, SERVICE_TYPES, validateRequest } from './validate.mjs';

const TIMEOUT_MS = 25_000; // server gratis bisa lambat saat pertama diakses

const newId = () =>
  globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/[x]/g, () => Math.floor(Math.random() * 16).toString(16));

export function initForm({ root = document, fetchImpl = (...a) => fetch(...a), apiBase = '' } = {}) {
  const form = root.getElementById('request-form');
  if (!form) return null;
  const status = root.getElementById('form-status');
  const submit = root.getElementById('form-submit');
  const whatsapp = form.dataset.whatsapp ?? '';
  let requestId = newId(); // tetap sama saat kirim ulang setelah gagal: tidak ada permintaan ganda

  const showStatus = (tone, html) => {
    status.className = `rounded-xl px-4 py-3 text-sm font-medium ${tone === 'ok' ? 'bg-ok-soft text-ok' : 'bg-danger-soft text-danger'}`;
    status.innerHTML = html;
  };
  const setError = (name, message) => {
    const p = form.querySelector(`[data-error-for="${name}"]`);
    const input = form.elements[name];
    if (p) {
      p.textContent = message ?? '';
      p.classList.toggle('hidden', !message);
    }
    if (input) {
      if (message) input.setAttribute('aria-invalid', 'true');
      else input.removeAttribute('aria-invalid');
    }
  };
  const clearErrors = () => {
    ['name', 'phone', 'area', 'serviceType', 'address', 'message'].forEach((n) => setError(n, ''));
    status.className = 'hidden';
    status.textContent = '';
  };
  const values = () => ({
    name: form.elements.name.value,
    phone: form.elements.phone.value,
    area: form.elements.area.value,
    serviceType: form.elements.serviceType.value,
    address: form.elements.address.value,
    message: form.elements.message.value,
    website: form.elements.website.value,
  });

  // Jalur cadangan: bila server tidak terjangkau, pengunjung tetap bisa menghubungi lewat WhatsApp.
  const fallback = (v) => {
    if (!whatsapp) return '';
    const text = `Halo Tomodachiqua, saya ${v.name.trim()} (${AREAS[v.area] ?? ''}) ingin ${SERVICE_TYPES[v.serviceType]?.toLowerCase() ?? 'bertanya'}. ${v.address.trim() ? `Alamat: ${v.address.trim()}. ` : ''}${v.message.trim()}`.trim();
    return ` <a class="font-bold underline" href="${waLink(whatsapp, text)}" target="_blank" rel="noopener">Kirim lewat WhatsApp</a>`;
  };

  async function onSubmit(event) {
    event.preventDefault();
    clearErrors();
    const v = values();
    const errors = validateRequest(v);
    const names = Object.keys(errors);
    if (names.length) {
      names.forEach((n) => setError(n, errors[n]));
      form.elements[names[0]]?.focus();
      return;
    }

    submit.disabled = true;
    submit.textContent = 'Mengirim…';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetchImpl(`${apiBase}/api/public/service-requests`, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'tomodachiqua' },
        body: JSON.stringify({ ...v, address: v.address.trim(), message: v.message.trim(), clientRequestId: requestId }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        requestId = newId();
        form.reset();
        showStatus('ok', `Terima kasih, ${v.name.trim()}. Permintaan Anda sudah kami terima. Kami akan menghubungi Anda lewat WhatsApp.`);
        status.focus?.();
        return;
      }
      if (res.status === 400 && Array.isArray(data?.error?.details)) {
        data.error.details.forEach((d) => setError(d.field, d.message));
        showStatus('error', 'Periksa kembali isian yang ditandai.');
        return;
      }
      showStatus('error', `${data?.error?.message ?? 'Permintaan belum terkirim. Silakan coba lagi.'}${fallback(v)}`);
    } catch {
      showStatus('error', `Permintaan belum terkirim. Server sedang sibuk atau koneksi terputus. Coba kirim lagi sebentar lagi.${fallback(v)}`);
    } finally {
      clearTimeout(timer);
      submit.disabled = false;
      submit.textContent = 'Kirim permintaan';
    }
  }

  form.addEventListener('submit', onSubmit);
  return { onSubmit, form };
}
