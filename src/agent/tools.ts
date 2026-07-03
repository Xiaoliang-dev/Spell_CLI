import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync, appendFileSync } from 'fs';
import { join, dirname, relative, resolve } from 'path';
import { execSync, spawn } from 'child_process';
import { homedir } from 'os';
import { Tool } from '../types/index.js';

export function createFileTools(workspaceRoot: string = process.cwd()): Tool[] {
  const root = resolve(workspaceRoot);

  function safePath(p: string): string {
    const abs = resolve(root, p);
    if (!abs.startsWith(root) && !abs.startsWith(homedir())) {
      throw new Error(`Path "${p}" is outside workspace`);
    }
    return abs;
  }

  return [
    {
      name: 'read_file',
      description: 'Read the contents of a file. Provide relative path from workspace root. Use offset/limit for large files.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative file path' },
          offset: { type: 'number', description: 'Start line (1-based)' },
          limit: { type: 'number', description: 'Max lines to read' },
        },
        required: ['path'],
      },
      execute: async (args) => {
        const p = safePath(args.path);
        if (!existsSync(p)) return `Error: File not found: ${args.path}`;
        const stats = statSync(p);
        if (stats.isDirectory()) return `Error: "${args.path}" is a directory. Use list_dir instead.`;

        let content = readFileSync(p, 'utf-8');
        const lines = content.split('\n');
        const total = lines.length;

        if (args.offset || args.limit) {
          const start = (args.offset || 1) - 1;
          const end = args.limit ? start + args.limit : total;
          content = lines.slice(start, end).join('\n');
          return `[Lines ${start + 1}-${Math.min(end, total)}/${total}]\n${content}`;
        }
        if (total > 200) {
          return `[${total} lines, showing first 200]\n${lines.slice(0, 200).join('\n')}\n... (use offset/limit to read more)`;
        }
        return content;
      },
    },
    {
      name: 'write_file',
      description: 'Write content to a file. Creates directories if needed. Use mode "append" to append.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative file path' },
          content: { type: 'string', description: 'File content' },
          mode: { type: 'string', description: 'Write mode: overwrite or append', enum: ['overwrite', 'append'] },
        },
        required: ['path', 'content'],
      },
      execute: async (args) => {
        const p = safePath(args.path);
        const dir = dirname(p);
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

        if (args.mode === 'append') {
          appendFileSync(p, args.content, 'utf-8');
          return `Appended to "${args.path}" (${args.content.length} chars)`;
        }
        writeFileSync(p, args.content, 'utf-8');
        return `Wrote "${args.path}" (${args.content.length} chars)`;
      },
    },
    {
      name: 'list_dir',
      description: 'List files and directories. Shows file sizes and modification times.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative directory path (default: root)' },
          recursive: { type: 'boolean', description: 'List recursively' },
        },
        required: [],
      },
      execute: async (args) => {
        const p = safePath(args.path || '.');
        if (!existsSync(p)) return `Error: Directory not found: ${args.path || '.'}`;

        function list(dir: string, prefix = '', depth = 0): string {
          if (depth > 3 && args.recursive) return `${prefix}  ... (max depth reached)`;
          const entries = readdirSync(dir, { withFileTypes: true });
          const lines: string[] = [];
          for (const e of entries) {
            if (e.name.startsWith('.') && e.name !== '.gitignore') continue;
            const full = join(dir, e.name);
            const rel = relative(root, full) || '.';
            if (e.isDirectory()) {
              lines.push(`${prefix}📁 ${e.name}/`);
              if (args.recursive) {
                lines.push(list(full, prefix + '  ', depth + 1));
              }
            } else {
              const size = statSync(full).size;
              const sizeStr = size > 1024 * 1024 ? `${(size / 1024 / 1024).toFixed(1)}MB` : size > 1024 ? `${(size / 1024).toFixed(1)}KB` : `${size}B`;
              lines.push(`${prefix}📄 ${e.name} (${sizeStr})`);
            }
          }
          return lines.join('\n');
        }
        return list(p);
      },
    },
    {
      name: 'search_files',
      description: 'Search for text patterns in files. Returns matching file paths with line numbers.',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Search pattern (string or regex)' },
          path: { type: 'string', description: 'Directory to search in (default: root)' },
          filePattern: { type: 'string', description: 'File glob pattern, e.g. "*.ts"' },
        },
        required: ['pattern'],
      },
      execute: async (args) => {
        const p = safePath(args.path || '.');
        const results: string[] = [];
        const regex = new RegExp(args.pattern, 'gi');

        function search(dir: string, depth = 0) {
          if (depth > 5) return;
          const entries = readdirSync(dir, { withFileTypes: true });
          for (const e of entries) {
            if (e.name.startsWith('.') && e.name !== '.gitignore') continue;
            const full = join(dir, e.name);
            if (e.isDirectory()) {
              search(full, depth + 1);
            } else if (e.isFile()) {
              if (args.filePattern && !e.name.match(args.filePattern.replace('*', '.*'))) continue;
              try {
                const content = readFileSync(full, 'utf-8');
                const lines = content.split('\n');
                const matches: string[] = [];
                lines.forEach((line, i) => {
                  if (regex.test(line)) {
                    matches.push(`  L${i + 1}: ${line.trim().substring(0, 100)}`);
                  }
                });
                if (matches.length > 0) {
                  results.push(`📄 ${relative(root, full)} (${matches.length} matches):\n${matches.join('\n')}`);
                }
              } catch {
                // Skip binary files
              }
            }
          }
        }
        search(p);
        return results.length > 0 ? results.join('\n\n') : 'No matches found.';
      },
    },
    {
      name: 'execute_command',
      description: 'Execute a shell command. Returns stdout/stderr. Use with caution.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Shell command to execute' },
          cwd: { type: 'string', description: 'Working directory (relative to workspace)' },
          timeout: { type: 'number', description: 'Timeout in seconds (default: 30)' },
        },
        required: ['command'],
      },
      execute: async (args) => {
        const cwd = args.cwd ? safePath(args.cwd) : root;
        const timeout = (args.timeout || 30) * 1000;
        try {
          const result = execSync(args.command, {
            cwd,
            timeout,
            encoding: 'utf-8',
            maxBuffer: 10 * 1024 * 1024,
          });
          const output = result.trim();
          return output.length > 2000 ? output.substring(0, 2000) + '\n... (truncated)' : output || '(command completed with no output)';
        } catch (err: any) {
          return `Error: ${err.message}\n${err.stderr || ''}`;
        }
      },
    },
    {
      name: 'file_info',
      description: 'Get detailed info about a file or directory.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative file or directory path' },
        },
        required: ['path'],
      },
      execute: async (args) => {
        const p = safePath(args.path);
        if (!existsSync(p)) return `Error: Not found: ${args.path}`;
        const stats = statSync(p);
        const isDir = stats.isDirectory();
        const lines = [
          `📎 ${args.path}`,
          `  Type: ${isDir ? 'Directory' : 'File'}`,
          `  Size: ${stats.size} bytes`,
          `  Created: ${stats.birthtime.toLocaleString()}`,
          `  Modified: ${stats.mtime.toLocaleString()}`,
          `  Mode: ${stats.mode.toString(8)}`,
        ];
        if (!isDir) {
          const ext = args.path.split('.').pop() || '';
          lines.push(`  Extension: ${ext}`);
        }
        return lines.join('\n');
      },
    },
  ];
}

