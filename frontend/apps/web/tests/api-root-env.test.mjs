import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectDir = path.resolve(__dirname, '..');

test('Vite 在 development 模式下正确加载 OPEN_AGENT_API_ROOT 配置', () => {
    const env = loadEnv('development', projectDir, ['VITE_', 'OPEN_AGENT_']);
    assert.equal(env.OPEN_AGENT_API_ROOT, 'http://127.0.0.1:10000/api');
});
