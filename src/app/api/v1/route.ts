import { route } from "@/server/http/api";

/** API index — a machine-readable list of resources. Full reference: docs/api.md */
export const GET = route({ auth: "optional", rateLimit: false }, async () => ({
  name: "Forgebase API",
  version: "v1",
  auth: ["session cookie (browser)", "Authorization: Bearer fbp_… (personal access token)"],
  docs: "/docs/api.md",
  resources: {
    me: "/api/v1/me",
    notifications: "/api/v1/notifications",
    search: "/api/v1/search?q=",
    organizations: "/api/v1/orgs",
    projects: "/api/v1/projects",
    project: {
      files: "/api/v1/projects/{project}/files",
      folders: "/api/v1/projects/{project}/folders",
      uploads: "/api/v1/projects/{project}/uploads",
      versions: "/api/v1/projects/{project}/versions",
      issues: "/api/v1/projects/{project}/issues",
      tasks: "/api/v1/projects/{project}/tasks",
      milestones: "/api/v1/projects/{project}/milestones",
      requirements: "/api/v1/projects/{project}/requirements",
      tests: "/api/v1/projects/{project}/tests",
      decisions: "/api/v1/projects/{project}/decisions",
      changes: "/api/v1/projects/{project}/changes",
      notebook: "/api/v1/projects/{project}/notebook",
      releases: "/api/v1/projects/{project}/releases",
      comments: "/api/v1/projects/{project}/comments",
      links: "/api/v1/projects/{project}/links",
      activity: "/api/v1/projects/{project}/activity",
      integrations: "/api/v1/projects/{project}/integrations",
      webhooks: "/api/v1/projects/{project}/webhooks",
      forge: "/api/v1/projects/{project}/forge",
    },
  },
}));