export function createGitTools(workspaceRoot: string = process.cwd()): Tool[] {
  const root = resolve(workspaceRoot);

  return [
    {
      name: 'git_status',
      description: 'Show git status of the workspace.',
      parameters: { type: 'object', properties: {}, required: [] },
      execute: async () => {
        try {
          const result = execSync('git status --short', { cwd: root, encoding: 'utf-8' });
          return result.trim() || 'Working tree clean.';
        } catch {
          return 'Error: Not a git repository.';
        }
      },
    },
    {
      name: 'git_log',
      description: 'Show recent git commit history.',
      parameters: {
        type: 'object',
        properties: {
          count: { type: 'number', description: 'Number of commits (default: 10)' },
        },
        required: [],
      },
      execute: async (args) => {
        try {
          const count = args.count || 10;
          const result = execSync(`git log --oneline -${count}`, { cwd: root, encoding: 'utf-8' });
          return result.trim();
        } catch {
          return 'Error: Not a git repository.';
        }
      },
    },
    {
      name: 'git_diff',
      description: 'Show git diff of current changes.',
      parameters: {
        type: 'object',
        properties: {
          file: { type: 'string', description: 'Specific file to diff' },
        },
        required: [],
      },
      execute: async (args) => {
        try {
          const cmd = args.file ? `git diff -- "${args.file}"` : 'git diff';
          const result = execSync(cmd, { cwd: root, encoding: 'utf-8', maxBuffer: 5 * 1024 * 1024 });
          return result.trim() || 'No changes.';
        } catch {
          return 'Error: Not a git repository or no changes.';
        }
      },
    },
  ];
}

export function getAllTools(workspaceRoot?: string): Tool[] {
  return [...createFileTools(workspaceRoot), ...createGitTools(workspaceRoot)];
}
