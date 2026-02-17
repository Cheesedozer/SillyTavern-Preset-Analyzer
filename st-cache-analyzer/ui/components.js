// ui/components.js — Render functions for cache analyzer UI components

function getScoreLabel(score) {
    if (score >= 90) return { label: 'Excellent', class: 'ca-score-excellent' };
    if (score >= 70) return { label: 'Good', class: 'ca-score-good' };
    if (score >= 50) return { label: 'Needs Work', class: 'ca-score-needswork' };
    return { label: 'Poor', class: 'ca-score-poor' };
}

function getSeverityIcon(severity) {
    switch (severity) {
        case 'critical': return '\u26D4';
        case 'warning':  return '\u26A0\uFE0F';
        case 'info':     return '\u2139\uFE0F';
        default:         return '\u2022';
    }
}

function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function renderScoreBar(score) {
    const info = getScoreLabel(score);
    return `
        <div class="ca-score-section">
            <div class="ca-score-header">
                <span class="ca-score-label ${info.class}">${score}</span>
                <span class="ca-score-descriptor">${info.label}</span>
            </div>
            <div class="ca-score-bar">
                <div class="ca-score-bar-fill ${info.class}" style="width: ${score}%"></div>
            </div>
        </div>`;
}

function renderSummaryPills(summary) {
    const pills = [];
    if (summary.critical > 0) {
        pills.push(`<span class="ca-pill ca-pill-critical">\u26D4 ${summary.critical} Critical</span>`);
    }
    if (summary.warning > 0) {
        pills.push(`<span class="ca-pill ca-pill-warning">\u26A0\uFE0F ${summary.warning} Warning</span>`);
    }
    if (summary.info > 0) {
        pills.push(`<span class="ca-pill ca-pill-info">\u2139\uFE0F ${summary.info} Info</span>`);
    }
    if (pills.length === 0) {
        pills.push(`<span class="ca-pill" style="background: rgba(68,204,68,0.15); color: #44CC44;">\u2705 No issues</span>`);
    }
    return `<div class="ca-summary-pills">${pills.join('')}</div>`;
}

function renderFindingCard(finding) {
    const icon = getSeverityIcon(finding.severity);
    const severityClass = finding.severity;
    return `
        <div class="ca-finding-card ca-finding-${severityClass}">
            <div class="ca-finding-header">
                <span class="ca-severity-badge ca-badge-${severityClass}">${icon} ${finding.severity}</span>
                <span class="ca-finding-title">${escapeHtml(finding.title)}</span>
            </div>
            <div class="ca-finding-desc">${escapeHtml(finding.description)}</div>
            <div class="ca-finding-rec">\uD83D\uDCA1 ${escapeHtml(finding.recommendation)}</div>
            <div class="ca-finding-meta">${escapeHtml(finding.rule)} \u2022 ${escapeHtml(finding.affectedEntry)}</div>
        </div>`;
}

function renderFindingsList(findings) {
    if (!findings || findings.length === 0) {
        return `<div class="ca-findings-list">
            <div class="ca-empty-state">
                <div class="ca-empty-icon">\u2705</div>
                <div class="ca-empty-text">No issues found</div>
                <div class="ca-empty-subtext">Your preset looks cache-friendly!</div>
            </div>
        </div>`;
    }
    // Sort: critical first, then warning, then info
    const order = { critical: 0, warning: 1, info: 2 };
    const sorted = [...findings].sort((a, b) => (order[a.severity] || 3) - (order[b.severity] || 3));
    return `<div class="ca-findings-list">${sorted.map(f => renderFindingCard(f)).join('')}</div>`;
}

function renderPromptViz(orderedEntries) {
    if (!orderedEntries || orderedEntries.length === 0) return '';

    const volatileIds = new Set(['chatHistory', 'dialogueExamples']);
    const rows = orderedEntries.map(entry => {
        const isVolatile = volatileIds.has(entry.identifier);
        const dotClass = entry.flagged ? 'ca-dot-flagged' : (isVolatile ? 'ca-dot-volatile' : 'ca-dot-stable');
        const tagClass = isVolatile ? 'ca-tag-volatile' : 'ca-tag-stable';
        const tagText = isVolatile ? 'volatile' : 'stable';
        const name = escapeHtml(entry.name || entry.identifier);
        return `
            <div class="ca-prompt-entry">
                <div class="ca-prompt-dot ${dotClass}"></div>
                <span class="ca-prompt-name">${name}</span>
                <span class="ca-prompt-tag ${tagClass}">${tagText}</span>
            </div>`;
    });

    return `
        <div class="ca-prompt-viz">
            <div class="ca-prompt-viz-title">Prompt Order</div>
            ${rows.join('')}
        </div>`;
}

function renderEmptyState() {
    return `
        <div class="ca-empty-state">
            <div class="ca-empty-icon">\uD83D\uDD25</div>
            <div class="ca-empty-text">Click Analyze to scan your preset</div>
            <div class="ca-empty-subtext">Check for cache efficiency issues across all providers</div>
        </div>`;
}

function renderLoadingState() {
    return `
        <div class="ca-loading-state">
            <div class="ca-loading-dots">
                <div class="ca-loading-dot"></div>
                <div class="ca-loading-dot"></div>
                <div class="ca-loading-dot"></div>
            </div>
            <div class="ca-loading-text">Analyzing preset...</div>
        </div>`;
}

function renderDashboard(results) {
    if (!results) return renderEmptyState();

    return `
        ${renderScoreBar(results.score)}
        ${renderSummaryPills(results.summary)}
        ${renderFindingsList(results.findings)}`;
}

if (typeof module !== 'undefined') {
    module.exports = {
        getScoreLabel,
        getSeverityIcon,
        escapeHtml,
        renderScoreBar,
        renderSummaryPills,
        renderFindingCard,
        renderFindingsList,
        renderPromptViz,
        renderEmptyState,
        renderLoadingState,
        renderDashboard,
    };
}
