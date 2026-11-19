// Tes landing page: HTML hasil render (konten, SEO, keamanan teks) dan perilaku formulir.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { content as defaultContent } from './content.mjs';
import { initForm } from './form.mjs';
import { esc, renderBody, renderHead } from './render.mjs';
import { validateRequest } from './validate.mjs';

const withWa = { ...defaultContent, whatsapp: '0812 3456 7890' };
const parse = (html) => new DOMParser().parseFromString(html, 'text/html');
const jsonLd = (head) => JSON.parse(/<script type="application\/ld\+json">(.*)<\/script>/s.exec(head)[1].replace(/\\u003c/g, '<'));

describe('render: isi halaman', () => {
  const doc = parse(`<body>${renderBody(defaultContent)}</body>`);

  it('memuat bagian-bagian utama dengan satu judul utama dan hierarki yang benar', () => {
    expect(doc.querySelectorAll('h1')).toHaveLength(1);
    expect(doc.querySelector('h1').textContent).toBe(defaultContent.hero.headline);
    for (const id of ['layanan', 'area', 'cara-kerja', 'faq', 'permintaan']) expect(doc.getElementById(id), id).toBeTruthy();
    expect(doc.querySelectorAll('#layanan li')).toHaveLength(defaultContent.services.length);
    expect(doc.querySelectorAll('#faq details')).toHaveLength(defaultContent.faq.length);
    expect(doc.querySelectorAll('#cara-kerja li')).toHaveLength(defaultContent.steps.length);
    for (const section of doc.querySelectorAll('section[aria-labelledby]')) {
      expect(doc.getElementById(section.getAttribute('aria-labelledby')), section.id).toBeTruthy();
    }
  });

  it('menyebut area layanan Bandung dan Cimahi', () => {
    expect(doc.getElementById('area').textContent).toContain('Kota Bandung');
    expect(doc.getElementById('area').textContent).toContain('Cimahi');
  });

  it('bagian tanpa data tidak tampil (testimoni, galeri, paket, tentang)', () => {
    for (const id of ['testimoni', 'galeri', 'paket', 'tentang']) expect(doc.getElementById(id), id).toBeNull();
  });

  it('tanpa nomor WhatsApp: tidak ada tombol WhatsApp, tombol utama menuju formulir', () => {
    expect(doc.querySelectorAll('a[href*="wa.me"]')).toHaveLength(0);
    expect(doc.querySelector('header a').getAttribute('href')).toBe('#atas');
    expect([...doc.querySelectorAll('a')].some((a) => a.getAttribute('href') === '#permintaan')).toBe(true);
  });

  it('formulir lengkap: semua kolom berlabel, kolom jebakan tersembunyi, catatan privasi, dan tautan masuk staf', () => {
    for (const name of ['name', 'phone', 'area', 'serviceType', 'address', 'message']) {
      const el = doc.querySelector(`[name="${name}"]`);
      expect(el, name).toBeTruthy();
      expect(doc.querySelector(`label[for="${el.id}"]`), `label ${name}`).toBeTruthy();
    }
    const trap = doc.querySelector('[name="website"]');
    expect(trap.getAttribute('tabindex')).toBe('-1');
    expect(trap.closest('[aria-hidden="true"]')).toBeTruthy();
    expect(doc.body.textContent).toMatch(/hanya dipakai untuk menghubungi Anda/);
    expect(doc.querySelector('footer a').getAttribute('href')).toBe('/app/login');
    expect(doc.querySelector('footer a').textContent).toBe('Masuk staf');
    expect(doc.querySelectorAll('#f-area option')).toHaveLength(4); // placeholder + 3 area
    expect(doc.querySelectorAll('#f-serviceType option')).toHaveLength(5);
  });

  it('tidak ada klaim yang tidak bisa dibuktikan dalam konten bawaan', () => {
    const text = doc.body.textContent.toLowerCase();
    for (const bad of ['garansi', 'bersertifikat', 'terpercaya', 'terbaik', 'pelanggan puas', 'ribuan', 'slhs', 'berpengalaman']) expect(text, bad).not.toContain(bad);
  });
});

