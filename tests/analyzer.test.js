// tests/analyzer.test.js — Integration tests for the full analysis engine

const { analyze, calculateScore } = require('../analyzer');

const presetGood = require('./fixtures/preset-good.json');
const presetBadMacros = require('./fixtures/preset-bad-macros.json');
const presetBadOrdering = require('./fixtures/preset-bad-ordering.json');
const presetThresholdMiss = require('./fixtures/preset-threshold-miss.json');
const presetDeepInjection = require('./fixtures/preset-deep-injection.json');
const presetRealComplex = require('./fixtures/preset-real-complex.json');

describe('Analyzer Integration', function () {
    it('should return high score for clean preset with no critical findings', function () {
        const results = analyze(presetGood, { provider: 'anthropic' });
        expect(results.score).toBeGreaterThan(80);
        expect(results.summary.critical).toBe(0);
    });

    it('should find critical issues in bad macros preset', function () {
        const results = analyze(presetBadMacros, { provider: 'anthropic' });
        expect(results.summary.critical).toBeGreaterThan(0);
        expect(results.score).toBeLessThan(80);
    });

    it('should aggregate findings from multiple rule categories', function () {
        const results = analyze(presetBadMacros, { provider: 'anthropic' });
        const rules = [];
        for (var i = 0; i < results.findings.length; i++) {
            var rule = results.findings[i].rule;
            if (rules.indexOf(rule) === -1) rules.push(rule);
        }
        expect(rules.length).toBeGreaterThan(1);
        expect(rules).toContain('macro-placement');
    });

    it('should calculate score correctly from findings', function () {
        expect(calculateScore([])).toBe(100);
        expect(calculateScore([{ severity: 'critical' }])).toBe(80);
        expect(calculateScore([{ severity: 'warning' }])).toBe(90);
        expect(calculateScore([{ severity: 'info' }])).toBe(97);
        expect(calculateScore([
            { severity: 'critical' },
            { severity: 'critical' },
            { severity: 'warning' },
            { severity: 'info' }
        ])).toBe(47);
    });

    it('should clamp score to 0 minimum', function () {
        const manyFindings = [];
        for (var i = 0; i < 10; i++) manyFindings.push({ severity: 'critical' });
        expect(calculateScore(manyFindings)).toBe(0);
    });

    it('should return properly structured results', function () {
        const results = analyze(presetGood, { provider: 'anthropic' });
        expect(typeof results.score).toBe('number');
        expect(Array.isArray(results.findings)).toBe(true);
        expect(typeof results.summary.critical).toBe('number');
        expect(typeof results.summary.warning).toBe('number');
        expect(typeof results.summary.info).toBe('number');
    });

    it('should find injection issues in deep injection preset', function () {
        const results = analyze(presetDeepInjection, { provider: 'anthropic' });
        const injectionFindings = results.findings.filter(function (f) { return f.rule === 'injection-depth'; });
        expect(injectionFindings.length).toBeGreaterThan(0);
    });

    it('should find ordering issues in bad ordering preset', function () {
        const results = analyze(presetBadOrdering, { provider: 'anthropic' });
        const orderFindings = results.findings.filter(function (f) { return f.rule === 'prompt-ordering'; });
        expect(orderFindings.length).toBeGreaterThan(0);
    });
});

