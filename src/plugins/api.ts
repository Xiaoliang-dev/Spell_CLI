import { EventEmitter } from 'events';
import {
  PluginAPI,
  Command,
  PromptModifier,
  AppConfig,
  Message,
} from '../types/index.js';
import { promptBuilder } from '../utils/prompt-builder.js';

export class PluginAPIManager extends EventEmitter implements PluginAPI {
  private commands: Map<string, Command> = new Map();
  private hooks: Map<string, Set<Function>> = new Map();
  private messageSender?: (content: string) => Promise<void>;
  private messageGetter?: () => Message[];
  private configGetter?: () => AppConfig;
  private configSetter?: <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => void;

  constructor(
    messageGetter: () => Message[],
    messageSender: (content: string) => Promise<void>,
    configGetter: () => AppConfig,
    configSetter: <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => void
  ) {
    super();
    this.messageGetter = messageGetter;
    this.messageSender = messageSender;
    this.configGetter = configGetter;
    this.configSetter = configSetter;
  }

  registerCommand(command: Command): void {
    this.commands.set(command.name, command);
    if (command.aliases) {
      for (const alias of command.aliases) {
        this.commands.set(alias, command);
      }
    }
    this.emit('commandRegistered', command);
  }

  unregisterCommand(name: string): void {
    const cmd = this.commands.get(name);
    this.commands.delete(name);
    if (cmd?.aliases) {
      for (const alias of cmd.aliases) {
        this.commands.delete(alias);
      }
    }
  }

  getCommands(): Command[] {
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

  getCommand(name: string): Command | undefined {
    return this.commands.get(name);
  }

  addPromptModifier(modifier: PromptModifier): void {
    promptBuilder.addModifier(modifier);
  }

  removePromptModifier(id: string): void {
    promptBuilder.removeModifier(id);
  }

  getMessages(): Message[] {
    return this.messageGetter ? this.messageGetter() : [];
  }

  async sendMessage(content: string): Promise<void> {
    if (this.messageSender) {
      await this.messageSender(content);
    }
  }

  onEvent(event: string, handler: (...args: any[]) => void): void {
    this.on(event, handler);
  }

  emitEvent(event: string, ...args: any[]): void {
    this.emit(event, ...args);
  }

  registerHook(hook: string, handler: (...args: any[]) => any): void {
    if (!this.hooks.has(hook)) {
      this.hooks.set(hook, new Set());
    }
    this.hooks.get(hook)!.add(handler);
  }

  unregisterHook(hook: string, handler: (...args: any[]) => any): void {
    this.hooks.get(hook)?.delete(handler);
  }

  async executeHook(hook: string, ...args: any[]): Promise<any[]> {
    const handlers = this.hooks.get(hook);
    if (!handlers) return [];
    const results: any[] = [];
    for (const handler of handlers) {
      try {
        results.push(await handler(...args));
      } catch (err) {
        if (this.configGetter?.().debug) {
          console.error(`[PluginAPI] Hook ${hook} error:`, err);
        }
      }
    }
    return results;
  }

  getConfig(): AppConfig {
    return this.configGetter ? this.configGetter() : {} as AppConfig;
  }

  setConfigValue<K extends keyof AppConfig>(key: K, value: AppConfig[K]): void {
    if (this.configSetter) {
      this.configSetter(key, value);
    }
  }
}
