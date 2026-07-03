import { Skill } from '../../src/types/index.js';

const translateSkill: Skill = {
  name: 'translate',
  description: 'Quick translation trigger - prepends translation instruction',
  version: '1.0.0',
  author: 'AI CLI',
  triggers: ['translate', '翻译', '번역', 'traduction'],

  async onTrigger(context) {
    const { input, api } = context;
    const text = input.replace(/\b(translate|翻译|번역|traduction)\b/gi, '').trim();

    if (!text) {
      return '🔤 Translation Skill: Please provide text to translate. Usage: "translate Hello world to Japanese"';
    }

    api.sendMessage(`Please translate the following text. Detect the source language and translate appropriately. If a target language is specified, translate to that language:\n\n"${text}"`);
    return '';
  },
};

export default translateSkill;
