// Скриншоты и автопроверки макетов публичного сайта (design/v2/site/*.html).
// Запуск из корня репозитория:  node design/v2/tools/shot_site.mjs
// Проверки: горизонтальный скролл (320/360/768/1024/1440 и 360 при 130 % текста), минимальный кегль видимого текста,
// цели касания < 44×44 (кроме ссылок внутри строки текста — исключение WCAG 2.5.8), вес HTML.
import { chromium } from '@playwright/test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const here = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.resolve(here, '../site');
const OUT = path.resolve(here, '../screenshots/site');
fs.mkdirSync(OUT, { recursive: true });

const pages = fs.readdirSync(SITE).filter(f => f.endsWith('.html'));
const states = {
  'kk-home.html': ['menu'],
  'kk-tilekter-sundet-toi.html': ['filter', 'filtered', 'copied'],
  'kk-tilekter.html': ['filter'],
  'kk-dastur-betashar.html': ['toc', 'faq'],
  'kk-shaqyru-qyz-uzatu.html': ['copied'],
  'ru-rassadka-gostei.html': ['toc'],
};

const browser = await chromium.launch({ channel: 'chromium' });
const report = [];

async function open(file, w, h, hash = '', zoom = 1) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto(pathToFileURL(path.join(SITE, file)).href + (hash ? '#' + hash : ''));
  if (zoom !== 1) await page.addStyleTag({ content: `html{font-size:${zoom * 100}%}` });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);
  return { ctx, page };
}

const audit = () => {
  const vw = document.documentElement.clientWidth;
  const overflow = document.documentElement.scrollWidth - vw;
  const wide = [];
  if (overflow > 0) document.querySelectorAll('body *').forEach(el => { const r = el.getBoundingClientRect(); if (r.right > vw + 1 && r.width > 0 && getComputedStyle(el).position !== 'fixed') wide.push((el.className || el.tagName) + ':' + Math.round(r.right)); });
  // кегль
  let minFont = 99, minEl = '';
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const n = walker.currentNode; if (!n.textContent.trim()) continue;
    const el = n.parentElement; if (!el || el.closest('svg, .sr-only, [hidden], .phone, .f-art, .hero-art, .ui-row')) continue;
    const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none' || !el.getClientRects().length) continue;
    const fs = parseFloat(cs.fontSize); if (fs < minFont) { minFont = fs; minEl = el.tagName + '.' + el.className + ' «' + n.textContent.trim().slice(0, 30) + '»'; }
  }
  // цели касания
  const small = [];
  document.querySelectorAll('a, button, summary, input, select').forEach(el => {
    if (!el.getClientRects().length || el.closest('[hidden], details:not([open]) > :not(summary)') || el.classList.contains('skip')) return;
    const r = el.getBoundingClientRect(); if (r.width === 0) return;
    const inline = el.tagName === 'A' && el.closest('p, li, dd, td, figcaption') && !el.matches('.btn, .chip, .link-more, .fn') && getComputedStyle(el).display === 'inline';
    const fn = el.matches('.fn');
    if (inline || fn) return;
    if (r.height < 43.5 || r.width < 43.5) small.push(`${el.tagName}.${el.className}「${(el.textContent || '').trim().slice(0, 24)}」${Math.round(r.width)}×${Math.round(r.height)}`);
  });
  const base = parseFloat(getComputedStyle(document.body).fontSize);
  return { overflow, wide: wide.slice(0, 5), minFont, minEl, small: small.slice(0, 8), smallCount: small.length, base };
};

for (const file of pages) {
  const name = file.replace('.html', '');
  const row = { page: file, kb: Math.round(fs.statSync(path.join(SITE, file)).size / 1024) };
  for (const [w, h] of [[320, 640], [360, 740], [768, 1024], [1024, 768], [1440, 900]]) {
    const { ctx, page } = await open(file, w, h);
    const a = await page.evaluate(audit);
    row['ov' + w] = a.overflow; if (a.wide.length) row['wide' + w] = a.wide;
    if (w === 360) { row.minFont = a.minFont; row.minEl = a.minEl; row.small = a.small; row.smallCount = a.smallCount; row.base360 = a.base; }
    if (w === 1440) row.base1440 = a.base;
    if (w === 360 || w === 1440) {
      await page.screenshot({ path: path.join(OUT, `${name}_${w}.png`) });
      await page.evaluate(async () => { document.querySelectorAll('img[loading=lazy]').forEach(i => i.loading = 'eager'); await Promise.all([...document.images].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; }))); });
      await page.addStyleTag({ content: '.sticky-cta{display:none!important}' });
      const H = await page.evaluate(() => document.documentElement.scrollHeight);
      await page.screenshot({ path: path.join(OUT, `${name}_${w}_full.png`), fullPage: true, clip: { x: 0, y: 0, width: w, height: Math.min(H, 16000) } });
    }
    if (w === 768 && (file === 'kk-home.html' || file === 'kk-tilekter-sundet-toi.html')) await page.screenshot({ path: path.join(OUT, `${name}_${w}.png`) });
    await ctx.close();
  }
  { const { ctx, page } = await open(file, 360, 740, '', 1.3); const a130 = await page.evaluate(audit); row.ov360_130 = a130.overflow; if (a130.wide.length) row.wide130 = a130.wide; await ctx.close(); }
  for (const st of states[file] || []) {
    const { ctx, page } = await open(file, 360, 740, st);
    if (st === 'filter' || st === 'filtered') await page.locator('.filter').scrollIntoViewIfNeeded();
    if (st === 'copied') await page.locator('.tcard').first().scrollIntoViewIfNeeded();
    if (st === 'toc') await page.locator('.article-main .toc').scrollIntoViewIfNeeded();
    if (st === 'faq') await page.locator('.faq').scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, -80));
    await page.screenshot({ path: path.join(OUT, `${name}_${st}_360.png`) });
    await ctx.close();
  }
  report.push(row);
  console.log(JSON.stringify(row));
}
await browser.close();
fs.writeFileSync(path.join(OUT, '_checks.json'), JSON.stringify(report, null, 2));
