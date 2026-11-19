// Vertex Insights build: copies the site to dist/, fills in the domain, and renders published CMS content
// (articles, services, page SEO, contact details) from Supabase. Runs on every Netlify deploy.
// Without SUPABASE_URL + SUPABASE_ANON_KEY the static pages are published unchanged.
import { cpSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd(), DIST = join(ROOT, 'dist');
const SKIP = new Set(['dist', 'netlify', 'supabase', 'docs', 'scripts', 'node_modules', '.git', '.netlify', '.env', '.env.example', '.gitignore', 'README.md', 'netlify.toml', 'package.json']);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const host = (process.env.SITE_URL || process.env.URL || 'localhost:8888').replace(/^https?:\/\//, '').replace(/\/+$/, '');
const SB = (process.env.SUPABASE_URL || '').replace(/\/$/, ''), KEY = process.env.SUPABASE_ANON_KEY || '';
const warn = (m) => console.warn('[build] ' + m);

rmSync(DIST, { recursive: true, force: true }); mkdirSync(DIST, { recursive: true });
for (const f of readdirSync(ROOT)) if (!SKIP.has(f) && !f.endsWith('.py')) cpSync(join(ROOT, f), join(DIST, f), { recursive: true });
const rd = (f) => readFileSync(join(DIST, f), 'utf8'), wr = (f, s) => writeFileSync(join(DIST, f), s);

async function get(table, query) {
  if (!SB || !KEY) return null;
  try {
    const r = await fetch(`${SB}/rest/v1/${table}?${query}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
    if (!r.ok) { warn(`${table}: HTTP ${r.status}; keeping static content`); return null; }
    return await r.json();
  } catch (e) { warn(`${table}: ${e.message}; keeping static content`); return null; }
}
const [articles, services, pages, settings] = await Promise.all([
  get('articles', 'status=eq.published&order=published_at.desc&select=*'),
  get('services', 'status=eq.published&is_visible=eq.true&order=sort_order.asc&select=*'),
  get('pages', 'status=eq.published&select=slug,seo_title,meta_description'),
  get('site_settings', 'key=eq.public_site&select=value')
]);
const mediaRows = (await get('media', 'select=storage_path,alt_text')) || [];
const alts = new Map(mediaRows.map((m) => [m.storage_path, m.alt_text]));
const imgUrl = (p) => `${SB}/storage/v1/object/public/vertex-media/${p.split('/').map(encodeURIComponent).join('/')}`;
const allServices = await get('services', 'select=slug,status,is_visible');
const pub = (settings && settings[0] && settings[0].value) || {};

// ---- admin/config.js from environment (no manual editing) ----
if (existsSync(join(DIST, 'admin'))) {
  wr('admin/config.js', `window.VERTEX_CONFIG = ${JSON.stringify({ supabaseUrl: SB || 'https://YOUR_PROJECT.supabase.co', supabaseAnonKey: KEY || 'YOUR_SUPABASE_ANON_OR_PUBLISHABLE_KEY' })};\n`);
}

// ---- page SEO overrides (pages whose slug matches a file: home|index, about, services, ...) ----
const setMeta = (html, p) => {
  if (p.seo_title) html = html.replace(/<title>.*?<\/title>/, `<title>${esc(p.seo_title)}</title>`).replace(/(<meta property="og:title" content=")[^"]*"/, `$1${esc(p.seo_title)}"`);
  if (p.meta_description) html = html.replace(/(<meta name="description" content=")[^"]*"/, `$1${esc(p.meta_description)}"`).replace(/(<meta property="og:description" content=")[^"]*"/, `$1${esc(p.meta_description)}"`);
  return html;
};
for (const p of pages || []) {
  const file = (p.slug === 'home' ? 'index' : p.slug) + '.html';
  if (/^[a-z0-9-]+\.html$/.test(file) && existsSync(join(DIST, file))) wr(file, setMeta(rd(file), p));
}

// ---- services: override matching sections on services.html, hide unpublished ones, append new ones ----
if (allServices) {
  let html = rd('services.html');
  const live = new Map((services || []).map((s) => [s.slug, s]));
  const known = new Map(allServices.map((s) => [s.slug, s]));
  const list = (arr) => `<ul>${(arr || []).map((d) => `<li>${esc(d)}</li>`).join('')}</ul>`;
  for (const [slug, row] of known) {
    const re = new RegExp(`<section class="sec[^"]*" id="${slug}">[\\s\\S]*?</section>`);
    if (!/^[a-z0-9-]+$/.test(slug)) continue;
    if (!live.has(slug)) { html = html.replace(re, '').replace(new RegExp(`<a href="#${slug}">[^<]*</a>`), ''); continue; }
    const s = live.get(slug);
    if (re.test(html)) {
      html = html.replace(re, (sec) => sec
        .replace(/<h2>.*?<\/h2>/, `<h2>${esc(s.name)}</h2>`)
        .replace(/(<h4>The problem<\/h4><p>).*?(<\/p>)/, s.summary ? `$1${esc(s.summary)}$2` : '$&')
        .replace(/(<h4>What we do<\/h4><p>).*?(<\/p>)/, s.description ? `$1${esc(s.description)}$2` : '$&')
        .replace(/(<h4>What you receive<\/h4>)<ul>[\s\S]*?<\/ul>/, (m, a) => (s.deliverables || []).length ? a + list(s.deliverables) : m)
        .replace(/(<a class="btn" href=")[^"]*(">)[^<]*(<\/a>)/, `$1${esc(s.cta_href || 'contact.html')}$2Request a quote$3`));
    } else {
      const sec = `<section class="sec" id="${esc(slug)}"><div class="container svc"><div><span class="badge now">Available now</span><h2>${esc(s.name)}</h2><p>${esc(s.summary)}</p>${s.description ? `<h4>What we do</h4><p>${esc(s.description)}</p>` : ''}${(s.deliverables || []).length ? `<h4>What you receive</h4>${list(s.deliverables)}` : ''}<div class="cta"><a class="btn" href="${esc(s.cta_href || 'contact.html')}">Request a quote</a></div></div></div></section>`;
      html = html.replace(/(<section class="sec pd" id="planned">)/, sec + '$1');
      html = html.replace('<a href="#operational">', `<a href="#${esc(slug)}">${esc(s.name)}</a><a href="#operational">`);
    }
  }
  wr('services.html', html);
}

// ---- contact details from settings (shown only when the owner has filled them in) ----
if (pub.contact_email || pub.contact_phone) {
  const bits = [pub.contact_email && `<a href="mailto:${esc(pub.contact_email)}">${esc(pub.contact_email)}</a>`, pub.contact_phone && `<a href="tel:${esc(String(pub.contact_phone).replace(/[^+\d]/g, ''))}">${esc(pub.contact_phone)}</a>`].filter(Boolean).join(' · ');
  wr('contact.html', rd('contact.html').replace(/<p class="cap" id="direct">.*?<\/p>/, `<p class="cap" id="direct">Prefer to write directly? ${bits}</p>`));
}

// ---- articles: /insights/<slug>.html + cards on insights.html + sitemap ----
const extra = [];
if (articles && articles.length) {
  mkdirSync(join(DIST, 'insights'), { recursive: true });
  const tpl = rd('five-numbers-small-manufacturers.html');
  const abs = (h) => h.replace(/(href|src)="(?!https?:|mailto:|tel:|#|\/)([^"]+)"/g, '$1="/$2"');
  const fmt = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });
  const cards = [];
  for (const a of articles) {
    if (!/^[a-z0-9-]+$/.test(a.slug)) continue;
    const mins = Math.max(1, Math.round(a.body.split(/\s+/).length / 200));
    const when = fmt(a.published_at || a.created_at), meta = `${esc(a.author_name)} · ${when} · ${mins} min read`;
    const body = a.body.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean).map((b) => b.startsWith('## ') ? `<h2>${esc(b.slice(3))}</h2>` : `<p>${esc(b).replace(/\n/g, '<br>')}</p>`).join('');
    const cover = a.cover_image_path ? `<img src="${esc(imgUrl(a.cover_image_path))}" alt="${esc(alts.get(a.cover_image_path) || a.title)}" style="width:100%;height:auto;border-radius:12px;margin:0 0 24px" loading="lazy">` : '';
    const title = a.seo_title || a.title, desc = a.meta_description || a.excerpt || '';
    let h = tpl.replace(/<main id="main">[\s\S]*<\/main>/, `<main id="main"><section class="sec"><div class="container art"><p class="crumb"><a href="insights.html">← Insights</a></p><p class="meta">${meta}</p><h1>${esc(a.title)}</h1>${a.excerpt ? `<p class="lede">${esc(a.excerpt)}</p>` : ''}${cover}${body}</div></section></main>`);
    h = h.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>\n?/, `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'BlogPosting', headline: a.title, description: desc, datePublished: (a.published_at || a.created_at).slice(0, 10), author: { '@type': 'Person', name: a.author_name }, publisher: { '@type': 'Organization', name: 'Vertex Insights' }, mainEntityOfPage: `https://__SITE_URL__/insights/${a.slug}.html` }).replace(/</g, '\\u003c')}</script>\n`);
    h = setMeta(h, { seo_title: `${title} | Vertex Insights`, meta_description: desc }).replace(/https:\/\/__SITE_URL__\/five-numbers-small-manufacturers\.html/g, `https://__SITE_URL__/insights/${a.slug}.html`);
    if (a.cover_image_path) h = h.replace(/(<meta property="og:image" content=")[^"]*"/, `$1${esc(imgUrl(a.cover_image_path))}"`);
    writeFileSync(join(DIST, 'insights', `${a.slug}.html`), abs(h));
    cards.push(`<a class="card" href="insights/${esc(a.slug)}.html"><p class="meta">${meta}</p><h3>${esc(a.title)}</h3><p>${esc(a.excerpt)}</p><span class="more">Read article</span></a>`);
    extra.push(`/insights/${a.slug}.html`);
  }
  if (cards.length) wr('insights.html', rd('insights.html').replace('</div></section><section class="band">', `<div class="grid g2" style="margin-top:20px">${cards.join('')}</div></div></section><section class="band">`));
}

// ---- sitemap (generated from the pages present) + domain + link check ----
import { execSync } from 'node:child_process';
const NOINDEX = new Set(['404.html', 'thanks.html']);
const lastmod = (f) => { try { const d = execSync(`git log -1 --format=%cs -- "${f}"`, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); if (d) return d; } catch {} return new Date().toISOString().slice(0, 10); };
const urls = readdirSync(ROOT).filter((f) => f.endsWith('.html') && !NOINDEX.has(f)).sort()
  .map((f) => `<url><loc>https://__SITE_URL__/${f === 'index.html' ? '' : f}</loc><lastmod>${lastmod(f)}</lastmod></url>`);
const today = new Date().toISOString().slice(0, 10);
urls.push(...extra.map((u) => `<url><loc>https://__SITE_URL__${u}</loc><lastmod>${today}</lastmod></url>`));
wr('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>\n`);
// every public page must have a CSP block in _headers
const hdr = existsSync(join(ROOT, '_headers')) ? readFileSync(join(ROOT, '_headers'), 'utf8') : '';
for (const f of readdirSync(ROOT)) if (f.endsWith('.html') && !hdr.includes(`\n/${f}\n`) && !hdr.startsWith(`/${f}\n`)) warn(`${f} has no block in _headers; run: node scripts/gen-headers.mjs`);
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]);
let broken = 0;
for (const f of walk(DIST)) {
  if (!/\.(html|txt|xml)$/.test(f)) continue;
  let s = readFileSync(f, 'utf8');
  if (s.includes('__SITE_URL__')) writeFileSync(f, s = s.replaceAll('__SITE_URL__', host));
  if (!f.endsWith('.html') || f.includes('/admin/')) continue;
  for (const m of s.matchAll(/(?:href|src)="([^"#?]+)/g)) {
    const h = m[1]; if (/^(https?:|mailto:|tel:)/.test(h) || h.startsWith('/api/')) continue;
    const p = h.startsWith('/') ? join(DIST, h) : join(f, '..', h);
    if (!existsSync(p)) { console.error('[build] BROKEN LINK', f.replace(DIST, ''), h); broken++; }
  }
}
if (broken) process.exit(1);
console.log(`[build] OK -> dist/ (domain ${host}; articles ${articles ? articles.length : 'static only'}; services ${services ? services.length : 'static only'})`);
