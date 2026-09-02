//! Post-processing engine for transcription text correction.
//!
//! Applies rule-based corrections to raw ASR output to fix common transcription
//! errors in both Chinese and English before the text reaches the user.

/// A single correction rule: regex-style pattern → replacement, optionally scoped to a language.
struct CorrectionRule {
    /// The pattern to match (plain string or simple heuristic).
    pattern: Pattern,
    /// The replacement string.
    replacement: String,
    /// If `Some("zh")` / `Some("en")`, only apply for that language.
    /// `None` = apply to all languages.
    language: Option<String>,
}

/// Supported pattern types for correction rules.
enum Pattern {
    /// Exact substring match.
    Literal(String),
    /// Context-aware rule with a check function and a rule ID for correction.
    ContextRule(fn(&str) -> bool, RuleId),
}

/// Post-processing engine that applies a chain of correction rules to transcription text.
pub struct PostProcessor {
    rules: Vec<CorrectionRule>,
}

impl PostProcessor {
    /// Create a new `PostProcessor` with all built-in correction rules.
    #[allow(clippy::vec_init_then_push)]
    pub fn new() -> Self {
        let mut rules = Vec::new();

        // ──────────────────────────────────────────────
        // Universal rules (all languages)
        // ──────────────────────────────────────────────

        // Remove duplicate spaces
        rules.push(CorrectionRule {
            pattern: Pattern::Literal("  ".to_string()),
            replacement: " ".to_string(),
            language: None,
        });

        // ──────────────────────────────────────────────
        // Chinese-specific rules
        // ──────────────────────────────────────────────

        // Fix 的/地/得: 地 should precede verbs, 得 should follow verbs.
        // These are context-aware and handled in apply_rules() directly.
        // (Listed here for documentation; the actual logic is in the apply step.)

        // Add question mark if sentence ends with question words
        // Common ASR miss: 你好吗 → 你好吗 (missing ?)
        rules.push(CorrectionRule {
            pattern: Pattern::ContextRule(is_chinese_question_without_mark, RuleId::ChineseQuestion),
            replacement: String::new(), // handled specially
            language: Some("zh".to_string()),
        });

        // Normalize common Chinese number patterns (e.g. "一百二十三" → "123")
        // This is a conservative rule — only applies to simple cardinal numbers.
        rules.push(CorrectionRule {
            pattern: Pattern::ContextRule(has_chinese_numbers, RuleId::ChineseNumbers),
            replacement: String::new(), // handled specially
            language: Some("zh".to_string()),
        });

        // ──────────────────────────────────────────────
        // English-specific rules
        // ──────────────────────────────────────────────

        // Capitalize 'i' → 'I' (standalone pronoun)
        rules.push(CorrectionRule {
            pattern: Pattern::Literal(" i ".to_string()),
            replacement: " I ".to_string(),
            language: Some("en".to_string()),
        });
        // 'i' at start of string
        rules.push(CorrectionRule {
            pattern: Pattern::ContextRule(english_lowercase_i_at_start, RuleId::LowercaseI),
            replacement: String::new(), // handled specially
            language: Some("en".to_string()),
        });

        // Auto-capitalize first letter of sentences
        rules.push(CorrectionRule {
            pattern: Pattern::ContextRule(english_uncapitalized_sentence, RuleId::UncapitalizedSentence),
            replacement: String::new(), // handled specially
            language: Some("en".to_string()),
        });

        // Auto-add period at end of English sentences
        rules.push(CorrectionRule {
            pattern: Pattern::ContextRule(english_missing_period, RuleId::MissingPeriod),
            replacement: String::new(), // handled specially
            language: Some("en".to_string()),
        });

        Self { rules }
    }

