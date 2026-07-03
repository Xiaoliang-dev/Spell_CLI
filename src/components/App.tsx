import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Box, Text, useApp, useInput, useStdout } from 'ink';
import { Message, AppConfig, AgentStep, ClusterEvent } from '../types/index.js';
import { AIClient } from '../ai/client.js';
import { CommandRegistry } from '../commands/registry.js';
import { PluginAPIManager } from '../plugins/api.js';
import { SkillManager } from '../skills/manager.js';
import { createBuiltinCommands } from '../commands/builtins.js';
import { promptBuilder } from '../utils/prompt-builder.js';
import { saveConfig, defaultConfig } from '../config.js';
import { loadPlugins } from '../plugins/loader.js';
import { loadSkills } from '../skills/loader.js';
import { AgentManager } from '../agent/manager.js';
import { ClusterManager } from '../agent/cluster.js';
import { getAllTools } from '../agent/tools.js';
import MessageList from './MessageList.js';
import InputBox from './InputBox.js';
import StatusBar from './StatusBar.js';
import AgentPanel from './AgentPanel.js';
import 'dotenv/config';

interface AppProps {
  initialConfig?: AppConfig;
}

const App: React.FC<AppProps> = ({ initialConfig }) => {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [config, setConfigState] = useState<AppConfig>(initialConfig || defaultConfig);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState('Ready');
  const [commandOutput, setCommandOutput] = useState<string | null>(null);
  const [showAgents, setShowAgents] = useState(false);
  const [activeAgentId, setActiveAgentId] = useState<string | undefined>();
  const [agentSteps, setAgentSteps] = useState<AgentStep[]>([]);
  const messagesEndRef = useRef<Message[]>([]);
  const configRef = useRef(config);

  messagesEndRef.current = messages;
  configRef.current = config;

  const aiClient = useRef(new AIClient(config.models, config.currentModelId));

  const pluginAPI = useRef(
    new PluginAPIManager(
      () => messagesEndRef.current,
      async (content: string) => { await handleSend(content); },
      () => configRef.current,
      <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => {
        setConfigState(prev => {
          const next = { ...prev, [key]: value };
          configRef.current = next;
          return next;
        });
      }
    )
  );

  const skillManager = useRef(new SkillManager(pluginAPI.current));
  const commandRegistry = useRef(new CommandRegistry(pluginAPI.current));

  // Initialize Agent and Cluster managers
  const allTools = useRef(getAllTools(process.cwd()));
  const agentManager = useRef(new AgentManager(aiClient.current, allTools.current));
  const clusterManager = useRef(new ClusterManager(agentManager.current, aiClient.current));

  const [agents, setAgents] = useState(agentManager.current.listAgents());
  const [clusters, setClusters] = useState(clusterManager.current.listClusters());

  // Update agents/clusters periodically
  useEffect(() => {
    const interval = setInterval(() => {
      setAgents(agentManager.current.listAgents());
      setClusters(clusterManager.current.listClusters());
    }, 500);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const builtins = createBuiltinCommands();
    for (const cmd of builtins) {
      commandRegistry.current.register(cmd);
      pluginAPI.current.registerCommand(cmd);
    }

    loadPlugins(pluginAPI.current, config.pluginsDir);
    loadSkills(skillManager.current, config.skillsDir);

    // Expose agentManager and clusterManager to plugin API
    (pluginAPI.current as any).agentManager = agentManager.current;
    (pluginAPI.current as any).clusterManager = clusterManager.current;

    setStatus(`Model: ${aiClient.current.getCurrentModel().name}`);
  }, []);

  const handleSend = useCallback(async (input: string) => {
    if (!input.trim()) return;

    if (commandRegistry.current.isCommand(input)) {
      const { name, args } = commandRegistry.current.parseCommand(input);
      setStatus(`Executing /${name}...`);
      setCommandOutput(null);
      try {
        const result = await commandRegistry.current.execute(name, {
          args,
          messages: messagesEndRef.current,
          config: configRef.current,
          setConfig: (newConfig) => {
            setConfigState(newConfig);
            configRef.current = newConfig;
          },
          setMessages,
          aiClient: aiClient.current,
          pluginAPI: pluginAPI.current,
          skillManager: skillManager.current,
          agentManager: agentManager.current,
          clusterManager: clusterManager.current,
        });
        if (result) {
          setCommandOutput(String(result));
        }
        setStatus(`Model: ${aiClient.current.getCurrentModel().name}`);
      } catch (err: any) {
        setCommandOutput(`Error: ${err.message}`);
        setStatus('Error');
      }
      return;
    }

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);
    setStatus('Thinking...');
    setCommandOutput(null);

    try {
      const skillResult = skillManager.current.autoTrigger(input, {
        input,
        messages: messagesEndRef.current,
        api: pluginAPI.current,
      });

      if (skillResult) {
        const result = await skillResult;
        if (result) {
          const assistantMsg: Message = {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: String(result),
            timestamp: new Date(),
          };
          setMessages(prev => [...prev, assistantMsg]);
        }
        setIsLoading(false);
        setStatus(`Model: ${aiClient.current.getCurrentModel().name}`);
        return;
      }

      const builtPrompt = await promptBuilder.build(
        input,
        messagesEndRef.current,
        configRef.current
      );

      const allMessages: Message[] = [
        { id: 'system', role: 'system', content: builtPrompt, timestamp: new Date() },
        ...messagesEndRef.current,
        userMsg,
      ];

      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: '',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, assistantMsg]);

      const stream = aiClient.current.chat(allMessages);
      let fullContent = '';

      for await (const chunk of stream) {
        fullContent += chunk;
        setMessages(prev => {
          const updated = [...prev];
          const lastMsg = updated[updated.length - 1];
          if (lastMsg && lastMsg.role === 'assistant') {
            lastMsg.content = fullContent;
          }
          return updated;
        });
      }

      setStatus(`Model: ${aiClient.current.getCurrentModel().name}`);
    } catch (err: any) {
      setMessages(prev => [
        ...prev,
        {
          id: (Date.now() + 2).toString(),
          role: 'assistant',
          content: `Error: ${err.message || 'Failed to get response'}`,
          timestamp: new Date(),
        },
      ]);
      setStatus('Error');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useInput((input, key) => {
    if (key.escape) {
      setCommandOutput(null);
    }
    if (key.ctrl && input === 'a') {
      setShowAgents(prev => !prev);
    }
  });

  const currentModel = aiClient.current.getCurrentModel();

  return (
    <Box flexDirection="column" height={stdout.rows || 24}>
      <Box flexDirection="row" flexGrow={1} overflow="hidden">
        <Box flexDirection="column" flexGrow={1} minWidth={showAgents ? 40 : undefined}>
          <MessageList messages={messages} agentSteps={agentSteps} />
        </Box>
        {showAgents && (
          <AgentPanel
            agents={agents}
            clusters={clusters}
            activeAgentId={activeAgentId}
          />
        )}
      </Box>

      {commandOutput && (
        <Box borderStyle="round" borderColor="cyan" paddingX={1} marginY={1}>
          <Box flexDirection="column" overflowY="hidden">
            <Text bold color="cyan">Output (ESC to close)</Text>
            <Text>{commandOutput}</Text>
          </Box>
        </Box>
      )}

      <Box flexDirection="column">
        <InputBox onSubmit={handleSend} disabled={isLoading} />
        <StatusBar
          model={currentModel}
          status={status}
          messageCount={messages.length}
          language={config.language}
          agentCount={agents.length}
          clusterCount={clusters.length}
          showAgents={showAgents}
        />
      </Box>
    </Box>
  );
};

export default App;
