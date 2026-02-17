// rules/injection-depth.js
// Checks for injection entries at shallow depths that disrupt the cache prefix.

const DYNAMIC_MACRO_REGEX = /\{\{(random|roll|time|date|weekday|isotime|isodate|idle_duration|time_UTC)(::|\}\})/gi;

function hasDynamicMacros(content) {
    if (!content) return false;
    DYNAMIC_MACRO_REGEX.lastIndex = 0;
    return DYNAMIC_MACRO_REGEX.test(content);
}

function checkInjectionDepth(preset, options = {}) {
    const findings = [];

    if (!preset || !preset.prompts || !preset.prompt_order) {
        return findings;
    }

    // Get the prompt order array — handle the nested character_id structure
    let orderArray = preset.prompt_order;
    if (Array.isArray(orderArray) && orderArray.length > 0 && orderArray[0].order) {
        orderArray = orderArray[0].order;
    }

    // Filter to only enabled entries
    const enabledIdentifiers = new Set(
        orderArray.filter(entry => entry.enabled).map(entry => entry.identifier)
    );

    // Check each enabled prompt with injection_position === 1 (in-chat injection)
    for (const prompt of preset.prompts) {
        if (!prompt.enabled) continue;
        if (!enabledIdentifiers.has(prompt.identifier)) continue;
        if (prompt.injection_position !== 1) continue;

        const depth = prompt.injection_depth;

        // Depth 4+ → no finding (deep enough to not disrupt prefix)
        if (depth === null || depth === undefined || depth >= 4) continue;

        const isDynamic = hasDynamicMacros(prompt.content);

        let severity;
        if (depth <= 1 && isDynamic) {
            // Dynamic content at depth 0-1 → critical
            severity = 'critical';
        } else if (depth <= 1) {
            // Static content at depth 0-1 → warning
            severity = 'warning';
        } else if (isDynamic) {
            // Dynamic content at depth 2-3 → warning
            severity = 'warning';
        } else {
            // Static content at depth 2-3 → info
            severity = 'info';
        }

        const entryName = prompt.name || prompt.identifier;

        findings.push({
            id: `injection-depth-${prompt.identifier}`,
            rule: 'injection-depth',
            severity: severity,
            title: `${isDynamic ? 'Dynamic' : 'Static'} content injected at shallow depth ${depth}`,
            description: `"${entryName}" is injected into chat at depth ${depth}${isDynamic ? ' with dynamic macros' : ''}. Shallow injections near the end of conversation disrupt the cacheable portion of recent messages.`,
            affectedEntry: prompt.identifier,
            recommendation: `Consider increasing the injection depth to 4+ or moving this content to a fixed prompt position to preserve cache efficiency.`,
            provider: 'all',
            meta: {
                depth: depth,
                injectionPosition: prompt.injection_position,
                hasDynamicContent: isDynamic
            }
        });
    }

    return findings;
}

if (typeof module !== 'undefined') module.exports = { checkInjectionDepth };
