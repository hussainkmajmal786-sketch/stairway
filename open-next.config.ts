import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// No ISR in Phase 1: pages are rendered per request, so no incremental cache binding is needed.
export default defineCloudflareConfig({});
