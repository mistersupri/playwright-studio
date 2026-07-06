export interface User {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  getIdToken: () => Promise<string>;
}

type AuthStateCallback = (user: User | null) => void;

class CustomAuth {
  private callbacks: AuthStateCallback[] = [];
  private currentUser: User | null = null;
  private currentToken: string | null = null;

  constructor() {
    // Restore persisted Google session on initialization
    try {
      const savedUser = localStorage.getItem("google_oauth_user");
      const savedToken = localStorage.getItem("google_oauth_token");
      if (savedUser && savedToken) {
        const profile = JSON.parse(savedUser);
        this.currentUser = {
          uid: profile.uid,
          email: profile.email || null,
          displayName: profile.name || null,
          photoURL: profile.picture || null,
          getIdToken: async () => savedToken,
        };
        this.currentToken = savedToken;
      }
    } catch (e) {
      console.error("Failed to restore saved Google OAuth session:", e);
    }
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

  setCurrentSession(token: string, profile: any) {
    this.currentToken = token;
    this.currentUser = {
      uid: profile.uid,
      email: profile.email || null,
      displayName: profile.name || null,
      photoURL: profile.picture || null,
      getIdToken: async () => token,
    };
    try {
      localStorage.setItem("google_oauth_user", JSON.stringify(profile));
      localStorage.setItem("google_oauth_token", token);
    } catch (e) {
      console.error("Failed to save Google session to localStorage:", e);
    }
    this.notifyListeners();
  }

  clearSession() {
    this.currentUser = null;
    this.currentToken = null;
    try {
      localStorage.removeItem("google_oauth_user");
      localStorage.removeItem("google_oauth_token");
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
      // Accept local development or live deployment origins
      if (!origin.endsWith(".run.app") && !origin.includes("localhost") && !origin.includes("127.0.0.1")) {
        return;
      }

      const data = event.data;
      if (data && data.type === "OAUTH_AUTH_SUCCESS") {
        window.removeEventListener("message", handleMessage);
        if (checkClosedInterval) clearInterval(checkClosedInterval);
        
        auth.setCurrentSession(data.token, data.user);
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
