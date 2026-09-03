# Whisp 设计系统 / Design System

> Luminous ink and iris — a restrained, accessible palette for a desktop voice-to-text app.
> All CSS custom properties live in `src/App.css` and follow the space-separated HSL convention:
> `--token: H S% L%;` used as `hsl(var(--token))` or `hsl(var(--token) / alpha)`.

---

## 🎨 色彩体系 / Color Palette

### 主色 / Primary

| Token              | Light                 | Dark                  | Usage                  |
| ------------------ | --------------------- | --------------------- | ---------------------- |
| `--primary`        | `250 64% 57%`         | `248 82% 72%`         | CTA, active states     |
| `--primary-pressed`| `250 58% 50%`         | `248 72% 65%`         | Pressed / active        |
| `--primary-deep`   | `248 48% 40%`         | `250 64% 58%`         | Emphasis, headers      |
| `--on-primary`     | `0 0% 100%` (white)   | `240 25% 10%` (near-black) | Text on primary   |

### 语义色 / Semantic

| Token                     | Light               | Dark                | Usage                |
| ------------------------- | ------------------- | ------------------- | -------------------- |
| `--success`               | `154 48% 37%`       | `154 46% 52%`       | Confirmations        |
| `--warning`               | `35 75% 48%`        | `35 72% 59%`        | Caution states       |
| `--destructive`           | `355 64% 52%`       | `355 62% 63%`       | Errors, delete       |
| `--*-foreground`          | white / dark        | inverted            | Text on semantic bg  |

### 中性色阶 / Neutral Scale

| Token          | Light HSL         | Dark HSL          | Role                        |
| -------------- | ----------------- | ----------------- | --------------------------- |
| `--ink-deep`   | `238 28% 10%`     | `246 30% 97%`     | Headings, strong emphasis   |
| `--ink`        | `238 23% 15%`     | `244 22% 91%`     | Body text                   |
| `--charcoal`   | `237 16% 24%`     | `242 15% 83%`     | Secondary text              |
| `--slate`      | `238 12% 38%`     | `241 11% 68%`     | Tertiary / captions         |
| `--steel`      | `239 10% 48%`     | `240 9% 57%`      | Placeholders                |
| `--stone`      | `240 8% 61%`      | `240 7% 44%`      | Disabled text               |
| `--muted`      | `242 10% 74%`     | `240 9% 33%`      | Muted / subtle              |

### 表面色 / Surfaces

| Token              | Light               | Dark                |
| ------------------ | ------------------- | ------------------- |
| `--canvas`         | `0 0% 100%`         | `239 24% 11%`       |
| `--surface`        | `246 32% 97%`       | `239 22% 14%`       |
| `--surface-soft`   | `248 45% 98.5%`     | `241 24% 12%`       |
| `--card`           | `0 0% 100%`         | `239 24% 11%`       |
| `--hairline`       | `244 24% 89%`       | `240 18% 22%`       |
| `--hairline-soft`  | `246 32% 93%`       | `241 20% 17%`       |
| `--border`         | `244 24% 89%`       | `240 18% 22%`       |

---

## 📝 字体排版 / Typography

### 字体栈 / Font Stack

```css
font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'SF Pro Text',
             'Segoe UI', system-ui, sans-serif;
```

- **Primary**: Inter — excellent legibility at small sizes, tabular numerals.
- **Fallback**: SF Pro Text (macOS), Segoe UI (Windows), system-ui.
- **Features**: `cv02 cv03 cv04 cv11` (alternate glyphs for a, g, l).

### 字号比例 / Size Scale (base 14px)

| Token        | Size   | Usage                        |
| ------------ | ------ | ---------------------------- |
| `--text-xs`  | 11px   | Timestamps, badges           |
| `--text-sm`  | 12px   | Captions, metadata           |
| `--text-base`| 14px   | Body (default)               |
| `--text-md`  | 15px   | Emphasized body              |
| `--text-lg`  | 16px   | Section titles               |
| `--text-xl`  | 18px   | Panel headers                |
| `--text-2xl` | 22px   | Dialog titles                |
| `--text-3xl` | 28px   | Hero / empty-state headings  |

