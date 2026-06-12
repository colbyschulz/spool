import { useQuery } from "@tanstack/react-query";
import { searchAuthors, getAuthorPublications } from "./client.js";

export const queryKeys = {
  authorSearch: (name: string) => ["authorSearch", name] as const,
  authorPublications: (name: string, affiliation?: string) =>
    ["authorPublications", name, affiliation ?? ""] as const,
};

export function useAuthorSearch(name: string) {
  return useQuery({
    queryKey: queryKeys.authorSearch(name),
    queryFn: ({ signal }) => searchAuthors(name, signal),
    enabled: name.trim().length > 0,
  });
}

export function useAuthorPublications(name: string | null, affiliation?: string) {
  return useQuery({
    queryKey: queryKeys.authorPublications(name ?? "", affiliation),
    queryFn: ({ signal }) => getAuthorPublications(name!, affiliation, signal),
    enabled: !!name,
  });
}
