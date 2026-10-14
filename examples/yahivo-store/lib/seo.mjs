// Server-rendered <head> metadata (SEO + Open Graph + Twitter + JSON-LD) per route,
// so links shared on Facebook / Instagram / TikTok / WhatsApp preview correctly.

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// JSON inside <script>: escape "<" so a value can never close the tag.
const jsonLd = (obj) => `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`;

const abs = (siteUrl, src) => (!src ? null : /^https:\/\//.test(src) ? src : `${siteUrl}${src}`);

const PAGES = {
  '/': ['Hoodies', 'Shop YAHIVO hoodies — browse styles, pick your size and colour, and check out in a few taps.'],
  '/shop': ['Shop all hoodies', 'Browse every YAHIVO hoodie. Filter by size, colour, style and price.'],
  '/search': ['Search', 'Search YAHIVO hoodies.'],
  '/size-guide': ['Size guide', 'Find your YAHIVO hoodie size.'],
  '/faq': ['FAQs', 'Answers to common questions about YAHIVO orders, delivery, packing and returns.'],
  '/shipping-returns': ['Shipping & returns', 'YAHIVO delivery areas, fees, packing options and returns.'],
  '/contact': ['Contact', 'Get in touch with YAHIVO.'],
  '/privacy': ['Privacy policy', 'How YAHIVO handles your personal information.'],
  '/cart': ['Your cart', 'Your YAHIVO cart.', true],
  '/checkout': ['Checkout', 'Complete your YAHIVO order.', true],
  '/track': ['Track your order', 'Check the status of your YAHIVO order.', true],
};

/**
 * @returns {{ status: number, head: string }}
 */
export function routeMeta(pathname, { settings, siteUrl, getProduct }) {
  const brand = settings.brand;
  const image = abs(siteUrl, settings.ogImage);
  let status = 200;
  let title; let description; let noindex = false; let type = 'website'; let img = image; let extra = '';
  const ld = [];

  const product = pathname.match(/^\/product\/([a-z0-9-]{1,80})$/);
  if (product) {
    const p = getProduct(product[1]);
    if (p) {
      title = `${p.name} — ${brand}`;
      description = (p.description && !p.sample ? p.description : `${p.name} by ${brand}. ${p.style} hoodie in ${p.colors.map((c) => c.name).join(', ')}.`).slice(0, 180);
      type = 'product';
      img = abs(siteUrl, p.images[0]?.src) ?? image;
      noindex = Boolean(p.sample);
      if (p.price !== null) {
        extra += `<meta property="product:price:amount" content="${p.price.toFixed(2)}">\n<meta property="product:price:currency" content="${esc(settings.currency)}">\n`;
        const inStock = p.colors.some((c) => !c.stock || Object.values(c.stock).some((n) => n > 0));
        ld.push({
          '@context': 'https://schema.org', '@type': 'Product', name: p.name, brand: { '@type': 'Brand', name: brand },
          ...(p.description ? { description: p.description } : {}),
          ...(p.images.length ? { image: p.images.map((i) => abs(siteUrl, i.src)) } : {}),
          offers: { '@type': 'Offer', priceCurrency: settings.currency, price: p.price.toFixed(2), url: `${siteUrl}${pathname}`, availability: `https://schema.org/${inStock ? 'InStock' : 'OutOfStock'}` },
        });
      }
    } else status = 404;
  } else if (/^\/order\/[A-Za-z0-9_-]{10,64}$/.test(pathname)) {
    [title, description, noindex] = [`Your order — ${brand}`, 'Order details.', true];
  } else if (PAGES[pathname]) {
    const [t, d, ni] = PAGES[pathname];
    title = pathname === '/' ? `${brand} — ${t}` : `${t} — ${brand}`;
    description = d;
    noindex = Boolean(ni);
  } else status = 404;

  if (status === 404) [title, description, noindex] = [`Page not found — ${brand}`, 'This page does not exist.', true];
  if (pathname === '/') {
    const sameAs = Object.values(settings.social).filter(Boolean);
    ld.push({ '@context': 'https://schema.org', '@type': 'Organization', name: brand, url: siteUrl, ...(settings.logo ? { logo: abs(siteUrl, settings.logo) } : {}), ...(sameAs.length ? { sameAs } : {}) });
  }

  const url = `${siteUrl}${pathname}`;
  const head = [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(description)}">`,
    noindex ? '<meta name="robots" content="noindex">' : `<link rel="canonical" href="${esc(url)}">`,
    `<meta property="og:site_name" content="${esc(brand)}">`,
    `<meta property="og:type" content="${type}">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(description)}">`,
    `<meta property="og:url" content="${esc(url)}">`,
    img ? `<meta property="og:image" content="${esc(img)}">` : '',
    `<meta name="twitter:card" content="${img ? 'summary_large_image' : 'summary'}">`,
    `<meta name="twitter:title" content="${esc(title)}">`,
    `<meta name="twitter:description" content="${esc(description)}">`,
    img ? `<meta name="twitter:image" content="${esc(img)}">` : '',
    extra.trim(),
    ...ld.map(jsonLd),
  ].filter(Boolean).join('\n');
  return { status, head };
}

export function sitemap(siteUrl, products) {
  const urls = ['/', '/shop', '/size-guide', '/faq', '/shipping-returns', '/contact', '/privacy',
    ...products.filter((p) => !p.sample).map((p) => `/product/${p.slug}`)];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${esc(siteUrl + u)}</loc></url>`).join('\n')}\n</urlset>\n`;
}

export function robots(siteUrl) {
  return `User-agent: *\nDisallow: /admin\nDisallow: /api/\nDisallow: /checkout\nDisallow: /order/\nSitemap: ${siteUrl}/sitemap.xml\n`;
}