### 字重比例 / Weight Scale

| Weight | Value | Usage                  |
| ------ | ----- | ---------------------- |
| Normal | 400   | Body text              |
| Medium | 500   | Labels, buttons        |
| Semi   | 600   | Headings, emphasis     |
| Bold   | 700   | Page titles            |

### 行高与字距 / Line Height & Letter Spacing

- Body: `line-height: 1.50; letter-spacing: -0.011em;`
- Headings: `line-height: 1.25; letter-spacing: -0.02em;`
- Small text: `line-height: 1.4; letter-spacing: 0;`

---

## 📏 间距比例 / Spacing Scale

Base unit: **4px**. Use multiples for consistent rhythm.

| Token         | Value  | Typical Use                         |
| ------------- | ------ | ----------------------------------- |
| `--space-0`   | 0px    | Zero reset                          |
| `--space-1`   | 4px    | Inline icon gap, tight padding      |
| `--space-2`   | 8px    | Compact list items, badge padding   |
| `--space-3`   | 12px   | Small card padding, input padding   |
| `--space-4`   | 16px   | Standard card padding, form gaps    |
| `--space-5`   | 20px   | Section inner padding               |
| `--space-6`   | 24px   | Panel padding, dialog body          |
| `--space-8`   | 32px   | Section gaps, large component gaps  |
| `--space-10`  | 40px   | Major section dividers              |
| `--space-12`  | 48px   | Page-level vertical rhythm          |
| `--space-16`  | 64px   | Hero sections, large empty states   |

---

## 🔲 圆角比例 / Border Radius Scale

| Token           | Value   | Usage                              |
| --------------- | ------- | ---------------------------------- |
| `--radius-xs`   | 4px     | Badges, tags, small chips          |
| `--radius-sm`   | 6px     | Buttons, inputs, skeleton blocks   |
| `--radius-md`   | 8px     | Cards, dropdowns (default)         |
| `--radius-lg`   | 12px    | Modals, large cards                |
| `--radius-xl`   | 16px    | Panels, sidebars                   |
| `--radius-2xl`  | 20px    | Feature cards, hero sections       |
| `--radius-full` | 9999px  | Avatars, circular buttons          |

Legacy alias: `--radius: 0.5rem;` (8px) — prefer `--radius-md`.

---

## 🌑 阴影层级 / Shadow Elevation Scale

Light mode uses `hsl(var(--ink-deep) / alpha)` for shadows that adapt to the neutral tone.
Dark mode uses `hsl(0 0% 0% / alpha)` with higher opacity for visibility on dark surfaces.

| Token         | Light Elevation                                    | Dark Elevation                                     |
| ------------- | -------------------------------------------------- | -------------------------------------------------- |
| `--shadow-xs` | Subtle lift for tags, badges                       | Same structure, higher opacity (0.15)              |
| `--shadow-sm` | Cards at rest, dropdown menus                      | 0.2 + 0.15 layered                                 |
| `--shadow-md` | Floating panels, popovers                          | 0.2 + 0.15 layered                                 |
| `--shadow-lg` | Modals, dialogs                                    | 0.25 + 0.15 layered                                |
| `--shadow-xl` | Command palette, full-screen overlays              | 0.3 + 0.15 layered                                 |

**Usage pattern:**
```css
.my-card {
  box-shadow: var(--shadow-sm);
  transition: box-shadow 150ms ease;
}
.my-card:hover {
  box-shadow: var(--shadow-md);
}
```

---

## 🧩 组件模式 / Component Patterns

### Card 卡片

