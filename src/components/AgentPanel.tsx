import React from 'react';
import { Box, Text } from 'ink';
import { Agent, AgentCluster } from '../types/index.js';

interface AgentPanelProps {
  agents: Agent[];
  clusters: AgentCluster[];
  activeAgentId?: string;
  onSelectAgent?: (id: string) => void;
}

const AgentPanel: React.FC<AgentPanelProps> = ({ agents, clusters, activeAgentId }) => {
  if (agents.length === 0 && clusters.length === 0) return null;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running': return 'yellow';
      case 'completed': return 'green';
      case 'error': return 'red';
      case 'paused': return 'magenta';
      default: return 'gray';
    }
  };

  return (
    <Box flexDirection="column" borderStyle="single" borderColor="blue" paddingX={1} width={40}>
      <Text bold color="blue">🤖 Agents</Text>
      {agents.length === 0 && <Text color="gray">  No agents</Text>}
      {agents.map(agent => (
        <Box key={agent.config.id} flexDirection="column" marginY={1}>
          <Box>
            <Text color={agent.config.id === activeAgentId ? 'cyan' : 'white'} bold={agent.config.id === activeAgentId}>
              {agent.config.id === activeAgentId ? '▶ ' : '  '}
              {agent.config.name}
            </Text>
            <Text color="gray"> - </Text>
            <Text color={getStatusColor(agent.status)} bold>
              {agent.status.toUpperCase()}
            </Text>
          </Box>
          {agent.currentTask && (
            <Text color="gray" wrap="truncate">
              {'    '}📝 {agent.currentTask.length > 30 ? agent.currentTask.substring(0, 30) + '...' : agent.currentTask}
            </Text>
          )}
          {agent.steps.length > 0 && (
            <Text color="gray">{'    '}{agent.steps.filter(s => s.type === 'tool_call').length} tool calls</Text>
          )}
        </Box>
      ))}

      {clusters.length > 0 && (
        <>
          <Box marginTop={1} borderStyle="single" borderColor="gray" />
          <Text bold color="blue">🌐 Clusters</Text>
          {clusters.map(cluster => (
            <Box key={cluster.id} flexDirection="column" marginY={1}>
              <Box>
                <Text bold>{cluster.name}</Text>
                <Text color="gray"> - </Text>
                <Text color={getStatusColor(cluster.status)} bold>
                  {cluster.status.toUpperCase()}
                </Text>
              </Box>
              <Text color="gray">
                {'  '}{cluster.agents.length} agents, {cluster.tasks.length} tasks
              </Text>
              {cluster.tasks.length > 0 && (
                <Box flexDirection="column">
                  {cluster.tasks.slice(0, 5).map(task => (
                    <Text key={task.id} color="gray" wrap="truncate">
                      {'    '}{task.status === 'completed' ? '✅' : task.status === 'running' ? '⏳' : task.status === 'failed' ? '❌' : '⬜'} {task.description.length > 35 ? task.description.substring(0, 35) + '...' : task.description}
                    </Text>
                  ))}
                  {cluster.tasks.length > 5 && (
                    <Text color="gray">{'    '}... and {cluster.tasks.length - 5} more</Text>
                  )}
                </Box>
              )}
            </Box>
          ))}
        </>
      )}
    </Box>
  );
};

export default AgentPanel;
