// 发音播放工具：调主进程代理（有道 dictvoice）拿 base64 data URL → new Audio 播放。
// 后端读 audio_accent 设置决定英/美音，渲染端只管播。
// 失败（断网、生僻词无录音、解码失败、自动播放限制）一律静默吞，
// 不弹错、不阻断 UI——发音是锦上添花，断网不该打扰用户。
// 不自动发音：仅用户主动点击 🔊 时调用（被动不打扰理念）。
export async function playWord(word: string): Promise<void> {
  try {
    const dataUrl = await window.tasymize.pronounce(word)
    const audio = new Audio(dataUrl)
    await audio.play().catch(() => {})
  } catch {
    /* 发音失败静默：断网/无录音/解码失败均不打扰 */
  }
}
