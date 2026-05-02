export function AvatarImg({
  src,
  alt,
  size = 36,
}: {
  src: string | null | undefined;
  alt: string;
  size?: number;
}) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt}
        width={size}
        height={size}
        className="shrink-0 rounded-full object-cover ring-2 ring-white/80 dark:ring-zinc-800"
      />
    );
  }
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-semibold text-emerald-800 ring-2 ring-white/80 dark:bg-emerald-950 dark:text-emerald-200 dark:ring-zinc-800"
      style={{ width: size, height: size }}
      aria-hidden
    >
      {alt.slice(0, 1).toUpperCase()}
    </div>
  );
}
