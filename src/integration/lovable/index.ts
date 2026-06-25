// Native Supabase OAuth integration — no third-party auth wrapper
import { supabase } from "../supbase/client";

type SignInOptions = {
  redirect_uri?: string;
  extraParams?: Record<string, string>;
};

type OAuthResult =
  | { redirected: true; error?: never }
  | { redirected: false; error: Error }
  | { redirected: false; error?: never };

export const lovable = {
  auth: {
    signInWithOAuth: async (
      provider: "google" | "apple" | "azure",
      opts?: SignInOptions,
    ): Promise<OAuthResult> => {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: opts?.redirect_uri ?? window.location.origin,
          queryParams: opts?.extraParams,
        },
      });

      if (error) {
        return { redirected: false, error };
      }

      // Supabase redirects the browser; execution typically stops here
      return { redirected: true };
    },
  },
};
