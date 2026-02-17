/**
 * SillyTavern Extension: Preset Cache Analyzer
 *
 * Self-contained ES module loaded by SillyTavern via import().
 * All rule logic, component rendering, and dashboard management are inlined
 * because ST's ES module loader cannot resolve require() calls to the
 * separate CommonJS files.
 *
 * The separate CommonJS files (rules/, ui/, analyzer.js) remain for
 * Node.js test coverage — they contain identical logic.
 */

import { getContext } from '../../../extensions.js';
import { eventSource, event_types } from '../../../../script.js';

// ============================================================
// Constants
// ============================================================

const MODULE_NAME = 'cache_analyzer';

const defaultSettings = {
    enabled: true,
    autoAnalyze: true,
    provider: 'auto',
};

const DYNAMIC_MACRO_REGEX = /\{\{(random|roll|time|date|weekday|isotime|isodate|idle_duration|time_UTC)(::|\}\})/gi;

const VOLATILE_IDENTIFIERS = new Set(['chatHistory', 'dialogueExamples']);

const THRESHOLDS = {
    anthropic: 1024,
    openai: 1024,
    google: 4096,
};

// ============================================================
// Rule: macro-placement
// ============================================================

function checkMacroPlacement(preset) {
    const findings = [];
    if (!preset || !preset.prompts || !preset.prompt_order) return findings;

    let orderArray = preset.prompt_order;
    if (Array.isArray(orderArray) && orderArray.length > 0 && orderArray[0].order) {
        orderArray = orderArray[0].order;
    }

    const enabledEntries = orderArray.filter(e => e.enabled);
    const totalEntries = enabledEntries.length;
    if (totalEntries === 0) return findings;

    const promptMap = {};
    for (const p of preset.prompts) promptMap[p.identifier] = p;

    for (let i = 0; i < enabledEntries.length; i++) {
        const entry = enabledEntries[i];
        const prompt = promptMap[entry.identifier];
        if (!prompt || !prompt.content) continue;

        DYNAMIC_MACRO_REGEX.lastIndex = 0;
        let match;
        let mi = 0;
        while ((match = DYNAMIC_MACRO_REGEX.exec(prompt.content)) !== null) {
            const macroFound = `{{${match[1]}}}`;
            const pct = i / totalEntries;
            const severity = i === 0 ? 'critical' : pct < 0.4 ? 'warning' : 'info';
            const name = prompt.name || entry.identifier;
            findings.push({
                id: `macro-placement-${i}-${mi}`, rule: 'macro-placement', severity,
                title: `Dynamic macro in ${severity === 'critical' ? 'system prompt' : 'early prompt section'}`,
                description: `${macroFound} found in "${name}" (position ${i + 1} of ${totalEntries}). This changes every generation and invalidates the cached prefix for all content after it.`,
                affectedEntry: entry.identifier,
                recommendation: `Move ${macroFound} to a prompt entry in the latter half of the prompt order (after chat history), or replace it with a fixed value.`,
                provider: 'all',
                meta: { macroFound, position: i, totalEntries, positionPercent: pct },
            });
            mi++;
        }
    }
    return findings;
}

// ============================================================
// Rule: prompt-ordering
// ============================================================

function isVolatile(identifier, content) {
    if (VOLATILE_IDENTIFIERS.has(identifier)) return true;
    if (content) {
        DYNAMIC_MACRO_REGEX.lastIndex = 0;
        if (DYNAMIC_MACRO_REGEX.test(content)) return true;
    }
    return false;
}

