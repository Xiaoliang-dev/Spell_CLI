# AI CLI v2.0 - Agent Edition

A Claude Code-like AI command-line client with full **Agent System**, **multi-agent clusters**, **file operations**, and **cross-platform compilation**. Built with Node.js + React Ink for a modern TUI experience.

## Features

### Core
- **TUI Interface** - Built with Ink (React for CLI) with real-time streaming
- **Multi-Model Support** - GPT-4o, Claude, and custom models via `/model`
- **Slash Commands** - 20+ commands via `/command` syntax
- **Prompt Templating** - Auto-inject date, time, language, context
- **Plugin System** - Extend with custom commands, prompt modifiers, hooks
- **Skill System** - Keyword-triggered automated responses

### Agent System
- **ReAct Loop** - Think → Act (tool call) → Observe → Repeat
- **File Tools** - Read, write, list, search files; execute shell commands
- **Git Tools** - Status, log, diff integration
- **Custom Tools** - Register your own tools via Plugin API
- **Step-by-Step Visibility** - Watch agent reasoning in real-time

### Multi-Agent Cluster
- **Task Decomposition** - AI automatically breaks complex tasks into subtasks
- **Parallel Execution** - Multiple agents work simultaneously
- **Dependency Resolution** - Handles task dependencies automatically
- **Cluster Management** - Create, monitor, destroy agent clusters

### Multi-Platform Compilation
- **GitHub Actions** - Auto-build on push/tag for 5 platforms
- **Native Binaries** - Linux (x64, arm64), macOS (x64, arm64), Windows (x64)
- **Docker Support** - Alpine-based image with Git
- **pkg Integration** - Local packaging via `npm run package`

## Quick Start

```bash
# Install dependencies
npm install

# Build
npm run build

# Run (set API key first)
export OPENAI_API_KEY=your-api-key-here
npm start

# Or run directly with tsx
npm run dev
```

## Commands

### Basic
| Command | Aliases | Description |
|---------|---------|-------------|
| `/help` | `/h`, `/?` | Show all commands |
| `/model` | `/m` | List or switch AI models |
| `/clear` | `/cls`, `/c` | Clear conversation history |
| `/language` | `/lang`, `/l` | Set response language |
| `/config` | - | Show or edit configuration |
| `/quit` | `/q`, `/exit` | Exit application |

### Agent System
| Command | Aliases | Description |
|---------|---------|-------------|
| `/agent` | `/agents` | Show all agents and their status |
| `/agent_run` | `/arun`, `/ar` | Launch an agent with a task |
| `/agent_kill` | `/akill` | Kill a running agent |
| `/agent_tools` | `/tools` | List available agent tools |

### Cluster System
| Command | Aliases | Description |
|---------|---------|-------------|
| `/clusters` | `/cluster` | List all clusters |
| `/cluster_create` | `/ccreate`, `/cc` | Create a multi-agent cluster |
| `/cluster_run` | `/crun` | Execute task on a cluster |
| `/cluster_destroy` | `/ckill` | Destroy a cluster |

### System
| Command | Aliases | Description |
|---------|---------|-------------|
| `/skill` | `/skills`, `/s` | List loaded skills |
| `/plugin` | `/plugins`, `/p` | List plugin commands |
| `/history` | `/hist` | Show conversation history |
| `/template` | - | Show or reset prompt template |

## Agent Usage

### Single Agent
```
> /agent_run Read the package.json and summarize the project dependencies
🤖 Agent 1 started: Read the package.json and summarize...
💭 Thought: I need to read the package.json file first
🔧 read_file({"path": "package.json"})
📋 { file content shown }
💭 Thought: Now I can summarize the dependencies...
✅ The project uses React, Ink, OpenAI SDK, and TypeScript...
```

### With Custom Tools
```
> /agent_run Find all TODO comments in the codebase --tools search_files,read_file
```

### Multi-Agent Cluster
```
> /cluster_create CodeReview "Review codebase for issues" --agents 3
✓ Cluster "CodeReview" created with 3 agents

> /cluster_run cluster-1 Check for security issues, code style problems, and outdated dependencies
🌐 Cluster executing...
  [✅] Check for security issues
  [✅] Check code style problems
  [✅] Check outdated dependencies
```

## Available Tools

| Tool | Description |
|------|-------------|
| `read_file` | Read file contents with offset/limit |
| `write_file` | Write or append to files |
| `list_dir` | List directory contents (recursive option) |
| `search_files` | Search text patterns across files |
| `execute_command` | Run shell commands |
| `file_info` | Get file/directory metadata |
| `git_status` | Show git working tree status |
| `git_log` | Show commit history |
| `git_diff` | Show current changes |

## Configuration

Stored in `~/.ai-cli/config.json`:

```json
{
  "currentModelId": "gpt-4o",
  "language": "zh_CN",
  "systemPrompt": "You are a helpful AI assistant.",
  "promptTemplate": "{{system}}\n\n[Context]\nDate: {{date}}\nTime: {{time}}\nLanguage: {{language}}\n\n[History]\n{{history}}\n\n[User Input]\n{{input}}",
  "pluginsDir": "~/.ai-cli/plugins",
  "skillsDir": "~/.ai-cli/skills",
  "maxHistory": 50,
  "debug": false
}
```

