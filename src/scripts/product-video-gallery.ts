/** R2 poster-first video gallery: native <video preload="none"> loads no MP4
 * until user requests playback. Mobile navigation scrolls two clips per step;
 * desktop shows 4 videos in a grid. No third-party iframe or Instagram links.
 */
export function initProductVideoGalleries(): void {
  document.querySelectorAll<HTMLElement>('[data-product-video-gallery]').forEach(root => {
    if (root.dataset.videoGalleryReady === 'true') return;
    root.dataset.videoGalleryReady = 'true';

    const viewport = root.querySelector<HTMLElement>('[data-video-viewport]');
    const cards = [...root.querySelectorAll<HTMLElement>('[data-product-video-card]')];
    const videos = [...root.querySelectorAll<HTMLVideoElement>('video')];
    const prev = root.querySelector<HTMLButtonElement>('[data-video-prev]');
    const next = root.querySelector<HTMLButtonElement>('[data-video-next]');
    const indicator = root.querySelector<HTMLElement>('[data-video-current]');
    if (!viewport || cards.length === 0) return;
    const pageCount = Math.ceil(cards.length/2);
    let page = 0;

    const controls = () => {
      if (prev) prev.disabled = page === 0;
      if (next) next.disabled = page >= pageCount - 1;
      if (indicator) indicator.textContent = `${page+1} / ${pageCount}`;
    };
    const go = (newPage: number) => {
      page = Math.min(pageCount-1,Math.max(0,newPage));
      const target=cards[page*2];
      if(target){
        viewport.scrollTo({
          left: target.offsetLeft - cards[0].offsetLeft,
          behavior: 'smooth',
        });
      }
      controls();
    };
    prev?.addEventListener('click', () => go(page-1));
    next?.addEventListener('click', () => go(page+1));

    // Keep arrows in sync if visitors swipe instead of clicking.
    let framePending=false;
    viewport.addEventListener('scroll', () => {
      if(framePending) return;
      framePending=true;
      requestAnimationFrame(() => {
        framePending=false;
        const w=cards.length > 1 ? cards[1].offsetLeft-cards[0].offsetLeft : viewport.clientWidth;
        if(w > 0){
          page = Math.max(0,Math.min(pageCount-1,Math.round(viewport.scrollLeft/(w*2))));
          controls();
        }
      });
    }, {passive:true});

    for(const video of videos){
      video.addEventListener('play', () => {
        // Pause other players everywhere on the page.
        document.querySelectorAll<HTMLVideoElement>('video').forEach(other => {
          if(other !== video && !other.paused) other.pause();
        });
      });
    }
    controls();
  });
}
