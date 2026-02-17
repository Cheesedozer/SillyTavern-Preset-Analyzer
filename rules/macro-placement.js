// rules/macro-placement.js
// Checks for dynamic macros placed in early prompt positions that would
// invalidate the cached prefix.

const DYNAMIC_MACRO_REGEX = /\{\{(random|roll|time|date|weekday|isotime|isodate|idle_duration|time_UTC)(::|\}\})/gi;

function checkMacroPlacement(preset, options = {}) {
    const findings = [];

    if (!preset || !preset.prompts || !preset.prompt_order) {
        return findings;
    }

    // Get the prompt order array — handle the nested character_id structure
    let orderArray = preset.prompt_order;
    if (Array.isArray(orderArray) && orderArray.length > 0 && orderArray[0].order) {
        orderArray = orderArray[0].order;
    }

    // Filter to only enabled entries in prompt_order
    const enabledEntries = orderArray.filter(entry => entry.enabled);
    const totalEntries = enabledEntries.length;

    if (totalEntries === 0) {
        return findings;
    }

    // Build a lookup map from identifier to prompt content
    const promptMap = {};
    for (const prompt of preset.prompts) {
        promptMap[prompt.identifier] = prompt;
    }

    // For each enabled entry in order, scan for dynamic macros
    for (let entryIndex = 0; entryIndex < enabledEntries.length; entryIndex++) {
        const entry = enabledEntries[entryIndex];
        const prompt = promptMap[entry.identifier];

        if (!prompt || !prompt.content) {
            continue;
        }

        // Reset regex lastIndex since we reuse it
        DYNAMIC_MACRO_REGEX.lastIndex = 0;

        let match;
        let macroIndex = 0;

        while ((match = DYNAMIC_MACRO_REGEX.exec(prompt.content)) !== null) {
            const macroFound = `{{${match[1]}}}`;
            const positionPercent = entryIndex / totalEntries;

            // Assign severity
            let severity;
            if (entryIndex === 0) {
                severity = 'critical';
            } else if (positionPercent < 0.4) {
                severity = 'warning';
            } else {
                severity = 'info';
            }

            const entryName = prompt.name || entry.identifier;

            findings.push({
                id: `macro-placement-${entryIndex}-${macroIndex}`,
                rule: 'macro-placement',
                severity: severity,
                title: `Dynamic macro in ${severity === 'critical' ? 'system prompt' : 'early prompt section'}`,
                description: `${macroFound} found in "${entryName}" (position ${entryIndex + 1} of ${totalEntries}). This changes every generation and invalidates the cached prefix for all content after it.`,
                affectedEntry: entry.identifier,
                recommendation: `Move ${macroFound} to a prompt entry in the latter half of the prompt order (after chat history), or replace it with a fixed value.`,
                provider: 'all',
                meta: {
                    macroFound: macroFound,
                    position: entryIndex,
                    totalEntries: totalEntries,
                    positionPercent: positionPercent
                }
            });

            macroIndex++;
        }
    }

    return findings;
}

if (typeof module !== 'undefined') module.exports = { checkMacroPlacement };
