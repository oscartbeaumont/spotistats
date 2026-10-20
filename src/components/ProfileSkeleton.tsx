import { For } from "solid-js";

export function ProfileHeaderSkeleton() {
  return (
    <header
      aria-hidden="true"
      class="order-1 border-b-4 border-[#0a0a0a] pb-6 xl:col-start-1 xl:row-start-1"
    >
      <div class="flex flex-wrap items-start gap-5">
        <div class="h-24 w-24 shrink-0 animate-pulse border-4 border-[#0a0a0a] bg-[#d8d3ca] md:h-28 md:w-28" />
        <div class="min-w-0 flex-1 space-y-3 pt-1">
          <div class="h-2.5 w-24 animate-pulse bg-[#d8d3ca]" />
          <div class="h-9 w-[min(22rem,70%)] animate-pulse bg-[#d8d3ca]" />
          <div class="h-2.5 w-44 max-w-full animate-pulse bg-[#d8d3ca]" />
          <div class="h-2.5 w-28 animate-pulse bg-[#d8d3ca]" />
        </div>
        <div class="flex flex-wrap gap-2 md:ml-auto">
          <div class="h-8 w-24 animate-pulse border-[3px] border-[#0a0a0a] bg-[#d8d3ca]" />
          <div class="h-8 w-28 animate-pulse border-[3px] border-[#0a0a0a] bg-[#d8d3ca]" />
        </div>
      </div>
    </header>
  );
}

export function StatsRailSkeleton() {
  return (
    <div class="space-y-4 xl:sticky xl:top-24" aria-hidden="true">
      <section class="border-4 border-[#0a0a0a] p-5">
        <div class="mb-4 flex items-start justify-between gap-3">
          <div class="space-y-2">
            <div class="h-2.5 w-28 animate-pulse bg-[#d8d3ca]" />
            <div class="h-2 w-36 animate-pulse bg-[#d8d3ca]" />
          </div>
          <div class="h-7 w-20 animate-pulse border-[3px] border-[#0a0a0a] bg-[#d8d3ca]" />
        </div>
        <div>
          <For each={[0, 1, 2, 3, 4]}>
            {() => (
              <div class="flex items-center gap-3 border-b-[3px] border-[#0a0a0a] py-3 last:border-b-0">
                <div class="h-9 w-9 shrink-0 animate-pulse border-2 border-[#0a0a0a] bg-[#d8d3ca]" />
                <div class="min-w-0 flex-1 space-y-2">
                  <div class="h-2.5 w-3/4 animate-pulse bg-[#d8d3ca]" />
                  <div class="h-2 w-1/2 animate-pulse bg-[#d8d3ca]" />
                  <div class="h-2 w-1/3 animate-pulse bg-[#d8d3ca]" />
                </div>
              </div>
            )}
          </For>
        </div>
      </section>
      <section class="border-4 border-[#0a0a0a] p-5">
        <div class="mb-3 flex items-center justify-between gap-3">
          <div class="h-2.5 w-20 animate-pulse bg-[#d8d3ca]" />
          <div class="h-5 w-8 animate-pulse border-[3px] border-[#0a0a0a] bg-[#d8d3ca]" />
        </div>
        <div class="space-y-3">
          <For each={[0, 1, 2]}>
            {() => (
              <div class="flex items-center justify-between gap-2">
                <div class="h-2 w-20 animate-pulse bg-[#d8d3ca]" />
                <div class="h-2 w-24 animate-pulse bg-[#d8d3ca]" />
              </div>
            )}
          </For>
        </div>
        <div class="mt-4 h-2 w-24 animate-pulse bg-[#d8d3ca]" />
      </section>
    </div>
  );
}

/** The profile shell, used while the route chunk or its first data load resolves. */
export function ProfileSkeleton() {
  return (
    <main class="app-main flex-1 p-8 md:p-16">
      <div class="space-y-8">
        <div class="grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,26rem)] xl:items-start">
          <ProfileHeaderSkeleton />
          <aside class="order-2 xl:col-start-2 xl:row-span-2 xl:row-start-1">
            <StatsRailSkeleton />
          </aside>
        </div>
      </div>
    </main>
  );
}
