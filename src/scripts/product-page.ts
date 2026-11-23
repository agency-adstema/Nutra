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

  // Aktivni tab + sticky CTA: jedan rAF-ograničen scroll handler (radi i kod skoka na vrh/dno strane)
  const tabs = [...document.querySelectorAll<HTMLAnchorElement>('[data-tab]')];
  const sections = tabs
    .map((t) => ({ tab: t, el: document.getElementById(t.getAttribute('href')!.slice(1)) }))
    .filter((x): x is { tab: HTMLAnchorElement; el: HTMLElement } => !!x.el);
  const bar = document.querySelector<HTMLElement>('[data-sticky-cta]');
  const heroCta = document.querySelector<HTMLElement>('[data-hero-cta]');
  const form = document.getElementById('poruci');

  // The price/package selector next to the hero image mirrors the real
  // purchase form. Never send an order here; only select the matching package.
  const heroPackages = [...root.querySelectorAll<HTMLAnchorElement>('[data-hero-package]')];
  const orderForm = root.querySelector<HTMLFormElement>('[data-order-form]');
  const setHeroSelected = (packageId: string) => {
    heroPackages.forEach((link) => {
      link.dataset.selected = link.dataset.heroPackage === packageId ? 'true' : 'false';
    });
  };
  heroPackages.forEach((link) => {
    link.addEventListener('click', () => {
      const packageId = link.dataset.heroPackage;
      if (!packageId) return;
      const realInput = [...(orderForm?.querySelectorAll<HTMLInputElement>('input[name="packageId"]') ?? [])]
        .find((input) => input.value === packageId);
      if (realInput) {
        if (realInput.type === 'radio') realInput.checked = true;
        realInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
      setHeroSelected(packageId);
    });
  });
  orderForm?.querySelectorAll<HTMLInputElement>('input[name="packageId"]').forEach((input) => {
    input.addEventListener('change', () => setHeroSelected(input.value));
  });
  let lockUntil = 0;
  let stickyShown = false;

  const setActive = (tab: HTMLAnchorElement) => {
    if (tab.getAttribute('aria-current') === 'true') return;
    tabs.forEach((t) => t.removeAttribute('aria-current'));
    tab.setAttribute('aria-current', 'true');
  };
  tabs.forEach((t) =>
    t.addEventListener('click', () => {
      lockUntil = Date.now() + 1000;
      setActive(t);
    }),
  );

  const update = () => {
    const vh = window.innerHeight;
    // aktivan je poslednji odeljak čiji je vrh prošao liniju ispod headera (kod istog vrha — prvi po redu)
    if (sections.length && Date.now() > lockUntil) {
      const line = 160;
      let active = sections[0];
      let bestTop = -Infinity;
      for (const sct of sections) {
        const top = sct.el.getBoundingClientRect().top;
        if (top <= line && top > bestTop) {
          bestTop = top;
          active = sct;
        }
      }
      setActive(active.tab);
    }
    if (bar && heroCta && form) {
      const heroPassed = heroCta.getBoundingClientRect().bottom < 0;
      const f = form.getBoundingClientRect();
      const formOnScreen = f.top < vh * 0.9 && f.bottom > 0;
      const show = heroPassed && !formOnScreen;
      if (show !== stickyShown) {
        stickyShown = show;
        bar.classList.toggle('translate-y-full', !show);
        bar.setAttribute('aria-hidden', String(!show));
        bar.querySelector('a')?.setAttribute('tabindex', show ? '0' : '-1');
      }
    }
  };

  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      update();
    });
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  update();
}