describe('render: WhatsApp dan bagian opsional', () => {
  it('nomor WhatsApp diisi: tombol wa.me dengan pesan awal, nomor dinormalkan', () => {
    const doc = parse(`<body>${renderBody(withWa)}</body>`);
    const links = [...doc.querySelectorAll('a[href*="wa.me"]')];
    expect(links.length).toBeGreaterThanOrEqual(3);
    for (const a of links) {
      expect(a.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/6281234567890\?text=/);
      expect(a.getAttribute('rel')).toContain('noopener');
      expect(a.getAttribute('target')).toBe('_blank');
    }
    expect(doc.getElementById('request-form').dataset.whatsapp).toBe('0812 3456 7890');
  });

  it('testimoni, galeri, paket, tentang, kecamatan, kontak tampil bila diisi', () => {
    const rich = {
      ...withWa,
      about: 'Tentang kami.', districts: ['Coblong', 'Cicendo'], email: 'halo@contoh.id', address: 'Jl. Contoh 1', hours: 'Senin-Sabtu',
      packages: [{ title: 'Paket A', price: 'Rp 1.000.000', text: 'Isi paket' }],
      gallery: [{ src: '/foto-1.webp', alt: 'Instalasi depot di Cimahi' }],
      testimonials: [{ name: 'Bu Ani', text: 'Pengerjaan rapi.' }],
    };
    const doc = parse(`<body>${renderBody(rich)}</body>`);
    for (const id of ['tentang', 'paket', 'galeri', 'testimoni']) expect(doc.getElementById(id), id).toBeTruthy();
    expect(doc.getElementById('area').textContent).toContain('Coblong, Cicendo');
    expect(doc.getElementById('permintaan').textContent).toContain('halo@contoh.id');
    expect(doc.getElementById('permintaan').textContent).toContain('Senin-Sabtu');
    expect(doc.querySelector('#galeri img').getAttribute('alt')).toBe('Instalasi depot di Cimahi');
    expect(doc.querySelector('#galeri img').getAttribute('loading')).toBe('lazy');
  });

  it('nomor yang bukan nomor seluler Indonesia dianggap tidak ada (tidak membuat tautan rusak)', () => {
    const doc = parse(`<body>${renderBody({ ...defaultContent, whatsapp: '12345' })}</body>`);
    expect(doc.querySelectorAll('a[href*="wa.me"]')).toHaveLength(0);
  });
});

describe('render: keamanan teks', () => {
  const evil = { ...withWa, brand: 'A"B<script>alert(1)</script>', hero: { headline: '<img src=x onerror=alert(1)>', subtitle: "x' onmouseover='y" }, faq: [{ q: '<b>q</b>', a: '</details><script>1</script>' }] };

  it('semua teks konten di-escape di HTML', () => {
    const html = renderBody(evil);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<b>q</b>');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(parse(`<body>${html}</body>`).querySelectorAll('script')).toHaveLength(0);
  });

  it('JSON-LD tidak bisa menutup tag script dan tetap JSON yang valid', () => {
    const head = renderHead(evil, 'https://contoh.id');
    expect(head.match(/<script/g)).toHaveLength(1);
    expect(head.match(/<\/script>/g)).toHaveLength(1);
    expect(jsonLd(head).name).toBe(evil.brand);
  });

  it('esc menangani karakter khusus dan nilai kosong', () => {
    expect(esc(`<>&"'`)).toBe('&lt;&gt;&amp;&quot;&#39;');
    expect(esc(null)).toBe('');
  });
});

