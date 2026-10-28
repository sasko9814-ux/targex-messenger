import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "@/routeTree.gen";

describe("protected routes", () => {
  it("chats, chat and profile pages sit under the signed-in gate", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
    for (const path of ["/chats", "/chats/00000000-0000-0000-0000-000000000000", "/profile"]) {
      const ids = router.matchRoutes(path).map((m) => m.routeId);
      expect(ids).toContain("/_authenticated");
    }
  });
});
