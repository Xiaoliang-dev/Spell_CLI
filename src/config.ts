import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { AppConfig, ModelConfig } from './types/index.js';

const CONFIG_DIR = join(homedir(), '.ai-cli');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

const defaultModels: ModelConfig[] = [
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    provider: 'openai',
    modelId: 'gpt-4o',
    temperature: 0.7,
    maxTokens: 4096,
    enabled: true,
  },
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    provider: 'openai',
    modelId: 'gpt-4o-mini',
    temperature: 0.7,
    maxTokens: 4096,
    enabled: true,
  },
  {
    id: 'claude-sonnet',
    name: 'Claude 3.5 Sonnet',
    provider: 'anthropic',
    modelId: 'claude-3-5-sonnet-20241022',
    temperature: 0.7,
    maxTokens: 4096,
    enabled: true,
  },
  {
    id: 'custom',
    name: 'Custom',
    provider: 'custom',
    modelId: 'custom-model',
    temperature: 0.7,
    maxTokens: 4096,
    enabled: false,
  },
];

const defaultConfig: AppConfig = {
  currentModelId: 'gpt-4o',
  models: defaultModels,
  language: process.env.LANG?.split('.')[0] || 'zh_CN',
  systemPrompt: 'You are a helpful AI assistant.',
  promptTemplate: '{{system}}\n\n[Context]\nDate: {{date}}\nTime: {{time}}\nLanguage: {{language}}\n\n[History]\n{{history}}\n\n[User Input]\n{{input}}',
  pluginsDir: join(CONFIG_DIR, 'plugins'),
  skillsDir: join(CONFIG_DIR, 'skills'),
  maxHistory: 50,
  debug: false,
};

function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  if (!existsSync(defaultConfig.pluginsDir)) {
    mkdirSync(defaultConfig.pluginsDir, { recursive: true });
  }
  if (!existsSync(defaultConfig.skillsDir)) {
    mkdirSync(defaultConfig.skillsDir, { recursive: true });
  }
}

export function loadConfig(): AppConfig {
  ensureConfigDir();
  if (existsSync(CONFIG_FILE)) {
    try {
      const raw = readFileSync(CONFIG_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      return { ...defaultConfig, ...parsed, models: mergeModels(parsed.models || []) };
    } catch {
      return { ...defaultConfig };
    }
  }
  saveConfig(defaultConfig);
  return { ...defaultConfig };
}

export function saveConfig(config: AppConfig): void {
  ensureConfigDir();
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

function mergeModels(userModels: Partial<ModelConfig>[]): ModelConfig[] {
  const map = new Map(defaultModels.map(m => [m.id, m]));
  for (const um of userModels) {
    if (um.id && map.has(um.id)) {
      map.set(um.id, { ...map.get(um.id)!, ...um });
    } else if (um.id) {
      map.set(um.id, um as ModelConfig);
    }
  }
  return Array.from(map.values());
}

export function getConfigPath(): string {
  return CONFIG_DIR;
}

export { defaultModels, defaultConfig, CONFIG_DIR };
