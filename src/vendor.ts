/**
 * Vendor file loaders for beads plugin.
 *
 * The vendor directory contains beads command definitions and agent prompts
 * synced from the upstream beads repository via scripts/sync-beads.sh.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { Config } from "@opencode-ai/sdk";

function getVendorDir(): string {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  return path.join(__dirname, "..", "vendor");
}

interface ParsedMarkdown {
  frontmatter: Record<string, string | undefined>;
  body: string;
}

function parseMarkdownWithFrontmatter(content: string): ParsedMarkdown | null {
  const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return null;
  }

  const frontmatterStr = match[1];
  const body = match[2];

  if (frontmatterStr === undefined || body === undefined) {
    return null;
  }

  const frontmatter: Record<string, string | undefined> = {};

  for (const line of frontmatterStr.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const colonIndex = trimmed.indexOf(":");
    if (colonIndex === -1) continue;

    const key = trimmed.slice(0, colonIndex).trim();
    let value = trimmed.slice(colonIndex + 1).trim();

    // Handle quoted strings
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    // Handle empty array syntax like []
    if (value === "[]") {
      value = "";
    }

    frontmatter[key] = value;
  }

  return { frontmatter, body: body.trim() };
}

async function readVendorFile(relativePath: string): Promise<string | null> {
  try {
    const fullPath = path.join(getVendorDir(), relativePath);
    return await fs.readFile(fullPath, "utf-8");
  } catch {
    return null;
  }
}

async function listVendorFiles(relativePath: string): Promise<string[]> {
  try {
    const fullPath = path.join(getVendorDir(), relativePath);
    return await fs.readdir(fullPath);
  } catch {
    return [];
  }
}

export const CLI_GUIDANCE = `<beads-cli-guidance>
Beads MCP tools are not available. Use the \`bd\` CLI via bash instead:

- \`init\` → \`bd init [prefix]\`
- \`ready\` → \`bd ready --json\`
- \`show\` → \`bd show <id> --json\`
- \`create\` → \`bd create "title" -t bug|feature|task -p 0-4 --json\`
- \`update\` → \`bd update <id> --status in_progress --json\`
- \`close\` → \`bd close <id> --reason "message" --json\`
- \`reopen\` → \`bd reopen <id> --json\`
- \`dep\` → \`bd dep add <from> <to> --type blocks|discovered-from --json\`
- \`list\` → \`bd list --status open --json\`
- \`blocked\` → \`bd blocked --json\`
- \`stats\` → \`bd stats --json\`
- \`sync\` → \`bd sync\`

MCP tools map directly to bd CLI commands. If a tool is not listed above, try \`bd <tool> --help\`.

Always use \`--json\` flag for structured output.
</beads-cli-guidance>`;

export async function loadAgent(): Promise<Config["agent"]> {
  const content = await readVendorFile("agents/task-agent.md");
  if (!content) return {};

  const parsed = parseMarkdownWithFrontmatter(content);
  if (!parsed) return {};

  const description =
    parsed.frontmatter.description ?? "Beads task completion agent";

  return {
    "beads-task-agent": {
      description,
      prompt: CLI_GUIDANCE + "\n" + parsed.body,
      mode: "subagent",
    },
  };
}

export async function loadCommands(): Promise<Config["command"]> {
  const files = await listVendorFiles("commands");
  const commands: Config["command"] = {};

  for (const file of files) {
    if (!file.endsWith(".md")) continue;

    const content = await readVendorFile(`commands/${file}`);
    if (!content) continue;

    const parsed = parseMarkdownWithFrontmatter(content);
    if (!parsed) continue;

    const name = `bd-${file.replace(".md", "")}`;

    const argHint = parsed.frontmatter["argument-hint"];
    const baseDescription = parsed.frontmatter.description ?? name;
    const description = argHint
      ? `${baseDescription} (${argHint})`
      : baseDescription;

    commands[name] = {
      description,
      template: parsed.body,
    };
  }

  return commands;
}