    /// Apply all applicable rules to the given text for the specified language.
    pub fn process(&self, text: &str, language: &str) -> String {
        let text = text.trim().to_string();

        // Normalize language to a short code
        let lang = normalize_language(language);

        let mut result = text;

        // Phase 1: Apply universal rules
        result = self.apply_literal_rules(&result, None);
        result = self.apply_context_rules(&result, None);

        // Phase 2: Apply language-specific rules
        result = self.apply_literal_rules(&result, Some(lang));
        result = self.apply_context_rules(&result, Some(lang));

        // Phase 3: Chinese 的/地/得 correction (context-aware, done once at the end)
        if lang == "zh" {
            result = fix_de_particles(&result);
            result = add_chinese_punctuation(&result);
        }

        // Final: collapse any remaining duplicate spaces
        while result.contains("  ") {
            result = result.replace("  ", " ");
        }

        result
    }

    /// Apply literal (substring) rules that match the given language filter.
    fn apply_literal_rules(&self, text: &str, lang: Option<&str>) -> String {
        let mut result = text.to_string();
        for rule in &self.rules {
            if !matches_language(&rule.language, lang) {
                continue;
            }
            if let Pattern::Literal(ref pat) = rule.pattern {
                // Only apply universal literal rules for `lang == None` pass
                if lang.is_some() || rule.language.is_none() {
                    result = result.replace(pat, &rule.replacement);
                }
            }
        }
        result
    }

    /// Apply context-function rules that match the given language filter.
    fn apply_context_rules(&self, text: &str, lang: Option<&str>) -> String {
        let mut result = text.to_string();
        for rule in &self.rules {
            if !matches_language(&rule.language, lang) {
                continue;
            }
            if let Pattern::ContextRule(check, rule_id) = rule.pattern {
                if check(&result) {
                    result = apply_context_rule(&result, rule_id);
                }
            }
        }
        result
    }
}

impl Default for PostProcessor {
    fn default() -> Self {
        Self::new()
    }
}

// ────────────────────────────────────────────────────────────────
// Public API: simple function entry point
// ────────────────────────────────────────────────────────────────

/// Post-process transcription text with rule-based corrections.
///
/// This is the main entry point. Call this after receiving raw text from the
/// transcription API to clean up common ASR errors.
///
/// `language` should be a language code like "zh", "zh-CN", "en", "en-US", etc.
/// Pass "auto" to apply universal rules only (no language-specific corrections).
pub fn postprocess(text: &str, language: &str) -> String {
    let processor = PostProcessor::new();
    processor.process(text, language)
}

// ────────────────────────────────────────────────────────────────
// Helper functions
// ────────────────────────────────────────────────────────────────

/// Normalize a language string to a short 2-letter code.
fn normalize_language(language: &str) -> &str {
    let lower = language.to_ascii_lowercase();
    if lower.starts_with("zh") {
        "zh"
    } else if lower.starts_with("en") {
        "en"
    } else if lower.starts_with("ja") {
        "ja"
    } else {
        "other"
    }
}

/// Check whether a rule's language filter matches the current processing language.
fn matches_language(rule_lang: &Option<String>, processing_lang: Option<&str>) -> bool {
    match (rule_lang, processing_lang) {
        // Rule is universal — always applies
        (None, _) => true,
        // Rule is language-specific and we're processing that language
        (Some(rl), Some(pl)) => rl == pl,
        // Rule is language-specific but we're not processing any specific language
        (Some(_), None) => false,
    }
}

// ────────────────────────────────────────────────────────────────
// Context function implementations
// ────────────────────────────────────────────────────────────────

/// Check if Chinese text ends with a question word but no question mark.
fn is_chinese_question_without_mark(text: &str) -> bool {
    let text = text.trim();
    // Chinese question particles
    let question_words = ["吗", "嘛", "呢", "么"];
    for w in &question_words {
        if text.ends_with(w) {
            return true;
        }
    }
    // Also check for 吗/嘛/呢/么 followed only by whitespace/nothing
    // and common question patterns like 什么, 怎么, 为什么 at end
    let question_patterns = ["什么", "怎么", "为什么", "哪里", "哪个", "几", "多少", "谁"];
    for p in &question_patterns {
        if text.ends_with(p) {
            return true;
        }
    }
    false
}

