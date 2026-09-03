# Whisp UI 改造计划 / UI Renovation Plan

> 基于 ui-ux-pro-max-skill 设计智能库分析
> 约束：录音胶囊浮窗（`src/overlay/`）不做任何变更
> 版本策略：以 0.0.1 递增（v2.14.3 → v2.15.0 → v2.16.0 → ...）

---

## 📊 现状评估

### 技术栈
| 层级 | 技术 | 版本 |
|------|------|------|
| 框架 | Tauri v2 + React | 18.3 |
| 样式 | Tailwind CSS | v4.1 |
| 动画 | Framer Motion | 13.x |
| 图标 | Lucide React | 1.28 |
| UI 组件 | shadcn/ui 风格 | 自建 |
| 字体 | Inter + 系统字体栈 | — |

### 当前设计系统
- **色彩**：「Luminous ink and iris」—— 紫蓝色主色调 (HSL 250)
- **排版**：Inter 字体，14px 基准，8 级字号
- **间距**：4px 基础单位，12 级间距
- **圆角**：7 级圆角（4px → 9999px）
- **阴影**：5 级阴影层级
- **暗色模式**：完整支持（prefers-color-scheme + data-theme）

### 已有优势 ✅
- 设计系统完整，CSS 变量体系规范
- 暗色/亮色双主题完善
- 无障碍基础好（focus-visible、ARIA、reduced-motion）
- 组件化程度高（shadcn 风格）
- 国际化完善（4 语言）

### 需要改进的区域 ⚠️
1. **HistoryPage**（873 行）—— 主页面，信息密度与视觉层次可优化
2. **StatsPage**（567 行）—— 数据可视化纯 CSS 实现，缺少交互
3. **Settings 页面**（5 个子页面）—— 表单 UX 可提升
4. **OnboardingPage**（308 行）—— 引导流程体验
5. **Sidebar**（105 行）—— 导航交互与视觉
6. **FloatingRecordButton**（40 行）—— 主窗口浮动按钮
7. **全局动效** —— Framer Motion 使用可更精细
8. **组件库** —— 部分组件缺少状态反馈

---

## 🗓 版本路线图

### v2.15.0 — 设计系统强化 + Sidebar 重构
**目标**：奠定后续改造的视觉基础

#### 1.1 Sidebar 现代化
**文件**：`src/components/Sidebar.tsx`

**当前问题**：
- 固定 200px 宽度，无折叠态
- 导航项仅有 3 个（History/Stats/Settings），空间利用率低
- 版本号和更新按钮挤在底部

**改造方案**：
- [ ] 添加 Sidebar 折叠/展开切换（图标-only 模式）
- [ ] 导航项添加微动画（active 状态的滑块指示器）
- [ ] 底部区域重新组织：深色模式切换 + 版本号合并为一行
- [ ] 添加 `cursor: pointer` 到所有可点击元素
- [ ] 折叠态宽度 64px，展开态 220px（增加 20px 提升可读性）

**参考**：ui-ux-pro-max 推荐的 Minimalism & Swiss Style —— 功能性导航，减少视觉噪音

#### 1.2 设计 Token 补全
**文件**：`src/App.css`、`DESIGN.md`

- [ ] 添加 `--transition-fast: 150ms ease`、`--transition-normal: 200ms ease`、`--transition-slow: 300ms ease` 统一动效时长
- [ ] 添加 `--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1)` 缓动函数 token
- [ ] 补充 `--text-4xl: 36px` 用于空状态大标题
- [ ] 更新 DESIGN.md 文档

#### 1.3 空状态设计
**文件**：所有页面的空状态

- [ ] HistoryPage 空状态：大标题 + 插图 + 快捷录音按钮
- [ ] StatsPage 空状态：引导用户先录音
- [ ] 统一空状态组件 `<EmptyState icon title description action />`

**预计版本**：v2.15.0
**预计工时**：3-5 天

---

### v2.16.0 — HistoryPage 重构
**目标**：提升主页面的信息密度、搜索体验和操作效率

