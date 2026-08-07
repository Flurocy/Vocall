# Vocall

**Windows 上的被动弹窗式背词伴侣** —— 把复习卡悄悄塞进你一天的缝隙里，而不是要求你坐下来专门学习。

<p>
  <img alt="Platform" src="https://img.shields.io/badge/platform-Windows-0078D6">
  <img alt="Electron" src="https://img.shields.io/badge/Electron-40-47848F?logo=electron&logoColor=white">
  <img alt="React" src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white">
  <img alt="Tailwind" src="https://img.shields.io/badge/Tailwind-v4-38BDF8?logo=tailwindcss&logoColor=white">
</p>

[English](./README.md) · [更新记录](./CHANGELOG.md)

---

## 这是什么

Vocall 常驻系统托盘，按你设定的间隔，在屏幕角落轻轻弹出一张词卡——无论你是在打游戏、看视频还是写作业。看一眼单词、翻面、给自己打个分，它就消失了。日积月累，那些零碎的空当就变成了词汇量。

没有"打开软件开始学习"这种仪式。是它来找你。

## 功能

- **弹窗背词** —— 定时弹窗或全局快捷键主动唤出；关窗不退出、常驻托盘，一直在却不碍事。
- **弹窗节拍 SRS** —— 基于"弹窗次数"而非挂钟时间的调度算法。忘了的词更快再见，记牢的词间隔拉长，彻底掌握的词不再出现。
- **5 本内置词书（1580 词）** —— 按话题组织，词根同义族聚类，释义含多义项多词性。
- **读音** —— 有道真人发音，英音/美音可选，弹窗与列表均可朗读。
- **统计** —— 一目了然的数据页：正确率趋势、每日答题量、掌握度分布，手绘 SVG 图表。
- **表达教练** —— 优化英文句子的写作/口语表达，或把中文翻成地道英文，可联动你正在学的词。
- **AI 翻译 / 生成**（可选）—— 让 AI 给生词配释义例句，或按主题生成词组。
- **多供应商模型配置** —— 自备 key；多个供应商、OpenAI 或 Gemini 兼容协议，各自可设"当前使用"。
- **回收站** —— 删词进可还原的回收站，而非直接消失。
- **外观** —— 界面大小/弹窗字体/透明度三滑块独立调节，主题色可切换。
- **易忘词标记** —— 点过"忘了"的词累计计数，列表标红。
- **同词拦截** —— 生词库/回收站已有的词不支持重复导入。

## 安装

1. 从 [Releases](../../releases) 下载 `Vocall-<版本号>-portable.exe`。
2. 双击运行，无需安装。
3. 首次启动会导入少量内置生词；关窗后常驻系统托盘。

> 纯本地运行：无后端、无账号、无数据上报。AI 和发音需联网；AI 功能需自备 API key（可选——不填也能用词书和弹窗背词）。

## 快速上手

1. **加词书** —— 打开管理窗口 → 「词书」 → 选一本 → 勾选加入。
2. **绑快捷键** —— 「设置」 → 设一个全局唤出键，随时主动弹窗背词（默认 Ctrl+Shift+W）。
3. **开始背** —— 弹窗自动来。看词 → 翻面看释义例句 → 点「忘了 / 有点印象 / 记得」评分，剩下的交给调度。

## 数据与更新

| | |
|---|---|
| **数据位置** | `C:\Users\<你的用户名>\AppData\Roaming\Vocall\config.json`——覆盖重装不丢；想迁移把整个 `Vocall` 文件夹拷走即可。 |
| **更新** | 「设置」 → 关于 → 检查更新（从 GitHub Releases 拉最新版）。 |

## 技术栈

| 层 | 技术 |
|---|---|
| 运行时 | Electron 40 |
| 界面 | React 19 + TypeScript + Tailwind v4 |
| 存储 | electron-store（本地 JSON） |
| 构建 | electron-vite |
| 测试 | Vitest |

## 开发

```bash
npm install
npm run dev    # 开发模式，弹出管理窗口
npm run build  # 构建到 out/
npm run dist   # 打包 portable exe 到 dist/
npm test       # vitest
```

---

Vocall 是一个个人学习项目。欢迎反馈与 issue。
