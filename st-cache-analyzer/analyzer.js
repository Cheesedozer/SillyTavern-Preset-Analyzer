// analyzer.js — Main analysis engine
// Runs all rules against a preset and returns results.

const { checkMacroPlacement } = require('./rules/macro-placement');
const { checkPromptOrdering } = require('./rules/prompt-ordering');
const { checkTokenThresholds } = require('./rules/token-thresholds');
const { checkInjectionDepth } = require('./rules/injection-depth');
const { checkProviderSpecific } = require('./rules/provider-specific');

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
    for (const finding of findings) {
        switch (finding.severity) {
            case 'critical': score -= 20; break;
            case 'warning':  score -= 10; break;
            case 'info':     score -= 3;  break;
        }
    }
    return Math.max(0, Math.min(100, score));
}

// Phase 2 hook — leave for LLM analysis
function getPresetSummary(preset) {
    // TODO: Condensed representation for LLM analysis
    return { status: 'not-implemented' };
}

if (typeof module !== 'undefined') {
    module.exports = { analyze, calculateScore, getPresetSummary };
}
