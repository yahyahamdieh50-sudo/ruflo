import { api } from '../api.js';
import { esc, hoodieSvg, productCard, socialLinks } from '../ui.js';

export default async function home(main, { settings, isCurrent }) {
  document.title = `${settings.brand} — Hoodies`;
  const { products, facets } = await api('/api/products?sort=featured');
  if (!isCurrent()) return;
  const featured = products.filter((p) => p.featured).slice(0, 4);
  const fresh = products.filter((p) => p.isNew).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 4);
  const heroColor = featured[0]?.colors[0]?.hex ?? '#151515';
  const hero = settings.hero;
  const headline = esc(hero.headline).replace(/(\S+)\.?$/, '<em>$&</em>');

  const cats = facets.styles.map((s) => {
    const sample = products.find((p) => p.style === s.name);
    const n = products.filter((p) => p.style === s.name).length;
    return `<a class="cat-card" href="/shop?style=${esc(s.id)}" data-link>
      ${hoodieSvg(sample?.colors[0]?.hex ?? '#151515', { label: '' })}
      <span class="count">${n} hoodie${n === 1 ? '' : 's'}</span>
      <span class="display">${esc(s.name)}</span>
    </a>`;
  }).join('');

  const section = (title, list, href) => (list.length ? `
    <section class="section wrap" aria-labelledby="h-${esc(title)}">
      <div class="section-head"><h2 id="h-${esc(title)}">${esc(title)}</h2><a class="btn btn-ghost btn-small" href="${href}" data-link>View all</a></div>
      <div class="grid grid-4">${list.map(productCard).join('')}</div>
    </section>` : '');

  const social = socialLinks(settings.social);
  main.innerHTML = `
    <section class="hero">
      <div class="wrap hero-grid">
        <div>
          ${hero.eyebrow ? `<p class="eyebrow">${esc(hero.eyebrow)}</p>` : ''}
          <h1>${headline}</h1>
          ${hero.subhead ? `<p>${esc(hero.subhead)}</p>` : ''}
          <div class="hero-ctas">
            <a class="btn btn-accent" href="/shop" data-link>Shop hoodies</a>
            <a class="btn btn-ghost btn-light" href="/size-guide" data-link>Find your size</a>
          </div>
        </div>
        <div class="hero-art" aria-hidden="true">${hoodieSvg(heroColor, { label: '' })}</div>
      </div>
    </section>
    <div class="ticker" aria-hidden="true"><span>${'Hoodies — YAHIVO — '.repeat(12)}</span></div>
    ${cats ? `<section class="section wrap" aria-labelledby="h-cats"><div class="section-head"><h2 id="h-cats">Shop by style</h2></div><div class="cat-grid">${cats}</div></section>` : ''}
    ${section('Featured', featured, '/shop')}
    ${section('New arrivals', fresh, '/shop?new=1&sort=newest')}
    ${!products.length ? '<section class="section wrap empty"><h2>Hoodies coming soon</h2><p class="muted">No products are published yet.</p></section>' : ''}
    <section class="section wrap">
      <div class="notice"><h3>Need a hand choosing?</h3><p>Tap <strong>Ask</strong> for help with sizes, colours and delivery, or check the <a href="/size-guide" data-link>size guide</a> and <a href="/shipping-returns" data-link>delivery info</a>.</p>
      <a class="btn" href="/shop" data-link>Shop hoodies</a></div>
    </section>
    ${social ? `<section class="social-band"><div class="wrap"><h2>Follow ${esc(settings.brand)}</h2><div class="social">${social}</div></div></section>` : ''}`;
}