function checkPromptOrdering(preset) {
    const findings = [];
    if (!preset || !preset.prompts || !preset.prompt_order) return findings;

    let orderArray = preset.prompt_order;
    if (Array.isArray(orderArray) && orderArray.length > 0 && orderArray[0].order) {
        orderArray = orderArray[0].order;
    }

    const enabledEntries = orderArray.filter(e => e.enabled);
    if (enabledEntries.length === 0) return findings;

    const promptMap = {};
    for (const p of preset.prompts) promptMap[p.identifier] = p;

    const classified = enabledEntries.map((entry, index) => {
        const prompt = promptMap[entry.identifier];
        const content = prompt ? prompt.content : '';
        return { entry, prompt, index, volatile: isVolatile(entry.identifier, content) };
    });

    for (let i = 0; i < classified.length; i++) {
        if (!classified[i].volatile) continue;
        const stableAfter = [];
        for (let j = i + 1; j < classified.length; j++) {
            if (!classified[j].volatile) stableAfter.push(classified[j]);
        }
        if (stableAfter.length < 2) continue;

        const v = classified[i];
        const entryName = v.prompt ? v.prompt.name : v.entry.identifier;
        const stableNames = stableAfter.map(s => s.prompt ? s.prompt.name : s.entry.identifier);
        findings.push({
            id: `prompt-ordering-${i}`, rule: 'prompt-ordering', severity: 'warning',
            title: 'Volatile entry interleaved before stable content',
            description: `"${entryName}" (position ${i + 1}) is volatile and appears before ${stableAfter.length} stable entries (${stableNames.join(', ')}). This breaks the cacheable prefix — all stable content after this point cannot be cached together with earlier stable content.`,
            affectedEntry: v.entry.identifier,
            recommendation: `Move "${entryName}" after all stable prompt entries so that the maximum amount of static content forms a contiguous cacheable prefix.`,
            provider: 'all',
            meta: { volatilePosition: i, stableEntriesAfter: stableAfter.length, stableIdentifiers: stableAfter.map(s => s.entry.identifier) },
        });
    }
    return findings;
}

// ============================================================
// Rule: token-thresholds
// ============================================================

function defaultTokenizer(text) {
    return Math.ceil(text.length / 4);
}

function checkTokenThresholds(preset, options) {
    const findings = [];
    if (!preset || !preset.prompts || !preset.prompt_order) return findings;

    const provider = options.provider || 'anthropic';
    const threshold = THRESHOLDS[provider] || THRESHOLDS.anthropic;
    const tokenizer = options.tokenizer || defaultTokenizer;

    let orderArray = preset.prompt_order;
    if (Array.isArray(orderArray) && orderArray.length > 0 && orderArray[0].order) {
        orderArray = orderArray[0].order;
    }

    const enabledEntries = orderArray.filter(e => e.enabled);
    const promptMap = {};
    for (const p of preset.prompts) promptMap[p.identifier] = p;

    const stableContent = [];
    for (const entry of enabledEntries) {
        const prompt = promptMap[entry.identifier];
        const content = prompt ? prompt.content : '';
        if (!isVolatile(entry.identifier, content) && content) stableContent.push(content);
    }

    const estimatedTokens = tokenizer(stableContent.join('\n'));
    if (estimatedTokens >= threshold) return findings;

    const ratio = estimatedTokens / threshold;
    const severity = ratio >= 0.9 ? 'warning' : 'info';

    findings.push({
        id: `token-thresholds-${provider}`, rule: 'token-thresholds', severity,
        title: `Stable prefix below ${provider} cache threshold`,
        description: `The stable prefix is estimated at ${estimatedTokens} tokens, which is below the ${provider} caching threshold of ${threshold} tokens. The prompt prefix will not be cached, resulting in full re-processing on every request.`,
        affectedEntry: 'all',
        recommendation: `Add more static content to your prompt entries before the chat history, or consolidate prompt entries to reach at least ${threshold} tokens in the stable prefix.`,
        provider,
        meta: { estimatedTokens, threshold, deficit: threshold - estimatedTokens, ratio },
    });
    return findings;
}

// ============================================================
// Rule: injection-depth
// ============================================================

function hasDynamicMacros(content) {
    if (!content) return false;
    DYNAMIC_MACRO_REGEX.lastIndex = 0;
    return DYNAMIC_MACRO_REGEX.test(content);
}

function checkInjectionDepth(preset) {
    const findings = [];
    if (!preset || !preset.prompts || !preset.prompt_order) return findings;

    let orderArray = preset.prompt_order;
    if (Array.isArray(orderArray) && orderArray.length > 0 && orderArray[0].order) {
        orderArray = orderArray[0].order;
    }

    const enabledIds = new Set(orderArray.filter(e => e.enabled).map(e => e.identifier));

    for (const prompt of preset.prompts) {
        if (!prompt.enabled || !enabledIds.has(prompt.identifier)) continue;
        if (prompt.injection_position !== 1) continue;
        const depth = prompt.injection_depth;
        if (depth === null || depth === undefined || depth >= 4) continue;

        const isDynamic = hasDynamicMacros(prompt.content);
        let severity;
        if (depth <= 1 && isDynamic) severity = 'critical';
        else if (depth <= 1) severity = 'warning';
        else if (isDynamic) severity = 'warning';
        else severity = 'info';

        const name = prompt.name || prompt.identifier;
        findings.push({
            id: `injection-depth-${prompt.identifier}`, rule: 'injection-depth', severity,
            title: `${isDynamic ? 'Dynamic' : 'Static'} content injected at shallow depth ${depth}`,
            description: `"${name}" is injected into chat at depth ${depth}${isDynamic ? ' with dynamic macros' : ''}. Shallow injections near the end of conversation disrupt the cacheable portion of recent messages.`,
            affectedEntry: prompt.identifier,
            recommendation: 'Consider increasing the injection depth to 4+ or moving this content to a fixed prompt position to preserve cache efficiency.',
            provider: 'all',
            meta: { depth, injectionPosition: prompt.injection_position, hasDynamicContent: isDynamic },
        });
    }
    return findings;
}

