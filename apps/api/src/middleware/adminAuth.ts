import { createRemoteJWKSet, decodeJwt, jwtVerify } from "jose";
import type { MiddlewareHandler } from "hono";
import type { RuntimeEnv } from "../env";
import { logServerError } from "../utils/logger";

type AccessIdentity = {
  isAuthenticated: boolean;
  email: string | null;
  groups: string[];
  verifiedAccessJwt: boolean;
};

type AccessResolution =
  | { ok: true; identity: AccessIdentity }
  | { ok: false; status: number; message: string };

type AdminResolution =
  | { ok: true; identity: AccessIdentity; isAdmin: boolean; devBypass?: boolean }
  | { ok: false; status: number; message: string };

const JWKS_TTL_MS = 60 * 60 * 1000;
const jwksCache = new Map<string, { jwks: ReturnType<typeof createRemoteJWKSet>; expiresAt: number }>();

const getCachedJwks = (issuer: string) => {
  const cached = jwksCache.get(issuer);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.jwks;
  }
  const jwksUrl = new URL("/cdn-cgi/access/certs", issuer);
  const jwks = createRemoteJWKSet(jwksUrl, { cacheMaxAge: JWKS_TTL_MS });
  jwksCache.set(issuer, { jwks, expiresAt: Date.now() + JWKS_TTL_MS });
  return jwks;
};

const isCloudflareAccessIssuer = (issuer: string) =>
  issuer.startsWith("https://") && issuer.endsWith(".cloudflareaccess.com");

const normalizeEmail = (email?: string | null) => email?.trim().toLowerCase() ?? null;

const extractGroups = (payload: Record<string, unknown>) => {
  const groupsClaim =
    payload.groups ?? payload["https://schemas.cloudflareaccess.com/groups"];
  if (!Array.isArray(groupsClaim)) return [];
  return groupsClaim.filter((group): group is string => typeof group === "string");
};

const resolveAccessIdentity = async (
  env: RuntimeEnv,
  headers: { get: (name: string) => string | null },
  options: { requireAccessJwt?: boolean } = {}
): Promise<AccessResolution> => {
  const token = headers.get("cf-access-jwt-assertion");
  const emailHeader = headers.get("cf-access-authenticated-user-email");

  if (!token) {
    if (options.requireAccessJwt) {
      return { ok: true, identity: { isAuthenticated: false, email: null, groups: [], verifiedAccessJwt: false } };
    }
    if (!emailHeader) {
      return {
        ok: true,
        identity: { isAuthenticated: false, email: null, groups: [], verifiedAccessJwt: false }
      };
    }
    return {
      ok: true,
      identity: {
        isAuthenticated: true,
        email: normalizeEmail(emailHeader),
        groups: [],
        verifiedAccessJwt: false
      }
    };
  }

  if (!env.cfAccessAud) {
    return { ok: false, status: 500, message: "CF_ACCESS_AUD is not configured" };
  }

  const decoded = decodeJwt(token);
  const issuer = typeof decoded.iss === "string" ? decoded.iss : null;
  if (!issuer || !isCloudflareAccessIssuer(issuer)) {
    return { ok: false, status: 401, message: "Invalid Access issuer" };
  }

  try {
    const jwks = getCachedJwks(issuer);
    const { payload } = await jwtVerify(token, jwks, {
      audience: env.cfAccessAud,
      issuer
    });
    const record = payload as Record<string, unknown>;
    const email = normalizeEmail((record.email as string | undefined) ?? emailHeader);
    const groups = extractGroups(record);
    return { ok: true, identity: { isAuthenticated: true, email, groups, verifiedAccessJwt: true } };
  } catch (error) {
    console.error("Access JWT verification failed", error);
    return { ok: false, status: 401, message: "Invalid Access token" };
  }
};

const isAdminAllowed = (env: RuntimeEnv, email: string | null, groups: string[]) => {
  const emailAllowlist = new Set(env.adminEmails.map((item) => item.toLowerCase()));
  const groupAllowlist = new Set(env.adminGroups);
  const emailAllowed = email ? emailAllowlist.has(email) : false;
  const groupAllowed = groups.some((group) => groupAllowlist.has(group));
  return emailAllowed || groupAllowed;
};

const isDevBypassEnabled = (env: RuntimeEnv) =>
  env.environment === "development" && env.bypassAdminAuth;

export const resolveAdminStatus = async (
  env: RuntimeEnv,
  headers: { get: (name: string) => string | null }
): Promise<AdminResolution> => {
  if (isDevBypassEnabled(env)) {
    const devToken = headers.get("x-dev-admin-token");
    const devTokenRequired = Boolean(env.devAdminToken);
    const devTokenValid = devTokenRequired ? devToken === env.devAdminToken : true;
    if (devTokenValid) {
      return {
        ok: true,
        identity: { isAuthenticated: true, email: "dev-admin", groups: [], verifiedAccessJwt: true },
        isAdmin: true,
        devBypass: true
      };
    }
  }

  const result = await resolveAccessIdentity(env, headers, { requireAccessJwt: true });
  if (!result.ok) {
    return result;
  }
  const identity = result.identity;
  const allowlistConfigured = env.adminEmails.length > 0 || env.adminGroups.length > 0;
  const isAdmin =
    identity.isAuthenticated && identity.verifiedAccessJwt
      ? allowlistConfigured
        ? isAdminAllowed(env, identity.email, identity.groups)
        : true
      : false;
  return { ok: true as const, identity, isAdmin };
};

export const createAdminAuth = (env: RuntimeEnv): MiddlewareHandler => {
  return async (c, next) => {
    const result = await resolveAdminStatus(env, c.req.raw.headers);
    if (!result.ok) {
      if (result.status >= 500) {
        logServerError("admin.auth.error", new Error(result.message), {
          requestId: c.get("requestId"),
          status: result.status
        });
      }
      return c.json({ error: result.message }, result.status);
    }
    if (result.devBypass) {
      c.set("adminEmail", result.identity.email);
      c.set("isAdmin", true);
      await next();
      return;
    }
    if (!result.identity.isAuthenticated) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (!result.isAdmin) {
      return c.json({ error: "Forbidden" }, 403);
    }

    c.set("adminEmail", result.identity.email);
    c.set("isAdmin", true);
    await next();
  };
};
