import type { FastifyInstance } from "fastify";
import type { GetPublicationResponse } from "@spool/shared";
import type { PubMedClient } from "../pubmed/client.js";

export function publicationRoutes(app: FastifyInstance, client: PubMedClient): void {
  app.get<{ Params: { pmid: string } }>(
    "/api/publications/:pmid",
    {
      config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
      schema: {
        params: {
          type: "object",
          required: ["pmid"],
          properties: { pmid: { type: "string", pattern: "^\\d+$", maxLength: 9 } },
        },
      },
    },
    // No return annotation: the 404 branch returns the reply, not the envelope.
    async (req, reply) => {
      const pub = await client.getPublication(req.params.pmid);
      if (!pub) return reply.code(404).send({ error: "not_found", message: "publication not found" });
      const body: GetPublicationResponse = { publication: pub };
      return body;
    },
  );
}
