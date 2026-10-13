import { afterEach, describe, expect, it, vi } from "vitest";
import { api, useSession, type Actor } from "../src/services/api";
import { queryClient } from "../src/app/queryClient";
const actor: Actor = {
  userId: "fixture-one",
  companyId: "fictional",
  name: "Test One",
  email: "one@example.test",
  scope: "self",
  permissions: ["employees.read"],
};
afterEach(() => {
  useSession.getState().set(null);
  queryClient.clear();
  vi.unstubAllGlobals();
});
describe("account-isolated client cache", () => {
  it("preserves identity and data when an access token rotates", () => {
    useSession.getState().set("first", actor);
    queryClient.setQueryData(["restricted"], { salary: "fictional" });
    useSession.getState().set("rotated");
    expect(useSession.getState().actor).toEqual(actor);
    expect(queryClient.getQueryData(["restricted"])).toEqual({
      salary: "fictional",
    });
  });
  it("removes restricted records on expiration or logout", () => {
    useSession.getState().set("first", actor);
    queryClient.setQueryData(["restricted"], { salary: "fictional" });
    useSession.getState().set(null);
    expect(queryClient.getQueryData(["restricted"])).toBeUndefined();
    expect(useSession.getState().actor).toBeNull();
  });
  it("removes previous-account records on direct account replacement", () => {
    useSession.getState().set("first", actor);
    queryClient.setQueryData(["restricted"], { salary: "fictional" });
    useSession.getState().set("second", { ...actor, userId: "fixture-two" });
    expect(queryClient.getQueryData(["restricted"])).toBeUndefined();
  });
  it("discards an in-flight response from a previous account", async () => {
    useSession.getState().set("first", actor);
    const pending = Promise.withResolvers<Response>();
    vi.stubGlobal("fetch", () => pending.promise);
    const request = api("/employees");
    useSession.getState().set("second", { ...actor, userId: "fixture-two" });
    pending.resolve(
      new Response(JSON.stringify({ data: [{ salary: "old-account" }] }), {
        headers: { "Content-Type": "application/json" },
      }),
    );
    await expect(request).rejects.toThrow("account changed");
  });
});
