/**
 * Plan catalogue. Organizations carry a `plan`; limits are enforced server-side
 * (see server/services/plan-limits). Billing is not wired to a payment provider
 * in the MVP — `organizations.billing_*` columns are reserved for it.
 */
export type PlanId = "free" | "team" | "pro" | "enterprise";

const GB = 1024 ** 3;
const MB = 1024 ** 2;

export const PLANS: Record<
  PlanId,
  {
    name: string;
    price: string;
    maxProjects: number | null;
    storageBytes: number;
    maxFileBytes: number;
    ai: boolean;
    advancedIntegrations: boolean;
    sso: boolean;
    highlights: string[];
  }
> = {
  free: {
    name: "Free",
    price: "$0",
    maxProjects: 3,
    storageBytes: 2 * GB,
    maxFileBytes: 250 * MB,
    ai: false,
    advancedIntegrations: false,
    sso: false,
    highlights: ["3 projects", "2 GB storage", "250 MB per file", "Unlimited members", "GitHub & Discord"],
  },
  team: {
    name: "Team",
    price: "$12 / seat",
    maxProjects: null,
    storageBytes: 100 * GB,
    maxFileBytes: 2 * GB,
    ai: false,
    advancedIntegrations: false,
    sso: false,
    highlights: ["Unlimited projects", "100 GB storage", "2 GB per file", "Private projects & project roles", "Audit log"],
  },
  pro: {
    name: "Pro",
    price: "$24 / seat",
    maxProjects: null,
    storageBytes: 500 * GB,
    maxFileBytes: 5 * GB,
    ai: true,
    advancedIntegrations: true,
    sso: false,
    highlights: ["Everything in Team", "Forge assistant", "500 GB storage", "Advanced integrations & webhooks", "Traceability exports"],
  },
  enterprise: {
    name: "Enterprise",
    price: "Contact us",
    maxProjects: null,
    storageBytes: 5 * 1024 * GB,
    maxFileBytes: 20 * GB,
    ai: true,
    advancedIntegrations: true,
    sso: true,
    highlights: ["SSO / SAML", "Custom retention & audit controls", "Dedicated storage region", "Security review & DPA"],
  },
};

export function formatBytes(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}
