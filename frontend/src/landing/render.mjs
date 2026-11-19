// Membuat HTML landing page dari content.mjs (dipanggil saat build/dev, hasilnya statis agar cepat dan ramah Google).
// Semua teks dari konten di-escape. Bagian tanpa data tidak ditampilkan.
import { waLink } from '../lib/whatsapp.mjs';
import { normalizePhone } from '../lib/phone.mjs';
import { AREAS, SERVICE_TYPES } from './validate.mjs';

export const esc = (v) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const DROP = '<svg viewBox="0 0 64 64" class="size-6" aria-hidden="true"><path d="M32 12c8 10 14 17 14 25a14 14 0 0 1-28 0c0-8 6-15 14-25z" fill="currentColor"/></svg>';
const MARK = '<svg viewBox="0 0 64 64" class="size-9 shrink-0" aria-hidden="true"><rect width="64" height="64" rx="16" fill="#0B5FA5"/><path d="M32 12c8 10 14 17 14 25a14 14 0 0 1-28 0c0-8 6-15 14-25z" fill="#fff"/></svg>';
const RIPPLES = `<svg class="pointer-events-none absolute inset-0 size-full" viewBox="0 0 400 400" fill="none" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${[40, 90, 145, 205, 270, 340]
  .map((r, i) => `<circle cx="320" cy="330" r="${r}" stroke="#fff" stroke-opacity="${(0.2 - i * 0.025).toFixed(3)}" stroke-width="2"/>`)
  .join('')}</svg>`;

const BTN = 'inline-flex min-h-12 items-center justify-center rounded-xl px-6 text-base font-bold transition-colors';
const BTN_WHITE = `${BTN} bg-white text-brand-deep hover:bg-brand-soft`;
const BTN_OUTLINE = `${BTN} border border-white/60 text-white hover:bg-white/10`;
const BTN_BRAND = `${BTN} bg-brand text-white hover:bg-brand-dark`;
const FIELD = 'block min-h-12 w-full rounded-xl border border-line bg-white px-4 text-base text-ink placeholder:text-muted/70';

const WA_HELLO = 'Halo Tomodachiqua, saya ingin bertanya tentang pemasangan atau service depot air isi ulang.';

// ---------- <head> ----------

export function renderHead(c, siteUrl = '') {
  const url = siteUrl ? `${siteUrl.replace(/\/$/, '')}/` : '';
  const phone = normalizePhone(c.whatsapp);
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: c.brand,
    description: c.description,
    areaServed: c.areas.map((a) => ({ '@type': 'City', name: a.replace(/^Kota\s+/i, '') })),
    makesOffer: c.services.map((s) => ({ '@type': 'Offer', itemOffered: { '@type': 'Service', name: s.title, description: s.text } })),
    ...(url ? { url } : {}),
    ...(phone ? { telephone: `+${phone}` } : {}),
    ...(c.email ? { email: c.email } : {}),
    ...(c.address ? { address: { '@type': 'PostalAddress', streetAddress: c.address, addressCountry: 'ID' } } : {}),
  };
  return [
    `<title>${esc(c.title)}</title>`,
    `<meta name="description" content="${esc(c.description)}" />`,
    url ? `<link rel="canonical" href="${esc(url)}" />` : '',
    `<meta property="og:type" content="website" />`,
    `<meta property="og:locale" content="id_ID" />`,
    `<meta property="og:site_name" content="${esc(c.brand)}" />`,
    `<meta property="og:title" content="${esc(c.title)}" />`,
    `<meta property="og:description" content="${esc(c.description)}" />`,
    url ? `<meta property="og:url" content="${esc(url)}" />` : '',
    `<meta name="twitter:card" content="summary" />`,
    // < di-escape agar teks konten tidak bisa menutup tag script
    `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>`,
  ]
    .filter(Boolean)
    .join('\n    ');
}

// ---------- <body> ----------

function section(id, title, inner, { alt = false } = {}) {
  return `<section id="${id}" class="scroll-mt-20 ${alt ? 'bg-white' : ''} px-5 py-14 lg:py-20" aria-labelledby="${id}-title">
      <div class="mx-auto max-w-5xl">
        <h2 id="${id}-title" class="text-3xl font-extrabold tracking-tight text-ink lg:text-4xl">${esc(title)}</h2>
        ${inner}
      </div>
    </section>`;
}