**文件**：`src/pages/HistoryPage.tsx`（873 行 → 拆分组件）

#### 2.1 页面拆分
将 HistoryPage 拆分为子组件：
```
src/pages/history/
├── HistoryPage.tsx          # 主容器 + 布局
├── HistoryToolbar.tsx       # 搜索栏 + 筛选 + 批量操作
├── HistoryList.tsx          # 时间分组列表
├── HistoryCard.tsx          # 单条记录卡片
├── HistoryEmpty.tsx         # 空状态
└── HistoryDetail.tsx        # 展开详情（转写文本 + 音频播放）
```

#### 2.2 搜索体验优化
- [ ] 搜索框添加键盘快捷键提示（`Cmd+K` 或 `/`）
- [ ] 搜索时实时高亮匹配文本
- [ ] 搜索无结果时显示友好提示
- [ ] 搜索框添加清除按钮（已有的 `X` 图标优化位置）

#### 2.3 记录卡片重设计
**当前**：简单列表项，展开后显示全文
**改造**：
- [ ] 卡片添加悬停阴影提升（`--shadow-xs` → `--shadow-sm`）
- [ ] 时间戳使用相对时间（"2 分钟前"），悬停显示绝对时间
- [ ] 操作按钮（复制/删除/重试）默认隐藏，悬停显示
- [ ] 成功/失败状态使用更醒目的 Badge
- [ ] 添加音频时长显示（已有 `formatDuration`）
- [ ] AI 润色标记使用品牌色 Badge

#### 2.4 批量操作优化
- [ ] 选中状态添加计数显示（"已选 3 条"）
- [ ] 批量操作栏固定在底部（sticky）
- [ ] 添加「全选本组」快捷操作

#### 2.5 虚拟列表（性能）
- [ ] 当记录超过 100 条时启用虚拟滚动
- [ ] 使用 `react-window` 或原生 Intersection Observer
- [ ] 时间分组标题保持 sticky

**参考**：ui-ux-pro-max React 栈 —— "Virtualize long lists"（High severity）

**预计版本**：v2.16.0
**预计工时**：5-7 天

---

### v2.17.0 — StatsPage 数据可视化升级
**目标**：让统计数据更直观、更有洞察力

**文件**：`src/pages/StatsPage.tsx`（567 行）

#### 3.1 统计卡片增强
- [ ] 每个 StatCard 添加趋势指示（↑↓ + 百分比）
- [ ] 添加迷你折线图（sparkline）显示 7 天趋势
- [ ] 卡片悬停时显示详细 tooltip

#### 3.2 每日使用量图表
**当前**：纯 CSS 柱状图
**改造**：
- [ ] 使用 SVG 实现交互式柱状图
- [ ] 悬停显示具体数值和日期
- [ ] 添加动画入场效果（柱状图从底部生长）
- [ ] 空日期显示为淡灰色占位

#### 3.3 模型使用分布
- [ ] 饼图/环形图显示模型使用占比
- [ ] 悬停显示具体次数和百分比
- [ ] 使用 chart-1 到 chart-5 的设计 token 色

#### 3.4 新增统计维度
- [ ] 平均录音时长
- [ ] 每周使用趋势（折线图）
- [ ] 费用趋势（按日/周聚合）
- [ ] 最常用语言分布

#### 3.5 导出功能
- [ ] 添加「导出统计」按钮（CSV/JSON）
- [ ] 添加「分享统计」截图功能

**参考**：ui-ux-pro-max Analytics Dashboard 产品类型 —— "Drill-Down Analytics + Comparative"

**预计版本**：v2.17.0
**预计工时**：4-6 天

---

### v2.18.0 — Settings 页面 UX 提升
**目标**：让设置更易用、更智能

**文件**：`src/pages/Settings*.tsx`（5 个子页面）

#### 4.1 Settings 导航改进
- [ ] Tab 栏添加滑动指示器（与 Sidebar 同风格）
- [ ] Tab 切换添加过渡动画
- [ ] 当前 Tab 图标使用品牌色

