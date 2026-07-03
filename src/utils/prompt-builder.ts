import { AppConfig, Message, PromptContext, PromptModifier } from '../types/index.js';

class PromptBuilder {
  private modifiers: PromptModifier[] = [];

  addModifier(modifier: PromptModifier): void {
    this.modifiers.push(modifier);
    this.modifiers.sort((a, b) => a.priority - b.priority);
  }

  removeModifier(id: string): boolean {
    const idx = this.modifiers.findIndex(m => m.id === id);
    if (idx !== -1) {
      this.modifiers.splice(idx, 1);
      return true;
    }
    return false;
  }

  getModifiers(): PromptModifier[] {
    return [...this.modifiers];
  }

  async build(userInput: string, messages: Message[], config: AppConfig): Promise<string> {
    const now = new Date();
    const ctx: PromptContext = { userInput, messages, config, timestamp: now };

    const vars: Record<string, string> = {
      system: config.systemPrompt,
      date: this.formatDate(now, config.language),
      time: this.formatTime(now, config.language),
      language: this.getLanguageName(config.language),
      history: this.formatHistory(messages),
      input: userInput,
      weekday: this.getWeekday(now, config.language),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };

    let result = this.replaceVars(config.promptTemplate, vars);

    for (const mod of this.modifiers) {
      try {
        const modResult = await mod.modifier(ctx);
        if (modResult) {
          result += `\n[${mod.id}]\n${modResult}`;
        }
      } catch (err) {
        if (config.debug) {
          console.error(`[PromptBuilder] Modifier ${mod.id} error:`, err);
        }
      }
    }

    return result;
  }

  private replaceVars(template: string, vars: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_match, key) => vars[key] ?? '');
  }

  private formatDate(date: Date, locale: string): string {
    try {
      return date.toLocaleDateString(locale, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
    } catch {
      return date.toLocaleDateString('en-US');
    }
  }

  private formatTime(date: Date, locale: string): string {
    try {
      return date.toLocaleTimeString(locale, {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return date.toLocaleTimeString('en-US');
    }
  }

  private getWeekday(date: Date, locale: string): string {
    try {
      return date.toLocaleDateString(locale, { weekday: 'long' });
    } catch {
      return date.toLocaleDateString('en-US', { weekday: 'long' });
    }
  }

  private getLanguageName(locale: string): string {
    const map: Record<string, string> = {
      zh_CN: 'Chinese (Simplified)',
      zh_TW: 'Chinese (Traditional)',
      en_US: 'English',
      ja_JP: 'Japanese',
      ko_KR: 'Korean',
      fr_FR: 'French',
      de_DE: 'German',
      es_ES: 'Spanish',
      ru_RU: 'Russian',
    };
    return map[locale] || locale;
  }

  private formatHistory(messages: Message[]): string {
    if (messages.length === 0) return 'No previous messages.';
    return messages
      .filter(m => m.role !== 'system')
      .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n');
  }

  getDefaultTemplate(): string {
    return '{{system}}\n\n[Context]\nDate: {{date}}\nTime: {{time}}\nWeekday: {{weekday}}\nTimezone: {{timezone}}\nLanguage: {{language}}\n\n[History]\n{{history}}\n\n[User Input]\n{{input}}';
  }
}

export const promptBuilder = new PromptBuilder();
