/** 2 videos per screen; next/previous moves by TWO, not by one. */
export function initProductVideoGalleries(): void {
  document.querySelectorAll<HTMLElement>('[data-product-video-gallery]').forEach((root) => {
    if (root.dataset.videoGalleryReady === 'true') return;
    root.dataset.videoGalleryReady = 'true';

    const pages = [...root.querySelectorAll<HTMLElement>('[data-video-page]')];
    const prev = root.querySelector<HTMLButtonElement>('[data-video-prev]');
    const next = root.querySelector<HTMLButtonElement>('[data-video-next]');
    const currentEl = root.querySelector<HTMLElement>('[data-video-current]');
    if (!pages.length) return;

    let current = 0;
    const render = () => {
      pages.forEach((page, index) => {
        const active = index === current;
        page.hidden = !active;
        page.classList.toggle('hidden', !active);
        if (!active) page.querySelectorAll<HTMLVideoElement>('video').forEach((v) => v.pause());
      });
      if (prev) prev.disabled = current === 0;
      if (next) next.disabled = current === pages.length - 1;
      if (currentEl) currentEl.textContent = `${current + 1} / ${pages.length}`;
    };
    prev?.addEventListener('click', () => { if (current > 0) { current--; render(); } });
    next?.addEventListener('click', () => { if (current < pages.length - 1) { current++; render(); } });
    render();

    root.querySelectorAll<HTMLButtonElement>('[data-product-video-play]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const src = btn.dataset.src;
        if (!src) return;
        const player = document.createElement('video');
        player.src = src;
        player.controls = true;
        player.playsInline = true;
        player.preload = 'metadata';
        player.className = 'absolute inset-0 h-full w-full bg-black object-contain';
        player.setAttribute('aria-label', btn.dataset.videoTitle || 'Video o proizvodu');
        const poster = btn.querySelector<HTMLImageElement>('img')?.src;
        if (poster) player.poster = poster;
        player.addEventListener('play', () => {
          root.querySelectorAll<HTMLVideoElement>('video').forEach((other) => {
            if (other !== player) other.pause();
          });
        });
        btn.replaceWith(player);
        player.play().catch(() => { /* mobile browsers may require pressing play */ });
      }, { once: true });
    });
  });
}
