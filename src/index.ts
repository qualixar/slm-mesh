/**
 * SLM Mesh — Entry Point
 * Detects CLI mode vs MCP server mode based on process.argv.
 * Copyright 2026 Varun Pratap Bhardwaj. Elastic-2.0.
 * Part of the Qualixar research initiative | Powered by SuperLocalMemory
 */

export { VERSION, PRODUCT_NAME, BRANDING } from './config.js';
export type { MeshConfig } from './config.js';
export { createConfig } from './config.js';

const CLI_COMMANDS = new Set([
  'start', 'stop', 'status', 'peers', 'send',
  'broadcast', 'state', 'lock', 'events', 'version', 'clean',
  'help', '--help', '-h', '--version', '-V', '--json',
]);

/**
 * Detect if argv contains a known CLI command.
 * argv[0] = node, argv[1] = script, argv[2+] = args
 */
function isCliMode(argv: readonly string[]): boolean {
  return argv.slice(2).some((arg) => CLI_COMMANDS.has(arg));
}

// Auto-run when executed directly (not imported as library)
const isDirectExecution = process.argv[1]?.includes('slm-mesh') ?? false;

if (isDirectExecution) {
  if (isCliMode(process.argv)) {
    // CLI mode: parse commands via Commander
    import('./cli/cli.js').then(({ runCli }) => runCli(process.argv)).catch((err) => {
      console.error(`Fatal: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    });
  } else {
    // MCP server mode: spawned by AI agent via stdio (no CLI args)
    // This is how Claude Code, Cursor, etc. launch the MCP server
    import('./mcp/server.js').then(({ startMcpServer }) => startMcpServer()).catch((err) => {
      console.error(`Fatal: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    });
  }
}
