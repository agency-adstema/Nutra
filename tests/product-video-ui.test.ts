import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const template = readFileSync(new URL('../src/components/product/ProductVideoGallery.astro', import.meta.url), 'utf8');
const behavior = readFileSync(new URL('../src/scripts/product-video-gallery.ts', import.meta.url), 'utf8');

describe('Video previews and large modal', () => {
  it('uses a lightweight muted preview with a guaranteed large custom play button', () => {
    const preview = template.match(/<video\s+[\s\S]*?data-video-preview[\s\S]*?<\/video>/)?.[0];
    expect(preview).toBeDefined();
    expect(preview).toContain('preload="metadata"');
    expect(preview).toContain('poster={video.poster}');
    expect(preview).toContain('muted');
    expect(preview).toContain('playsinline');
    expect(preview).toContain('#t=0.5');
    expect(preview).not.toMatch(/\scontrols(?:\s|=|>)/);
    expect(template).toContain('data-video-open');
    expect(template).toContain('h-14 w-14');
  });

  it('opens one accessible vertical dialog with real controls and autoplay', () => {
    expect(template).toContain('<dialog');
    expect(template).toContain('data-video-dialog');
    expect(template).toContain('data-video-close');
    expect(template).toContain('data-video-player');
    expect(template).toContain('max-h-[90dvh]');
    expect(template).toContain('aspect-[9/16]');
    expect(template).toMatch(/data-video-player[\s\S]*?preload="metadata"[\s\S]*?controls[\s\S]*?autoplay[\s\S]*?playsinline/);
  });

  it('handles missing R2 JPGs and closes/pauses reliably', () => {
    expect(behavior).toContain('const check = new Image()');
    expect(behavior).toContain("preview.removeAttribute('poster')");
    expect(behavior).toContain('preview.currentTime = 0.5');
    expect(behavior).toContain('dialog.showModal()');
    expect(behavior).toContain("closeButton.addEventListener('click'");
    expect(behavior).toContain("dialog.addEventListener('click'");
    expect(behavior).toContain("dialog.addEventListener('close'");
    expect(behavior).toContain('modalVideo.pause()');
    expect(behavior).toContain('stopOthers(modalVideo)');
  });
});
