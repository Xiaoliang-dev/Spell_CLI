import { Plugin, PluginAPI, Command } from '../../src/types/index.js';

const examplePlugin: Plugin = {
  name: 'example-plugin',
  version: '1.0.0',
  description: 'An example plugin demonstrating the plugin API',

  async onLoad(api: PluginAPI) {
    api.registerCommand({
      name: 'hello',
      description: 'Say hello from the plugin',
      handler: async (ctx) => {
        const name = ctx.args[0] || 'World';
        return `👋 Hello, ${name}! This message is from example-plugin.`;
      },
    });

    api.registerCommand({
      name: 'time',
      description: 'Show current time with timezone info',
      handler: async () => {
        const now = new Date();
        return [
          `🕐 Local: ${now.toLocaleString()}`,
          `🌍 UTC: ${now.toUTCString()}`,
          `⏱️  Timestamp: ${now.getTime()}`,
          `📅 ISO: ${now.toISOString()}`,
        ].join('\n');
      },
    });

    api.registerCommand({
      name: 'calc',
      description: 'Simple calculator (e.g., /calc 1 + 2)',
      handler: async (ctx) => {
        try {
          const expr = ctx.args.join(' ');
          const result = eval(expr);
          return `🧮 ${expr} = ${result}`;
        } catch {
          return '❌ Invalid expression. Example: /calc 1 + 2';
        }
      },
    });

    api.addPromptModifier({
      id: 'example-modifier',
      priority: 10,
      modifier: async (context) => {
        return `[Plugin Reminder] This conversation is powered by AI CLI. Current model: ${context.config.currentModelId}.`;
      },
    });

    api.onEvent('messageReceived', (msg: string) => {
      if (msg.toLowerCase().includes('plugin')) {
        console.log('[example-plugin] Plugin keyword detected!');
      }
    });
  },

  async onUnload(api: PluginAPI) {
    api.unregisterCommand('hello');
    api.unregisterCommand('time');
    api.unregisterCommand('calc');
    api.removePromptModifier('example-modifier');
  },
};

export default examplePlugin;
