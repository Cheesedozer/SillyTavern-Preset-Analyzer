// ui/dashboard.js — Panel assembly, event handling, state management

/**
 * Creates and manages the cache analyzer UI panel.
 *
 * Exports:
 *   initDashboard(container, onAnalyze) — Injects the panel into container element
 *   updateDashboard(results) — Renders analysis results
 *   showLoading() — Shows loading state
 *   showEmpty() — Shows empty/initial state
 */

// Import components if running in Node (for testing)
// In browser, components.js is loaded via script tag before this file
let components;
if (typeof module !== 'undefined' && typeof require === 'function') {
    components = require('./components');
} else if (typeof window !== 'undefined') {
    components = window;
}

let panelBody = null;
let analyzeBtn = null;
let panelEl = null;
let onAnalyzeCallback = null;

function createPanelHTML() {
    return `
        <div class="ca-panel" id="ca-panel">
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
                ${components.renderEmptyState()}
            </div>
        </div>`;
}

function initDashboard(container, onAnalyze) {
    if (!container) return;

    onAnalyzeCallback = onAnalyze || null;
    container.innerHTML = createPanelHTML();

    panelEl = container.querySelector('#ca-panel');
    panelBody = container.querySelector('#ca-body');
    analyzeBtn = container.querySelector('#ca-btn-analyze');

    // Header click toggles collapse
    const header = container.querySelector('#ca-header');
    header.addEventListener('click', function (e) {
        // Don't collapse when clicking the analyze button
        if (e.target.closest('.ca-btn-analyze')) return;
        panelEl.classList.toggle('collapsed');
    });

    // Analyze button click
    analyzeBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (onAnalyzeCallback) {
            showLoading();
            // Allow UI to update before running analysis
            setTimeout(function () {
                onAnalyzeCallback();
            }, 50);
        }
    });
}

function updateDashboard(results) {
    if (!panelBody) return;

    if (analyzeBtn) {
        analyzeBtn.classList.remove('ca-loading');
    }

    panelBody.innerHTML = components.renderDashboard(results);

    // Trigger score bar animation after render
    requestAnimationFrame(function () {
        const fill = panelBody.querySelector('.ca-score-bar-fill');
        if (fill) {
            fill.style.width = results.score + '%';
        }
    });
}

function showLoading() {
    if (!panelBody) return;
    if (analyzeBtn) {
        analyzeBtn.classList.add('ca-loading');
    }
    panelBody.innerHTML = components.renderLoadingState();
}

function showEmpty() {
    if (!panelBody) return;
    if (analyzeBtn) {
        analyzeBtn.classList.remove('ca-loading');
    }
    panelBody.innerHTML = components.renderEmptyState();
}

if (typeof module !== 'undefined') {
    module.exports = { initDashboard, updateDashboard, showLoading, showEmpty };
}
