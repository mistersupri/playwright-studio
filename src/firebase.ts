export interface User {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  getIdToken: (forceRefresh?: boolean) => Promise<string>;
}

type AuthStateCallback = (user: User | null) => void;

class CustomAuth {
  private callbacks: AuthStateCallback[] = [];
  private currentUser: User | null = null;
  private currentToken: string | null = null;
  private refreshTokenVal: string | null = null;
  private expiresAt: number = 0;
  private refreshingPromise: Promise<string | null> | null = null;

  constructor() {
    // Restore persisted Google session on initialization
    try {
      const savedUser = localStorage.getItem("google_oauth_user");
      const savedToken = localStorage.getItem("google_oauth_token");
      const savedRefreshToken = localStorage.getItem("google_oauth_refresh_token");
      const savedExpiresAt = localStorage.getItem("google_oauth_expires_at");

      if (savedUser && savedToken) {
        const profile = JSON.parse(savedUser);
        this.currentToken = savedToken;
        this.refreshTokenVal = savedRefreshToken || null;
        this.expiresAt = savedExpiresAt ? parseInt(savedExpiresAt, 10) : Date.now() + 3600000;

        this.currentUser = {
          uid: profile.uid,
          email: profile.email || null,
          displayName: profile.name || null,
          photoURL: profile.picture || null,
          getIdToken: async (forceRefresh?: boolean) => {
            if (forceRefresh || (this.expiresAt && Date.now() >= this.expiresAt - 300000)) {
              const freshToken = await this.refreshGoogleToken();
              if (freshToken) return freshToken;
            }
            return this.currentToken || savedToken;
          },
        };
      }
    } catch (e) {
      console.error("Failed to restore saved Google OAuth session:", e);
    }
  }

  async refreshGoogleToken(): Promise<string | null> {
    if (!this.refreshTokenVal) {
      return this.currentToken;
    }

    if (this.refreshingPromise) {
      return this.refreshingPromise;
    }

    this.refreshingPromise = (async () => {
      try {
        const res = await fetch("/api/auth/google/refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: this.refreshTokenVal })
        });
        if (res.ok) {
          const data = await res.json();
          if (data.token) {
            this.currentToken = data.token;
            const expiresInSec = data.expiresIn || 3600;
            this.expiresAt = Date.now() + expiresInSec * 1000;

            try {
              localStorage.setItem("google_oauth_token", data.token);
              localStorage.setItem("google_oauth_expires_at", String(this.expiresAt));
            } catch (e) {
              console.error("Failed to update refreshed token in localStorage:", e);
            }

            return data.token;
          }
        } else {
          console.warn("Failed to refresh Google OAuth token from backend.");
        }
      } catch (err) {
        console.error("Error calling /api/auth/google/refresh:", err);
      } finally {
        this.refreshingPromise = null;
      }
      return this.currentToken;
    })();

    return this.refreshingPromise;
  }

  onAuthStateChanged(callback: AuthStateCallback) {
    this.callbacks.push(callback);
    // Fire immediately with current loaded state
    callback(this.currentUser);
    // Return unsubscribe handler
    return () => {
      this.callbacks = this.callbacks.filter(cb => cb !== callback);
    };
  }

  private notifyListeners() {
    this.callbacks.forEach(cb => cb(this.currentUser));
  }

  setCurrentSession(token: string, profile: any, refreshToken?: string, expiresIn?: number) {
    this.currentToken = token;
    if (refreshToken) {
      this.refreshTokenVal = refreshToken;
    }
    const expiresInSec = expiresIn || 3600;
    this.expiresAt = Date.now() + expiresInSec * 1000;

    this.currentUser = {
      uid: profile.uid,
      email: profile.email || null,
      displayName: profile.name || null,
      photoURL: profile.picture || null,
      getIdToken: async (forceRefresh?: boolean) => {
        if (forceRefresh || (this.expiresAt && Date.now() >= this.expiresAt - 300000)) {
          const freshToken = await this.refreshGoogleToken();
          if (freshToken) return freshToken;
        }
        return this.currentToken || token;
      },
    };

    try {
      localStorage.setItem("google_oauth_user", JSON.stringify(profile));
      localStorage.setItem("google_oauth_token", token);
      if (this.refreshTokenVal) {
        localStorage.setItem("google_oauth_refresh_token", this.refreshTokenVal);
      }
      localStorage.setItem("google_oauth_expires_at", String(this.expiresAt));
    } catch (e) {
      console.error("Failed to save Google session to localStorage:", e);
    }
    this.notifyListeners();
  }

  clearSession() {
    this.currentUser = null;
    this.currentToken = null;
    this.refreshTokenVal = null;
    this.expiresAt = 0;
    try {
      localStorage.removeItem("google_oauth_user");
      localStorage.removeItem("google_oauth_token");
      localStorage.removeItem("google_oauth_refresh_token");
      localStorage.removeItem("google_oauth_expires_at");
    } catch (e) {
      console.error("Failed to remove Google session from localStorage:", e);
    }
    this.notifyListeners();
  }
}

