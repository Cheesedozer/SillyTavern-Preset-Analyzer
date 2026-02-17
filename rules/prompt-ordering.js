// rules/prompt-ordering.js
// Checks if volatile entries are interleaved between stable entries,
// which fragments the cacheable prefix.

const DYNAMIC_MACRO_REGEX = /\{\{(random|roll|time|date|weekday|isotime|isodate|idle_duration|time_UTC)(::|\}\})/gi;

const VOLATILE_IDENTIFIERS = new Set([
    'chatHistory',
    'dialogueExamples'
]);

function isVolatile(identifier, content) {
    if (VOLATILE_IDENTIFIERS.has(identifier)) {
        return true;
    }
    if (content) {
        DYNAMIC_MACRO_REGEX.lastIndex = 0;
        if (DYNAMIC_MACRO_REGEX.test(content)) {
            return true;
        }
    }
    return false;
}

function checkPromptOrdering(preset, options = {}) {
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
    const enabledEntries = orderArray.filter(entry => entry.enabled);

    if (enabledEntries.length === 0) {
        return findings;
    }

    // Build a lookup map from identifier to prompt content
    const promptMap = {};
    for (const prompt of preset.prompts) {
        promptMap[prompt.identifier] = prompt;
    }

    // Classify each entry as stable or volatile
    const classified = enabledEntries.map((entry, index) => {
        const prompt = promptMap[entry.identifier];
        const content = prompt ? prompt.content : '';
        const volatile = isVolatile(entry.identifier, content);
        return { entry, prompt, index, volatile };
    });

    // Find each volatile entry that has stable entries after it
    for (let i = 0; i < classified.length; i++) {
        if (!classified[i].volatile) continue;

        // Count stable entries that come after this volatile entry
        const stableAfter = [];
        for (let j = i + 1; j < classified.length; j++) {
            if (!classified[j].volatile) {
                stableAfter.push(classified[j]);
            }
        }

        // Only flag if there are 2+ stable entries after the volatile one
        // (a single trailing stable entry is common and usually not impactful)
        if (stableAfter.length < 2) continue;

        const volatileEntry = classified[i];
        const entryName = volatileEntry.prompt ? volatileEntry.prompt.name : volatileEntry.entry.identifier;
        const stableNames = stableAfter.map(s =>
            s.prompt ? s.prompt.name : s.entry.identifier
        );

        findings.push({
            id: `prompt-ordering-${i}`,
            rule: 'prompt-ordering',
            severity: 'warning',
            title: 'Volatile entry interleaved before stable content',
            description: `"${entryName}" (position ${i + 1}) is volatile and appears before ${stableAfter.length} stable entries (${stableNames.join(', ')}). This breaks the cacheable prefix — all stable content after this point cannot be cached together with earlier stable content.`,
            affectedEntry: volatileEntry.entry.identifier,
            recommendation: `Move "${entryName}" after all stable prompt entries so that the maximum amount of static content forms a contiguous cacheable prefix.`,
            provider: 'all',
            meta: {
                volatilePosition: i,
                stableEntriesAfter: stableAfter.length,
                stableIdentifiers: stableAfter.map(s => s.entry.identifier)
            }
        });
    }

    return findings;
}

if (typeof module !== 'undefined') module.exports = { checkPromptOrdering };
