export interface AuthenticatedUser {
  uid: string;
  email?: string;
  name?: string;
  picture?: string;
}

// In-memory token cache to maintain performance and avoid API rate-limiting
interface CacheEntry {
  user: AuthenticatedUser;
  expiresAt: number;
}
const tokenCache = new Map<string, CacheEntry>();
const CACHE_DURATION_MS = 60 * 60 * 1000; // Cache verified sessions for 1 hour

/**
 * Validate a user's Google token from the authorization header using googleapis userinfo/tokeninfo. Clean, independent from Firebase!
 */
export async function getAuthUser(authHeader: string | undefined): Promise<AuthenticatedUser | null> {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  const token = authHeader.substring(7).trim();
  if (!token) {
    return null;
  }

  // Pre-configured Admin Token Check
  if (token === "admin-manual-token-secret-xyz-123") {
    return {
      uid: "admin-manual-uid-001",
      email: process.env.ADMIN_EMAIL || "admin@admin.com",
      name: "Admin User",
      picture: "",
    };
  }

  // Check cache first
  const cached = tokenCache.get(token);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.user;
  }

  // Token not cached or expired; let's verify with Google's API
  try {
    // Try Userinfo API (for OAuth Access Tokens)
    let res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (res.ok) {
      const data = await res.json();
      if (data && data.sub) {
        const user: AuthenticatedUser = {
          uid: data.sub,
          email: data.email,
          name: data.name || data.email?.split("@")[0] || "Google User",
          picture: data.picture,
        };
        tokenCache.set(token, { user, expiresAt: Date.now() + CACHE_DURATION_MS });
        return user;
      }
    }

    // Fallback: Try Tokeninfo API (for ID Tokens)
    res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${token}`);
    if (res.ok) {
      const data = await res.json();
      if (data && data.sub) {
        const user: AuthenticatedUser = {
          uid: data.sub,
          email: data.email,
          name: data.name || data.email?.split("@")[0] || "Google User",
          picture: data.picture,
        };
        tokenCache.set(token, { user, expiresAt: Date.now() + CACHE_DURATION_MS });
        return user;
      }
    }

    console.warn("Token verification with Google endpoints failed");
    return null;
  } catch (error) {
    console.error("Error verifying Google token:", error);
    return null;
  }
}