#### 4.2 SettingsApiPage 改进
- [ ] API Key 输入框添加「显示/隐藏」切换
- [ ] 端点预设改为卡片式选择（而非下拉）
- [ ] 添加「测试连接」按钮的状态反馈动画
- [ ] 模型选择添加搜索过滤

#### 4.3 SettingsRecordingPage 改进
- [ ] 快捷键录制使用可视化键盘展示
- [ ] 麦克风选择添加音量指示器
- [ ] 静音检测阈值使用滑块 + 实时预览

#### 4.4 SettingsBehaviorPage 改进
- [ ] 开关控件添加状态过渡动画
- [ ] 相关设置分组（基础行为 / 高级行为）
- [ ] 添加「重置为默认」按钮

#### 4.5 SettingsPolishPage 改进
- [ ] AI 润色提示词编辑器添加语法高亮
- [ ] 变量插入使用 chip 标签（而非纯文本）
- [ ] 添加预览功能（输入示例文本 → 查看润色效果）

#### 4.6 SettingsModelsPage 改进
- [ ] 模型列表改为卡片网格布局
- [ ] 每个模型卡片显示：名称、提供商、描述、状态
- [ ] 添加模型搜索和筛选

**参考**：ui-ux-pro-max Form UX —— "Inline validation" + "Error clarity" + "Focus management"

**预计版本**：v2.18.0
**预计工时**：5-7 天

---

### v2.19.0 — Onboarding + 全局动效升级
**目标**：提升首次体验和整体动效品质

#### 5.1 OnboardingPage 改进
**文件**：`src/pages/OnboardingPage.tsx`

- [ ] 步骤指示器改为进度条 + 步骤圆点
- [ ] 添加步骤完成的庆祝动画（checkmark 弹入）
- [ ] 每步添加「跳过」按钮（ui-ux-pro-max: "Users should be able to skip tutorials"）
- [ ] API Key 步骤添加「一键粘贴」快捷操作
- [ ] 最后一步添加「开始录音」CTA

#### 5.2 全局动效统一
**文件**：`src/lib/constants.ts`（viewVariants）、各页面

- [ ] 页面切换使用统一切换变体（已有的 spring 动画优化）
- [ ] 列表项添加 stagger 入场动画（Framer Motion `staggerChildren`）
- [ ] Toast 通知添加弹性进入效果
- [ ] Modal/Dialog 添加背景模糊 + 缩放入场
- [ ] 所有动画检查 `prefers-reduced-motion` 兼容性

#### 5.3 微交互增强
- [ ] 按钮点击添加 scale(0.97) 反馈（部分已有，统一化）
- [ ] 复制成功添加 checkmark 动画（200ms → 自动消失）
- [ ] 删除操作添加滑出动画
- [ ] 加载状态使用统一的 skeleton shimmer

**参考**：ui-ux-pro-max Animation UX —— "Cancellable State Transitions" + "Reduced Motion"

**预计版本**：v2.19.0
**预计工时**：4-5 天

---

### v2.20.0 — 组件库完善 + 无障碍审计
**目标**：组件专业化，无障碍达标 WCAG AA

#### 6.1 组件库增强
**新增组件**：
- [ ] `<CommandPalette />` —— 全局命令面板（Cmd+K）
- [ ] `<EmptyState />` —— 统一空状态
- [ ] `<ConfirmDialog />` —— 确认对话框（删除等危险操作）
- [ ] `<ProgressRing />` —— 环形进度指示器
- [ ] `<AnimatedNumber />` —— 数字滚动动画

**现有组件优化**：
- [ ] `Button` —— 添加 loading 态（spinner + disabled）
- [ ] `Input` —— 添加 error 态（红色边框 + 错误信息）
- [ ] `Card` —— 添加 interactive 态（cursor-pointer + hover 效果）
- [ ] `Badge` —— 添加 dot 变体（小圆点状态指示）
- [ ] `Switch` —— 添加 disabled 态样式

