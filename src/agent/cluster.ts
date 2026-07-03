import { EventEmitter } from 'events';
import {
  AgentCluster,
  AgentConfig,
  ClusterTask,
  ClusterEvent,
  ClusterManagerInterface,
  AgentManagerInterface,
  Message,
  AIClientInterface,
} from '../types/index.js';

let clusterIdCounter = 0;
let taskIdCounter = 0;

const CLUSTER_PLANNER_PROMPT = `You are a cluster task planner. Given a complex task, break it down into subtasks that can be executed in parallel or sequence.

## Rules:
- Each subtask should be independent and assignable to a single agent
- Consider dependencies between subtasks
- Use "parallel" group for independent tasks
- Keep subtasks specific and actionable

## Output Format (JSON):
{
  "subtasks": [
    { "description": "Task description", "dependsOn": [], "skills": [] }
  ],
  "reasoning": "Why this plan works"
}

Respond ONLY with the JSON, no other text.`;

export class ClusterManager extends EventEmitter implements ClusterManagerInterface {
  private clusters: Map<string, AgentCluster> = new Map();
  private agentManager: AgentManagerInterface;
  private aiClient: AIClientInterface;

  constructor(agentManager: AgentManagerInterface, aiClient: AIClientInterface) {
    super();
    this.agentManager = agentManager;
    this.aiClient = aiClient;
  }

  createCluster(name: string, description: string): AgentCluster {
    clusterIdCounter++;
    const cluster: AgentCluster = {
      id: `cluster-${clusterIdCounter}`,
      name: name || `Cluster ${clusterIdCounter}`,
      description: description || '',
      agents: [],
      tasks: [],
      status: 'idle',
    };
    this.clusters.set(cluster.id, cluster);
    this.emit('clusterCreated', cluster);
    return cluster;
  }

  destroyCluster(id: string): void {
    const cluster = this.clusters.get(id);
    if (cluster) {
      for (const agent of cluster.agents) {
        this.agentManager.destroyAgent(agent.config.id);
      }
      this.emit('clusterDestroyed', cluster);
      this.clusters.delete(id);
    }
  }

  getCluster(id: string): AgentCluster | undefined {
    return this.clusters.get(id);
  }

  listClusters(): AgentCluster[] {
    return Array.from(this.clusters.values());
  }

  addAgentToCluster(clusterId: string, agentConfig: Partial<AgentConfig>) {
    const cluster = this.clusters.get(clusterId);
    if (!cluster) throw new Error(`Cluster ${clusterId} not found`);
    const agent = this.agentManager.createAgent(agentConfig);
    cluster.agents.push(agent);
    this.emit('agentAdded', cluster, agent);
    return agent;
  }

  removeAgentFromCluster(clusterId: string, agentId: string): void {
    const cluster = this.clusters.get(clusterId);
    if (!cluster) return;
    cluster.agents = cluster.agents.filter(a => a.config.id !== agentId);
    this.agentManager.destroyAgent(agentId);
    this.emit('agentRemoved', cluster, agentId);
  }

