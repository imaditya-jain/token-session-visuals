import "server-only";

import { hash, verify } from "@node-rs/argon2";

// argon2id with OWASP-recommended minimums (19 MiB memory, 2 iterations, 1 lane).
const OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1, algorithm: 2 } as const;

export const hashPassword = (password: string): Promise<string> => hash(password, OPTIONS);

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | undefined;

/** Burns equivalent CPU when the account doesn't exist, so response time doesn't reveal valid emails. */
export async function verifyAgainstDummy(password: string): Promise<void> {
  dummyHash ??= hashPassword("timing-equalization-placeholder");
  await verifyPassword(await dummyHash, password);
}
