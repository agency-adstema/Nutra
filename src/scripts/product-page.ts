/** Stranica proizvoda: view_item, aktivni tab, akordeoni, mobilni sticky CTA */
import { track } from './analytics';

export function initProductPage(): void {
  const root = document.querySelector<HTMLElement>('[data-product-page]');
  if (!root) return;
  const info = JSON.parse(root.dataset.product || '{}');

  track('view_item', {
    currency: info.currency,
    value: info.value ?? undefined,
    items: [{ item_id: info.slug, item_name: info.name, item_category: info.category }],
  });

  // Akordeoni: na desktopu ostaju otvoreni
  const desktop = window.matchMedia('(min-width: 1024px)');
  document.querySelectorAll<HTMLDetailsElement>('details[data-acc]').forEach((d) => {
    d.querySelector('summary')?.addEventListener('click', (e) => {
      if (desktop.matches) e.preventDefault();
    });
  });
  desktop.addEventListener('change', (e) => {
    if (e.matches) document.querySelectorAll<HTMLDetailsElement>('details[data-acc]').forEach((d) => (d.open = true));
  });
  // Link ka sekciji otvara akordeon
  document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]').forEach((a) => {
    a.addEventListener('click', () => {
      const target = document.querySelector<HTMLElement>(a.getAttribute('href')!);
      if (target instanceof HTMLDetailsElement) target.open = true;
    });
  });

  // Aktivni tab
  const tabs = [...document.querySelectorAll<HTMLAnchorElement>('[data-tab]')];
  if (tabs.length && 'IntersectionObserver' in window) {
    const byId = new Map(tabs.map((t) => [t.getAttribute('href')!.slice(1), t]));
    const order = [...byId.keys()];
    const visible = new Set<string>();
    let lockUntil = 0;
    const setActive = (id: string) => {
      tabs.forEach((t) => t.removeAttribute('aria-current'));
      byId.get(id)?.setAttribute('aria-current', 'true');
    };
    tabs.forEach((t) =>
      t.addEventListener('click', () => {
        lockUntil = Date.now() + 1000;
        setActive(t.getAttribute('href')!.slice(1));
      }),
    );
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => (en.isIntersecting ? visible.add(en.target.id) : visible.delete(en.target.id)));
        if (Date.now() < lockUntil) return;
        const first = order.find((id) => visible.has(id));
        if (first) setActive(first);
      },
      { rootMargin: '-25% 0px -55% 0px' },
    );
    byId.forEach((_, id) => {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    });
  }

  // Sticky CTA: vidljiv kada je hero CTA van ekrana, a forma još nije na ekranu
  const bar = document.querySelector<HTMLElement>('[data-sticky-cta]');
  const heroCta = document.querySelector('[data-hero-cta]');
  const form = document.getElementById('poruci');
  if (bar && heroCta && form && 'IntersectionObserver' in window) {
    let heroVisible = true;
    let formVisible = false;
    const update = () => {
      const show = !heroVisible && !formVisible;
      bar.classList.toggle('translate-y-full', !show);
      bar.setAttribute('aria-hidden', String(!show));
      bar.querySelector('a')?.setAttribute('tabindex', show ? '0' : '-1');
      document.body.classList.toggle('has-sticky-cta', show);
    };
    new IntersectionObserver(([e]) => {
      heroVisible = e.isIntersecting || e.boundingClientRect.top > 0;
      update();
    }).observe(heroCta);
    new IntersectionObserver(([e]) => {
      formVisible = e.isIntersecting;
      update();
    }, { rootMargin: '0px 0px -10% 0px' }).observe(form);
  }
}