// ============================================================
// Rule: provider-specific
// ============================================================

function getStablePrefixTokens(preset, tokenizer) {
    let orderArray = preset.prompt_order;
    if (Array.isArray(orderArray) && orderArray.length > 0 && orderArray[0].order) {
        orderArray = orderArray[0].order;
    }
    const enabledEntries = orderArray.filter(e => e.enabled);
    const promptMap = {};
    for (const p of preset.prompts) promptMap[p.identifier] = p;

    const stableContent = [];
    for (const entry of enabledEntries) {
        const prompt = promptMap[entry.identifier];
        const content = prompt ? prompt.content : '';
        if (!isVolatile(entry.identifier, content) && content) stableContent.push(content);
    }
    return tokenizer(stableContent.join('\n'));
}

function checkProviderSpecific(preset, options) {
    const findings = [];
    if (!preset || !preset.prompts || !preset.prompt_order) return findings;
    const provider = options.provider;
    if (!provider) return findings;

    if (provider === 'anthropic') return checkAnthropic(preset, options);
    if (provider === 'openai') return checkOpenAI(preset, options);
    if (provider === 'google') return checkGoogle(preset, options);
    return findings;
}

function checkAnthropic(preset, options) {
    const findings = [];
    let orderArray = preset.prompt_order;
    if (Array.isArray(orderArray) && orderArray.length > 0 && orderArray[0].order) {
        orderArray = orderArray[0].order;
    }
    const enabledIds = new Set(orderArray.filter(e => e.enabled).map(e => e.identifier));
    const systemPrompts = preset.prompts.filter(p => p.enabled && p.role === 'system' && enabledIds.has(p.identifier));

    if (systemPrompts.length > 1) {
        if (preset.squash_system_messages === true) {
            findings.push({
                id: 'provider-specific-anthropic-squash-on', rule: 'provider-specific', severity: 'info',
                title: 'System message squashing enabled',
                description: `squash_system_messages is enabled with ${systemPrompts.length} system prompts. This consolidates them into a single system message, which is optimal for Anthropic prompt caching.`,
                affectedEntry: 'all',
                recommendation: 'No action needed — this is the recommended configuration for Anthropic caching.',
                provider: 'anthropic',
                meta: { systemPromptCount: systemPrompts.length, squashEnabled: true },
            });
        } else {
            findings.push({
                id: 'provider-specific-anthropic-squash-off', rule: 'provider-specific', severity: 'warning',
                title: 'Fragmented system messages without squashing',
                description: `${systemPrompts.length} separate system prompts detected but squash_system_messages is not enabled. Anthropic treats each system message as a separate cache-breaking boundary.`,
                affectedEntry: 'all',
                recommendation: 'Enable squash_system_messages in your preset settings to consolidate system prompts into a single message for better cache utilization.',
                provider: 'anthropic',
                meta: { systemPromptCount: systemPrompts.length, squashEnabled: false },
            });
        }
    }
    return findings;
}

function checkOpenAI(preset, options) {
    const findings = [];
    const tokenizer = options.tokenizer || defaultTokenizer;
    const estimatedTokens = getStablePrefixTokens(preset, tokenizer);
    const remainder = estimatedTokens % 128;
    if (remainder !== 0) {
        const padding = 128 - remainder;
        findings.push({
            id: 'provider-specific-openai-alignment', rule: 'provider-specific', severity: 'info',
            title: 'Stable prefix not aligned to 128-token boundary',
            description: `The stable prefix is estimated at ${estimatedTokens} tokens (remainder ${remainder} when divided by 128). OpenAI caches at 128-token boundaries, so ${padding} tokens are wasted in the current boundary.`,
            affectedEntry: 'all',
            recommendation: `Consider adding ~${padding} tokens of static content to align your prefix to the next 128-token boundary for optimal cache utilization.`,
            provider: 'openai',
            meta: { estimatedTokens, remainder, paddingNeeded: padding },
        });
    }
    return findings;
}

