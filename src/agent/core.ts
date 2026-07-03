import { Agent, AgentConfig, AgentStep, Tool, ToolCall, AIClientInterface, Message } from '../types/index.js';

const AGENT_SYSTEM_PROMPT = `You are an autonomous AI agent. You can use tools to accomplish tasks.

Available tools will be provided in each turn. Follow this workflow:

1. **Think** - Analyze the task and plan your approach
2. **Act** - Call ONE tool using the exact format below
3. **Observe** - Wait for the tool result, then continue

## Tool Call Format (MUST use exactly this JSON format):
<tool_call>
{
  "name": "tool_name",
  "arguments": { "param1": "value1", "param2": "value2" }
}
</tool_call>

## Rules:
- You can call ONE tool at a time
- After each tool call, wait for the result (it will be provided)
- When the task is complete, provide your final response WITHOUT any tool call
- Do not repeat the same tool call with identical arguments
- If a task cannot be completed, explain why
- Be concise in your thoughts
- Current date: {{date}}, Time: {{time}}
`;

interface ParsedResponse {
  thought: string;
  toolCall?: ToolCall;
  finalResponse?: string;
}

export class AgentCore {
  private agent: Agent;
  private tools: Map<string, Tool>;
  private aiClient: AIClientInterface;

  constructor(agent: Agent, tools: Tool[], aiClient: AIClientInterface) {
    this.agent = agent;
    this.tools = new Map(tools.map(t => [t.name, t]));
    this.aiClient = aiClient;
  }

  async *run(task: string): AsyncIterable<AgentStep> {
    this.agent.status = 'running';
    this.agent.currentTask = task;
    this.agent.steps = [];

    const now = new Date();
    const systemPrompt = AGENT_SYSTEM_PROMPT
      .replace('{{date}}', now.toLocaleDateString())
      .replace('{{time}}', now.toLocaleTimeString());

    const toolDescriptions = Array.from(this.tools.values())
      .map(t => `- ${t.name}: ${t.description}\n  Parameters: ${JSON.stringify(t.parameters.properties)}`)
      .join('\n');

    const messages: Message[] = [
      { id: 'sys', role: 'system', content: systemPrompt, timestamp: now },
      { id: 'tools', role: 'system', content: `## Available Tools:\n${toolDescriptions}`, timestamp: now },
      { id: 'task', role: 'user', content: `Task: ${task}\n\nStart by thinking about what to do, then call tools as needed.`, timestamp: now },
    ];

    let stepCount = 0;
    const maxSteps = this.agent.config.maxSteps;

    while (stepCount < maxSteps && this.agent.status === 'running') {
      stepCount++;

      // Build conversation history
      const chatMessages = [...messages, ...this.buildStepMessages()];

      // Get AI response
      let fullResponse = '';
      const stream = this.aiClient.chat(chatMessages);
      for await (const chunk of stream) {
        fullResponse += chunk;
      }

      // Parse response
      const parsed = this.parseResponse(fullResponse, stepCount);

      // Emit thought
      if (parsed.thought) {
        const thoughtStep: AgentStep = {
          id: `step-${stepCount}-thought`,
          type: 'thought',
          content: parsed.thought,
          timestamp: new Date(),
        };
        this.agent.steps.push(thoughtStep);
        yield thoughtStep;
      }

      // If final response, we're done
      if (parsed.finalResponse) {
        const responseStep: AgentStep = {
          id: `step-${stepCount}-response`,
          type: 'response',
          content: parsed.finalResponse,
          timestamp: new Date(),
        };
        this.agent.steps.push(responseStep);
        this.agent.status = 'completed';
        yield responseStep;
        return;
      }

      // Execute tool call
      if (parsed.toolCall) {
        const toolCallStep: AgentStep = {
          id: `step-${stepCount}-call`,
          type: 'tool_call',
          content: `🔧 ${parsed.toolCall.name}(${JSON.stringify(parsed.toolCall.arguments)})`,
          toolCall: parsed.toolCall,
          timestamp: new Date(),
        };
        this.agent.steps.push(toolCallStep);
        yield toolCallStep;

        // Execute the tool
        const tool = this.tools.get(parsed.toolCall.name);
        let result: string;
        if (!tool) {
          result = `Error: Tool "${parsed.toolCall.name}" not found. Available: ${Array.from(this.tools.keys()).join(', ')}`;
        } else {
          try {
            result = await tool.execute(parsed.toolCall.arguments);
          } catch (err: any) {
            result = `Error: ${err.message}`;
          }
        }

        const toolResultStep: AgentStep = {
          id: `step-${stepCount}-result`,
          type: 'tool_result',
          content: result,
          toolResult: { id: parsed.toolCall.id, name: parsed.toolCall.name, result },
          timestamp: new Date(),
        };
        this.agent.steps.push(toolResultStep);
        yield toolResultStep;
      } else {
        // No tool call and no final response - treat as response
        const responseStep: AgentStep = {
          id: `step-${stepCount}-response`,
          type: 'response',
          content: parsed.thought || fullResponse,
          timestamp: new Date(),
        };
        this.agent.steps.push(responseStep);
        this.agent.status = 'completed';
        yield responseStep;
        return;
      }
    }

    if (stepCount >= maxSteps) {
      this.agent.status = 'error';
      const errorStep: AgentStep = {
        id: `step-${stepCount}-error`,
        type: 'error',
        content: `Reached maximum steps (${maxSteps}). Task may be incomplete.`,
        timestamp: new Date(),
      };
      this.agent.steps.push(errorStep);
      yield errorStep;
    }
  }

