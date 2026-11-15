/** REST check suite and workflow run shapes read for a head commit. */
export interface RestSuite {
  id: number;
  node_id: string;
  status: string;
  conclusion: string | null;
  created_at: string;
  updated_at: string;
  app?: { slug?: string | null } | null;
}
export interface RestWorkflowRun {
  id: number;
  check_suite_id: number;
  event: string;
  workflow_id: number;
  name: string;
  created_at: string;
  updated_at: string;
  html_url: string;
  path?: string; // workflow file, e.g. .github/workflows/ci.yml
}
