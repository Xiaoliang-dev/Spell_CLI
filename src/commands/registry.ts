import { Command, CommandContext, AppConfig, Message } from '../types/index.js';
import { PluginAPIManager } from '../plugins/api.js';

export class CommandRegistry {
  private commands: Map<string, Command> = new Map();
  private api: PluginAPIManager;

  constructor(api: PluginAPIManager) {
    this.api = api;
  }

  register(command: Command): void {
    this.commands.set(command.name, command);
    if (command.aliases) {
      for (const alias of command.aliases) {
        this.commands.set(alias, command);
      }
    }
  }

  unregister(name: string): void {
    const cmd = this.commands.get(name);
    if (cmd) {
      this.commands.delete(cmd.name);
      if (cmd.aliases) {
        for (const alias of cmd.aliases) {
          this.commands.delete(alias);
        }
      }
    }
  }

  get(name: string): Command | undefined {
    return this.commands.get(name);
  }

  getAll(): Command[] {
    const seen = new Set<string>();
    const result: Command[] = [];
    for (const cmd of this.commands.values()) {
      if (!seen.has(cmd.name)) {
        seen.add(cmd.name);
        result.push(cmd);
      }
    }
    return result;
  }

  async execute(input: string, context: Omit<CommandContext, 'args'> & { args?: string[] }): Promise<string | void> {
    const parts = input.trim().split(/\s+/);
    const name = parts[0].toLowerCase().replace(/^\//, '');
    const args = parts.slice(1);

    const command = this.commands.get(name);
    if (!command) {
      return `Unknown command: /${name}. Type /help for available commands.`;
    }

    return await command.handler({
      ...context,
      args,
    } as CommandContext);
  }

  isCommand(input: string): boolean {
    return input.trim().startsWith('/');
  }

  parseCommand(input: string): { name: string; args: string[] } {
    const parts = input.trim().slice(1).split(/\s+/);
    return { name: parts[0] || '', args: parts.slice(1) };
  }
}