```css
.card {
  background: hsl(var(--card));
  color: hsl(var(--card-foreground));
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius-md);
  padding: var(--space-4);
  box-shadow: var(--shadow-xs);
  transition: box-shadow 150ms ease, border-color 150ms ease;
}
.card:hover {
  box-shadow: var(--shadow-sm);
  border-color: hsl(var(--hairline-strong));
}
```

### Button 按钮

```css
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  height: 36px;
  padding: 0 var(--space-4);
  font-size: 14px;
  font-weight: 500;
  border-radius: var(--radius-sm);
  border: none;
  cursor: pointer;
  transition: background 150ms ease, box-shadow 150ms ease, transform 100ms ease;
}
.btn:active { transform: scale(0.97); }

.btn-primary {
  background: hsl(var(--primary));
  color: hsl(var(--on-primary));
}
.btn-primary:hover { background: hsl(var(--primary-pressed)); }

.btn-secondary {
  background: hsl(var(--secondary));
  color: hsl(var(--secondary-foreground));
  border: 1px solid hsl(var(--border));
}

.btn-ghost {
  background: transparent;
  color: hsl(var(--ink));
}
.btn-ghost:hover { background: hsl(var(--accent)); }

.btn-destructive {
  background: hsl(var(--destructive));
  color: hsl(var(--destructive-foreground));
}
```

### Input 输入框

```css
.input {
  height: 36px;
  padding: 0 var(--space-3);
  font-size: 14px;
  background: hsl(var(--canvas));
  color: hsl(var(--ink));
  border: 1px solid hsl(var(--hairline-strong));
  border-radius: var(--radius-sm);
  outline: none;
  transition: border-color 150ms ease, box-shadow 150ms ease;
}
.input:focus {
  border-color: hsl(var(--primary));
  box-shadow: 0 0 0 2px hsl(var(--primary) / 0.12);
}
.input::placeholder {
  color: hsl(var(--steel));
}
```

### Badge 标签

```css
.badge {
  display: inline-flex;
  align-items: center;
  height: 20px;
  padding: 0 var(--space-2);
  font-size: 11px;
  font-weight: 500;
  border-radius: var(--radius-xs);
  background: hsl(var(--accent));
  color: hsl(var(--accent-foreground));
}
.badge-success { background: hsl(var(--success) / 0.12); color: hsl(var(--success)); }
.badge-warning { background: hsl(var(--warning) / 0.12); color: hsl(var(--warning)); }
.badge-destructive { background: hsl(var(--destructive) / 0.12); color: hsl(var(--destructive)); }
```

### Switch 开关

```css
.switch {
  position: relative;
  width: 36px;
  height: 20px;
  background: hsl(var(--muted));
  border-radius: var(--radius-full);
  cursor: pointer;
  transition: background 200ms ease;
}
.switch[data-state="checked"] {
  background: hsl(var(--primary));
}
.switch::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  background: white;
  border-radius: var(--radius-full);
  transition: transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1);
}
.switch[data-state="checked"]::after {
  transform: translateX(16px);
}
```

---

## ✨ 动效指南 / Motion Guidelines

### 时长 / Duration

| Type              | Duration  | Easing                          | Use Case                        |
| ----------------- | --------- | ------------------------------- | ------------------------------- |
| Micro-interaction | 100-150ms | `ease` or `ease-out`            | Hover, press, focus             |
| State transition  | 200ms     | `ease`                          | Toggle, expand/collapse         |
| Enter / exit      | 250-300ms | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Toast, modal, popover    |
| Skeleton shimmer  | 1500ms    | `ease-in-out`                   | Loading placeholders            |

### 缓动函数 / Easing

```css
/* Standard */
--ease-out: cubic-bezier(0.16, 1, 0.3, 1);
/* Spring-like overshoot for playful enters */
--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
/* Snappy for micro-interactions */
--ease-snappy: cubic-bezier(0.2, 0, 0, 1);
```

### 无障碍动效 / Reduced Motion

Respect `prefers-reduced-motion: reduce` — already handled globally in `App.css`:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

