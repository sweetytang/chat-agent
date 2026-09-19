import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('ChatComposer 采用内联纯文字技能词（无标签外壳，按退格一键整个删除），右下角收纳模型与发送操作', () => {
  const composer = fs.readFileSync(
    new URL('../src/modules/chat/components/ChatComposer/index.tsx', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(composer, /SkillSelector/);
  assert.match(composer, /SkillSlashMenu/);
  assert.match(composer, /skillTextWord/);
  assert.match(composer, /editorFlow/);
  assert.match(composer, /selectedSkillIds/);
  assert.match(composer, /toggleSelectSkill/);
  assert.match(composer, /slashMatch/);
});

test('SkillsDialog 包含技能模式选择与指定当前专精技能功能 (支持多选)', () => {
  const dialog = fs.readFileSync(
    new URL('../src/modules/skills/components/SkillsDialog/index.tsx', import.meta.url),
    'utf8',
  );
  assert.match(dialog, /modeBanner/);
  assert.match(dialog, /clearSelectedSkills/);
  assert.match(dialog, /selectActionBtn/);
  assert.match(dialog, /已指定/);
  assert.match(dialog, /指定此技能/);
});

test('侧边栏与 AppShell 包含技能管理入口与弹窗', () => {
  const sidebar = fs.readFileSync(
    new URL('../src/modules/threads/components/Sidebar/index.tsx', import.meta.url),
    'utf8',
  );
  const shell = fs.readFileSync(
    new URL('../src/app/components/AppShell/index.tsx', import.meta.url),
    'utf8',
  );
  assert.match(sidebar, /setSkillsDialogOpen/);
  assert.match(sidebar, /技能管理/);
  assert.match(shell, /<SkillsDialog \/>/);
});

test('RunStreamRequest 与 RunRequestContext 支持 skill_ids 多选传参', () => {
  const timelineTypes = fs.readFileSync(
    new URL('../src/modules/timeline/types/index.ts', import.meta.url),
    'utf8',
  );
  const runStore = fs.readFileSync(
    new URL('../src/modules/runs/store/run.ts', import.meta.url),
    'utf8',
  );
  const chat = fs.readFileSync(
    new URL('../src/modules/chat/components/Chat/index.tsx', import.meta.url),
    'utf8',
  );
  assert.match(timelineTypes, /skill_ids\?:\s*string\[\];/);
  assert.match(runStore, /skillIds\?:\s*string\[\];/);
  assert.match(chat, /skill_ids:\s*options\.skillIds/);
});