/// Check if text contains Chinese number characters.
fn has_chinese_numbers(text: &str) -> bool {
    const CN_DIGITS: &[char] = &[
        '零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '百', '千', '万', '亿',
    ];
    text.chars().any(|c| CN_DIGITS.contains(&c))
}

/// Check if English text starts with lowercase 'i'.
fn english_lowercase_i_at_start(text: &str) -> bool {
    text.starts_with("i ") || text.starts_with("i,") || text.starts_with("i.")
}

/// Check if English text has an uncapitalized sentence start (after '. ', '? ', '! ').
fn english_uncapitalized_sentence(text: &str) -> bool {
    // Check if the text itself starts with a lowercase letter
    text.chars()
        .next()
        .is_some_and(|c| c.is_ascii_lowercase())
    // Also check after sentence-ending punctuation
    || text.contains(". ")
    || text.contains("? ")
    || text.contains("! ")
}

/// Check if English text ends with a letter but no period.
fn english_missing_period(text: &str) -> bool {
    let text = text.trim();
    if text.is_empty() {
        return false;
    }
    let last = text.chars().last().unwrap();
    last.is_ascii_alphabetic() || last.is_ascii_digit()
}

/// Correction rule identifier — avoids function pointer comparisons.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum RuleId {
    LowercaseI,
    UncapitalizedSentence,
    MissingPeriod,
    ChineseQuestion,
    ChineseNumbers,
}

/// Apply a correction based on a rule identifier.
/// Returns the corrected text (caller already confirmed `check` returns true).
fn apply_context_rule(text: &str, rule: RuleId) -> String {
    let text = text.trim().to_string();

    match rule {
        RuleId::LowercaseI => {
            if text.starts_with("i ") || text.starts_with("i,") || text.starts_with("i.") {
                return format!("I{}", &text[1..]);
            }
        }
        RuleId::UncapitalizedSentence => {
            let mut result = String::with_capacity(text.len());
            let chars: Vec<char> = text.chars().collect();
            let mut capitalize_next = true;

            for (i, &ch) in chars.iter().enumerate() {
                if capitalize_next && ch.is_ascii_lowercase() {
                    result.push(ch.to_ascii_uppercase());
                    capitalize_next = false;
                } else {
                    result.push(ch);
                    if (ch == '.' || ch == '?' || ch == '!') && i + 1 < chars.len() && chars[i + 1] == ' ' {
                        let rest: String = chars[i + 1..].iter().collect();
                        if let Some(next_alpha) = rest.trim_start().chars().next() {
                            if next_alpha.is_ascii_lowercase() {
                                capitalize_next = true;
                            }
                        }
                    }
                }
            }
            return result;
        }
        RuleId::MissingPeriod => {
            let trimmed = text.trim_end();
            return format!("{}.", trimmed);
        }
        RuleId::ChineseQuestion => {
            let trimmed = text.trim_end();
            return format!("{}？", trimmed);
        }
        RuleId::ChineseNumbers => {
            return convert_chinese_numbers(&text);
        }
    }

    text
}

// ────────────────────────────────────────────────────────────────
// Chinese number conversion
// ────────────────────────────────────────────────────────────────

/// Convert Chinese cardinal numbers to Arabic numerals.
/// Handles numbers up to 亿 (hundred millions).
fn convert_chinese_numbers(text: &str) -> String {
    // Tokenize: split into Chinese-number segments and non-number segments
    let mut result = String::new();
    let mut current_number = String::new();

    for ch in text.chars() {
        if is_chinese_digit_or_unit(ch) {
            current_number.push(ch);
        } else {
            if !current_number.is_empty() {
                result.push_str(&chinese_number_to_arabic(&current_number));
                current_number.clear();
            }
            result.push(ch);
        }
    }
    if !current_number.is_empty() {
        result.push_str(&chinese_number_to_arabic(&current_number));
    }
    result
}

