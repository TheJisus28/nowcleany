import { cn } from './ui';

/** NOW CLEANY's own mark (the "nc" monogram from nowcleany.co), served from /brand. */
export function BrandMark({
  className,
  inverted = false,
}: {
  className?: string | undefined;
  inverted?: boolean;
}) {
  return (
    <img
      src="/brand/nowcleany-mark.png"
      alt=""
      width={32}
      height={32}
      className={cn('size-8 rounded-[8px]', inverted && 'ring-1 ring-white/25', className)}
    />
  );
}

/** "SCIP" is the internal system; the mark and name are NOW CLEANY's. */
export function BrandLockup({
  inverted = false,
  large = false,
}: {
  inverted?: boolean;
  large?: boolean;
}) {
  return (
    <div className={cn('flex items-center', large ? 'gap-3.5' : 'gap-2.5')}>
      <BrandMark inverted={inverted} className={large ? 'size-12 rounded-[12px]' : undefined} />
      <div className="leading-none">
        <p
          className={cn(
            large ? 'text-[22px]' : 'text-[17px]',
            'font-bold tracking-[0.02em] [font-stretch:118%]',
            inverted ? 'text-white' : 'text-ink',
          )}
        >
          SCIP
        </p>
        <p
          className={cn(
            large ? 'mt-1.5 text-[13px]' : 'mt-1 text-[11px]',
            inverted ? 'text-white/70' : 'text-ink-3',
          )}
        >
          Now Cleany S.A.S.
        </p>
      </div>
    </div>
  );
}
