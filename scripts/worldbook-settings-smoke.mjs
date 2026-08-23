import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDb } from '../lib/db/index.js'
import * as setting from '../lib/data/setting.js'

openDb(mkdtempSync(join(tmpdir(), 'wb-settings-')))

const first = setting.saveSettings({
  ...setting.defaultSettings(),
  devMode: true,
  devFloating: true,
  devAction: 'edit',
  devBookId: 'book-1',
  devEntryIds: ['entry-1'],
  workspaceMode: 'selected',
  workspaceIds: ['workspace-1'],
})

if (!first.devMode || !first.devFloating || first.devAction !== 'edit' || first.devBookId !== 'book-1') throw new Error('第一次保存未持久化')

const second = setting.saveSettings({ ...first, devFloating: false, devEntryIds: ['entry-2', 'entry-2'] })
if (second.devFloating || second.devEntryIds.join(',') !== 'entry-2') throw new Error('第二次保存未覆盖旧值或未去重')

console.log('worldbook settings persistence: ok')