function checkGoogle(preset, options) {
    const findings = [];
    const tokenizer = options.tokenizer || defaultTokenizer;
    const estimatedTokens = getStablePrefixTokens(preset, tokenizer);
    const threshold = 4096;
    if (estimatedTokens < threshold) {
        findings.push({
            id: 'provider-specific-google-threshold', rule: 'provider-specific', severity: 'warning',
            title: 'Stable prefix below Google caching threshold',
            description: `The stable prefix is estimated at ${estimatedTokens} tokens, below Google's ${threshold}-token minimum for context caching. The prefix will not be cached.`,
            affectedEntry: 'all',
            recommendation: `Add more static content to reach at least ${threshold} tokens in your stable prefix for Google context caching to activate.`,
            provider: 'google',
            meta: { estimatedTokens, threshold, deficit: threshold - estimatedTokens },
        });
    }
    return findings;
}

// ============================================================
// Analyzer
// ============================================================

function analyze(preset, options = {}) {
    const findings = [
        ...checkMacroPlacement(preset, options),
        ...checkPromptOrdering(preset, options),
        ...checkTokenThresholds(preset, options),
        ...checkInjectionDepth(preset, options),
        ...checkProviderSpecific(preset, options),
    ];
    const score = calculateScore(findings);
    const summary = {
        critical: findings.filter(f => f.severity === 'critical').length,
        warning: findings.filter(f => f.severity === 'warning').length,
        info: findings.filter(f => f.severity === 'info').length,
    };
    return { findings, score, summary };
}

function calculateScore(findings) {
    let score = 100;
    for (const f of findings) {
        if (f.severity === 'critical') score -= 20;
        else if (f.severity === 'warning') score -= 10;
        else if (f.severity === 'info') score -= 3;
    }
    return Math.max(0, Math.min(100, score));
}

// ============================================================
// UI Components (HTML string renderers)
// ============================================================

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function getScoreLabel(score) {
    if (score >= 90) return { label: 'Excellent', cls: 'ca-score-excellent' };
    if (score >= 70) return { label: 'Good', cls: 'ca-score-good' };
    if (score >= 50) return { label: 'Needs Work', cls: 'ca-score-needswork' };
    return { label: 'Poor', cls: 'ca-score-poor' };
}

function getSeverityIcon(severity) {
    if (severity === 'critical') return '\u26D4';
    if (severity === 'warning') return '\u26A0\uFE0F';
    if (severity === 'info') return '\u2139\uFE0F';
    return '\u2022';
}

function renderScoreBar(score) {
    const info = getScoreLabel(score);
    return `<div class="ca-score-section">
        <div class="ca-score-header">
            <span class="ca-score-label ${info.cls}">${score}</span>
            <span class="ca-score-descriptor">${info.label}</span>
        </div>
        <div class="ca-score-bar">
            <div class="ca-score-bar-fill ${info.cls}" style="width: ${score}%"></div>
        </div>
    </div>`;
}

function renderSummaryPills(summary) {
    const pills = [];
    if (summary.critical > 0) pills.push(`<span class="ca-pill ca-pill-critical">\u26D4 ${summary.critical} Critical</span>`);
    if (summary.warning > 0) pills.push(`<span class="ca-pill ca-pill-warning">\u26A0\uFE0F ${summary.warning} Warning</span>`);
    if (summary.info > 0) pills.push(`<span class="ca-pill ca-pill-info">\u2139\uFE0F ${summary.info} Info</span>`);
    if (pills.length === 0) pills.push('<span class="ca-pill" style="background:rgba(68,204,68,0.15);color:#44CC44;">\u2705 No issues</span>');
    return `<div class="ca-summary-pills">${pills.join('')}</div>`;
}

function renderFindingCard(finding) {
    const icon = getSeverityIcon(finding.severity);
    return `<div class="ca-finding-card ca-finding-${finding.severity}">
        <div class="ca-finding-header">
            <span class="ca-severity-badge ca-badge-${finding.severity}">${icon} ${finding.severity}</span>
            <span class="ca-finding-title">${escapeHtml(finding.title)}</span>
        </div>
        <div class="ca-finding-desc">${escapeHtml(finding.description)}</div>
        <div class="ca-finding-rec">\uD83D\uDCA1 ${escapeHtml(finding.recommendation)}</div>
        <div class="ca-finding-meta">${escapeHtml(finding.rule)} \u2022 ${escapeHtml(finding.affectedEntry)}</div>
    </div>`;
}

