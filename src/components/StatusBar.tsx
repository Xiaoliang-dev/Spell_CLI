import React from 'react';
import { Box, Text } from 'ink';
import { ModelConfig } from '../types/index.js';

interface StatusBarProps {
  model: ModelConfig;
  status: string;
  messageCount: number;
  language: string;
  agentCount?: number;
  clusterCount?: number;
  showAgents?: boolean;
}

const StatusBar: React.FC<StatusBarProps> = ({
  model,
  status,
  messageCount,
  language,
  agentCount = 0,
  clusterCount = 0,
  showAgents = false,
}) => {
  return (
    <Box justifyContent="space-between" paddingX={1}>
      <Box>
        <Text color="cyan" bold>
          [{model.name}]
        </Text>
        <Text color="gray"> | </Text>
        <Text color={status === 'Error' ? 'red' : 'green'}>
          {status}
        </Text>
      </Box>
      <Box>
        {agentCount > 0 && (
          <>
            <Text color={showAgents ? 'yellow' : 'magenta'}>
              🤖{agentCount}
            </Text>
            <Text color="gray"> | </Text>
          </>
        )}
        {clusterCount > 0 && (
          <>
            <Text color="blue">
              🌐{clusterCount}
            </Text>
            <Text color="gray"> | </Text>
          </>
        )}
        <Text color="gray">
          Msgs: {messageCount}
        </Text>
        <Text color="gray"> | </Text>
        <Text color="gray">
          Lang: {language}
        </Text>
        <Text color="gray"> | </Text>
        <Text color="yellow">
          /help
        </Text>
        <Text color="gray"> | </Text>
        <Text color="gray">
          Ctrl+A: Agents
        </Text>
      </Box>
    </Box>
  );
};

export default StatusBar;
