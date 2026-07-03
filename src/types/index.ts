import { ReactElement } from 'react';

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface ModelConfig {
  id: string;
  name: string;
  provider: 'openai' | 'anthropic' | 'custom';
  modelId: string;
  apiKey?: string;
  baseUrl?: string;
  temperature?: number;
  maxTokens?: number;
  enabled: boolean;
}

export interface AppConfig {
  currentModelId: string;
  models: ModelConfig[];
  language: string;
  systemPrompt: string;
  promptTemplate: string;
  pluginsDir: string;
  skillsDir: string;
  maxHistory: number;
  debug: boolean;
}

export interface CommandContext {
  args: string[];
  messages: Message[];
  config: AppConfig;
  setConfig: (config: AppConfig) => void;
  setMessages: (messages: Message[] | ((prev: Message[]) => Message[])) => void;
  aiClient: AIClientInterface;
  pluginAPI: PluginAPI;
  skillManager: SkillManagerInterface;
}

export interface Command {
  name: string;
  description: string;
  usage?: string;
  aliases?: string[];
  handler: (ctx: CommandContext) => string | Promise<string | void>;
}

export interface PluginAPI {
  registerCommand: (command: Command) => void;
  unregisterCommand: (name: string) => void;
  getCommands: () => Command[];
  getCommand: (name: string) => Command | undefined;
  addPromptModifier: (modifier: PromptModifier) => void;
  removePromptModifier: (id: string) => void;
  getMessages: () => Message[];
  sendMessage: (content: string) => Promise<void>;
  onEvent: (event: string, handler: (...args: any[]) => void) => void;
  emitEvent: (event: string, ...args: any[]) => void;
  registerHook: (hook: string, handler: HookHandler) => void;
  unregisterHook: (hook: string, handler: HookHandler) => void;
  getConfig: () => AppConfig;
  setConfigValue: <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => void;
}

export type HookHandler = (...args: any[]) => any;

export interface PromptModifier {
  id: string;
  priority: number;
  modifier: (context: PromptContext) => string | Promise<string>;
}

export interface PromptContext {
  userInput: string;
  messages: Message[];
  config: AppConfig;
  timestamp: Date;
}

export interface AIClientInterface {
  chat(messages: Message[], model?: ModelConfig): AsyncIterable<string>;
  getCurrentModel(): ModelConfig;
  switchModel(modelId: string): boolean;
  listModels(): ModelConfig[];
}

export interface Skill {
  name: string;
  description: string;
  version: string;
  author?: string;
  triggers: string[];
  onTrigger: (context: SkillContext) => Promise<string | void>;
  onLoad?: (api: PluginAPI) => Promise<void>;
  onUnload?: (api: PluginAPI) => Promise<void>;
}

export interface SkillContext {
  input: string;
  messages: Message[];
  api: PluginAPI;
  args: string[];
}

export interface SkillManagerInterface {
  loadSkill(skill: Skill): void;
  unloadSkill(name: string): void;
  getSkills(): Skill[];
  findSkill(trigger: string): Skill | undefined;
  executeSkill(name: string, context: SkillContext): Promise<string | void>;
}

export interface Plugin {
  name: string;
  version: string;
  description?: string;
  onLoad: (api: PluginAPI) => Promise<void>;
  onUnload?: (api: PluginAPI) => Promise<void>;
}

export interface UIProps {
  messages: Message[];
  onSend: (input: string) => void;
  onCommand: (command: string, args: string[]) => Promise<string | void>;
  isLoading: boolean;
  currentModel: ModelConfig;
  status: string;
}

// ─── Agent & Tool System ───

export interface ToolParameter {
  type: string;
  properties: Record<string, {
    type: string;
    description: string;
    enum?: string[];
  }>;
  required: string[];
}

export interface Tool {
  name: string;
  description: string;
  parameters: ToolParameter;
  execute: (args: Record<string, any>) => Promise<string>;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
}

export interface ToolResult {
  id: string;
  name: string;
  result: string;
  error?: string;
}

export interface AgentStep {
  id: string;
  type: 'thought' | 'tool_call' | 'tool_result' | 'response' | 'error';
  content: string;
  toolCall?: ToolCall;
  toolResult?: ToolResult;
  timestamp: Date;
}

export interface AgentConfig {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  modelId?: string;
  maxSteps: number;
  tools: string[];
  autoRun: boolean;
  temperature?: number;
}

export interface Agent {
  config: AgentConfig;
  steps: AgentStep[];
  status: 'idle' | 'running' | 'paused' | 'completed' | 'error';
  currentTask?: string;
  memory: Map<string, any>;
}

export interface AgentManagerInterface {
  createAgent(config: Partial<AgentConfig>): Agent;
  destroyAgent(id: string): void;
  getAgent(id: string): Agent | undefined;
  listAgents(): Agent[];
  runAgent(id: string, task: string): AsyncIterable<AgentStep>;
  pauseAgent(id: string): void;
  resumeAgent(id: string): void;
  registerTool(tool: Tool): void;
  unregisterTool(name: string): void;
  listTools(): Tool[];
}

export interface ClusterTask {
  id: string;
  description: string;
  assignedAgent?: string;
  dependencies: string[];
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: string;
}

export interface AgentCluster {
  id: string;
  name: string;
  description: string;
  agents: Agent[];
  tasks: ClusterTask[];
  status: 'idle' | 'planning' | 'executing' | 'completed' | 'error';
}

export interface ClusterManagerInterface {
  createCluster(name: string, description: string): AgentCluster;
  destroyCluster(id: string): void;
  getCluster(id: string): AgentCluster | undefined;
  listClusters(): AgentCluster[];
  addAgentToCluster(clusterId: string, agentConfig: Partial<AgentConfig>): Agent;
  removeAgentFromCluster(clusterId: string, agentId: string): void;
  executeClusterTask(clusterId: string, task: string): AsyncIterable<ClusterEvent>;
}

export interface ClusterEvent {
  type: 'plan' | 'agent_start' | 'agent_step' | 'agent_complete' | 'task_complete' | 'error' | 'info';
  clusterId: string;
  agentId?: string;
  taskId?: string;
  content: string;
  step?: AgentStep;
  timestamp: Date;
}

export interface CommandContext {
  args: string[];
  messages: Message[];
  config: AppConfig;
  setConfig: (config: AppConfig) => void;
  setMessages: (messages: Message[] | ((prev: Message[]) => Message[])) => void;
  aiClient: AIClientInterface;
  pluginAPI: PluginAPI;
  skillManager: SkillManagerInterface;
  agentManager?: AgentManagerInterface;
  clusterManager?: ClusterManagerInterface;
}