describe('render: SEO', () => {
  it('judul, deskripsi, Open Graph; kanonik hanya bila alamat situs diketahui', () => {
    const none = renderHead(defaultContent, '');
    expect(none).toContain(`<title>${defaultContent.title}</title>`);
    expect(none).toContain('name="description"');
    expect(none).toContain('property="og:title"');
    expect(none).not.toContain('rel="canonical"');
    expect(none).not.toContain('og:url');
    const site = renderHead(defaultContent, 'https://tomodachiqua.id/');
    expect(site).toContain('<link rel="canonical" href="https://tomodachiqua.id/" />');
    expect(site).toContain('content="https://tomodachiqua.id/"');
  });

  it('judul memuat kata kunci layanan dan kedua kota', () => {
    expect(defaultContent.title).toMatch(/Depot Air Isi Ulang/);
    expect(defaultContent.title).toMatch(/Bandung/);
    expect(defaultContent.title).toMatch(/Cimahi/);
    expect(defaultContent.title.length).toBeLessThanOrEqual(70);
    expect(defaultContent.description.length).toBeLessThanOrEqual(170);
  });

  it('JSON-LD LocalBusiness: area layanan, layanan, dan tanpa penilaian palsu', () => {
    const ld = jsonLd(renderHead(withWa, 'https://tomodachiqua.id'));
    expect(ld['@type']).toBe('LocalBusiness');
    expect(ld.areaServed.map((a) => a.name)).toEqual(['Bandung', 'Cimahi']);
    expect(ld.makesOffer).toHaveLength(defaultContent.services.length);
    expect(ld.telephone).toBe('+6281234567890');
    expect(ld.url).toBe('https://tomodachiqua.id/');
    expect(ld.aggregateRating).toBeUndefined();
    expect(ld.review).toBeUndefined();
    const bare = jsonLd(renderHead(defaultContent, ''));
    expect(bare.telephone).toBeUndefined();
    expect(bare.url).toBeUndefined();
  });
});

describe('validasi formulir', () => {
  const ok = { name: 'Bu Rina', phone: '0812 3456 7890', area: 'BANDUNG', serviceType: 'PASANG', address: '', message: '' };
  it('isian benar tidak menghasilkan galat; tiap kolom salah dilaporkan', () => {
    expect(validateRequest(ok)).toEqual({});
    expect(Object.keys(validateRequest({ ...ok, name: 'A' }))).toEqual(['name']);
    expect(Object.keys(validateRequest({ ...ok, phone: '021 123' }))).toEqual(['phone']);
    expect(Object.keys(validateRequest({ ...ok, area: '' }))).toEqual(['area']);
    expect(Object.keys(validateRequest({ ...ok, serviceType: 'X' }))).toEqual(['serviceType']);
    expect(Object.keys(validateRequest({ ...ok, address: 'x'.repeat(301) }))).toEqual(['address']);
    expect(Object.keys(validateRequest({ ...ok, message: 'x'.repeat(1001) }))).toEqual(['message']);
    expect(Object.keys(validateRequest({}))).toEqual(['name', 'phone', 'area', 'serviceType']);
  });
});