  private parseResponse(response: string, stepCount: number): ParsedResponse {
    const toolCallMatch = response.match(/<tool_call>\s*({[\s\S]*?})\s*<\/tool_call>/);

    if (toolCallMatch) {
      try {
        const toolCall = JSON.parse(toolCallMatch[1]);
        const thought = response.replace(/<tool_call>[\s\S]*?<\/tool_call>/, '').trim();
        return {
          thought,
          toolCall: {
            id: `call-${stepCount}`,
            name: toolCall.name,
            arguments: toolCall.arguments || toolCall.params || {},
          },
        };
      } catch {
        // JSON parse failed, treat as final response
      }
    }

    // Check if it looks like a JSON tool call without tags
    const jsonMatch = response.match(/\{\s*"name"\s*:\s*"(\w+)"\s*,\s*"arguments"\s*:/);
    if (jsonMatch) {
      try {
        const jsonStart = response.indexOf('{');
        const jsonEnd = response.lastIndexOf('}') + 1;
        const toolCall = JSON.parse(response.substring(jsonStart, jsonEnd));
        const beforeJson = response.substring(0, jsonStart).trim();
        return {
          thought: beforeJson,
          toolCall: {
            id: `call-${stepCount}`,
            name: toolCall.name,
            arguments: toolCall.arguments || toolCall.params || {},
          },
        };
      } catch {
        // Not valid JSON
      }
    }

    // No tool call found - treat as final response
    return {
      thought: '',
      finalResponse: response.trim(),
    };
  }

  private buildStepMessages(): Message[] {
    const msgs: Message[] = [];
    for (const step of this.agent.steps) {
      if (step.type === 'thought') {
        msgs.push({ id: step.id, role: 'assistant', content: `Thought: ${step.content}`, timestamp: step.timestamp });
      } else if (step.type === 'tool_call' && step.toolCall) {
        msgs.push({ id: step.id, role: 'assistant', content: `<tool_call>\n${JSON.stringify({ name: step.toolCall.name, arguments: step.toolCall.arguments })}\n</tool_call>`, timestamp: step.timestamp });
      } else if (step.type === 'tool_result' && step.toolResult) {
        msgs.push({ id: step.id, role: 'user', content: `[Tool Result: ${step.toolResult.name}]\n${step.toolResult.result}`, timestamp: step.timestamp });
      }
    }
    return msgs;
  }

  pause(): void {
    this.agent.status = 'paused';
  }

  resume(): void {
    if (this.agent.status === 'paused') {
      this.agent.status = 'running';
    }
  }
}