#### 6.2 无障碍审计
- [ ] 所有交互元素添加 `cursor: pointer`
- [ ] 检查所有颜色对比度 ≥ 4.5:1
- [ ] 确保 Tab 顺序与视觉顺序一致
- [ ] 所有图标按钮添加 `aria-label`
- [ ] 表单字段添加 `aria-describedby` 错误关联
- [ ] 测试 VoiceOver 完整导航流程
- [ ] 测试纯键盘操作流程

#### 6.3 响应式优化
- [ ] 窄窗口（< 640px）Sidebar 自动折叠
- [ ] Settings 页面窄窗口 tab 改为下拉选择
- [ ] HistoryPage 卡片窄窗口操作菜单改为「更多」按钮

**参考**：ui-ux-pro-max Accessibility —— "Keyboard Navigation" + "Focus Not Obscured"

**预计版本**：v2.20.0
**预计工时**：5-7 天

---

### v2.21.0 — 暗色模式精调 + 品牌升级
**目标**：暗色模式体验专业化，品牌视觉统一

#### 7.1 暗色模式精调
- [ ] 暗色模式下阴影使用更高不透明度（已有，验证一致性）
- [ ] 暗色模式下卡片边框可见性检查
- [ ] 暗色模式下图表颜色对比度验证
- [ ] 暗色模式下 skeleton shimmer 适配
- [ ] 暗色模式下 toast 通知可见性

#### 7.2 品牌视觉统一
- [ ] BrandMark 添加微动画（音频波形脉动）
- [ ] 应用图标与内图标风格统一
- [ ] 关于页面品牌展示增强
- [ ] 启动画面优化（如有）

#### 7.3 情感化设计
- [ ] 录音成功后的成功反馈（绿色 flash + checkmark）
- [ ] 首次使用里程碑庆祝（第 10 次录音、第 1 小时录音）
- [ ] 错误状态的友好插图（而非纯文字）

**预计版本**：v2.21.0
**预计工时**：3-4 天

---

## 🔧 技术债务清理（穿插进行）

| 项目 | 说明 | 优先级 |
|------|------|--------|
| HistoryPage 拆分 | 873 行单文件 → 6 个子组件 | 🔴 高 |
| StatsPage 拆分 | 567 行单文件 → 4 个子组件 | 🟡 中 |
| CSS 重复清理 | `App.css` 中 `focus-visible` 重复定义 | 🟢 低 |
| 类型安全 | 部分 `as Record<string, string>` 强转清理 | 🟢 低 |
| 虚拟列表 | 大量记录时性能优化 | 🟡 中 |

---

## 📐 设计原则（不变）

1. **克制用色** —— 层次通过字重和间距建立，非色彩堆砌
2. **桌面原生** —— 不做移动端妥协，优化鼠标/键盘/Retina
3. **默认无障碍** —— WCAG AA 最低标准
4. **性能优先** —— 浮窗和音频可视化不做重效果
5. **Token 驱动** —— 所有间距/圆角/阴影必须来自 scale token

---

## 🚫 不动区域

| 区域 | 文件 | 原因 |
|------|------|------|
| 录音胶囊浮窗 | `src/overlay/*` | 用户明确要求保持现状 |
| Rust 后端 | `src-tauri/*` | 不在本次 UI 改造范围 |
| i18n 内容 | `src/i18n/*` | 仅在新增 UI 文案时补充 |

---

## 📋 依赖管理

### 可能新增的依赖
| 包 | 用途 | 引入版本 |
|----|------|----------|
| `react-window` | 虚拟列表 | v2.16.0 |
| `@phosphor-icons/react` | 图标库补充（可选） | 评估中 |

### 不引入的依赖
- 不引入完整图表库（如 Chart.js/Recharts）—— 使用 SVG 自建轻量图表
- 不引入状态管理库（如 Zustand）—— 当前 useState 已够用
- 不引入 UI 框架（如 Mantine）—— 保持 shadcn 风格自建

---

*Created: 2026-09-04*
*Based on: ui-ux-pro-max-skill design intelligence*
*Total estimated effort: 29-41 天（约 6-8 个版本周期）*
