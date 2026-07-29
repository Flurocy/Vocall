import { app } from 'electron'
import type { UpdateInfo } from '../shared/ipc-types'

// GitHub 仓库 owner/repo。检查更新访问 https://api.github.com/repos/{OWNER}/{REPO}/releases/latest。
const OWNER = 'Flurocy'
const REPO = 'Vocall'

// 检查 GitHub 最新 release，与本地版本语义化比对。
// 一律 resolve（不抛）——失败返回 error，渲染端据此显示"检查失败/可手动访问 GitHub"。
export async function checkUpdate(): Promise<UpdateInfo> {
  const current = app.getVersion()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15_000)
  try {
    const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`, {
      headers: { 'User-Agent': 'Vocall-Updater' }, // GitHub API 要求 User-Agent
      signal: controller.signal,
    })
    if (res.status === 404) {
      // 仓库还没发任何 release
      return { current, latest: null, hasUpdate: false, releaseUrl: null, error: '尚未发布任何版本' }
    }
    if (!res.ok) {
      return { current, latest: null, hasUpdate: false, releaseUrl: null, error: `GitHub 返回 HTTP ${res.status}` }
    }
    const data = (await res.json()) as { tag_name?: string; html_url?: string }
    const latest = (data.tag_name ?? '').replace(/^v/i, '').trim()
    const releaseUrl = data.html_url ?? `https://github.com/${OWNER}/${REPO}/releases`
    if (!latest) {
      return { current, latest: null, hasUpdate: false, releaseUrl, error: '未解析到版本号' }
    }
    return { current, latest, hasUpdate: compareVersions(latest, current) > 0, releaseUrl }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return { current, latest: null, hasUpdate: false, releaseUrl: null, error: '请求超时（>15s）' }
    }
    return { current, latest: null, hasUpdate: false, releaseUrl: null, error: `检查失败：${err instanceof Error ? err.message : String(err)}` }
  } finally {
    clearTimeout(timer)
  }
}

// 语义化版本比对：a > b → 1，相等 → 0，a < b → -1（按 . 分段比整数）。
function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0)
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const va = pa[i] ?? 0
    const vb = pb[i] ?? 0
    if (va > vb) return 1
    if (va < vb) return -1
  }
  return 0
}
