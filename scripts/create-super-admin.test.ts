// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { hashEmailToken } from "@/server/auth/tokens";
import { resetEnvCache } from "@/server/config/env";
import { AuditLog } from "@/server/db/models/audit-log";
import { AuthToken } from "@/server/db/models/auth-token";
import { User } from "@/server/db/models/user";

import { hashEmailTokenWith } from "./create-super-admin";

describe("create-super-admin script parity with the app", () => {
  it("hashes one-time tokens exactly like the app, so the printed link is accepted", () => {
    vi.stubEnv("ACCESS_TOKEN_SECRET", "a".repeat(48));
    vi.stubEnv("REFRESH_TOKEN_SECRET", "b".repeat(48));
    vi.stubEnv("MONGODB_URI", "mongodb://localhost/x");
    resetEnvCache();
    expect(hashEmailTokenWith("b".repeat(48), "some-token")).toBe(hashEmailToken("some-token"));
  });

  it("writes to the same collections the app's models read", () => {
    expect(User.collection.name).toBe("users");
    expect(AuthToken.collection.name).toBe("authtokens");
    expect(AuditLog.collection.name).toBe("auditlogs");
  });
});