  async *executeClusterTask(clusterId: string, task: string): AsyncIterable<ClusterEvent> {
    const cluster = this.clusters.get(clusterId);
    if (!cluster) {
      yield this.makeEvent('error', clusterId, `Cluster "${clusterId}" not found`);
      return;
    }

    cluster.status = 'planning';
    yield this.makeEvent('info', clusterId, `Planning task: ${task}`);

    // Plan subtasks using AI
    const plan = await this.planSubtasks(task);
    yield this.makeEvent('plan', clusterId, `Plan: ${plan.reasoning}\nSubtasks: ${plan.subtasks.map(s => s.description).join(', ')}`);

    // Create tasks
    cluster.tasks = plan.subtasks.map(st => {
      taskIdCounter++;
      return {
        id: `task-${taskIdCounter}`,
        description: st.description,
        dependencies: st.dependsOn || [],
        status: 'pending' as const,
      };
    });

    // Assign tasks to agents
    cluster.status = 'executing';
    const taskAgentMap = new Map<string, string>();

    for (let i = 0; i < cluster.tasks.length; i++) {
      const clusterTask = cluster.tasks[i];
      const agentIndex = i % Math.max(cluster.agents.length, 1);
      if (cluster.agents[agentIndex]) {
        clusterTask.assignedAgent = cluster.agents[agentIndex].config.id;
        taskAgentMap.set(clusterTask.id, cluster.agents[agentIndex].config.id);
      }
    }

    // Execute tasks with dependency resolution
    const completedTasks = new Set<string>();
    const failedTasks = new Set<string>();

    while (completedTasks.size + failedTasks.size < cluster.tasks.length) {
      const readyTasks = cluster.tasks.filter(t =>
        t.status === 'pending' &&
        t.dependencies.every(d => completedTasks.has(d))
      );

      if (readyTasks.length === 0) {
        // Check for deadlock
        const pendingTasks = cluster.tasks.filter(t => t.status === 'pending');
        if (pendingTasks.length > 0) {
          for (const pt of pendingTasks) {
            pt.status = 'failed';
            failedTasks.add(pt.id);
          }
          yield this.makeEvent('error', clusterId, 'Deadlock detected, marking remaining tasks as failed');
        }
        break;
      }

      // Execute ready tasks (sequentially for now, can be parallelized)
      for (const clusterTask of readyTasks) {
        clusterTask.status = 'running';
        const agentId = clusterTask.assignedAgent;

        if (!agentId) {
          clusterTask.status = 'failed';
          failedTasks.add(clusterTask.id);
          yield this.makeEvent('error', clusterId, `No agent assigned for task: ${clusterTask.description}`, undefined, clusterTask.id);
          continue;
        }

        const agent = this.agentManager.getAgent(agentId);
        if (!agent) {
          clusterTask.status = 'failed';
          failedTasks.add(clusterTask.id);
          yield this.makeEvent('error', clusterId, `Agent ${agentId} not found`, undefined, clusterTask.id);
          continue;
        }

        yield this.makeEvent('agent_start', clusterId, `${agent.config.name} started: ${clusterTask.description}`, agentId, clusterTask.id);

        try {
          let fullResult = '';
          for await (const step of this.agentManager.runAgent(agentId, clusterTask.description)) {
            yield this.makeEvent('agent_step', clusterId, `[${step.type}] ${step.content.substring(0, 200)}`, agentId, clusterTask.id, step);
            if (step.type === 'response' || step.type === 'tool_result') {
              fullResult += step.content + '\n';
            }
          }
          clusterTask.status = 'completed';
          clusterTask.result = fullResult.trim();
          completedTasks.add(clusterTask.id);
          yield this.makeEvent('agent_complete', clusterId, `${agent.config.name} completed task`, agentId, clusterTask.id);
        } catch (err: any) {
          clusterTask.status = 'failed';
          failedTasks.add(clusterTask.id);
          yield this.makeEvent('error', clusterId, `${agent.config.name} failed: ${err.message}`, agentId, clusterTask.id);
        }
      }
    }

    // Summarize
    const completed = cluster.tasks.filter(t => t.status === 'completed').length;
    const failed = cluster.tasks.filter(t => t.status === 'failed').length;
    cluster.status = failed > 0 ? 'error' : 'completed';

    const summary = `\n📊 Cluster Results:\n  Completed: ${completed}/${cluster.tasks.length}\n  Failed: ${failed}/${cluster.tasks.length}\n\n${cluster.tasks.map(t => `  [${t.status === 'completed' ? '✅' : '❌'}] ${t.description}`).join('\n')}`;

    yield this.makeEvent('task_complete', clusterId, summary);
  }

  private async planSubtasks(task: string): Promise<{ subtasks: Array<{ description: string; dependsOn: string[]; skills: string[] }>; reasoning: string }> {
    const messages: Message[] = [
      { id: 'sys', role: 'system', content: CLUSTER_PLANNER_PROMPT, timestamp: new Date() },
      { id: 'task', role: 'user', content: `Break down this task into subtasks:\n\n${task}`, timestamp: new Date() },
    ];

    let response = '';
    const stream = this.aiClient.chat(messages);
    for await (const chunk of stream) {
      response += chunk;
    }

    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          subtasks: parsed.subtasks || [{ description: task, dependsOn: [], skills: [] }],
          reasoning: parsed.reasoning || 'Direct execution',
        };
      }
    } catch {
      // Fallback: single task
    }

    return {
      subtasks: [{ description: task, dependsOn: [], skills: [] }],
      reasoning: 'Fallback: executing as single task',
    };
  }

  private makeEvent(
    type: ClusterEvent['type'],
    clusterId: string,
    content: string,
    agentId?: string,
    taskId?: string,
    step?: ClusterEvent['step']
  ): ClusterEvent {
    return { type, clusterId, agentId, taskId, content, step, timestamp: new Date() };
  }
}
