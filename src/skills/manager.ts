import { EventEmitter } from 'events';
import {
  Skill,
  SkillContext,
  SkillManagerInterface,
  PluginAPI,
} from '../types/index.js';

export class SkillManager extends EventEmitter implements SkillManagerInterface {
  private skills: Map<string, Skill> = new Map();
  private api: PluginAPI;

  constructor(api: PluginAPI) {
    super();
    this.api = api;
  }

  loadSkill(skill: Skill): void {
    this.skills.set(skill.name, skill);
    if (skill.onLoad) {
      skill.onLoad(this.api).catch(err => {
        console.error(`[SkillManager] Failed to load skill ${skill.name}:`, err);
      });
    }
  }

  unloadSkill(name: string): void {
    const skill = this.skills.get(name);
    if (skill?.onUnload) {
      skill.onUnload(this.api).catch(() => {});
    }
    this.skills.delete(name);
  }

  getSkills(): Skill[] {
    return Array.from(this.skills.values());
  }

  findSkill(trigger: string): Skill | undefined {
    for (const skill of this.skills.values()) {
      if (skill.triggers.some(t => trigger.toLowerCase().includes(t.toLowerCase()))) {
        return skill;
      }
    }
    return undefined;
  }

  async executeSkill(name: string, context: SkillContext): Promise<string | void> {
    const skill = this.skills.get(name);
    if (!skill) {
      return `[Error: Skill "${name}" not found]`;
    }
    return await skill.onTrigger(context);
  }

  autoTrigger(input: string, context: Omit<SkillContext, 'args'> & { args?: string[] }): Promise<string | void> | null {
    const skill = this.findSkill(input);
    if (skill) {
      return skill.onTrigger({
        ...context,
        args: context.args || input.split(' ').slice(1),
      });
    }
    return null;
  }
}