function renderFindingsList(findings) {
    if (!findings || findings.length === 0) {
        return `<div class="ca-findings-list"><div class="ca-empty-state">
            <div class="ca-empty-icon">\u2705</div>
            <div class="ca-empty-text">No issues found</div>
            <div class="ca-empty-subtext">Your preset looks cache-friendly!</div>
        </div></div>`;
    }
    const order = { critical: 0, warning: 1, info: 2 };
    const sorted = [...findings].sort((a, b) => (order[a.severity] || 3) - (order[b.severity] || 3));
    return `<div class="ca-findings-list">${sorted.map(f => renderFindingCard(f)).join('')}</div>`;
}

function renderPromptViz(preset) {
    if (!preset || !preset.prompt_order) return '';
    let orderArray = preset.prompt_order;
    if (Array.isArray(orderArray) && orderArray.length > 0 && orderArray[0].order) {
        orderArray = orderArray[0].order;
    }
    const enabledEntries = orderArray.filter(e => e.enabled);
    if (enabledEntries.length === 0) return '';

    const promptMap = {};
    for (const p of preset.prompts) promptMap[p.identifier] = p;

    const rows = enabledEntries.map(entry => {
        const prompt = promptMap[entry.identifier];
        const content = prompt ? prompt.content : '';
        const vol = isVolatile(entry.identifier, content);
        const dotClass = vol ? 'ca-dot-volatile' : 'ca-dot-stable';
        const tagClass = vol ? 'ca-tag-volatile' : 'ca-tag-stable';
        const tagText = vol ? 'volatile' : 'stable';
        const name = escapeHtml(prompt ? prompt.name : entry.identifier);
        return `<div class="ca-prompt-entry">
            <div class="ca-prompt-dot ${dotClass}"></div>
            <span class="ca-prompt-name">${name}</span>
            <span class="ca-prompt-tag ${tagClass}">${tagText}</span>
        </div>`;
    });

    return `<div class="ca-prompt-viz">
        <div class="ca-prompt-viz-title">Prompt Order</div>
        ${rows.join('')}
    </div>`;
}

function renderEmptyState() {
    return `<div class="ca-empty-state">
        <div class="ca-empty-icon">\uD83D\uDD25</div>
        <div class="ca-empty-text">Click Analyze to scan your preset</div>
        <div class="ca-empty-subtext">Check for cache efficiency issues across all providers</div>
    </div>`;
}

function renderLoadingState() {
    return `<div class="ca-loading-state">
        <div class="ca-loading-dots">
            <div class="ca-loading-dot"></div>
            <div class="ca-loading-dot"></div>
            <div class="ca-loading-dot"></div>
        </div>
        <div class="ca-loading-text">Analyzing preset...</div>
    </div>`;
}

function renderResults(results, preset) {
    if (!results) return renderEmptyState();
    return renderScoreBar(results.score) +
        renderSummaryPills(results.summary) +
        renderFindingsList(results.findings) +
        renderPromptViz(preset);
}

// ============================================================
// Dashboard DOM Management
// ============================================================

let panelBody = null;
let analyzeBtn = null;
let panelEl = null;

function createPanelHTML() {
    return `<div class="ca-panel" id="ca-panel">
        <div class="ca-header" id="ca-header">
            <div class="ca-header-title">
                <span class="ca-icon">\uD83D\uDD25</span>
                <span>Cache Analyzer</span>
            </div>
            <div class="ca-header-actions">
                <button class="ca-btn-analyze" id="ca-btn-analyze">Analyze</button>
                <span class="ca-collapse-indicator">\u25BC</span>
            </div>
        </div>
        <div class="ca-body" id="ca-body">
            ${renderEmptyState()}
        </div>
    </div>`;
}

function initDashboard(container) {
    if (!container) return;

    container.innerHTML = createPanelHTML();

    panelEl = container.querySelector('#ca-panel');
    panelBody = container.querySelector('#ca-body');
    analyzeBtn = container.querySelector('#ca-btn-analyze');

    // Header click toggles collapse
    container.querySelector('#ca-header').addEventListener('click', function (e) {
        if (e.target.closest('.ca-btn-analyze')) return;
        panelEl.classList.toggle('collapsed');
    });

    // Analyze button click
    analyzeBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        showLoading();
        setTimeout(function () { runAnalysis(); }, 50);
    });
}

