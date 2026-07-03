import { readdirSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { SkillManager } from './manager.js';
import { Skill } from '../types/index.js';

export async function loadSkills(manager: SkillManager, skillsDir: string): Promise<void> {
  if (!existsSync(skillsDir)) {
    return;
  }

  const entries = readdirSync(skillsDir, { withFileTypes: true });

  for (const entry of entries) {
    const skillPath = join(skillsDir, entry.name);

    try {
      let skill: Skill | null = null;

      if (entry.isDirectory()) {
        const indexPath = join(skillPath, 'index.js');
        const indexTsPath = join(skillPath, 'index.ts');
        if (existsSync(indexTsPath)) {
          const mod = await import(indexTsPath);
          skill = mod.default || mod.skill || mod;
        } else if (existsSync(indexPath)) {
          const mod = await import(indexPath);
          skill = mod.default || mod.skill || mod;
        }
      } else if (entry.name.endsWith('.js') || entry.name.endsWith('.ts')) {
        const mod = await import(skillPath);
        skill = mod.default || mod.skill || mod;
      } else if (entry.name.endsWith('.json')) {
        const raw = readFileSync(skillPath, 'utf-8');
        const parsed = JSON.parse(raw);
        skill = createSkillFromJSON(parsed);
      }

      if (skill && skill.name && typeof skill.onTrigger === 'function') {
        manager.loadSkill(skill);
      }
    } catch (err: any) {
      console.error(`[SkillLoader] Failed to load skill ${entry.name}:`, err.message);
    }
  }
}

function createSkillFromJSON(data: any): Skill | null {
  if (!data.name || !data.triggers || !data.response) {
    return null;
  }
  return {
    name: data.name,
    description: data.description || '',
    version: data.version || '1.0.0',
    author: data.author,
    triggers: data.triggers,
    onTrigger: async (context) => {
      if (data.responseTemplate) {
        return data.responseTemplate.replace(/\{\{input\}\}/g, context.input);
      }
      return data.response;
    },
  };
}
