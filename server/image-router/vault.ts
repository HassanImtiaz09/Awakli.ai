/**
 * Secrets Vault — Centralized secret accessor for the Image Router.
 *
 * The router is the ONLY service with read access to provider API keys.
 * All secrets are read from environment variables (injected from the vault at deploy time).
 * No API keys are hard-coded or committed to the repository.
 *
 * Vault choice: Doppler (preferred) → AWS Secrets Manager → 1Password Vault.
 * At runtime, all vault backends resolve to environment variables.
 *
 * @see Prompt 25, Section 4
 */

// ─── Secret Names (Section 4.2) ─────────────────────────────────────────

export const SECRET_NAMES = {
  // Image generation providers
  RUNWARE_API_KEY: "RUNWARE_API_KEY",
  TENSORART_API_KEY: "TENSORART_API_KEY",
  FAL_API_KEY: "FAL_API_KEY",

  // GPU training providers (already configured)
  MODAL_TOKEN_ID: "MODAL_TOKEN_ID",
  MODAL_TOKEN_SECRET: "MODAL_TOKEN_SECRET",
  RUNPOD_API_KEY: "RUNPOD_API_KEY",

  // Budget caps (configurable per environment)
  BUDGET_RUNWARE_MONTHLY: "BUDGET_RUNWARE_MONTHLY",
  BUDGET_TENSORART_MONTHLY: "BUDGET_TENSORART_MONTHLY",
  BUDGET_FAL_MONTHLY: "BUDGET_FAL_MONTHLY",
} as const;

export type SecretName = (typeof SECRET_NAMES)[keyof typeof SECRET_NAMES];

// ─── Vault Accessor ─────────────────────────────────────────────────────

/**
 * Read a secret from the vault (environment variable).
 * Returns null if the secret is not set.
 * Never logs or exposes the secret value.
 */
export function getSecret(name: SecretName): string | null {
  const value = process.env[name];
  if (!value || value.trim() === "") return null;
  return value.trim();
}

/**
 * Read a secret, throwing if not set.
 * Use for required secrets that must be present at startup.
 */
export function requireSecret(name: SecretName): string {
  const value = getSecret(name);
  if (!value) {
    throw new Error(
      `[Vault] Required secret ${name} is not set. ` +
      `Check your vault configuration or environment variables.`
    );
  }
  return value;
}

// ─── Provider Key Accessors ─────────────────────────────────────────────

export type ImageProvider = "runware" | "tensorart" | "fal";

const PROVIDER_SECRET_MAP: Record<ImageProvider, SecretName> = {
  runware: SECRET_NAMES.RUNWARE_API_KEY,
  tensorart: SECRET_NAMES.TENSORART_API_KEY,
  fal: SECRET_NAMES.FAL_API_KEY,
};

/**
 * Get the API key for a specific image provider.
 * Returns null if the key is not configured.
 */
export function getProviderApiKey(provider: ImageProvider): string | null {
  return getSecret(PROVIDER_SECRET_MAP[provider]);
}

/**
 * Check if a provider has a configured API key.
 */
export function isProviderConfigured(provider: ImageProvider): boolean {
  return getProviderApiKey(provider) !== null;
}

/**
 * Get all configured providers (those with valid API keys).
 */
export function getConfiguredProviders(): ImageProvider[] {
  return (Object.keys(PROVIDER_SECRET_MAP) as ImageProvider[]).filter(
    (p) => isProviderConfigured(p)
  );
}

// ─── Budget Cap Accessors ───────────────────────────────────────────────

const PROVIDER_BUDGET_MAP: Record<ImageProvider, SecretName> = {
  runware: SECRET_NAMES.BUDGET_RUNWARE_MONTHLY,
  tensorart: SECRET_NAMES.BUDGET_TENSORART_MONTHLY,
  fal: SECRET_NAMES.BUDGET_FAL_MONTHLY,
};

/** Default monthly caps (Section 7.1) */
const DEFAULT_MONTHLY_CAPS: Record<ImageProvider, number> = {
  runware: 500,
  tensorart: 100,
  fal: 200,
};

/**
 * Get the monthly budget cap for a provider in USD.
 * Falls back to default caps from Section 7.1 if not explicitly set.
 */
export function getMonthlyBudgetCap(provider: ImageProvider): number {
  const envValue = getSecret(PROVIDER_BUDGET_MAP[provider]);
  if (envValue) {
    const parsed = parseFloat(envValue);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_MONTHLY_CAPS[provider];
}

// ─── Validation ─────────────────────────────────────────────────────────

/**
 * Validate that all required secrets are present.
 * Returns a list of missing secret names.
 * Call at startup to fail fast if misconfigured.
 */
export function validateRequiredSecrets(): {
  valid: boolean;
  missing: SecretName[];
  configured: SecretName[];
} {
  const required: SecretName[] = [
    SECRET_NAMES.RUNWARE_API_KEY,
    SECRET_NAMES.TENSORART_API_KEY,
    SECRET_NAMES.FAL_API_KEY,
  ];

  const missing: SecretName[] = [];
  const configured: SecretName[] = [];

  for (const name of required) {
    if (getSecret(name)) {
      configured.push(name);
    } else {
      missing.push(name);
    }
  }

  return { valid: missing.length === 0, missing, configured };
}

// ─── Security: Secret Masking ───────────────────────────────────────────

/**
 * Mask a secret value for safe logging.
 * Shows first 4 chars + "***" + last 2 chars.
 * Never use this for actual authentication — only for debug output.
 */
export function maskSecret(value: string): string {
  if (value.length <= 8) return "***";
  return `${value.slice(0, 4)}***${value.slice(-2)}`;
}