describe('Real-World Preset: Complex RP Preset', function () {
    it('should handle 14 prompt entries without error', function () {
        const results = analyze(presetRealComplex, { provider: 'anthropic' });
        expect(typeof results.score).toBe('number');
        expect(results.score).toBeGreaterThan(-1);
        expect(results.score).toBeLessThan(101);
    });

    it('should complete analysis in under 100ms', function () {
        const start = Date.now();
        analyze(presetRealComplex, { provider: 'anthropic' });
        const elapsed = Date.now() - start;
        expect(elapsed).toBeLessThan(100);
    });

    it('should detect Anti-429 random macros when entry is enabled', function () {
        const modified = JSON.parse(JSON.stringify(presetRealComplex));
        var anti429 = modified.prompts.find(function (p) { return p.identifier === 'anti429'; });
        anti429.enabled = true;
        var order = modified.prompt_order[0].order;
        var orderEntry = order.find(function (o) { return o.identifier === 'anti429'; });
        orderEntry.enabled = true;

        const results = analyze(modified, { provider: 'anthropic' });
        const macroFindings = results.findings.filter(function (f) { return f.rule === 'macro-placement'; });
        expect(macroFindings.length).toBeGreaterThan(0);
    });

    it('should recognize squash_system_messages as positive', function () {
        const results = analyze(presetRealComplex, { provider: 'anthropic' });
        const squashFindings = results.findings.filter(function (f) {
            return f.description && f.description.toLowerCase().indexOf('squash') !== -1;
        });
        expect(squashFindings.length).toBeGreaterThan(0);
    });

    it('should flag shallow injection depth for context reminder', function () {
        const results = analyze(presetRealComplex, { provider: 'anthropic' });
        const injectionFindings = results.findings.filter(function (f) { return f.rule === 'injection-depth'; });
        expect(injectionFindings.length).toBeGreaterThan(0);
        var reminderFinding = injectionFindings.find(function (f) { return f.affectedEntry === 'reminderPrompt'; });
        expect(typeof reminderFinding).toBe('object');
    });

    it('should detect volatile interleaving from dialogueExamples', function () {
        const results = analyze(presetRealComplex, { provider: 'anthropic' });
        const orderFindings = results.findings.filter(function (f) { return f.rule === 'prompt-ordering'; });
        expect(orderFindings.length).toBeGreaterThan(0);
    });

    it('should produce different results for different providers', function () {
        const anthropic = analyze(presetRealComplex, { provider: 'anthropic' });
        const openai = analyze(presetRealComplex, { provider: 'openai' });

        var anthropicProviderFindings = anthropic.findings.filter(function (f) { return f.rule === 'provider-specific'; });
        var openaiProviderFindings = openai.findings.filter(function (f) { return f.rule === 'provider-specific'; });

        expect(anthropicProviderFindings.length).toBeGreaterThan(0);
        expect(openaiProviderFindings.length).toBeGreaterThan(0);
    });

    it('should not flag disabled anti429 entry', function () {
        const results = analyze(presetRealComplex, { provider: 'anthropic' });
        var anti429Findings = results.findings.filter(function (f) {
            return f.meta && f.meta.macroFound && (
                f.meta.macroFound.indexOf('random') !== -1 ||
                f.meta.macroFound.indexOf('time') !== -1 ||
                f.meta.macroFound.indexOf('date') !== -1
            );
        });
        expect(anti429Findings.length).toBe(0);
    });
});

describe('Index Module', function () {
    it('should export all required functions', function () {
        const index = require('../index');
        expect(typeof index.init).toBe('function');
        expect(typeof index.runAnalysis).toBe('function');
        expect(typeof index.detectProvider).toBe('function');
        expect(typeof index.getSettings).toBe('function');
        expect(typeof index.registerSlashCommands).toBe('function');
    });

    it('should have correct default settings', function () {
        const index = require('../index');
        expect(index.defaultSettings.enabled).toBe(true);
        expect(index.defaultSettings.autoAnalyze).toBe(true);
        expect(index.defaultSettings.provider).toBe('auto');
    });

    it('should run analysis with preset override', function () {
        const index = require('../index');
        const results = index.runAnalysis(presetGood, { provider: 'anthropic' });
        expect(typeof results.score).toBe('number');
        expect(results.summary.critical).toBe(0);
    });

    it('should return null when no preset is available', function () {
        const index = require('../index');
        const results = index.runAnalysis();
        expect(results).toBe(null);
    });

    it('should detect anthropic as default provider in Node env', function () {
        const index = require('../index');
        expect(index.detectProvider()).toBe('anthropic');
    });

    it('should have correct MODULE_NAME', function () {
        const index = require('../index');
        expect(index.MODULE_NAME).toBe('cache_analyzer');
    });
});
