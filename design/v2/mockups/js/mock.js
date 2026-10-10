/* «Той» v2 — вспомогательный скрипт ТОЛЬКО для статичных макетов.
   1) спрайт иконок (Lucide, ISC; WhatsApp — Simple Icons, CC0);
   2) библиотека орнаментов (те же пути, что в assets/ornaments/*.svg);
   3) генератор SVG-зала по геометрии design_spec 3.12–3.13 и данным 5.2.
   В продукте это React-компоненты; страница гостя рендерится на сервере без этого JS. */
(function () {
  const I = {
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    grid: '<rect width="7" height="7" x="3" y="3" rx="1.5"/><rect width="7" height="7" x="14" y="3" rx="1.5"/><rect width="7" height="7" x="14" y="14" rx="1.5"/><rect width="7" height="7" x="3" y="14" rx="1.5"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    minus: '<path d="M5 12h14"/>',
    'user-plus': '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6"/><path d="M22 11h-6"/>',
    search: '<circle cx="11" cy="11" r="7.5"/><path d="m20.5 20.5-4.2-4.2"/>',
    phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>',
    yes: '<circle cx="12" cy="12" r="10"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
    no: '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/><path d="M4 2C2.8 3.7 2 5.7 2 8"/><path d="M22 8c0-2.3-.8-4.3-2-6"/>',
    up: '<path d="m18 15-6-6-6 6"/>', down: '<path d="m6 9 6 6 6-6"/>', right: '<path d="m9 18 6-6-6-6"/>',
    back: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
    move: '<path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/>',
    lock: '<rect width="16" height="11" x="4" y="11" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    history: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    list: '<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>',
    sliders: '<path d="M20 7h-9"/><path d="M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
    order: '<path d="m21 16-4 4-4-4"/><path d="M17 20V4"/><path d="m3 8 4-4 4 4"/><path d="M7 4v16"/>',
    pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
    cal: '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/>',
    vol: '<path d="M11 5 6 9H2v6h4l5 4V5Z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>',
    mute: '<path d="M11 5 6 9H2v6h4l5 4V5Z"/><path d="m22 9-6 6"/><path d="m16 9 6 6"/>',
    offline: '<path d="M12 20h.01"/><path d="M8.5 16.43a5 5 0 0 1 7 0"/><path d="M5 12.86a10 10 0 0 1 5.17-2.69"/><path d="M19 12.86a10 10 0 0 0-2-1.52"/><path d="M2 8.82a15 15 0 0 1 4.18-2.64"/><path d="M22 8.82a15 15 0 0 0-11.29-3.76"/><path d="m2 2 20 20"/>',
    wifi: '<path d="M12 20h.01"/><path d="M2 8.82a15 15 0 0 1 20 0"/><path d="M5 12.86a10 10 0 0 1 14 0"/><path d="M8.5 16.43a5 5 0 0 1 7 0"/>',
    wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
    chart: '<path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
    gear: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
    door: '<path d="M13 4h3a2 2 0 0 1 2 2v14"/><path d="M2 20h3"/><path d="M13 20h9"/><path d="M10 12v.01"/><path d="M13 4.56v16.16a1 1 0 0 1-1.24.97L5 20V5.56a2 2 0 0 1 1.52-1.94l4-1A2 2 0 0 1 13 4.56Z"/>',
    refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
    music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
    printer: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/>',
    pencil: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
    sms: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    login: '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="m10 17 5-5-5-5"/><path d="M15 12H3"/>',
    'user-x': '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="m17 8 5 5"/><path d="m22 8-5 5"/>',
    more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
    play: '<path d="M7 4.5v15l12-7.5z"/>',
    heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>'
  };
  const WA = '<path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.16-.17.2-.35.22-.64.07-.3-.15-1.26-.46-2.39-1.47-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.6.13-.14.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.61-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.07c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.7.63.71.22 1.36.19 1.87.12.57-.09 1.76-.72 2-1.41.25-.7.25-1.29.18-1.41-.08-.13-.27-.2-.57-.35m-5.42 7.4h-.01a9.87 9.87 0 0 1-5.03-1.38l-.36-.21-3.74.98 1-3.65-.24-.37a9.86 9.86 0 0 1-1.51-5.26c0-5.45 4.44-9.88 9.89-9.88 2.64 0 5.12 1.03 6.99 2.9a9.83 9.83 0 0 1 2.89 6.99c0 5.45-4.44 9.88-9.88 9.88m8.41-18.3A11.82 11.82 0 0 0 12.05 0C5.5 0 .16 5.34.16 11.89c0 2.1.55 4.14 1.59 5.95L.06 24l6.3-1.65a11.88 11.88 0 0 0 5.68 1.45h.01c6.55 0 11.89-5.34 11.89-11.89 0-3.18-1.24-6.17-3.48-8.41z"/>';

  let sprite = '<svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true">';
  for (const k in I) sprite += `<symbol id="i-${k}" viewBox="0 0 24 24">${I[k]}</symbol>`;
  sprite += `<symbol id="i-wa" viewBox="0 0 24 24">${WA}</symbol></svg>`;
  document.body.insertAdjacentHTML('afterbegin', sprite);

  /* ---------- Орнаменты (pathLength=1 для «рисования» через stroke-dashoffset) ---------- */
  const P = 'pathLength="1"';
  const O = {
    horn: (c = '') => `<svg class="${c}" viewBox="0 0 120 64" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path ${P} d="M60 60 C60 44 53 32 41 27 C29 22 16 26 13.5 37 C11 47 18 53.5 26 51.5 C32.5 50 34 42.5 29 39.5 C25.5 37.5 21.5 39.5 22.5 43.5"/>
      <path ${P} d="M60 60 C60 44 67 32 79 27 C91 22 104 26 106.5 37 C109 47 102 53.5 94 51.5 C87.5 50 86 42.5 91 39.5 C94.5 37.5 98.5 39.5 97.5 43.5"/>
      <path ${P} class="d2" d="M60 46 C58.5 38 53 33.5 46.5 34"/><path ${P} class="d2" d="M60 46 C61.5 38 67 33.5 73.5 34"/>
      <path ${P} class="d3" d="M60 60 V19"/><path ${P} class="d3" d="M60 4 L65 11 L60 18 L55 11 Z"/></svg>`,
    shanyraq: (c = '', rays = true) => {
      let r = '';
      if (rays) for (let i = 0; i < 32; i++) { const a = (i / 32) * Math.PI * 2, L = i % 2 ? 55 : 61, x1 = (45 * Math.cos(a)).toFixed(2), y1 = (45 * Math.sin(a)).toFixed(2), x2 = (L * Math.cos(a)).toFixed(2), y2 = (L * Math.sin(a)).toFixed(2); r += `<path ${P} class="ray" style="animation-delay:${(i * 28)}ms" d="M${x1} ${y1} L${x2} ${y2}"/>`; }
      return `<svg class="${c}" viewBox="-64 -64 128 128" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">
      <path ${P} d="M0 -40 A40 40 0 1 1 0 40 A40 40 0 1 1 0 -40"/><path ${P} class="d2" d="M0 -34 A34 34 0 1 0 0 34 A34 34 0 1 0 0 -34"/>
      <path ${P} class="d3" d="M-13 -31.4 Q-18 0 -13 31.4"/><path ${P} class="d3" d="M13 -31.4 Q18 0 13 31.4"/>
      <path ${P} class="d4" d="M-31.4 -13 Q0 -18 31.4 -13"/><path ${P} class="d4" d="M-31.4 13 Q0 18 31.4 13"/>${r}</svg>`;
    },
    corner: (c = '') => `<svg class="${c}" viewBox="0 0 96 96" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true">
      <path ${P} d="M5 94 V40 C5 20 20 5 40 5 H94"/><path ${P} class="d2" d="M15 94 V48 C15 30 30 15 48 15 H94"/>
      <path ${P} class="d3" d="M26 26 C36 36 48 38 54 32 C60 26 54 18 48 22 C44 25 47 29 50 28"/>
      <path ${P} class="d3" d="M26 26 C36 36 38 48 32 54 C26 60 18 54 22 48 C25 44 29 47 28 50"/>
      <path ${P} class="d4" d="M5 5 L11 11"/></svg>`,
    tulip: (c = '') => `<svg class="${c}" viewBox="0 0 64 150" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path ${P} d="M32 148 C32 118 33 92 32 62"/>
      <path ${P} class="d2" d="M32 128 C16 116 10 98 13 80 C23 92 29 104 32 116"/><path ${P} class="d2" d="M32 112 C46 102 52 88 50 72 C41 82 35 92 32 102"/>
      <path ${P} class="d3" d="M32 62 C21 60 15 48 17 30 C23 37 27 40 32 42 C37 40 41 37 47 30 C49 48 43 60 32 62 Z"/>
      <path ${P} class="d4" d="M32 42 C27 32 27 22 32 12 C37 22 37 32 32 42"/></svg>`,
    star: (c = '') => `<svg class="${c}" viewBox="-10 -10 20 20" aria-hidden="true"><path fill="currentColor" d="M0 -9 C1 -1.5 1.5 -1 9 0 C1.5 1 1 1.5 0 9 C-1 1.5 -1.5 1 -9 0 C-1.5 -1 -1 -1.5 0 -9Z"/></svg>`,
    mark: (c = '') => `<svg class="${c}" viewBox="-32 -32 64 64" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" aria-hidden="true"><circle r="17"/><path d="M-6 -15.8 Q-8.5 0 -6 15.8 M6 -15.8 Q8.5 0 6 15.8 M-15.8 -6 Q0 -8.5 15.8 -6 M-15.8 6 Q0 8.5 15.8 6"/><path d="M22.0 0.0 L29.0 0.0 M19.1 11.0 L25.1 14.5 M11.0 19.1 L14.5 25.1 M0.0 22.0 L0.0 29.0 M-11.0 19.1 L-14.5 25.1 M-19.1 11.0 L-25.1 14.5 M-22.0 0.0 L-29.0 0.0 M-19.1 -11.0 L-25.1 -14.5 M-11.0 -19.1 L-14.5 -25.1 M-0.0 -22.0 L-0.0 -29.0 M11.0 -19.1 L14.5 -25.1 M19.1 -11.0 L25.1 -14.5"/></svg>`
  };
  window.TOI_ORN = O;
  document.querySelectorAll('[data-orn]').forEach(el => { el.outerHTML = O[el.dataset.orn](el.className); });

  /* ---------- Данные зала (design_spec 5.2, «Ожидаемая рассадка») ---------- */
  const CAT = { kuda: 'Құдалар', oz: 'Өз туыстар', nagashy: 'Нағашылар', dos: 'Достар', ariptes: 'Әріптестер', korshi: 'Көршілер', synyp: 'Сыныптастар', baska: 'Басқа' };
  const T = {
    1: ['kuda', [['Райхан құдағи отбасы', 3], ['Жұпар құдағи', 2]]],
    2: ['kuda', [['Сапарбаевтар (бас құда)', 6], ['Нұрболат құда отбасы', 5]]],
    3: ['kuda', [['Әділбек құда отбасы', 4], ['Тимур құда отбасы', 4, 'inv'], ['Сәкен құда отбасы', 4]]],
    4: ['oz', [['Қайрат отбасы', 6], ['Серікбай ағай отбасы', 5], ['Жанар апай', 1]]],
    5: ['oz', [['Талғат отбасы', 4], ['Мұрат ағай отбасы', 4], ['Болат ағай отбасы', 4, 'new']]],
    6: ['oz', [['Ғабит ағай отбасы', 5], ['Бауыржан ағай отбасы', 4], ['Ермек отбасы', 3, 'inv']]],
    7: ['nagashy', [['Мейрамбек нағашы отбасы', 6, 'yes', 1], ['Гүлнар апай отбасы', 5, 'yes', 1], ['Әйгерім отбасы', 3, 'yes', 1]]],
    8: ['oz', [['Жомарт отбасы', 4], ['Нұрлан мен Әсем', 2], ['Ербол нағашы отбасы', 5]]],
    9: ['dos', [['Ақылбек ағай отбасы', 4], ['Ержан отбасы', 3, 'inv'], ['Темірлан отбасы', 3], ['Самат отбасы', 2]]],
    10: ['nagashy', [['Ерлан ағай отбасы', 4], ['Даурен нағашы отбасы', 4], ['Қанат отбасы', 4]]],
    11: ['nagashy', [['Бибігүл апай отбасы', 4], ['Нұрсұлу апай отбасы', 3, 'inv'], ['Алмагүл апай отбасы', 3], ['Күләш апай', 2]]],
    12: ['korshi', [['Бақытжан отбасы', 2, 'yes', 1], ['Сәуле апай', 1, 'yes', 1], ['Марат отбасы', 4, 'yes', 1], ['Ләззат апай отбасы', 4, 'yes', 1], ['Роза отбасы', 2, 'yes', 1]]],
    13: ['synyp', [['Қуаныш отбасы', 3], ['Бекзат отбасы', 2], ['Нұржан отбасы', 2, 'new'], ['Әлия', 1], ['Ерасыл', 1], ['Айдана', 1], ['Зейнеп апай', 1], ['Дина', 1]]],
    14: ['dos', [['Арман отбасы', 2], ['Дидар мен Томирис', 2], ['Мадина отбасы', 2], ['Шынар', 1, 'inv'], ['Аружан', 1], ['Ернұр', 1], ['Санжар', 1, 'inv'], ['Әлихан', 1], ['Асхат', 1]]],
    15: ['ariptes', [['Бақытжан Омаров отбасы', 2], ['Дархан отбасы', 2], ['Ғалым отбасы', 2, 'inv'], ['Нәзира отбасы', 2], ['Ақбота', 1], ['Нұрислам', 1], ['Тоғжан', 1]]],
    16: ['baska', []]
  };
  window.TOI_HALL = { T, CAT };
  const occ = n => T[n][1].reduce((s, f) => s + f[1], 0);

  /* opts: {mode:'normal'|'dup'|'move', cap:12, sel:n, move:{size,current}} */
  window.renderHall = function (svg, opts = {}) {
    const cap = opts.cap || 12, cols = opts.cols || 4, W = 328, CW = W / cols, CH = 86, top = 24 + 64 + 16, n = opts.n || 16, levels = Math.ceil(n / cols);
    const H = top + levels * CH + 40;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    let s = '';
    // ТӨР
    s += `<g class="tor"><line x1="92" y1="13" x2="136" y2="13" class="gl"/><line x1="192" y1="13" x2="236" y2="13" class="gl"/>
      <text x="164" y="13" class="lbl-tor">ТӨР</text></g>`;
    // Стол молодых с орнаментом
    s += `<g class="couple" role="button" tabindex="0" aria-label="Жастар үстелі: Айбек пен Дана">
      <g transform="translate(148 26) scale(.27)" class="orn-couple">${O.horn('draw').replace(/^<svg[^>]*>|<\/svg>$/g, '')}</g>
      <rect x="98" y="47" width="132" height="34" rx="17" class="ctable"/>
      <circle cx="86" cy="64" r="6" class="cseat"/><circle cx="242" cy="64" r="6" class="cseat"/>
      <text x="164" y="64.5" class="lbl-couple">Жастар үстелі</text></g>`;
    for (let i = 1; i <= n; i++) {
      const lv = Math.floor((i - 1) / cols), col = (i - 1) % cols, ox = col * CW, oy = top + lv * CH, cx = ox + CW / 2, cy = oy + 32;
      const cat = T[i] ? T[i][0] : 'baska', o = (opts.empty || !T[i]) ? 0 : occ(i), over = o > cap, empty = o === 0;
      const R = cap >= 15 ? 27 : 26, c = cap >= 15 ? 4 : 4.5;
      let cls = 'tbl';
      let mode = opts.mode || 'normal';
      const dupT = mode === 'dup' && (i === 12 || i === 15);
      const dim = (mode === 'dup' && !dupT) || (mode === 'move' && i !== opts.move.current && (cap - o) < opts.move.size);
      const cand = mode === 'move' && i !== opts.move.current && (cap - o) >= opts.move.size;
      const cur = mode === 'move' && i === opts.move.current;
      if (dim) cls += ' dim';
      if (opts.sel === i) cls += ' sel';
      const label = mode === 'move' ? (cur ? 'қазір' : `${Math.max(cap - o, 0)} бос`) : `${o}/${cap}`;
      const aria = `${i}-үстел, ${o} адам, ${cap} орын` + (over ? `, ${o - cap} орын жетпейді` : '');
      s += `<g class="${cls}" role="button" tabindex="0" aria-label="${aria}" data-t="${i}">`;
      s += `<rect x="${ox + 1}" y="${oy + 1}" width="${CW - 2}" height="${CH - 2}" rx="10" class="hit"/>`;
      if (over) s += `<circle cx="${cx}" cy="${cy}" r="${R + c + 4.5}" class="ring-over2"/>`;
      if (dupT) s += `<circle cx="${cx}" cy="${cy}" r="${R + c + 3}" class="ring-dup"/>`;
      if (cand) s += `<circle cx="${cx}" cy="${cy}" r="${R + c + 3}" class="ring-cand"/>`;
      if (cur) s += `<circle cx="${cx}" cy="${cy}" r="${R + c + 3}" class="ring-cur"/>`;
      // стулья
      let k = 0; const dupFam = dupT ? (i === 12 ? 2 : 2) : 0;
      for (let j = 0; j < cap; j++) {
        const a = (-90 + j * 360 / cap) * Math.PI / 180, x = (cx + R * Math.cos(a)).toFixed(2), y = (cy + R * Math.sin(a)).toFixed(2);
        let st = j < o ? 'taken' : 'free';
        if (over) st = 'over';
        if (dupT && j < dupFam) st = 'dupseat';
        s += `<circle cx="${x}" cy="${y}" r="${c}" class="seat ${st}"/>`;
      }
      s += `<circle cx="${cx}" cy="${cy}" r="18" class="disc ${empty ? 'empty' : ''}" style="fill:${empty ? 'var(--paper)' : `var(--cat-${cat})`}"/>`;
      if (over) s += `<circle cx="${cx}" cy="${cy}" r="18" class="disc-over"/>`;
      s += `<text x="${cx}" y="${cy + .5}" class="lbl-no">${i}</text>`;
      if (!opts.noLabels) s += `<text x="${cx}" y="${oy + 77}" class="lbl-occ ${over ? 'over' : ''} ${cand ? 'cand' : ''}">${label}</text>`;
      if (over) s += `<g class="badge-over"><circle cx="${cx + 25}" cy="${cy - 25}" r="9"/><text x="${cx + 25}" y="${cy - 24.5}">!</text></g>`;
      if (dupT) s += `<g class="badge-dup"><circle cx="${cx - 25}" cy="${cy - 25}" r="10"/><text x="${cx - 25}" y="${cy - 24.5}">${i === 12 ? 1 : 2}</text></g>`;
      if (cur) s += `<g class="lock-cur"></g>`;
      s += `</g>`;
    }
    const by = top + levels * CH + 8;
    s += `<g class="entrance"><path d="M134 ${by + 4} h60" class="door"/><text x="164" y="${by + 22}" class="lbl-ent">КІРЕБЕРІС</text></g>`;
    svg.innerHTML = s;
  };

  /* Крупная графика стола в шторке: стулья блоками по семьям, номер семьи на первом стуле */
  window.renderTableBig = function (svg, n, cap = 12) {
    const fam = T[n][1], o = occ(n), over = o > cap;
    let s = '', idx = 0;
    const R = 70, c = cap >= 15 ? 10 : 11;
    if (over) s += `<circle cx="100" cy="100" r="${R + c + 7}" class="ring-over2"/>`;
    const seats = [];
    fam.forEach((f, fi) => { for (let q = 0; q < f[1]; q++) seats.push({ fi, first: q === 0 }); });
    for (let j = 0; j < cap; j++) {
      const a = (-90 + j * 360 / cap) * Math.PI / 180, x = 100 + R * Math.cos(a), y = 100 + R * Math.sin(a);
      const st = seats[j];
      const cls = over ? 'over' : (st ? 'taken' : 'free');
      s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${c}" class="seat big ${cls}"/>`;
      if (st && st.first) s += `<text x="${x.toFixed(1)}" y="${(y + .5).toFixed(1)}" class="lbl-fam">${st.fi + 1}</text>`;
    }
    s += `<circle cx="100" cy="100" r="46" class="disc" style="fill:var(--cat-${T[n][0]})"/>`;
    if (over) s += `<circle cx="100" cy="100" r="46" class="disc-over"/>`;
    s += `<text x="100" y="94" class="lbl-big">${n}</text><text x="100" y="121" class="lbl-big-sub">үстел</text>`;
    if (over) s += `<g class="badge-over"><circle cx="160" cy="40" r="14"/><text x="160" y="41" style="font-size:18px">!</text></g>`;
    svg.setAttribute('viewBox', '0 0 200 200');
    svg.innerHTML = s;
  };

  /* Хром макета: состояние из hash (#ok, #open, #answered …) */
  window.TOI_STATE = (location.hash || '').replace('#', '');
  document.documentElement.dataset.state = window.TOI_STATE;
  /* N4: бесконечные анимации на паузе вне экрана и в фоновой вкладке */
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(es => es.forEach(e => e.target.classList.toggle('paused', !e.isIntersecting)));
    document.querySelectorAll('[data-ambient], .event-hero, .event-mini').forEach(el => io.observe(el));
  }
  document.addEventListener('visibilitychange', () => document.documentElement.classList.toggle('page-hidden', document.hidden));
  { const t = document.querySelector(".toast"); if (t && getComputedStyle(t).display !== "none") document.body.classList.add("has-toast"); }
  const tb = document.querySelector('.topbar');
  if (tb) addEventListener('scroll', () => tb.classList.toggle('scrolled', scrollY > 4), { passive: true });
})();