**Rule**: Any custom animation MUST still function when durations are collapsed to near-zero. Use `opacity` and `transform` only — avoid animating `width`, `height`, `margin`, or `color` directly.

---

## ♿ 无障碍 / Accessibility

### 对比度 / Contrast Ratios (WCAG AA)

| Pair                          | Required Ratio | Notes                            |
| ----------------------------- | -------------- | -------------------------------- |
| Body text on canvas           | ≥ 4.5:1        | `--ink` on `--canvas`            |
| Large text (≥18px bold)       | ≥ 3:1          | Headings on canvas               |
| Interactive elements          | ≥ 3:1          | Icons, borders against surface   |
| Focus indicator               | ≥ 3:1          | Ring against adjacent colors     |

### 焦点指示器 / Focus Indicators

All interactive elements MUST have a visible focus ring:

```css
:focus-visible {
  outline: 2px solid hsl(var(--ring));
  outline-offset: 2px;
}
```

- Use `:focus-visible` (not `:focus`) to show rings only for keyboard navigation.
- The ring color (`--ring`) matches `--primary` and adapts in dark mode.
- Minimum 2px outline with 2px offset for visibility against any background.

### ARIA 标注 / ARIA Patterns

| Pattern              | Required Attributes                                      |
| -------------------- | -------------------------------------------------------- |
| Record button        | `aria-label`, `aria-pressed`, `aria-describedby`         |
| Transcript list      | `role="log"`, `aria-live="polite"`, `aria-relevant="additions"` |
| Status indicators    | `role="status"`, `aria-live="polite"`                    |
| Error messages       | `role="alert"`, `aria-live="assertive"`                  |
| Modal dialogs        | `role="dialog"`, `aria-modal="true"`, `aria-labelledby`  |
| Icon-only buttons    | `aria-label` (mandatory)                                 |
| Sidebar navigation   | `role="navigation"`, `aria-label`                        |
| Tabs                 | `role="tablist"`, `role="tab"`, `aria-selected`          |

### 键盘导航 / Keyboard Navigation

| Key         | Action                                    |
| ----------- | ----------------------------------------- |
| `Tab`       | Move focus forward through interactive elements |
| `Shift+Tab` | Move focus backward                       |
| `Enter/Space` | Activate button / toggle               |
| `Escape`    | Close modal, cancel recording             |
| `Arrow keys`| Navigate within lists, tabs               |
| `Cmd/Ctrl+K`| Open command palette (if applicable)      |

---

## 🗂 图表色 / Chart Colors

Eight-step palette for data visualization:

| Token        | Light               | Dark                |
| ------------ | ------------------- | ------------------- |
| `--chart-1`  | `250 64% 57%`       | `248 82% 72%`       |
| `--chart-2`  | `267 60% 60%`       | `270 76% 72%`       |
| `--chart-3`  | `232 70% 58%`       | `228 82% 70%`       |
| `--chart-4`  | `216 72% 55%`       | `211 78% 65%`       |
| `--chart-5`  | `282 54% 61%`       | `288 64% 72%`       |
| `--chart-6`  | `198 66% 46%`       | `193 68% 58%`       |
| `--chart-7`  | `244 42% 69%`       | `246 48% 57%`       |
| `--chart-8`  | `218 46% 72%`       | `222 46% 55%`       |

---

## 🎯 设计原则 / Design Principles

1. **Restrained colour** — hierarchy through weight and spacing, not colour explosion.
2. **Desktop-native** — no mobile-first compromises. Optimize for mouse, keyboard, and retina displays.
3. **Accessible by default** — WCAG AA minimum; test with screen readers and keyboard-only navigation.
4. **Performance** — no heavy shadows or blur effects on recording overlay or audio visualizer.
5. **Consistency** — every spacing, radius, and shadow value MUST come from the scale tokens. No magic numbers.

---

*Last updated: 2026-09-03*
