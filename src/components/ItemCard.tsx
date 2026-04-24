import { Show } from "solid-js";

type ImageLike = { url: string };

export function ItemCard(props: {
  name: string;
  description?: string;
  images?: ImageLike[];
  url?: string;
  privateIcon?: boolean;
  collaborativeIcon?: boolean;
  onClick?: () => void;
}) {
  const image = () => props.images?.[0]?.url ?? "/assets/placeholder.svg";
  const isPlaceholder = () => !props.images?.[0]?.url;
  const open = () => {
    if (props.onClick) return props.onClick();
    if (!props.url) return;
    if (props.url.startsWith("spotify:")) window.location.href = props.url;
    else window.open(props.url, "_blank", "noopener");
  };

  return (
    <button
      type="button"
      onClick={open}
      class="group grid w-full grid-cols-[5.75rem_1fr] items-center rounded-2xl border border-transparent p-2 text-left opacity-0 animate-[itemFadeIn_.22s_ease-out_forwards] transition hover:border-[#1DB954]/30 hover:bg-white/[0.06] sm:grid-cols-[10rem_1fr] sm:p-3"
    >
      <img
        src={image()}
        alt={props.name}
        loading="lazy"
        class={`h-20 w-20 rounded-xl object-cover sm:h-36 sm:w-36 ${isPlaceholder() ? "object-scale-down p-5 invert" : ""}`}
      />
      <span class="min-w-0 px-3 sm:px-8">
        <span class="block truncate text-base text-white sm:text-xl">{props.name}</span>
        <span class="mt-2 flex items-center gap-2 truncate text-sm text-zinc-400 sm:text-lg">
          <Show when={props.collaborativeIcon}>
            <img class="h-5 w-5 shrink-0 invert" src="/assets/people-icon.svg" alt="Collaborative" />
          </Show>
          <Show when={!props.collaborativeIcon && props.privateIcon}>
            <img class="h-5 w-5 shrink-0 invert" src="/assets/lock-icon.svg" alt="Private" />
          </Show>
          {props.description}
        </span>
      </span>
    </button>
  );
}
