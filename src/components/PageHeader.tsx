import type { JSX } from "@solidjs/web";

/**
 * The local header every authenticated page shares.
 *
 * Each page used to roll its own title row, so Favourites, Export and Account
 * all looked subtly different. This keeps the rule, the type scale and the
 * spacing in one place; a page only supplies its title and whatever controls
 * belong on the right.
 */
export function PageHeader(props: {
  title: string;
  /** A short qualifier shown next to the title, such as "Stats Sync". */
  eyebrow?: string;
  /** Controls rendered on the right of the title row. */
  actions?: JSX.Element;
  /** A row under the rule, used for keyboard hints. */
  hints?: JSX.Element;
}) {
  return (
    <>
      <div class="mb-8 border-b-4 border-[#0a0a0a] pb-4">
        <div class="flex flex-wrap items-center justify-between gap-4">
          <div class="flex flex-wrap items-baseline gap-6">
            <h1 class="text-2xl font-black uppercase tracking-tight">
              {props.title}
            </h1>
            {props.eyebrow && (
              <span class="text-xs uppercase tracking-widest text-[#5c5c5c]">
                {props.eyebrow}
              </span>
            )}
          </div>
          {props.actions && (
            <div class="flex flex-wrap items-center gap-2">{props.actions}</div>
          )}
        </div>
      </div>
      {props.hints && (
        <div class="mb-6 flex flex-wrap gap-2 text-[0.65rem] font-bold uppercase tracking-widest text-[#5c5c5c]">
          {props.hints}
        </div>
      )}
    </>
  );
}
