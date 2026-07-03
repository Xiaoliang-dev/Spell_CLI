import { EventEmitter } from 'events';
import {
  Agent,
  AgentConfig,
  AgentStep,
  AgentManagerInterface,
  Tool,
  AIClientInterface,
  Message,
} from '../types/index.js';
import { AgentCore } from './core.js';

let agentIdCounter = 0;

export class AgentManager extends EventEmitter implements AgentManagerInterface {
  private agents: Map<string, Agent> = new Map();
  private tools: Map<string, Tool> = new Map();
  private aiClient: AIClientInterface;

  constructor(aiClient: AIClientInterface, initialTools: Tool[] = []) {
    super();
    this.aiClient = aiClient;
    for (const tool of initialTools) {
      this.tools.set(tool.name, tool);
    }
  }

  createAgent(config: Partial<AgentConfig>): Agent {
    agentIdCounter++;
    const fullConfig: AgentConfig = {
      id: config.id || `agent-${agentIdCounter}`,
      name: config.name || `Agent ${agentIdCounter}`,
      description: config.description || 'An AI agent',
      systemPrompt: config.systemPrompt || 'You are a helpful AI agent.',
      modelId: config.modelId,
      maxSteps: config.maxSteps ?? 15,
      tools: config.tools || [],
      autoRun: config.autoRun ?? true,
      temperature: config.temperature ?? 0.7,
    };

    const agent: Agent = {
      config: fullConfig,
      steps: [],
      status: 'idle',
      memory: new Map(),
    };

    this.agents.set(fullConfig.id, agent);
    this.emit('agentCreated', agent);
    return agent;
  }

  destroyAgent(id: string): void {
    const agent = this.agents.get(id);
    if (agent) {
      this.emit('agentDestroyed', agent);
      this.agents.delete(id);
    }
  }

  getAgent(id: string): Agent | undefined {
    return this.agents.get(id);
  }

  listAgents(): Agent[] {
    return Array.from(this.agents.values());
  }

  async *runAgent(id: string, task: string): AsyncIterable<AgentStep> {
    const agent = this.agents.get(id);
    if (!agent) {
      const errorStep: AgentStep = {
        id: 'error',
        type: 'error',
        content: `Agent "${id}" not found`,
        timestamp: new Date(),
      };
      yield errorStep;
      return;
    }

    if (agent.status === 'running') {
      const errorStep: AgentStep = {
        id: 'error',
        type: 'error',
        content: `Agent "${id}" is already running`,
        timestamp: new Date(),
      };
      yield errorStep;
      return;
    }

    const activeTools = this.getActiveTools(agent);
    const core = new AgentCore(agent, activeTools, this.aiClient);

    this.emit('agentStarted', agent, task);

    try {
      for await (const step of core.run(task)) {
        this.emit('agentStep', agent, step);
        yield step;
      }
      this.emit('agentCompleted', agent);
    } catch (err: any) {
      agent.status = 'error';
      const errorStep: AgentStep = {
        id: 'runtime-error',
        type: 'error',
        content: `Runtime error: ${err.message}`,
        timestamp: new Date(),
      };
      agent.steps.push(errorStep);
      this.emit('agentError', agent, err);
      yield errorStep;
    }
  }

  pauseAgent(id: string): void {
    const agent = this.agents.get(id);
    if (agent && agent.status === 'running') {
      agent.status = 'paused';
      this.emit('agentPaused', agent);
    }
  }

  resumeAgent(id: string): void {
    const agent = this.agents.get(id);
    if (agent && agent.status === 'paused') {
      agent.status = 'running';
      this.emit('agentResumed', agent);
    }
  }

  registerTool(tool: Tool): void {
    this.tools.set(tool.name, tool);
    this.emit('toolRegistered', tool);
  }

  unregisterTool(name: string): void {
    this.tools.delete(name);
    this.emit('toolUnregistered', name);
  }

  listTools(): Tool[] {
    return Array.from(this.tools.values());
  }

  private getActiveTools(agent: Agent): Tool[] {
    if (agent.config.tools.length === 0) {
      return this.listTools();
    }
    return agent.config.tools
      .map(name => this.tools.get(name))
      .filter((t): t is Tool => t !== undefined);
  }
}