export function renderBody(c) {
  const wa = c.whatsapp && normalizePhone(c.whatsapp) ? waLink(c.whatsapp, WA_HELLO) : '';
  const waBtn = (cls) => (wa ? `<a href="${esc(wa)}" target="_blank" rel="noopener" class="${cls}">Chat WhatsApp</a>` : '');

  const header = `<header class="sticky top-0 z-30 border-b border-line bg-white/95 px-5 backdrop-blur">
      <div class="mx-auto flex max-w-5xl items-center justify-between gap-3 py-3">
        <a href="#atas" class="flex min-w-0 items-center gap-2.5" aria-label="${esc(c.brand)}, ke atas halaman">
          ${MARK}
          <span class="truncate text-lg font-extrabold tracking-tight text-brand-deep sm:text-xl">${esc(c.brand)}</span>
        </a>
        <a href="${wa ? esc(wa) : '#permintaan'}" ${wa ? 'target="_blank" rel="noopener"' : ''} class="${BTN_BRAND} min-h-11 shrink-0 whitespace-nowrap px-4 text-sm">${wa ? '<span class="sm:hidden">WhatsApp</span><span class="hidden sm:inline">Chat WhatsApp</span>' : '<span class="sm:hidden">Penawaran</span><span class="hidden sm:inline">Minta penawaran</span>'}</a>
      </div>
    </header>`;

  const hero = `<section id="atas" class="relative overflow-hidden bg-brand px-5 pt-14 pb-20 text-white lg:pt-24 lg:pb-28">
      ${RIPPLES}
      <div class="relative mx-auto max-w-5xl">
        <p class="mb-3 text-base font-semibold text-white/85">${esc(c.areas.join(' dan '))}</p>
        <h1 class="max-w-2xl text-4xl font-extrabold tracking-tight lg:text-6xl">${esc(c.hero.headline)}</h1>
        <p class="mt-5 max-w-xl text-lg text-white/90">${esc(c.hero.subtitle)}</p>
        <div class="mt-8 flex flex-col gap-3 sm:flex-row">
          ${wa ? waBtn(BTN_WHITE) : ''}
          <a href="#permintaan" class="${wa ? BTN_OUTLINE : BTN_WHITE}">Minta penawaran</a>
        </div>
      </div>
    </section>`;

  const services = section(
    'layanan',
    'Layanan kami',
    `<ul class="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        ${c.services
          .map(
            (s) => `<li class="rounded-2xl border border-line bg-white p-5">
          <span class="mb-3 flex size-11 items-center justify-center rounded-xl bg-brand-soft text-brand">${DROP}</span>
          <h3 class="text-xl font-extrabold text-ink">${esc(s.title)}</h3>
          <p class="mt-1 text-base text-muted">${esc(s.text)}</p>
        </li>`,
          )
          .join('')}
      </ul>`,
  );

  const areas = section(
    'area',
    'Area layanan',
    `<ul class="mt-6 flex flex-wrap gap-2">${c.areas.map((a) => `<li class="rounded-full bg-brand-soft px-4 py-2 text-base font-bold text-brand-dark">${esc(a)}</li>`).join('')}</ul>
      ${c.districts.length ? `<p class="mt-5 text-base text-muted">Termasuk kecamatan: ${esc(c.districts.join(', '))}.</p>` : ''}
      <p class="mt-4 text-base text-muted">Di luar area ini? Tanyakan lewat formulir di bawah.</p>`,
    { alt: true },
  );

  const about = c.about ? section('tentang', `Tentang ${c.brand}`, `<p class="mt-5 max-w-2xl text-lg text-muted">${esc(c.about)}</p>`) : '';

  const steps = section(
    'cara-kerja',
    'Cara kerja',
    `<ol class="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        ${c.steps
          .map(
            (s, i) => `<li class="rounded-2xl bg-white p-5 border border-line">
          <span class="mb-3 flex size-10 items-center justify-center rounded-full bg-brand text-lg font-extrabold text-white" aria-hidden="true">${i + 1}</span>
          <h3 class="text-lg font-extrabold text-ink">${esc(s.title)}</h3>
          <p class="mt-1 text-base text-muted">${esc(s.text)}</p>
        </li>`,
          )
          .join('')}
      </ol>`,
  );

  const packages = c.packages.length
    ? section(
        'paket',
        'Paket dan harga',
        `<ul class="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">${c.packages
          .map((p) => `<li class="rounded-2xl border border-line bg-white p-5"><h3 class="text-xl font-extrabold text-ink">${esc(p.title)}</h3>${p.price ? `<p class="mt-1 text-2xl font-extrabold text-brand-deep">${esc(p.price)}</p>` : ''}<p class="mt-2 text-base text-muted">${esc(p.text)}</p></li>`)
          .join('')}</ul>`,
        { alt: true },
      )
    : '';

  const gallery = c.gallery.length
    ? section(
        'galeri',
        'Hasil pekerjaan',
        `<ul class="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-3">${c.gallery
          .map((g) => `<li><img src="${esc(g.src)}" alt="${esc(g.alt)}" loading="lazy" decoding="async" class="aspect-[4/3] w-full rounded-2xl object-cover" /></li>`)
          .join('')}</ul>`,
      )
    : '';

  const testimonials = c.testimonials.length
    ? section(
        'testimoni',
        'Kata pelanggan',
        `<ul class="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">${c.testimonials
          .map((t) => `<li class="rounded-2xl border border-line bg-white p-5"><p class="text-base text-ink">“${esc(t.text)}”</p><p class="mt-3 text-sm font-bold text-muted">${esc(t.name)}</p></li>`)
          .join('')}</ul>`,
        { alt: true },
      )
    : '';

  const faq = section(
    'faq',
    'Pertanyaan yang sering diajukan',
    `<div class="mt-8 divide-y divide-line rounded-2xl border border-line bg-white">
        ${c.faq
          .map(
            (f) => `<details class="group p-5">
          <summary class="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-lg font-bold text-ink">
            ${esc(f.q)}<span class="text-2xl text-brand transition-transform group-open:rotate-45" aria-hidden="true">+</span>
          </summary>
          <p class="mt-2 text-base text-muted">${esc(f.a)}</p>
        </details>`,
          )
          .join('')}
      </div>`,
    { alt: true },
  );

  const contactLines = [
    wa ? `<p><span class="font-bold text-ink">WhatsApp:</span> <a class="font-semibold text-brand underline underline-offset-4" href="${esc(wa)}" target="_blank" rel="noopener">${esc(c.whatsapp)}</a></p>` : '',
    c.email ? `<p><span class="font-bold text-ink">Email:</span> <a class="font-semibold text-brand underline underline-offset-4" href="mailto:${esc(c.email)}">${esc(c.email)}</a></p>` : '',
    c.address ? `<p><span class="font-bold text-ink">Alamat:</span> ${esc(c.address)}</p>` : '',
    c.hours ? `<p><span class="font-bold text-ink">Jam layanan:</span> ${esc(c.hours)}</p>` : '',
  ].filter(Boolean);

  const form = `<section id="permintaan" class="scroll-mt-20 px-5 py-14 lg:py-20" aria-labelledby="permintaan-title">
      <div class="mx-auto grid max-w-5xl grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div>
          <h2 id="permintaan-title" class="text-3xl font-extrabold tracking-tight text-ink lg:text-4xl">Minta penawaran atau jadwalkan service</h2>
          <p class="mt-4 text-lg text-muted">Isi formulir singkat ini. Kami akan menghubungi Anda lewat WhatsApp.</p>
          ${contactLines.length ? `<div class="mt-6 space-y-2 text-base text-muted">${contactLines.join('')}</div>` : ''}
        </div>
        <div class="rounded-2xl border border-line bg-white p-5 lg:p-6">
          <form id="request-form" novalidate class="space-y-4" data-whatsapp="${esc(c.whatsapp)}">
            <div id="form-status" role="status" aria-live="polite" class="hidden rounded-xl px-4 py-3 text-sm font-medium"></div>
            ${field('name', 'Nama', `<input id="f-name" name="name" type="text" autocomplete="name" maxlength="100" class="${FIELD}" />`)}
            ${field('phone', 'Nomor WhatsApp', `<input id="f-phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="0812 3456 7890" class="${FIELD}" />`)}
            ${field('area', 'Area', select('f-area', 'area', 'Pilih area', AREAS))}
            ${field('serviceType', 'Jenis layanan', select('f-serviceType', 'serviceType', 'Pilih jenis layanan', SERVICE_TYPES))}
            ${field('address', 'Alamat singkat (boleh kosong)', `<input id="f-address" name="address" type="text" autocomplete="street-address" maxlength="300" placeholder="Mis. Jl. Contoh, Kecamatan Coblong" class="${FIELD}" />`)}
            ${field('message', 'Keterangan (boleh kosong)', `<textarea id="f-message" name="message" rows="3" maxlength="1000" placeholder="Ceritakan kebutuhan Anda" class="${FIELD} py-3"></textarea>`)}
            <div class="absolute -left-[9999px] h-0 w-0 overflow-hidden" aria-hidden="true">
              <label>Jangan diisi<input type="text" name="website" tabindex="-1" autocomplete="off" /></label>
            </div>
            <button type="submit" id="form-submit" class="${BTN_BRAND} w-full">Kirim permintaan</button>
            <p class="text-sm text-muted">Data Anda hanya dipakai untuk menghubungi Anda terkait permintaan ini.</p>
          </form>
        </div>
      </div>
    </section>`;

  const footer = `<footer class="border-t border-line bg-white px-5 py-8">
      <div class="mx-auto flex max-w-5xl flex-col gap-2 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
        <p>${esc(c.brand)} · ${esc(c.areas.join(', '))}</p>
        <a href="/app/login" class="min-h-11 py-2 font-semibold text-muted underline underline-offset-4 hover:text-brand">Masuk staf</a>
      </div>
    </footer>`;

  return [header, `<main>`, hero, services, areas, about, steps, packages, gallery, testimonials, faq, form, `</main>`, footer].filter(Boolean).join('\n    ');
}

function field(name, label, control) {
  return `<div>
              <label for="f-${name}" class="mb-1.5 block text-sm font-semibold text-ink">${esc(label)}</label>
              ${control}
              <p data-error-for="${name}" class="mt-1.5 hidden text-sm font-medium text-danger"></p>
            </div>`;
}

function select(id, name, placeholder, options) {
  return `<select id="${id}" name="${name}" class="${FIELD}"><option value="">${esc(placeholder)}</option>${Object.entries(options)
    .map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`)
    .join('')}</select>`;
}
