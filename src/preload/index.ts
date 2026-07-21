import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('tasymize', {
  // IPC 接口在后续任务中逐步挂载
})