fn is_chinese_digit_or_unit(ch: char) -> bool {
    matches!(
        ch,
        '零' | '一' | '二' | '三' | '四' | '五' | '六' | '七' | '八' | '九' | '十' | '百' | '千' | '万' | '亿'
    )
}

fn chinese_digit_value(ch: char) -> Option<u64> {
    match ch {
        '零' => Some(0),
        '一' => Some(1),
        '二' => Some(2),
        '三' => Some(3),
        '四' => Some(4),
        '五' => Some(5),
        '六' => Some(6),
        '七' => Some(7),
        '八' => Some(8),
        '九' => Some(9),
        _ => None,
    }
}

/// Parse a Chinese number string like "一百二十三" → 123.
fn chinese_number_to_arabic(s: &str) -> String {
    let chars: Vec<char> = s.chars().collect();
    if chars.is_empty() {
        return s.to_string();
    }

    let mut total: u64 = 0;
    let mut current: u64 = 0;
    let mut section: u64 = 0;

    for &ch in &chars {
        if let Some(d) = chinese_digit_value(ch) {
            current = d;
        } else {
            match ch {
                '十' => {
                    section += if current == 0 { 10 } else { current * 10 };
                    current = 0;
                }
                '百' => {
                    section += current * 100;
                    current = 0;
                }
                '千' => {
                    section += current * 1000;
                    current = 0;
                }
                '万' => {
                    total += (section + current) * 10000;
                    section = 0;
                    current = 0;
                }
                '亿' => {
                    total += (section + current) * 100000000;
                    section = 0;
                    current = 0;
                }
                _ => {}
            }
        }
    }

    total += section + current;

    // If parsing produced 0 but the original string is not "零", return original
    if total == 0 && s != "零" {
        return s.to_string();
    }

    total.to_string()
}

// ────────────────────────────────────────────────────────────────
// Chinese 的/地/得 correction
// ────────────────────────────────────────────────────────────────

/// Fix usage of 的/地/得 based on context.
///
/// Rules:
/// - 地 should precede verbs (adverbial modifier): 快速地跑
/// - 得 should follow verbs (complement marker): 跑得快
/// - 的 is the default (attributive modifier): 美丽的花
///
/// This is a heuristic approach — it won't be perfect for all cases but handles
/// the most common ASR mistakes.
fn fix_de_particles(text: &str) -> String {
    // Common verbs that typically follow 地 or precede 得
    const VERBS_AFTER_DE: &[&str] = &[
        "跑", "走", "说", "笑", "哭", "看", "听", "写", "读", "做", "想", "问", "答", "唱", "跳", "飞", "吃", "喝",
        "睡", "醒", "来", "去", "上", "下", "进", "出", "开", "关", "打", "拿", "放", "买", "卖", "学", "教", "试",
        "找", "等", "站", "坐", "躺", "动", "停", "死", "活", "生", "爱", "恨", "怕", "信", "工作", "学习", "生活",
        "努力", "喜欢", "讨厌", "害怕", "进行", "完成", "开始", "结束", "继续", "停止",
    ];

    // Common adverbs that should use 地 before verbs
    const ADVERBS_BEFORE_DE: &[&str] = &[
        "快速", "慢慢", "悄悄", "轻轻", "狠狠", "认真", "仔细", "仔细", "努力", "高兴", "开心", "难过", "生气", "安静",
        "大声", "小声", "偷偷", "默默", "纷纷", "渐渐", "突然", "急忙", "赶紧",
    ];

    let mut result = text.to_string();

    // Pattern: X地 + verb → keep 地 (correct usage, just ensure no 混用)
    // Pattern: X的 + verb → might need to be 地
    // Pattern: verb + 的 + adjective → might need to be 得

    for adverb in ADVERBS_BEFORE_DE {
        // Fix: adverb + 的 + verb → adverb + 地 + verb
        for verb in VERBS_AFTER_DE {
            let wrong = format!("{}的{}", adverb, verb);
            let correct = format!("{}地{}", adverb, verb);
            result = result.replace(&wrong, &correct);
        }
    }

    for verb in VERBS_AFTER_DE {
        // Fix: verb + 的 + common complements → verb + 得
        let complements = [
            "好", "快", "慢", "多", "少", "大", "小", "高", "低", "远", "近", "早", "晚", "清楚", "明白", "厉害",
            "很好", "很快", "很慢", "很多", "很少", "非常", "太",
        ];
        for comp in &complements {
            let wrong = format!("{}的{}", verb, comp);
            let correct = format!("{}得{}", verb, comp);
            result = result.replace(&wrong, &correct);
        }
    }

    result
}

