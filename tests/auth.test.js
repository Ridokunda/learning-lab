import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPair, exportJWK, SignJWT, createLocalJWKSet } from "jose";
import { verifyIdentity } from "../worker/index.js";
test("Access validates signature, issuer, audience, expiry and email", async () => {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const jwk = await exportJWK(publicKey);
  jwk.kid = "test";
  const keys = createLocalJWKSet({ keys: [jwk] });
  const env = {
    ACCESS_TEAM_DOMAIN: "example.cloudflareaccess.com",
    ACCESS_AUD: "private-app",
    ALLOWED_EMAIL: "owner@example.com",
  };
  const make = async (overrides = {}) =>
    new SignJWT({
      email: env.ALLOWED_EMAIL,
      iss: "https://" + env.ACCESS_TEAM_DOMAIN,
      aud: env.ACCESS_AUD,
      exp: Math.floor(Date.now() / 1000) + 600,
      ...overrides,
    })
      .setProtectedHeader({ alg: "RS256", kid: "test" })
      .sign(privateKey);
  await verifyIdentity(await make(), keys, env);
  for (const fields of [
    { email: "other@example.com" },
    { iss: "https://evil.example" },
    { aud: "other-app" },
    { exp: 1 },
    { exp: undefined },
  ])
    await assert.rejects(verifyIdentity(await make(fields), keys, env));
  const token = await make();
  await assert.rejects(
    verifyIdentity(token.slice(0, -10) + "tamperedxx", keys, env),
  );
});
