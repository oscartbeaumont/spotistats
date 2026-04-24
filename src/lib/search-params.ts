import { useSearchParams } from "@solidjs/router";
import { SetStoreFunction } from "solid-js/store";
import * as v from "valibot";

export function useValidatedSearchParams<const TSchema extends v.GenericSchema<Record<string, unknown>>>(schema: TSchema) {
  const [searchParams, setSearchParams] = useSearchParams();

  const params = () => v.parse(schema, { ...searchParams }) as v.InferOutput<TSchema>;

  return [params, setSearchParams as SetStoreFunction<Partial<v.InferOutput<TSchema>>>] as const;
}
