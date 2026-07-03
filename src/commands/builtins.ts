import { Command, CommandContext, AppConfig, Message, AgentConfig } from '../types/index.js';
import chalk from 'chalk';
import { saveConfig } from '../config.js';
import { promptBuilder } from '../utils/prompt-builder.js';
import { getAllTools } from '../agent/tools.js';

export function createBuiltinCommands(): Command[] {
  return [
    // ─── Basic Commands ───
    {
      name: 'help',
      description: 'Show available commands',
      aliases: ['h', '?'],
      handler: (ctx: CommandContext) => {
        const cmds = ctx.pluginAPI.getCommands();
        const categories: Record<string, Command[]> = {
          'Basic': [],
          'Model': [],
          'Agent': [],
          'Cluster': [],
          'Config': [],
          'Other': [],
        };

        for (const cmd of cmds) {
          if (['help', 'clear', 'quit', 'history'].includes(cmd.name)) categories['Basic'].push(cmd);
          else if (['model', 'language'].includes(cmd.name)) categories['Model'].push(cmd);
          else if (cmd.name.startsWith('agent') || cmd.name.startsWith('tool')) categories['Agent'].push(cmd);
          else if (cmd.name.startsWith('cluster')) categories['Cluster'].push(cmd);
          else if (['config', 'template'].includes(cmd.name)) categories['Config'].push(cmd);
          else categories['Other'].push(cmd);
        }

        const lines = [chalk.bold.cyan('\n📖 Available Commands:\n')];
        for (const [cat, catCmds] of Object.entries(categories)) {
          if (catCmds.length === 0) continue;
          lines.push(chalk.bold(`  [${cat}]`));
          for (const cmd of catCmds) {
            const aliases = cmd.aliases?.length ? chalk.gray(` (${cmd.aliases.join(', ')})`) : '';
            lines.push(`    ${chalk.yellow('/' + cmd.name)}${aliases}`);
            lines.push(`      ${chalk.gray(cmd.description)}`);
          }
        }
        lines.push(chalk.gray('\n  Use Ctrl+A to toggle agent panel\n'));
        return lines.join('\n');
      },
    },
    {
      name: 'model',
      description: 'Switch AI model or list available models',
      usage: '/model [model-id] [--list]',
      aliases: ['m'],
      handler: async (ctx: CommandContext) => {
        const { args } = ctx;
        if (args.includes('--list') || args.length === 0) {
          const models = ctx.aiClient.listModels();
          const current = ctx.aiClient.getCurrentModel();
          const lines = [
            chalk.bold.cyan('\n🤖 Available Models:\n'),
            ...models.map(m => {
              const isCurrent = m.id === current.id;
              const status = m.enabled
                ? (isCurrent ? chalk.green('● current') : chalk.gray('○'))
                : chalk.red('✗ disabled');
              return `  ${isCurrent ? chalk.bold(m.name) : m.name} ${chalk.gray(`(${m.id})`)} ${status}\n    ${chalk.gray(`Provider: ${m.provider}, Model: ${m.modelId}`)}`;
            }),
            chalk.gray('\n  Use /model <id> to switch.'),
            '',
          ];
          return lines.join('\n');
        }

        const modelId = args[0];
        const success = ctx.aiClient.switchModel(modelId);
        if (success) {
          const model = ctx.aiClient.getCurrentModel();
          return chalk.green(`✓ Switched to ${model.name} (${model.id})`);
        }
        return chalk.red(`✗ Model "${modelId}" not found or disabled.`);
      },
    },
    {
      name: 'clear',
      description: 'Clear conversation history',
      aliases: ['cls', 'c'],
      handler: (ctx: CommandContext) => {
        ctx.setMessages([]);
        return chalk.green('✓ Conversation cleared.');
      },
    },
    {
      name: 'language',
      description: 'Set or show response language',
      usage: '/language [lang-code]',
      aliases: ['lang', 'l'],
      handler: (ctx: CommandContext) => {
        const { args, config, setConfig } = ctx;
        if (args.length === 0) {
          return `Current language: ${chalk.cyan(config.language)}`;
        }
        const newLang = args[0];
        const newConfig = { ...config, language: newLang };
        setConfig(newConfig);
        saveConfig(newConfig);
        return chalk.green(`✓ Language set to: ${newLang}`);
      },
    },
    {
      name: 'config',
      description: 'Show or edit configuration',
      usage: '/config [key] [value]',
      handler: (ctx: CommandContext) => {
        const { args, config } = ctx;
        if (args.length === 0) {
          const lines = [
            chalk.bold.cyan('\n⚙️  Current Configuration:\n'),
            `  ${chalk.yellow('currentModelId')}: ${config.currentModelId}`,
            `  ${chalk.yellow('language')}: ${config.language}`,
            `  ${chalk.yellow('maxHistory')}: ${config.maxHistory}`,
            `  ${chalk.yellow('debug')}: ${config.debug}`,
            `  ${chalk.yellow('pluginsDir')}: ${config.pluginsDir}`,
            `  ${chalk.yellow('skillsDir')}: ${config.skillsDir}`,
            '',
          ];
          return lines.join('\n');
        }
        if (args.length === 2) {
          const [key, value] = args;
          const newConfig = { ...config };
          if (key === 'maxHistory') (newConfig as any)[key] = parseInt(value, 10);
          else if (key === 'debug') (newConfig as any)[key] = value === 'true';
          else (newConfig as any)[key] = value;
          ctx.setConfig(newConfig);
          saveConfig(newConfig);
          return chalk.green(`✓ ${key} = ${value}`);
        }
        return chalk.red('Usage: /config [key] [value]');
      },
    },
    {
      name: 'skill',
      description: 'List loaded skills',
      aliases: ['skills', 's'],
      handler: (ctx: CommandContext) => {
        const skills = ctx.skillManager.getSkills();
        if (skills.length === 0) return chalk.gray('No skills loaded.');
        const lines = [
          chalk.bold.cyan('\n🎯 Loaded Skills:\n'),
          ...skills.map(s => `  ${chalk.yellow(s.name)} v${s.version}\n    ${chalk.gray(s.description)}\n    ${chalk.gray('Triggers: ' + s.triggers.join(', '))}`),
          '',
        ];
        return lines.join('\n');
      },
    },
    {
      name: 'plugin',
      description: 'List loaded plugins',
      aliases: ['plugins', 'p'],
      handler: (ctx: CommandContext) => {
        const cmds = ctx.pluginAPI.getCommands();
        const builtinCmds = ['help', 'model', 'clear', 'language', 'config', 'skill', 'plugin', 'history', 'template', 'quit', 'agent', 'agents', 'agent_run', 'agent_kill', 'agent_tools', 'tool_list', 'cluster', 'clusters', 'cluster_create', 'cluster_run', 'cluster_destroy'];
        const customCmds = cmds.filter(c => !builtinCmds.includes(c.name));
        if (customCmds.length === 0) return chalk.gray('No custom plugin commands registered.');
        const lines = [
          chalk.bold.cyan('\n🔌 Plugin Commands:\n'),
          ...customCmds.map(c => `  ${chalk.yellow('/' + c.name)}\n    ${chalk.gray(c.description)}`),
          '',
        ];
        return lines.join('\n');
      },
    },
    {
      name: 'history',
      description: 'Show conversation history',
      aliases: ['hist'],
      handler: (ctx: CommandContext) => {
        const msgs = ctx.messages.filter(m => m.role !== 'system');
        if (msgs.length === 0) return chalk.gray('No messages yet.');
        const lines = [
          chalk.bold.cyan(`\n📜 History (${msgs.length} messages):\n`),
          ...msgs.map((m, i) => {
            const prefix = m.role === 'user' ? chalk.blue('You') : chalk.green('AI');
            const content = m.content.length > 100 ? m.content.slice(0, 100) + '...' : m.content;
            return `  ${chalk.gray(`[${i + 1}]`)} ${prefix}: ${content}`;
          }),
          '',
        ];
        return lines.join('\n');
      },
    },
    {
      name: 'template',
      description: 'Show or reset prompt template',
      usage: '/template [--reset]',
      handler: (ctx: CommandContext) => {
        const { args, config, setConfig } = ctx;
        if (args.includes('--reset')) {
          const newConfig = { ...config, promptTemplate: promptBuilder.getDefaultTemplate() };
          setConfig(newConfig);
          saveConfig(newConfig);
          return chalk.green('✓ Template reset to default.');
        }
        return [
          chalk.bold.cyan('\n📝 Prompt Template:\n'),
          chalk.gray('Variables: {{system}}, {{date}}, {{time}}, {{weekday}}, {{timezone}}, {{language}}, {{history}}, {{input}}\n'),
          config.promptTemplate,
          '',
        ].join('\n');
      },
    },

    // ─── Agent Commands ───
    {
      name: 'agent',
      description: 'Show agent status or manage agents',
      usage: '/agent [list|status]',
      aliases: ['agents'],
      handler: (ctx: CommandContext) => {
        const am = ctx.agentManager;
        if (!am) return chalk.red('Agent manager not available.');
        const agents = am.listAgents();
        if (agents.length === 0) return chalk.gray('No agents. Use /agent_run <task> to create one.');

        const lines = [
          chalk.bold.cyan('\n🤖 Agents:\n'),
          ...agents.map(a => {
            const statusColor = a.status === 'running' ? 'yellow' : a.status === 'completed' ? 'green' : a.status === 'error' ? 'red' : a.status === 'paused' ? 'magenta' : 'gray';
            const tools = a.config.tools.length > 0 ? a.config.tools.join(', ') : 'all';
            return `  ${chalk.bold(a.config.name)} ${chalk.gray(`(${a.config.id})`)}\n    Status: ${chalk[statusColor](a.status.toUpperCase())}\n    Task: ${a.currentTask ? a.currentTask.substring(0, 50) : 'none'}\n    Steps: ${a.steps.length} | Tools: ${tools} | Max: ${a.config.maxSteps}`;
          }),
          chalk.gray('\n  Commands:'),
          chalk.gray('    /agent_run <task>  - Run a new agent'),
          chalk.gray('    /agent_kill <id>   - Kill an agent'),
          chalk.gray('    /agent_tools       - List available tools'),
          '',
        ];
        return lines.join('\n');
      },
    },
    {
      name: 'agent_run',
      description: 'Run an AI agent with a task (auto tool usage)',
      usage: '/agent_run <task description> [--tools tool1,tool2] [--max-steps N]',
      aliases: ['arun', 'ar'],
      handler: async (ctx: CommandContext) => {
        const am = ctx.agentManager;
        if (!am) return chalk.red('Agent manager not available.');

        const { args } = ctx;
        if (args.length === 0) return chalk.red('Usage: /agent_run <task> [--tools t1,t2] [--max-steps N]');

        let toolsArg: string[] = [];
        let maxSteps = 15;
        const taskArgs: string[] = [];

        for (let i = 0; i < args.length; i++) {
          if (args[i] === '--tools' && args[i + 1]) {
            toolsArg = args[i + 1].split(',');
            i++;
          } else if (args[i] === '--max-steps' && args[i + 1]) {
            maxSteps = parseInt(args[i + 1], 10);
            i++;
          } else {
            taskArgs.push(args[i]);
          }
        }

        const task = taskArgs.join(' ');
        if (!task) return chalk.red('No task specified.');

        const agent = am.createAgent({
          name: `Agent ${am.listAgents().length + 1}`,
          description: task.substring(0, 100),
          maxSteps,
          tools: toolsArg.length > 0 ? toolsArg : [],
        });

        ctx.setMessages(prev => [...prev, {
          id: `agent-start-${Date.now()}`,
          role: 'system',
          content: `🤖 Agent ${agent.config.name} started: ${task}`,
          timestamp: new Date(),
        }]);

        (async () => {
          const steps: any[] = [];
          for await (const step of am.runAgent(agent.config.id, task)) {
            steps.push(step);
          }
          const lastResponse = steps.filter(s => s.type === 'response').pop();
          if (lastResponse) {
            ctx.setMessages(prev => [...prev, {
              id: `agent-done-${Date.now()}`,
              role: 'assistant',
              content: `🤖 **${agent.config.name}** completed:\n${lastResponse.content}`,
              timestamp: new Date(),
            }]);
          }
        })();

        return chalk.green(`✓ Agent ${agent.config.name} started with task: ${task.substring(0, 60)}${task.length > 60 ? '...' : ''}`);
      },
    },
    {
      name: 'agent_kill',
      description: 'Kill a running agent',
      usage: '/agent_kill <agent-id>',
      aliases: ['akill'],
      handler: (ctx: CommandContext) => {
        const am = ctx.agentManager;
        if (!am) return chalk.red('Agent manager not available.');
        const { args } = ctx;
        if (args.length === 0) return chalk.red('Usage: /agent_kill <agent-id>');

        const id = args[0];
        const agent = am.getAgent(id);
        if (!agent) return chalk.red(`Agent "${id}" not found.`);

        am.destroyAgent(id);
        return chalk.green(`✓ Agent "${agent.config.name}" killed.`);
      },
    },
    {
      name: 'agent_tools',
      description: 'List all available tools for agents',
      aliases: ['tools'],
      handler: (ctx: CommandContext) => {
        const am = ctx.agentManager;
        if (!am) return chalk.red('Agent manager not available.');
        const tools = am.listTools();
        const lines = [
          chalk.bold.cyan('\n🔧 Available Tools:\n'),
          ...tools.map(t => {
            const params = Object.entries(t.parameters.properties || {})
              .map(([k, v]) => `${k}: ${(v as any).type}`)
              .join(', ');
            return `  ${chalk.yellow(t.name)}\n    ${chalk.gray(t.description)}\n    ${chalk.gray(`Params: {${params}}`)}`;
          }),
          '',
        ];
        return lines.join('\n');
      },
    },

    // ─── Cluster Commands ───
    {
      name: 'clusters',
      description: 'List all clusters',
      aliases: ['cluster'],
      handler: (ctx: CommandContext) => {
        const cm = ctx.clusterManager;
        if (!cm) return chalk.red('Cluster manager not available.');
        const clusters = cm.listClusters();
        if (clusters.length === 0) return chalk.gray('No clusters. Use /cluster_create to create one.');

        const lines = [
          chalk.bold.cyan('\n🌐 Clusters:\n'),
          ...clusters.map(c => {
            const statusColor = c.status === 'executing' ? 'yellow' : c.status === 'completed' ? 'green' : c.status === 'error' ? 'red' : 'gray';
            return `  ${chalk.bold(c.name)} ${chalk.gray(`(${c.id})`)}\n    ${c.description}\n    Status: ${chalk[statusColor](c.status.toUpperCase())} | Agents: ${c.agents.length} | Tasks: ${c.tasks.length}`;
          }),
          '',
        ];
        return lines.join('\n');
      },
    },
    {
      name: 'cluster_create',
      description: 'Create a new agent cluster',
      usage: '/cluster_create <name> [description] [--agents N]',
      aliases: ['ccreate', 'cc'],
      handler: (ctx: CommandContext) => {
        const cm = ctx.clusterManager;
        if (!cm) return chalk.red('Cluster manager not available.');
        const { args } = ctx;
        if (args.length === 0) return chalk.red('Usage: /cluster_create <name> [description] [--agents N]');

        let agentCount = 2;
        const nameArgs: string[] = [];

        for (let i = 0; i < args.length; i++) {
          if (args[i] === '--agents' && args[i + 1]) {
            agentCount = parseInt(args[i + 1], 10);
            i++;
          } else {
            nameArgs.push(args[i]);
          }
        }

        const name = nameArgs[0];
        const desc = nameArgs.slice(1).join(' ') || '';
        const cluster = cm.createCluster(name, desc);

        for (let i = 0; i < agentCount; i++) {
          cm.addAgentToCluster(cluster.id, {
            name: `${name}-Agent-${i + 1}`,
            description: `Worker agent ${i + 1} for cluster ${name}`,
            maxSteps: 10,
          });
        }

        return chalk.green(`✓ Cluster "${name}" created with ${agentCount} agents. ID: ${cluster.id}`);
      },
    },
    {
      name: 'cluster_run',
      description: 'Run a task on a cluster',
      usage: '/cluster_run <cluster-id> <task>',
      aliases: ['crun'],
      handler: async (ctx: CommandContext) => {
        const cm = ctx.clusterManager;
        if (!cm) return chalk.red('Cluster manager not available.');
        const { args } = ctx;
        if (args.length < 2) return chalk.red('Usage: /cluster_run <cluster-id> <task>');

        const clusterId = args[0];
        const task = args.slice(1).join(' ');
        const cluster = cm.getCluster(clusterId);
        if (!cluster) return chalk.red(`Cluster "${clusterId}" not found.`);

        ctx.setMessages(prev => [...prev, {
          id: `cluster-start-${Date.now()}`,
          role: 'system',
          content: `🌐 Cluster "${cluster.name}" executing: ${task}`,
          timestamp: new Date(),
        }]);

        (async () => {
          let fullOutput = '';
          for await (const event of cm.executeClusterTask(clusterId, task)) {
            fullOutput += `[${event.type}] ${event.content}\n`;
          }
          ctx.setMessages(prev => [...prev, {
            id: `cluster-done-${Date.now()}`,
            role: 'assistant',
            content: `🌐 Cluster "${cluster.name}" completed:\n${fullOutput.substring(0, 2000)}`,
            timestamp: new Date(),
          }]);
        })();

        return chalk.green(`✓ Cluster "${cluster.name}" started task: ${task.substring(0, 60)}...`);
      },
    },
    {
      name: 'cluster_destroy',
      description: 'Destroy a cluster and all its agents',
      usage: '/cluster_destroy <cluster-id>',
      aliases: ['ckill'],
      handler: (ctx: CommandContext) => {
        const cm = ctx.clusterManager;
        if (!cm) return chalk.red('Cluster manager not available.');
        const { args } = ctx;
        if (args.length === 0) return chalk.red('Usage: /cluster_destroy <cluster-id>');

        const cluster = cm.getCluster(args[0]);
        if (!cluster) return chalk.red(`Cluster "${args[0]}" not found.`);

        cm.destroyCluster(args[0]);
        return chalk.green(`✓ Cluster "${cluster.name}" destroyed.`);
      },
    },

    {
      name: 'quit',
      description: 'Exit the application',
      aliases: ['q', 'exit'],
      handler: () => {
        process.exit(0);
      },
    },
  ];
}
