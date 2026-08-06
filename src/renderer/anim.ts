import gsap from 'gsap'

// GSAP 动画统一出口：所有 GSAP 用法经这里，集中处理两件事——
// ① prefers-reduced-motion：系统开"减少动态效果"的用户跳过动画直接到终态
// ② 测试环境（node 无 matchMedia）安全降级为"播放动画"（gsap 在 node 下对不存在元素静默无害）

// 检测用户是否开了系统级"减少动态效果"（Windows：设置→辅助功能→视觉效果→动画效果 关）。
// 无 matchMedia（node 测试环境）→ false（照常播放；gsap 对未挂载元素本就静默）。
function prefersReducedMotion(): boolean {
  try {
    return typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

// 弹窗入场：GSAP 弹性回弹（back.out 带过冲，CSS 贝塞尔做不出的"弹簧感"）。
// fromTo 写法保证 reduced-motion 时 gsap.set 也能落到正确终态（元素最终总是全显复位）。
// 返回动画实例（调用方一般忽略；重复触发时 gsap 自动覆盖同属性旧 tween，无堆积）。
export function popupEnter(el: Element | null): gsap.core.Tween | null {
  if (!el) return null
  if (prefersReducedMotion()) {
    gsap.set(el, { clearProps: 'transform,opacity' })
    return null
  }
  return gsap.fromTo(el,
    { opacity: 0, y: 12, scale: 0.94 },
    { opacity: 1, y: 0, scale: 1, duration: 0.38, ease: 'back.out(1.5)', clearProps: 'transform' },
  )
}

// 列表依次浮现（stagger）：新词加载/批量操作后整列柔和入场。
// targets 传稳定类名选中的元素数组；reduced-motion 时不动（元素本就可见）。
export function staggerIn(targets: Element[] | NodeListOf<Element>): gsap.core.Tween | null {
  if (prefersReducedMotion() || targets.length === 0) return null
  return gsap.fromTo(targets,
    { opacity: 0, y: 8 },
    { opacity: 1, y: 0, duration: 0.3, ease: 'power1.out', stagger: 0.03, clearProps: 'transform' },
  )
}

export { gsap }