export const auth = new CustomAuth();

// Custom sign-out handler
export async function signOut(authInstance?: any) {
  auth.clearSession();
}

// Custom manual authentication handler
export async function signInWithEmailAndPassword(email: string, password: string): Promise<any> {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ email, password })
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || "Invalid credentials");
  }
  const data = await res.json();
  auth.setCurrentSession(data.token, {
    uid: data.user.uid,
    email: data.user.email,
    name: data.user.name,
    picture: data.user.picture
  });
  return { user: auth["currentUser"] };
}

// Custom sign-in with Google popup hander coordinates with server endpoints
export async function signInWithPopup(authInstance?: any, providerInstance?: any): Promise<any> {
  return new Promise(async (resolve, reject) => {
    let checkClosedInterval: any = null;
    
    // Set up message event listener
    const handleMessage = (event: MessageEvent) => {
      const origin = event.origin;

      const data = event.data;
      if (data && data.type === "OAUTH_AUTH_SUCCESS") {
        window.removeEventListener("message", handleMessage);
        if (checkClosedInterval) clearInterval(checkClosedInterval);
        
        auth.setCurrentSession(data.token, data.user, data.refreshToken, data.expiresIn);
        resolve({ user: auth["currentUser"] });
      } else if (data && data.type === "OAUTH_AUTH_FAILURE") {
        window.removeEventListener("message", handleMessage);
        if (checkClosedInterval) clearInterval(checkClosedInterval);
        reject(new Error(data.error || "Google Sign-In failed"));
      }
    };

    try {
      // 1. Fetch authorization URL
      const res = await fetch("/api/auth/google/url");
      if (!res.ok) {
        throw new Error("Failed to prepare Google OAuth authorization session.");
      }
      const { url } = await res.json();

      // 2. Open login page directly in a centered popup
      const width = 500;
      const height = 650;
      const left = window.screen.width / 2 - width / 2;
      const top = window.screen.height / 2 - height / 2;

      const popup = window.open(
        url,
        "google_oauth_sign_in",
        `width=${width},height=${height},top=${top},left=${left},resizable=yes,scrollbars=yes,status=yes`
      );

      if (!popup) {
        alert("Please enable popups for this site to complete your Google Sign In.");
        reject(new Error("Google OAuth Sign-In popup blocked by browser."));
        return;
      }

      window.addEventListener("message", handleMessage);

      // 3. Monitor closed state
      checkClosedInterval = setInterval(() => {
        if (popup.closed) {
          clearInterval(checkClosedInterval);
          // Wait briefly in case message event fires right before closing
          setTimeout(() => {
            window.removeEventListener("message", handleMessage);
          }, 500);
        }
      }, 1000);
    } catch (err) {
      window.removeEventListener("message", handleMessage);
      if (checkClosedInterval) clearInterval(checkClosedInterval);
      console.error("Google Sign-In initialization failed:", err);
      reject(err);
    }
  });
}

// Mock GoogleAuthProvider to avoid breaking existing imports that reference it
export class GoogleAuthProvider {}
export const googleProvider = new GoogleAuthProvider();
