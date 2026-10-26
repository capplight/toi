/* «Той» · публичный сайт — скрипт ТОЛЬКО для макетов.
   1) спрайт иконок (Lucide ISC; WhatsApp — Simple Icons CC0) — в продукте это инлайновые SVG-компоненты;
   2) состояния из #hash: #menu #filter #filtered #copied #copy-fail #faq #calc #toc;
   3) островки, которые будут клиентскими в продукте (≤ 15 КБ вместе): «Көшіру», фильтр тілек,
      липкий CTA, подсветка оглавления. Без JS страница полностью читается: тексты видны, меню и FAQ — <details>. */
(function () {
  const I = {
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    copy: '<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    right: '<path d="m9 18 6-6-6-6"/>',
    arrow: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    bulb: '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>',
    quote: '<path d="M3 21c3 0 7-1 7-8V5c0-1.25-.76-2-2-2H4c-1.25 0-2 .75-2 2v6c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 0-1 1v3c0 1 0 1 1 1z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.76-2-2-2h-4c-1.25 0-2 .75-2 2v6c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"/>',
    book: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
    split: '<path d="M16 3h5v5"/><path d="M8 3H3v5"/><path d="M12 22v-8.3a4 4 0 0 0-1.17-2.87L3 3"/><path d="m15 9 6-6"/>',
    ext: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
    printer: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
    grid: '<circle cx="7" cy="7" r="3.2"/><circle cx="17" cy="7" r="3.2"/><circle cx="7" cy="17" r="3.2"/><circle cx="17" cy="17" r="3.2"/>',
    door: '<path d="M13 4h3a2 2 0 0 1 2 2v14"/><path d="M2 20h3"/><path d="M13 20h9"/><path d="M10 12v.01"/><path d="M13 4.56v16.16a1 1 0 0 1-1.24.97L5 20V5.56a2 2 0 0 1 1.52-1.94l4-1A2 2 0 0 1 13 4.56Z"/>',
    music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
    phone: '<rect width="14" height="20" x="5" y="2" rx="2"/><path d="M12 18h.01"/>',
    offline: '<path d="M12 20h.01"/><path d="M8.5 16.43a5 5 0 0 1 7 0"/><path d="M2 8.82a15 15 0 0 1 4.18-2.64"/><path d="M22 8.82a15 15 0 0 0-11.29-3.76"/><path d="m2 2 20 20"/>',
    heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
    wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
    list: '<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>',
    calc: '<rect width="16" height="20" x="4" y="2" rx="2"/><path d="M8 6h8"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01M8 10h.01M12 10h.01M16 10h.01"/>',
    play: '<path d="M7 4.5v15l12-7.5z"/>',
    mail: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
    filter: '<path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"/>',
    up: '<path d="m18 15-6-6-6 6"/>'
  };
  const WA = '<path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.16-.17.2-.35.22-.64.07-.3-.15-1.26-.46-2.39-1.47-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.6.13-.14.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.61-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.07c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.7.63.71.22 1.36.19 1.87.12.57-.09 1.76-.72 2-1.41.25-.7.25-1.29.18-1.41-.08-.13-.27-.2-.57-.35m-5.42 7.4h-.01a9.87 9.87 0 0 1-5.03-1.38l-.36-.21-3.74.98 1-3.65-.24-.37a9.86 9.86 0 0 1-1.51-5.26c0-5.45 4.44-9.88 9.89-9.88 2.64 0 5.12 1.03 6.99 2.9a9.83 9.83 0 0 1 2.89 6.99c0 5.45-4.44 9.88-9.88 9.88m8.41-18.3A11.82 11.82 0 0 0 12.05 0C5.5 0 .16 5.34.16 11.89c0 2.1.55 4.14 1.59 5.95L.06 24l6.3-1.65a11.88 11.88 0 0 0 5.68 1.45h.01c6.55 0 11.89-5.34 11.89-11.89 0-3.18-1.24-6.17-3.48-8.41z"/>';
  const SHANYRAQ = '<circle r="40"/><circle r="34"/><path d="M-13 -31.4 Q-18 0 -13 31.4 M13 -31.4 Q18 0 13 31.4 M-31.4 -13 Q0 -18 31.4 -13 M-31.4 13 Q0 18 31.4 13"/>' +
    Array.from({ length: 32 }, (_, i) => { const a = i * Math.PI / 16, r1 = 45, r2 = i % 2 ? 54 : 62; return `<path d="M${(r1 * Math.cos(a)).toFixed(2)} ${(r1 * Math.sin(a)).toFixed(2)} L${(r2 * Math.cos(a)).toFixed(2)} ${(r2 * Math.sin(a)).toFixed(2)}"/>`; }).join('');
  const KOSHKAR = '<path d="M-28 0 H-12 M12 0 H28"/><path d="M0 4 C-3 -6 -16 -8 -16 1 C-16 7 -9 8 -7 3 M0 4 C3 -6 16 -8 16 1 C16 7 9 8 7 3"/>';

  let s = '<svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true">';
  for (const k in I) s += `<symbol id="i-${k}" viewBox="0 0 24 24">${I[k]}</symbol>`;
  s += `<symbol id="i-wa" viewBox="0 0 24 24">${WA}</symbol>`;
  s += `<symbol id="o-shanyraq" viewBox="-64 -64 128 128">${SHANYRAQ}</symbol>`;
  s += `<symbol id="o-koshkar" viewBox="-30 -12 60 24">${KOSHKAR}</symbol></svg>`;
  document.body.insertAdjacentHTML('afterbegin', s);

  const $ = (q, r = document) => r.querySelector(q), $$ = (q, r = document) => [...r.querySelectorAll(q)];
  const state = (location.hash || '').slice(1);
  document.documentElement.dataset.state = state;
  const lang = document.documentElement.lang;
  const T = lang === 'ru'
    ? { copied: 'Скопировано', copiedToast: 'Текст скопирован. Вставьте его в WhatsApp или SMS.', fail: 'Не удалось скопировать. Нажмите на текст и удерживайте — появится «Копировать».', shown: (n, t) => `Показано: ${n} из ${t}` }
    : { copied: 'Көшірілді', copiedToast: 'Тілек көшірілді. Енді WhatsApp-қа немесе SMS-ке қоя аласыз.', fail: 'Көшірілмеді. Мәтінді басып тұрыңыз — «Көшіру» шығады.', shown: (n, t) => `Көрсетілді: ${n} / ${t}` };

  /* ---------- Тост ---------- */
  const toast = $('#toast');
  let tt;
  function showToast(msg, ok = true) {
    if (!toast) return;
    toast.querySelector('.msg').textContent = msg;
    toast.querySelector('use').setAttribute('href', ok ? '#i-check' : '#i-info');
    toast.hidden = false; clearTimeout(tt);
    if (!['copied', 'copy-fail'].includes(state)) tt = setTimeout(() => (toast.hidden = true), 3000);
  }

  /* ---------- «Көшіру» ---------- */
  function markCopied(btn) {
    const card = btn.closest('.tcard'); const label = btn.querySelector('.lbl');
    btn.classList.add('is-copied'); card && card.classList.add('is-copied');
    btn.querySelector('use').setAttribute('href', '#i-check');
    const old = label.textContent; label.textContent = T.copied;
    if (state !== 'copied') setTimeout(() => { btn.classList.remove('is-copied'); card && card.classList.remove('is-copied'); label.textContent = old; btn.querySelector('use').setAttribute('href', '#i-copy'); }, 2500);
  }
  $$('[data-copy]').forEach(btn => btn.addEventListener('click', async () => {
    const text = btn.closest('.tcard').querySelector('.tcard-text').innerText.trim();
    try { await navigator.clipboard.writeText(text); markCopied(btn); showToast(T.copiedToast); }
    catch (e) { showToast(T.fail, false); }
  }));
  /* WhatsApp: в href только ссылка на карточку; по нажатию — текст тілек + ссылка */
  $$('[data-wa]').forEach(a => a.addEventListener('click', () => {
    const text = a.closest('.tcard').querySelector('.tcard-text').innerText.trim();
    const link = decodeURIComponent(a.href.split('text=')[1] || '').split('\n').pop();
    a.href = 'https://wa.me/?text=' + encodeURIComponent(text + '\n\n' + link);
  }));
  if (state === 'copied') { const b = $('[data-copy]'); if (b) { markCopied(b); showToast(T.copiedToast); } }
  if (state === 'copy-fail') showToast(T.fail, false);

  /* ---------- Фильтр тілек ---------- */
  const filter = $('[data-filter]');
  if (filter) {
    const cards = $$('.tcard[data-who]'); const total = cards.length;
    const out = $('[data-filter-count]'); const sumCount = $('[data-filter-sum]');
    const sel = { who: 'all', len: 'all' };
    function apply() {
      let n = 0;
      cards.forEach(c => {
        const ok = (sel.who === 'all' || c.dataset.who.split(' ').includes(sel.who)) && (sel.len === 'all' || c.dataset.len === sel.len);
        c.hidden = !ok; if (ok) n++;
      });
      $$('.tilek-group').forEach(g => { g.hidden = !g.querySelector('.tcard:not([hidden])'); });
      const msg = T.shown(n, total);
      if (out) out.textContent = msg; if (sumCount) sumCount.textContent = msg;
      const empty = $('[data-empty]'); if (empty) empty.hidden = n > 0;
    }
    $$('[data-f]', filter).forEach(ch => ch.addEventListener('click', () => {
      const [k, v] = ch.dataset.f.split(':'); sel[k] = v;
      $$(`[data-f^="${k}:"]`, filter).forEach(o => o.setAttribute('aria-pressed', String(o === ch)));
      apply();
    }));
    $$('[data-reset]').forEach(b => b.addEventListener('click', () => { sel.who = sel.len = 'all'; $$('[data-f]', filter).forEach(o => o.setAttribute('aria-pressed', String(o.dataset.f.endsWith(':all')))); apply(); }));
    if (state === 'filter' || state === 'filtered') { const d = filter.closest('details'); if (d) d.open = true; }
    if (state === 'filtered') { $(`[data-f="who:ata-ana"]`, filter)?.click(); $(`[data-f="len:ortasha"]`, filter)?.click(); }
    apply();
  }

  /* ---------- Меню, FAQ, оглавление, калькулятор ---------- */
  if (filter && matchMedia('(min-width: 1024px)').matches) { const d = filter.closest('details'); if (d) d.open = true; }
  if (state === 'menu') { const m = $('.menu'); if (m) m.open = true; }
  if (state === 'faq') $$('.faq details').forEach(d => (d.open = true));
  if (state === 'toc') { const t = $('.article-main .toc'); if (t) t.open = true; }
  const calcForm = $('[data-calc]');
  if (calcForm) {
    const run = () => { const g = +calcForm.guests.value || 0, p = +calcForm.per.value || 10; $('[data-calc-out]').textContent = Math.ceil(g / p); $('[data-calc-g]').textContent = g; $('[data-calc-p]').textContent = p; };
    calcForm.addEventListener('submit', e => { e.preventDefault(); run(); });
    calcForm.addEventListener('input', run);
  }

  /* ---------- Подсветка оглавления (scrollspy) ---------- */
  const tocLinks = $$('.article-aside .toc a[href^="#"]');
  if (tocLinks.length && 'IntersectionObserver' in window) {
    const map = new Map(tocLinks.map(a => [a.getAttribute('href').slice(1), a]));
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting) { tocLinks.forEach(a => a.removeAttribute('aria-current')); map.get(e.target.id)?.setAttribute('aria-current', 'true'); }
    }), { rootMargin: '-20% 0px -70% 0px' });
    map.forEach((_, id) => { const el = document.getElementById(id); el && io.observe(el); });
  }

  /* ---------- Липкий CTA: виден, когда CTA героя ушёл с экрана, и прячется у финального баннера ---------- */
  const sticky = $('.sticky-cta');
  if (sticky && 'IntersectionObserver' in window) {
    const watch = $$('[data-hero-cta], .cta-banner, .site-footer');
    const vis = new Set();
    const io = new IntersectionObserver(es => { es.forEach(e => e.isIntersecting ? vis.add(e.target) : vis.delete(e.target)); sticky.classList.toggle('is-hidden', vis.size > 0); });
    watch.forEach(w => io.observe(w));
  }
})();