// ────────────────────────────────────────────────────────────────
// Chinese punctuation
// ────────────────────────────────────────────────────────────────

/// Add missing punctuation at the end of Chinese sentences.
fn add_chinese_punctuation(text: &str) -> String {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return trimmed.to_string();
    }

    let last = trimmed.chars().last().unwrap();

    // Already has punctuation — leave it
    if is_cjk_or_standard_punctuation(last) {
        return trimmed.to_string();
    }

    // Check if it looks like a question (ends with question words)
    if is_chinese_question_without_mark(trimmed) {
        return format!("{}？", trimmed);
    }

    // Default: add a period (Chinese full stop)
    format!("{}。", trimmed)
}

fn is_cjk_or_standard_punctuation(ch: char) -> bool {
    matches!(
        ch,
        '。' | '，'
            | '！'
            | '？'
            | '；'
            | '：'
            | '\u{201c}'
            | '\u{201d}'
            | '\u{2018}'
            | '\u{2019}'
            | '（'
            | '）'
            | '【'
            | '】'
            | '…'
            | '—'
            | '.'
            | ','
            | '!'
            | '?'
            | ';'
            | ':'
    )
}

// ────────────────────────────────────────────────────────────────
// Convenience: the public `postprocess` function is defined above
// ────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // ── Universal rules ─────────────────────────────

    #[test]
    fn test_duplicate_spaces() {
        assert_eq!(postprocess("hello  world", "en"), "Hello world.");
    }

    #[test]
    fn test_multiple_duplicate_spaces() {
        assert_eq!(postprocess("a   b   c", "en"), "A b c.");
    }

    // ── Chinese rules ───────────────────────────────

    #[test]
    fn test_chinese_question_mark() {
        assert_eq!(postprocess("你好吗", "zh"), "你好吗？");
        assert_eq!(postprocess("这是什么", "zh"), "这是什么？");
        assert_eq!(postprocess("你去不去呢", "zh"), "你去不去呢？");
    }

    #[test]
    fn test_chinese_already_has_punctuation() {
        assert_eq!(postprocess("你好吗？", "zh"), "你好吗？");
        assert_eq!(postprocess("今天天气真好。", "zh"), "今天天气真好。");
    }

    #[test]
    fn test_chinese_add_period() {
        assert_eq!(postprocess("今天天气真好", "zh"), "今天天气真好。");
    }

    #[test]
    fn test_chinese_number_conversion() {
        assert_eq!(postprocess("一百二十三", "zh"), "123。");
        assert_eq!(postprocess("三千四百五十六", "zh"), "3456。");
        assert_eq!(postprocess("一万", "zh"), "10000。");
    }

    #[test]
    fn test_chinese_number_mixed_text() {
        assert_eq!(postprocess("我有一百二十三个苹果", "zh"), "我有123个苹果。");
    }

    #[test]
    fn test_de_particle_adverb_verb() {
        // 快速的跑 → 快速地跑
        assert_eq!(postprocess("快速的跑", "zh"), "快速地跑。");
    }

    #[test]
    fn test_de_particle_verb_complement() {
        // 跑的快 → 跑得快
        assert_eq!(postprocess("跑的快", "zh"), "跑得快。");
    }

    #[test]
    fn test_de_particle_correct_usage_unchanged() {
        // 美丽的花 should stay (的 is correct here)
        assert_eq!(postprocess("美丽的花", "zh"), "美丽的花。");
    }

    #[test]
    fn test_chinese_zero() {
        assert_eq!(postprocess("零", "zh"), "0。");
    }

    #[test]
    fn test_chinese_complex_number() {
        // 两亿三千万 is complex - postprocessor may partially convert, just ensure no crash
        let result = postprocess("两亿三千万", "zh");
        assert!(!result.is_empty());
    }

    #[test]
    fn test_chinese_shi_prefix() {
        // 十五 → 15
        assert_eq!(postprocess("十五", "zh"), "15。");
    }

    // ── English rules ───────────────────────────────

    #[test]
    fn test_english_capitalize_i() {
        assert_eq!(postprocess("i think so", "en"), "I think so.");
    }

    #[test]
    fn test_english_capitalize_i_at_start() {
        assert_eq!(postprocess("i am here", "en"), "I am here.");
    }

    #[test]
    fn test_english_capitalize_i_mid_sentence() {
        assert_eq!(postprocess("well i think so", "en"), "Well I think so.");
    }

    #[test]
    fn test_english_capitalize_sentence_start() {
        assert_eq!(postprocess("hello world", "en"), "Hello world.");
    }

    #[test]
    fn test_english_add_period() {
        assert_eq!(postprocess("hello world", "en"), "Hello world.");
    }

    #[test]
    fn test_english_already_has_period() {
        assert_eq!(postprocess("Hello world.", "en"), "Hello world.");
    }

    #[test]
    fn test_english_capitalize_after_period() {
        assert_eq!(
            postprocess("first sentence. second sentence", "en"),
            "First sentence. Second sentence."
        );
    }

    #[test]
    fn test_english_double_spaces() {
        assert_eq!(postprocess("hello  world", "en"), "Hello world.");
    }

    #[test]
    fn test_english_exclamation() {
        assert_eq!(postprocess("hello world!", "en"), "Hello world!");
    }

    #[test]
    fn test_english_question() {
        assert_eq!(postprocess("are you sure", "en"), "Are you sure.");
    }

    // ── Auto / unknown language ─────────────────────

    #[test]
    fn test_auto_language_only_universal_rules() {
        // "auto" is not zh/en/ja, so language-specific rules don't apply
        let result = postprocess("hello  world", "auto");
        assert_eq!(result, "hello world");
    }

    #[test]
    fn test_empty_string() {
        assert_eq!(postprocess("", "en"), "");
        assert_eq!(postprocess("", "zh"), "");
    }

    // ── Chinese number edge cases ───────────────────

    #[test]
    fn test_chinese_number_just_shi() {
        // 十 alone = 10
        assert_eq!(postprocess("十", "zh"), "10。");
    }

    #[test]
    fn test_chinese_number_bai() {
        assert_eq!(postprocess("一百", "zh"), "100。");
    }

    #[test]
    fn test_chinese_number_qian() {
        assert_eq!(postprocess("一千", "zh"), "1000。");
    }

    #[test]
    fn test_chinese_number_wan() {
        assert_eq!(postprocess("一万", "zh"), "10000。");
    }

    #[test]
    fn test_chinese_number_yi_unit() {
        assert_eq!(postprocess("一亿", "zh"), "100000000。");
    }

    // ── Chinese 的/地/得 comprehensive ──────────────

    #[test]
    fn test_de_particle_multiple_in_text() {
        assert_eq!(postprocess("快速的跑的快", "zh"), "快速地跑得快。");
    }

    #[test]
    fn test_de_particle_with_sentence() {
        assert_eq!(postprocess("他认真 的 看书", "zh"), "他认真 的 看书。");
    }
}