function updateDashboard(results, preset) {
    if (!panelBody) return;
    if (analyzeBtn) analyzeBtn.classList.remove('ca-loading');
    panelBody.innerHTML = renderResults(results, preset);

    // Trigger score bar animation after render
    requestAnimationFrame(function () {
        const fill = panelBody.querySelector('.ca-score-bar-fill');
        if (fill) fill.style.width = results.score + '%';
    });
}

function showLoading() {
    if (!panelBody) return;
    if (analyzeBtn) analyzeBtn.classList.add('ca-loading');
    panelBody.innerHTML = renderLoadingState();
}

function showEmpty() {
    if (!panelBody) return;
    if (analyzeBtn) analyzeBtn.classList.remove('ca-loading');
    panelBody.innerHTML = renderEmptyState();
}

// ============================================================
// ST Integration
// ============================================================

function detectProvider() {
    try {
        if (typeof oai_settings !== 'undefined') {
            const source = oai_settings.chat_completion_source;
            if (source === 'claude') return 'anthropic';
            if (source === 'openai') return 'openai';
            if (source === 'google') return 'google';
        }
    } catch (e) { /* not in ST environment */ }
    return 'anthropic';
}

function getCurrentPreset() {
    try {
        if (typeof oai_settings === 'undefined') return null;
        return {
            prompts: oai_settings.prompts || [],
            prompt_order: oai_settings.prompt_order || [],
            squash_system_messages: oai_settings.squash_system_messages || false,
            stream_openai: oai_settings.stream_openai || false,
            openai_max_context: oai_settings.openai_max_context || 0,
        };
    } catch (e) {
        console.error('[Cache Analyzer] Could not read preset data:', e);
        return null;
    }
}

function getSettings() {
    try {
        const context = getContext();
        if (!context.extensionSettings[MODULE_NAME]) {
            context.extensionSettings[MODULE_NAME] = JSON.parse(JSON.stringify(defaultSettings));
        }
        return context.extensionSettings[MODULE_NAME];
    } catch (e) {
        return Object.assign({}, defaultSettings);
    }
}

function runAnalysis() {
    const preset = getCurrentPreset();
    if (!preset) {
        console.warn('[Cache Analyzer] No preset data available');
        showEmpty();
        return null;
    }

    const settings = getSettings();
    const provider = settings.provider === 'auto' ? detectProvider() : settings.provider;
    const results = analyze(preset, { provider });

    updateDashboard(results, preset);
    return results;
}

function registerSlashCommands() {
    try {
        if (typeof SlashCommandParser === 'undefined') return;

        SlashCommandParser.addCommandObject({
            name: 'cache-analyze',
            callback: async function () { runAnalysis(); return ''; },
            helpString: 'Run cache analysis on current preset',
        });

        SlashCommandParser.addCommandObject({
            name: 'cache-score',
            callback: async function () {
                const results = runAnalysis();
                if (!results) return 'No preset loaded';
                return `Cache Efficiency Score: ${results.score}/100 (${results.summary.critical} critical, ${results.summary.warning} warnings, ${results.summary.info} info)`;
            },
            helpString: 'Quick cache efficiency score check',
        });
    } catch (e) {
        console.warn('[Cache Analyzer] Could not register slash commands:', e);
    }
}

// ============================================================
// Init — called by SillyTavern when the extension loads
// ============================================================

async function init() {
    const settings = getSettings();

    // Inject UI panel into ST extensions drawer
    const panelContainer = document.getElementById('extensions_settings2');
    if (panelContainer) {
        const wrapper = document.createElement('div');
        wrapper.classList.add('cache-analyzer');
        wrapper.id = 'cache-analyzer-root';
        panelContainer.appendChild(wrapper);
        initDashboard(wrapper);
    }

    // Register auto-analyze events
    if (settings.autoAnalyze) {
        eventSource.on(event_types.OAI_PRESET_CHANGED, function () { runAnalysis(); });
        eventSource.on(event_types.SETTINGS_UPDATED, function () { runAnalysis(); });
    }

    // Register slash commands
    registerSlashCommands();

    console.log('[Cache Analyzer] Extension loaded');
}

export { init };
