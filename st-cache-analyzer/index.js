/**
 * SillyTavern Extension: Preset Cache Analyzer
 *
 * Lifecycle:
 * 1. On load: inject UI panel, load settings, register events
 * 2. On OAI_PRESET_CHANGED or SETTINGS_UPDATED: auto-analyze if enabled
 * 3. On Analyze button click: run analysis, render results
 * 4. On slash command: run analysis, output to chat or panel
 *
 * This file uses a hybrid approach:
 * - ES module `export { init }` for SillyTavern's runtime
 * - CommonJS `module.exports` for Node.js test environments
 * Node.js will ignore the `export` statement via a guard.
 */

const IS_NODE = typeof module !== 'undefined' && typeof require === 'function';

const MODULE_NAME = 'cache_analyzer';

const defaultSettings = {
    enabled: true,
    autoAnalyze: true,
    provider: 'auto', // 'auto' | 'anthropic' | 'openai' | 'google'
};

// In Node.js, load analyzer directly. In browser, loaded via script tags or import.
let analyzerModule, dashboardModule;
if (IS_NODE) {
    analyzerModule = require('./analyzer');
    dashboardModule = require('./ui/dashboard');
}

/**
 * Auto-detect provider from ST settings.
 * Reads oai_settings.chat_completion_source or equivalent.
 */
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

/**
 * Get the current preset data in the format our analyzer expects.
 * Reads from ST globals (oai_settings).
 */
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

/**
 * Get extension settings, creating defaults if needed.
 */
function getSettings() {
    if (IS_NODE) return Object.assign({}, defaultSettings);
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

/**
 * Run analysis on the current preset and update the UI.
 * Can also accept a preset directly for testing.
 * @param {Object} [presetOverride] - Optional preset to analyze instead of current
 * @param {Object} [optionsOverride] - Optional options override
 * @returns {{ findings: Array, score: number, summary: Object } | null}
 */
function runAnalysis(presetOverride, optionsOverride) {
    const preset = presetOverride || getCurrentPreset();
    if (!preset) {
        console.warn('[Cache Analyzer] No preset data available');
        return null;
    }

    const settings = getSettings();
    const provider = optionsOverride?.provider
        || (settings.provider === 'auto' ? detectProvider() : settings.provider);

    const analyze = IS_NODE
        ? analyzerModule.analyze
        : (window.cacheAnalyzer && window.cacheAnalyzer.analyze);

    if (!analyze) {
        console.error('[Cache Analyzer] Analyzer not loaded');
        return null;
    }

    const results = analyze(preset, { provider });

    // Update dashboard if available (browser only)
    if (!IS_NODE && typeof dashboardModule !== 'undefined' && dashboardModule) {
        dashboardModule.updateDashboard(results);
    }

    return results;
}

/**
 * Register slash commands with SillyTavern's command parser.
 */
function registerSlashCommands() {
    try {
        if (typeof SlashCommandParser === 'undefined') return;

        SlashCommandParser.addCommandObject({
            name: 'cache-analyze',
            callback: async function () {
                runAnalysis();
                return '';
            },
            helpString: 'Run cache analysis on current preset',
        });

        SlashCommandParser.addCommandObject({
            name: 'cache-score',
            callback: async function () {
                var results = runAnalysis();
                if (!results) return 'No preset loaded';
                return 'Cache Efficiency Score: ' + results.score + '/100 (' +
                    results.summary.critical + ' critical, ' +
                    results.summary.warning + ' warnings, ' +
                    results.summary.info + ' info)';
            },
            helpString: 'Quick cache efficiency score check',
        });
    } catch (e) {
        console.warn('[Cache Analyzer] Could not register slash commands:', e);
    }
}

/**
 * Extension init — called by ST when extension loads.
 */
async function init() {
    var settings = getSettings();

    // Inject UI panel into ST extensions area
    if (!IS_NODE) {
        var panelContainer = document.getElementById('extensions_settings');
        if (panelContainer) {
            var wrapper = document.createElement('div');
            wrapper.classList.add('cache-analyzer');
            wrapper.id = 'cache-analyzer-root';
            panelContainer.appendChild(wrapper);

            // dashboardModule loaded via script tag or dynamic import
            if (dashboardModule && dashboardModule.initDashboard) {
                dashboardModule.initDashboard(wrapper, function () { runAnalysis(); });
            }
        }
    }

    // Register auto-analyze events
    if (settings.autoAnalyze && typeof eventSource !== 'undefined' && typeof event_types !== 'undefined') {
        eventSource.on(event_types.OAI_PRESET_CHANGED, function () { runAnalysis(); });
        eventSource.on(event_types.SETTINGS_UPDATED, function () { runAnalysis(); });
    }

    // Register slash commands
    registerSlashCommands();

    console.log('[Cache Analyzer] Extension loaded');
}

// CommonJS exports for Node.js / test environment
if (IS_NODE) {
    module.exports = {
        MODULE_NAME,
        defaultSettings,
        detectProvider,
        getCurrentPreset,
        runAnalysis,
        getSettings,
        registerSlashCommands,
        init,
    };
}
