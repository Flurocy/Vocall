import { describe, it, expect, beforeEach } from 'vitest'
import { _resetStoreForTests, settingsBox } from '../src/main/store'
import { DEFAULT_SETTINGS, migrateReviewSteps } from '../src/main/settings'

const OLD_DEFAULT = '80,240,560,1200,2400'
const NEW_DEFAULT = '50,150,350,750,1500'

describe('migrateReviewSteps（review_steps_pops 旧默认 → 新默认，幂等）', () => {
  beforeEach(() => _resetStoreForTests())

  it('DEFAULT_SETTINGS.review_steps_pops 已是新默认', () => {
    expect(DEFAULT_SETTINGS.review_steps_pops).toBe(NEW_DEFAULT)
    expect(DEFAULT_SETTINGS.review_steps_pops).not.toBe(OLD_DEFAULT)
  })

  it('旧默认 → 新默认', () => {
    settingsBox.set({ ...settingsBox.get(), review_steps_pops: OLD_DEFAULT })
    migrateReviewSteps()
    expect(settingsBox.get().review_steps_pops).toBe(NEW_DEFAULT)
  })

  it('已是新默认：不动', () => {
    settingsBox.set({ ...settingsBox.get(), review_steps_pops: NEW_DEFAULT })
    migrateReviewSteps()
    expect(settingsBox.get().review_steps_pops).toBe(NEW_DEFAULT)
  })

  it('用户自定义值（如 1,2,3）：不动', () => {
    settingsBox.set({ ...settingsBox.get(), review_steps_pops: '1,2,3' })
    migrateReviewSteps()
    expect(settingsBox.get().review_steps_pops).toBe('1,2,3')
  })

  it('键缺失（undefined）：设新默认', () => {
    // settings 默认 {} 空对象，键缺失
    migrateReviewSteps()
    expect(settingsBox.get().review_steps_pops).toBe(NEW_DEFAULT)
  })
})
