import React, { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';

interface InputBoxProps {
  onSubmit: (input: string) => void;
  disabled?: boolean;
}

const InputBox: React.FC<InputBoxProps> = ({ onSubmit, disabled }) => {
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  useInput((value, key) => {
    if (disabled) return;

    if (key.return) {
      if (input.trim()) {
        onSubmit(input);
        setHistory(prev => [...prev, input]);
        setHistoryIndex(-1);
        setInput('');
      }
      return;
    }

    if (key.upArrow) {
      if (history.length > 0) {
        const newIndex = historyIndex === -1 ? history.length - 1 : Math.max(0, historyIndex - 1);
        setHistoryIndex(newIndex);
        setInput(history[newIndex] || '');
      }
      return;
    }

    if (key.downArrow) {
      if (historyIndex !== -1) {
        const newIndex = historyIndex + 1;
        if (newIndex >= history.length) {
          setHistoryIndex(-1);
          setInput('');
        } else {
          setHistoryIndex(newIndex);
          setInput(history[newIndex] || '');
        }
      }
      return;
    }

    if (key.backspace || key.delete) {
      setInput(prev => prev.slice(0, -1));
      setHistoryIndex(-1);
      return;
    }

    if (key.tab) {
      const trimmed = input.trim();
      if (trimmed.startsWith('/')) {
        const partial = trimmed.slice(1);
        const commands = ['help', 'model', 'clear', 'language', 'config', 'skill', 'plugin', 'history', 'template', 'quit'];
        const match = commands.find(c => c.startsWith(partial));
        if (match) {
          setInput('/' + match + ' ');
        }
      }
      return;
    }

    if (value && !key.ctrl && !key.meta) {
      setInput(prev => prev + value);
      setHistoryIndex(-1);
    }
  });

  return (
    <Box borderStyle="single" borderColor={disabled ? 'gray' : 'cyan'} paddingX={1}>
      <Text color={disabled ? 'gray' : 'cyan'} bold>
        {disabled ? '... ' : '> '}
      </Text>
      <Text color={input.startsWith('/') ? 'yellow' : 'white'}>
        {input || ' '}
      </Text>
    </Box>
  );
};

export default InputBox;
