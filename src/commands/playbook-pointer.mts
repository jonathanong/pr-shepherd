/** Name an on-demand pr-shepherd skill reference. The skill maps the name to a file. */
export function playbookPointer(name: string): string {
  return `Playbook: "${name}".`;
}
