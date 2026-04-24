import { useQuery } from "@tanstack/solid-query";
import { Suspense } from "solid-js";
import { isServer } from "solid-js/web";

export default function Demo() {
  const todo = useQuery(() => ({
    queryKey: ["todo"],
    queryFn: () => `Hello World ${isServer}`,
    enabled: !isServer,
  }));

  return (
    <Suspense fallback="Loading...">
      <p>{todo.data}</p>
    </Suspense>
  );
}
