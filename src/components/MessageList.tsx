import React from 'react';
import { Box, Text } from 'ink';
import chalk from 'chalk';
import { Message, AgentStep } from '../types/index.js';

interface MessageListProps {
  messages: Message[];
  agentSteps?: AgentStep[];
}

const MessageList: React.FC<MessageListProps> = ({ messages, agentSteps = [] }) => {
  const getStepIcon = (type: AgentStep['type']) => {
    switch (type) {
      case 'thought': return '💭';
      case 'tool_call': return '🔧';
      case 'tool_result': return '📋';
      case 'response': return '✅';
      case 'error': return '❌';
      default: return '•';
    }
  };

  const getStepColor = (type: AgentStep['type']) => {
    switch (type) {
      case 'thought': return 'gray';
      case 'tool_call': return 'yellow';
      case 'tool_result': return 'cyan';
      case 'response': return 'green';
      case 'error': return 'red';
      default: return 'white';
    }
  };

  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1}>
      {messages.length === 0 && agentSteps.length === 0 && (
        <Box flexDirection="column" alignItems="center" justifyContent="center" flexGrow={1}>
          <Text bold color="cyan">
            🤖 AI CLI with Agent System
          </Text>
          <Text color="gray">Type a message to start chatting</Text>
          <Text color="gray">Use /help for commands</Text>
          <Text color="gray">Use /agent run &lt;task&gt; to launch an agent</Text>
          <Text color="gray">Ctrl+A to toggle agent panel</Text>
        </Box>
      )}

      {messages.map((msg) => (
        <Box key={msg.id} flexDirection="column" marginY={1}>
          <Box>
            <Text bold color={msg.role === 'user' ? 'blue' : msg.role === 'system' ? 'gray' : 'green'}>
              {msg.role === 'user' ? 'You' : msg.role === 'system' ? 'System' : 'AI'}
            </Text>
            <Text color="gray"> {msg.timestamp.toLocaleTimeString()}</Text>
          </Box>
          <Box marginLeft={2}>
            <Text wrap="wrap">{msg.content || ' '}</Text>
          </Box>
        </Box>
      ))}

      {agentSteps.length > 0 && (
        <Box flexDirection="column" marginY={1} borderStyle="single" borderColor="magenta" paddingX={1}>
          <Text bold color="magenta">🤖 Agent Execution</Text>
          {agentSteps.map((step) => (
            <Box key={step.id} flexDirection="column" marginY={1}>
              <Box>
                <Text color={getStepColor(step.type)}>
                  {getStepIcon(step.type)} {step.type.toUpperCase()}
                </Text>
                <Text color="gray"> {step.timestamp.toLocaleTimeString()}</Text>
              </Box>
              <Box marginLeft={2}>
                <Text color={getStepColor(step.type)} wrap="wrap">
                  {step.content.length > 300 ? step.content.substring(0, 300) + '...' : step.content}
                </Text>
              </Box>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
};

export default MessageList;
