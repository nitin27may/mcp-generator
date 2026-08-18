import Image from 'next/image';

/**
 * Wraps a real screenshot of the running wizard (captured by
 * `scripts/capture-hero.mjs`) in a window-chrome frame, with the caption
 * outside the image rather than annotations drawn on top of it — overlay
 * callouts positioned against a specific PNG silently drift the moment the
 * screenshot is regenerated, and a caption cannot.
 */
export function ScreenshotFrame({
  src,
  alt,
  caption,
  width,
  height,
  priority = false,
}: {
  src: string;
  alt: string;
  caption: string;
  width: number;
  height: number;
  priority?: boolean;
}) {
  return (
    <figure className="flex flex-col gap-2">
      <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
        <div aria-hidden="true" className="flex items-center gap-1.5 border-b bg-muted px-3 py-2">
          <span className="size-2.5 rounded-full bg-foreground/15" />
          <span className="size-2.5 rounded-full bg-foreground/15" />
          <span className="size-2.5 rounded-full bg-foreground/15" />
        </div>
        <Image src={src} alt={alt} width={width} height={height} priority={priority} className="w-full" />
      </div>
      <figcaption className="text-sm text-muted-foreground">{caption}</figcaption>
    </figure>
  );
}
