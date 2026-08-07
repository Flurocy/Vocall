// Vite 资源内联导入类型声明：import xxx from './x.svg?raw' 把文件内容作为字符串注入。
// 用于品牌 logo SVG 内联（ProviderBrandIcon），构建期解析、离线可用。
declare module '*.svg?raw' {
  const content: string
  export default content
}