### Prompt Template Variables
- `{{system}}` - System prompt
- `{{date}}` - Current date (localized)
- `{{time}}` - Current time (localized)
- `{{weekday}}` - Day of week
- `{{timezone}}` - System timezone
- `{{language}}` - Target language
- `{{history}}` - Conversation history
- `{{input}}` - User input

## Plugin Development

Create `~/.ai-cli/plugins/my-plugin/index.ts`:

```typescript
import { Plugin, PluginAPI, Command } from 'ai-cli/src/types';

const myPlugin: Plugin = {
  name: 'my-plugin',
  version: '1.0.0',
  async onLoad(api: PluginAPI) {
    // Register command
    api.registerCommand({
      name: 'mycommand',
      description: 'My custom command',
      handler: async (ctx) => `Hello from plugin!`,
    });

    // Add prompt modifier
    api.addPromptModifier({
      id: 'my-mod',
      priority: 10,
      modifier: async () => 'Extra context for AI',
    });

    // Register tool for agents
    api.registerTool?.({
      name: 'my_tool',
      description: 'Does something useful',
      parameters: {
        type: 'object',
        properties: {
          input: { type: 'string', description: 'Input to process' }
        },
        required: ['input']
      },
      execute: async (args) => `Processed: ${args.input}`
    });
  },
  async onUnload(api) {
    api.unregisterCommand('mycommand');
    api.removePromptModifier('my-mod');
  }
};

export default myPlugin;
```

### Plugin API Methods

| Method | Description |
|--------|-------------|
| `registerCommand(cmd)` | Add slash command |
| `unregisterCommand(name)` | Remove command |
| `getCommands()` | List all commands |
| `addPromptModifier(mod)` | Add prompt modifier |
| `removePromptModifier(id)` | Remove modifier |
| `getMessages()` | Get conversation history |
| `sendMessage(content)` | Send message programmatically |
| `onEvent(event, handler)` | Listen for events |
| `emitEvent(event, ...args)` | Emit event |
| `getConfig()` / `setConfigValue(k, v)` | Config access |

## Skill Development

Create `~/.ai-cli/skills/my-skill/index.ts`:

```typescript
import { Skill } from 'ai-cli/src/types';

const mySkill: Skill = {
  name: 'weather',
  description: 'Weather responses',
  version: '1.0.0',
  triggers: ['weather', 'temperature'],
  async onTrigger(ctx) {
    return `The weather is nice today!`;
  }
};

export default mySkill;
```

Skills auto-trigger when user message contains any trigger keyword.

## Multi-Platform Build

### Local Packaging
```bash
npm run package:all    # Build + package for all platforms
```

Outputs to `releases/`:
- `ai-cli-linux-x64`
- `ai-cli-macos-x64`
- `ai-cli-macos-arm64`
- `ai-cli-win-x64.exe`

### GitHub Actions
Push a tag `v*` to automatically:
1. Build for all 5 platforms
2. Upload artifacts
3. Create GitHub Release
4. Build and push Docker image

```bash
git tag v2.0.0
git push origin v2.0.0
```

### Docker
```bash
docker build -t ai-cli .
docker run -it --rm -e OPENAI_API_KEY=$OPENAI_API_KEY ai-cli
```

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Enter` | Send message |
| `↑/↓` | Navigate message history |
| `Tab` | Auto-complete command |
| `Ctrl+A` | Toggle agent panel |
| `Escape` | Close command output |
| `Ctrl+C` | Quit |

## Project Structure

```
ai-cli/
├── src/
│   ├── index.tsx              # Entry point
│   ├── config.ts              # Configuration management
│   ├── ai/
│   │   └── client.ts          # AI client (OpenAI/Claude compatible)
│   ├── agent/
│   │   ├── core.ts            # ReAct agent loop
│   │   ├── manager.ts         # Agent lifecycle management
│   │   ├── cluster.ts         # Multi-agent cluster orchestration
│   │   └── tools.ts           # File, git, shell tools
│   ├── commands/
│   │   ├── registry.ts        # Command registry
│   │   └── builtins.ts        # 20+ built-in commands
│   ├── components/
│   │   ├── App.tsx            # Main app (orchestrates all)
│   │   ├── MessageList.tsx    # Message display with agent steps
│   │   ├── InputBox.tsx       # Input with history & tab completion
│   │   ├── StatusBar.tsx      # Bottom bar with agent/cluster counts
│   │   └── AgentPanel.tsx     # Side panel for agent/cluster status
│   ├── plugins/
│   │   ├── api.ts             # Plugin API implementation
│   │   └── loader.ts          # Dynamic plugin loader
│   ├── skills/
│   │   ├── manager.ts         # Skill manager
│   │   └── loader.ts          # Dynamic skill loader
│   ├── types/
│   │   └── index.ts           # All TypeScript types
│   └── utils/
│       └── prompt-builder.ts  # Template + modifier system
├── plugins/example/           # Example plugin
├── skills/                    # Example skills
├── .github/workflows/
│   └── build.yml              # CI/CD for 5 platforms + Docker
├── Dockerfile
├── tsconfig.json
├── package.json
└── README.md
```

## License

MIT
