import { readdirSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { PluginAPI, Plugin } from '../types/index.js';

export async function loadPlugins(api: PluginAPI, pluginsDir: string): Promise<void> {
  if (!existsSync(pluginsDir)) {
    return;
  }

  const entries = readdirSync(pluginsDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const pluginPath = join(pluginsDir, entry.name);
    const indexPath = join(pluginPath, 'index.js');
    const indexTsPath = join(pluginPath, 'index.ts');
    const pkgPath = join(pluginPath, 'package.json');

    try {
      let plugin: Plugin | null = null;

      if (existsSync(indexPath) || existsSync(indexTsPath)) {
        const mod = await import(existsSync(indexTsPath) ? indexTsPath : indexPath);
        plugin = mod.default || mod.plugin || mod;
      } else if (existsSync(pkgPath)) {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
        if (pkg.main) {
          const mainPath = join(pluginPath, pkg.main);
          const mod = await import(mainPath);
          plugin = mod.default || mod.plugin || mod;
        }
      }

      if (plugin && typeof plugin.onLoad === 'function') {
        await plugin.onLoad(api);
        if ((api as any).getConfig?.().debug) {
          console.log(`[PluginLoader] Loaded: ${plugin.name} v${plugin.version}`);
        }
      }
    } catch (err: any) {
      console.error(`[PluginLoader] Failed to load plugin ${entry.name}:`, err.message);
    }
  }
}
