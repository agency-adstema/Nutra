/** R2 previews + one full-size native video dialog.
 *
 * Previews are muted, metadata-only and show a frame at 0.5 s. The full MP4
 * is opened only after a deliberate card click. Posters that return 404 are
 * removed from the preview, allowing Chrome to paint the decoded video frame.
 */
export function initProductVideoGalleries(): void {
  document.querySelectorAll<HTMLElement>('[data-product-video-gallery]').forEach((root) => {
    if (root.dataset.videoGalleryReady === 'true') return;
    root.dataset.videoGalleryReady = 'true';

    const viewport = root.querySelector<HTMLElement>('[data-video-viewport]');
    const cards = [...root.querySelectorAll<HTMLElement>('[data-product-video-card]')];
    const prev = root.querySelector<HTMLButtonElement>('[data-video-prev]');
    const next = root.querySelector<HTMLButtonElement>('[data-video-next]');
    const indicator = root.querySelector<HTMLElement>('[data-video-current]');
    const dialog = root.querySelector<HTMLDialogElement>('[data-video-dialog]');
    const modalVideo = dialog?.querySelector<HTMLVideoElement>('[data-video-player]');
    const closeButton = dialog?.querySelector<HTMLButtonElement>('[data-video-close]');
    if (!viewport || cards.length === 0 || !dialog || !modalVideo || !closeButton) return;

    // Mobile: one snap position contains two cards; desktop displays the grid.
    const pageCount = Math.ceil(cards.length / 2);
    let page = 0;
    const updateControls = () => {
      if (prev) prev.disabled = page === 0;
      if (next) next.disabled = page >= pageCount - 1;
      if (indicator) indicator.textContent = `${page + 1} / ${pageCount}`;
    };
    const scrollToPage = (index: number) => {
      page = Math.max(0, Math.min(pageCount - 1, index));
      const target = cards[page * 2];
      if (target) {
        viewport.scrollTo({
          left: target.offsetLeft - cards[0].offsetLeft,
          behavior: 'smooth',
        });
      }
      updateControls();
    };
    prev?.addEventListener('click', () => scrollToPage(page - 1));
    next?.addEventListener('click', () => scrollToPage(page + 1));

    let framePending = false;
    viewport.addEventListener('scroll', () => {
      if (framePending) return;
      framePending = true;
      requestAnimationFrame(() => {
        framePending = false;
        const step = cards.length > 1 ? cards[1].offsetLeft - cards[0].offsetLeft : viewport.clientWidth;
        if (step > 0) {
          page = Math.max(0, Math.min(pageCount - 1, Math.round(viewport.scrollLeft / (step * 2))));
          updateControls();
        }
      });
    }, { passive: true });

    // A video tag doesn't emit an error event for its poster attribute.
    // Probe each poster independently and remove it when R2 returns 404.
    // Then the #t=0.5 fragment + metadata can show the first video frame.
    const previews = [...root.querySelectorAll<HTMLVideoElement>('[data-video-preview]')];
    for (const preview of previews) {
      const posterUrl = preview.getAttribute('poster');
      if (!posterUrl) continue;
      const check = new Image();
      check.addEventListener('error', () => {
        if (!preview.isConnected) return;
        preview.removeAttribute('poster');
        const showFrame = () => {
          try {
            if (preview.readyState >= HTMLMediaElement.HAVE_METADATA) preview.currentTime = 0.5;
          } catch { /* Some platforms cannot seek before a media range is ready. */ }
        };
        if (preview.readyState >= HTMLMediaElement.HAVE_METADATA) showFrame();
        else preview.addEventListener('loadedmetadata', showFrame, { once: true });
      }, { once: true });
      check.src = posterUrl;
    }

    // Keep exactly one player audible across all product galleries.
    const stopOthers = (active: HTMLVideoElement) => {
      document.querySelectorAll<HTMLVideoElement>('video').forEach((other) => {
        if (other !== active && !other.paused) other.pause();
      });
    };
    modalVideo.addEventListener('play', () => stopOthers(modalVideo));

    let opener: HTMLButtonElement | null = null;
    let oldOverflow = '';

    root.querySelectorAll<HTMLButtonElement>('[data-video-open]').forEach((button) => {
      button.addEventListener('click', () => {
        const src = button.dataset.videoSrc;
        if (!src) return;
        if (dialog.open) dialog.close();

        opener = button;
        stopOthers(modalVideo);
        modalVideo.src = src;
        const poster = button.dataset.videoPoster;
        const preview = button.parentElement?.querySelector<HTMLVideoElement>('[data-video-preview]');
        // Don't reuse a known-broken poster in the modal.
        if (poster && preview?.hasAttribute('poster')) modalVideo.poster = poster;
        else modalVideo.removeAttribute('poster');
        modalVideo.muted = false;
        modalVideo.controls = true;
        modalVideo.autoplay = true;
        modalVideo.playsInline = true;

        oldOverflow = document.documentElement.style.overflow;
        document.documentElement.style.overflow = 'hidden';
        try {
          dialog.showModal();
          closeButton.focus();
          void modalVideo.play().catch(() => {
            // A browser may block autoplay. Controls remain visible for manual play.
          });
        } catch {
          document.documentElement.style.overflow = oldOverflow;
          modalVideo.pause();
        }
      });
    });

    closeButton.addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', (event) => {
      // A click on the ::backdrop targets the dialog itself.
      if (event.target !== dialog) return;
      const bounds = dialog.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right ||
          event.clientY < bounds.top || event.clientY > bounds.bottom) {
        dialog.close();
      }
    });
    // Escape triggers native dialog cancel + close. Restore playback and focus
    // whether the visitor used X, Escape or the backdrop.
    dialog.addEventListener('close', () => {
      modalVideo.pause();
      modalVideo.removeAttribute('src');
      modalVideo.removeAttribute('poster');
      modalVideo.load();
      document.documentElement.style.overflow = oldOverflow;
      opener?.focus({ preventScroll: true });
    });
    updateControls();
  });
}
