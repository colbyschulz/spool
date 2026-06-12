import type { FastifyInstance } from "fastify";
import {
  normalizeAffiliation,
  type AuthorPublicationsResponse,
  type SearchAuthorsResponse,
} from "@spool/shared";
import type { PubMedClient } from "../pubmed/client.js";
import { buildCandidates, matchesQuery } from "../pubmed/candidates.js";

// Disambiguation only needs a handful of recent papers to identify distinct affiliations.
// Publications panel benefits from a larger set for usefulness.
const DISAMBIG_RETMAX = 10;
const PUBS_RETMAX = 50;

// Author names: personal ("Smith J", "'t Hooft G") and collective
// ("COVID-19 Genomics UK (COG-UK) Consortium") — letters in any script,
// digits, marks, and common name punctuation. Must start with a letter,
// digit, or apostrophe so whitespace-only input is rejected before it
// wastes an upstream call.
const NAME_SCHEMA = {
  type: "string",
  minLength: 1,
  maxLength: 200,
  pattern: "^[\\p{L}\\p{N}'’][\\p{L}\\p{M}\\p{N}'’ .,&()/-]*$",
} as const;

export function authorRoutes(app: FastifyInstance, client: PubMedClient): void {
  app.get<{ Querystring: { name?: string } }>(
    "/api/authors/search",
    {
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
      schema: {
        querystring: {
          type: "object",
          required: ["name"],
          properties: { name: NAME_SCHEMA },
        },
      },
    },
    async (req): Promise<SearchAuthorsResponse> => {
      const name = req.query.name!;
      const pubs = await client.searchAuthorPublications(name, DISAMBIG_RETMAX);
      return { candidates: buildCandidates(pubs, name) };
    },
  );

  app.get<{ Querystring: { name?: string; affiliation?: string } }>(
    "/api/authors/publications",
    {
      config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
      schema: {
        querystring: {
          type: "object",
          required: ["name"],
          properties: {
            name: NAME_SCHEMA,
            affiliation: { type: "string", maxLength: 500 },
          },
        },
      },
    },
    async (req): Promise<AuthorPublicationsResponse> => {
      const { name, affiliation } = req.query;
      const pubs = await client.searchAuthorPublications(name!, PUBS_RETMAX);
      const wanted = normalizeAffiliation(affiliation);
      const filtered = wanted
        ? pubs.filter((p) =>
            p.authors.some(
              (a) =>
                matchesQuery(a.name, name!) && normalizeAffiliation(a.affiliation) === wanted,
            ),
          )
        : pubs;
      return { publications: filtered };
    },
  );
}
