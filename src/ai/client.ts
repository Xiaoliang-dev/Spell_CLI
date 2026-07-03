import OpenAI from 'openai';
import { Message, ModelConfig, AIClientInterface } from '../types/index.js';
import { EventEmitter } from 'events';

export class AIClient extends EventEmitter implements AIClientInterface {
  private clients: Map<string, OpenAI> = new Map();
  private currentModel: ModelConfig;
  private models: Map<string, ModelConfig> = new Map();

  constructor(models: ModelConfig[], defaultModelId: string) {
    super();
    for (const m of models) {
      this.models.set(m.id, m);
      if (m.enabled) {
        this.clients.set(m.id, this.createOpenAIClient(m));
      }
    }
    this.currentModel = this.models.get(defaultModelId) || models[0];
  }

  private createOpenAIClient(model: ModelConfig): OpenAI {
    const apiKey = model.apiKey || process.env.OPENAI_API_KEY || '';
    if (model.provider === 'anthropic') {
      return new OpenAI({
        apiKey: apiKey,
        baseURL: model.baseUrl || 'https://api.openai.com/v1',
      });
    }
    return new OpenAI({
      apiKey: apiKey,
      baseURL: model.baseUrl,
    });
  }

  async *chat(messages: Message[], model?: ModelConfig): AsyncIterable<string> {
    const m = model || this.currentModel;
    const client = this.clients.get(m.id) || this.createOpenAIClient(m);

    const apiMessages = messages.map(msg => ({
      role: msg.role as 'user' | 'assistant' | 'system',
      content: msg.content,
    }));

    try {
      const stream = await client.chat.completions.create({
        model: m.modelId,
        messages: apiMessages,
        temperature: m.temperature ?? 0.7,
        max_tokens: m.maxTokens ?? 4096,
        stream: true,
      });

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content;
        if (content) {
          yield content;
        }
      }
    } catch (error: any) {
      if (error.status === 401) {
        yield '\n[Error: API Key invalid or missing. Set OPENAI_API_KEY env var or configure in ~/.ai-cli/config.json]';
      } else if (error.status === 429) {
        yield '\n[Error: Rate limited. Please try again later.]';
      } else {
        yield `\n[Error: ${error.message || 'Unknown error'}]`;
      }
    }
  }

  getCurrentModel(): ModelConfig {
    return this.currentModel;
  }

  switchModel(modelId: string): boolean {
    const model = this.models.get(modelId);
    if (!model) return false;
    if (!model.enabled) return false;
    this.currentModel = model;
    if (!this.clients.has(modelId)) {
      this.clients.set(modelId, this.createOpenAIClient(model));
    }
    this.emit('modelChanged', model);
    return true;
  }

  listModels(): ModelConfig[] {
    return Array.from(this.models.values());
  }

  addModel(model: ModelConfig): void {
    this.models.set(model.id, model);
    if (model.enabled) {
      this.clients.set(model.id, this.createOpenAIClient(model));
    }
  }

  removeModel(modelId: string): void {
    this.models.delete(modelId);
    this.clients.delete(modelId);
  }
}