describe('perilaku formulir', () => {
  let fetchImpl;
  const fill = (over = {}) => {
    const v = { name: 'Bu Rina', phone: '0812 3456 7890', area: 'CIMAHI', serviceType: 'PASANG', address: 'Jl. Contoh', message: 'Mau pasang depot', ...over };
    for (const [k, val] of Object.entries(v)) document.querySelector(`[name="${k}"]`).value = val;
  };
  const submit = () => document.getElementById('request-form').dispatchEvent(new Event('submit', { cancelable: true }));
  const flush = () => new Promise((r) => setTimeout(r, 0));
  const res = (status, body) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });

  function setup(content = defaultContent) {
    document.body.innerHTML = renderBody(content);
    fetchImpl = vi.fn(() => res(201, { ok: true }));
    return initForm({ root: document, fetchImpl, apiBase: '' });
  }
  beforeEach(() => setup());
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('isian salah: galat tampil di kolomnya, fokus ke kolom pertama yang salah, tidak ada permintaan', () => {
    fill({ name: '', phone: '123' });
    submit();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(document.querySelector('[data-error-for="name"]').textContent).toMatch(/Isi nama/);
    expect(document.querySelector('[data-error-for="phone"]').textContent).toMatch(/nomor WhatsApp/);
    expect(document.querySelector('[data-error-for="name"]').classList.contains('hidden')).toBe(false);
    expect(document.querySelector('[name="name"]').getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(document.querySelector('[name="name"]'));
  });

  it('berhasil: mengirim JSON ke endpoint publik dengan header pengaman, lalu menampilkan terima kasih dan mengosongkan formulir', async () => {
    fill();
    submit();
    expect(document.getElementById('form-submit').disabled).toBe(true);
    expect(document.getElementById('form-submit').textContent).toBe('Mengirim…');
    await flush();
    const [url, opts] = fetchImpl.mock.calls[0];
    expect(url).toBe('/api/public/service-requests');
    expect(opts.method).toBe('POST');
    expect(opts.headers['X-Requested-With']).toBe('tomodachiqua');
    const body = JSON.parse(opts.body);
    expect(body).toMatchObject({ name: 'Bu Rina', phone: '0812 3456 7890', area: 'CIMAHI', serviceType: 'PASANG', address: 'Jl. Contoh', message: 'Mau pasang depot', website: '' });
    expect(body.clientRequestId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(document.getElementById('form-status').textContent).toMatch(/Terima kasih, Bu Rina/);
    expect(document.querySelector('[name="name"]').value).toBe('');
    expect(document.getElementById('form-submit').disabled).toBe(false);
    expect(document.getElementById('form-submit').textContent).toBe('Kirim permintaan');
  });

  it('galat validasi dari server dipetakan ke kolomnya', async () => {
    fetchImpl.mockImplementation(() => res(400, { error: { code: 'VALIDATION_ERROR', message: 'x', details: [{ field: 'phone', message: 'Nomor tidak valid dari server.' }] } }));
    fill();
    submit();
    await flush();
    expect(document.querySelector('[data-error-for="phone"]').textContent).toBe('Nomor tidak valid dari server.');
    expect(document.getElementById('form-status').textContent).toMatch(/Periksa kembali/);
  });

  it('terlalu banyak permintaan (429): pesan server tampil; WhatsApp sebagai jalur lain bila ada', async () => {
    fetchImpl.mockImplementation(() => res(429, { error: { code: 'TOO_MANY_REQUESTS', message: 'Terlalu banyak permintaan. Silakan hubungi kami lewat WhatsApp.' } }));
    setup(withWa);
    fetchImpl.mockImplementation(() => res(429, { error: { code: 'TOO_MANY_REQUESTS', message: 'Terlalu banyak permintaan. Silakan hubungi kami lewat WhatsApp.' } }));
    fill();
    submit();
    await flush();
    const status = document.getElementById('form-status');
    expect(status.textContent).toMatch(/Terlalu banyak permintaan/);
    expect(status.querySelector('a').getAttribute('href')).toMatch(/^https:\/\/wa\.me\/6281234567890\?text=/);
  });

  it('koneksi gagal: pesan jelas, tombol aktif kembali, kirim ulang memakai clientRequestId yang sama, WhatsApp berisi data pengunjung', async () => {
    setup(withWa);
    fetchImpl.mockImplementationOnce(() => Promise.reject(new TypeError('Failed to fetch')));
    fill();
    submit();
    await flush();
    const status = document.getElementById('form-status');
    expect(status.textContent).toMatch(/belum terkirim/);
    expect(document.getElementById('form-submit').disabled).toBe(false);
    const wa = decodeURIComponent(status.querySelector('a').getAttribute('href'));
    expect(wa).toContain('Bu Rina');
    expect(wa).toContain('pemasangan depot baru');
    expect(wa).toContain('Jl. Contoh');
    expect(document.querySelector('[name="name"]').value).toBe('Bu Rina'); // isian tidak hilang

    submit(); // coba lagi
    await flush();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const ids = fetchImpl.mock.calls.map(([, o]) => JSON.parse(o.body).clientRequestId);
    expect(ids[1]).toBe(ids[0]);
    expect(document.getElementById('form-status').textContent).toMatch(/Terima kasih/);
  });

  it('tanpa nomor WhatsApp: tidak ada tautan cadangan', async () => {
    fetchImpl.mockImplementationOnce(() => Promise.reject(new TypeError('Failed to fetch')));
    fill();
    submit();
    await flush();
    expect(document.getElementById('form-status').querySelector('a')).toBeNull();
  });

  it('permintaan baru setelah berhasil memakai clientRequestId baru', async () => {
    fill();
    submit();
    await flush();
    fill({ name: 'Pak Budi' });
    submit();
    await flush();
    const ids = fetchImpl.mock.calls.map(([, o]) => JSON.parse(o.body).clientRequestId);
    expect(ids[1]).not.toBe(ids[0]);
  });

  it('tidak ada formulir di halaman: initForm tidak melakukan apa-apa', () => {
    document.body.innerHTML = '<p>kosong</p>';
    expect(initForm({ root: document })).toBeNull();
  });
});
