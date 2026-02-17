// rules/token-thresholds.js
// Checks if the stable prefix falls below provider cache activation thresholds.

const DYNAMIC_MACRO_REGEX = /\{\{(random|roll|time|date|weekday|isotime|isodate|idle_duration|time_UTC)(::|\}\})/gi;

const VOLATILE_IDENTIFIERS = new Set([
    'chatHistory',
    'dialogueExamples'
]);

const THRESHOLDS = {
    anthropic: 1024,
    openai: 1024,
    google: 4096
};

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

function checkTokenThresholds(preset, options = {}) {
    const findings = [];

    if (!preset || !preset.prompts || !preset.prompt_order) {
        return findings;
    }

    const provider = options.provider || 'anthropic';
    const threshold = THRESHOLDS[provider] || THRESHOLDS.anthropic;
    const tokenizer = options.tokenizer || defaultTokenizer;

    // Get the prompt order array — handle the nested character_id structure
    let orderArray = preset.prompt_order;
    if (Array.isArray(orderArray) && orderArray.length > 0 && orderArray[0].order) {
        orderArray = orderArray[0].order;
    }

    // Filter to only enabled entries
    const enabledEntries = orderArray.filter(entry => entry.enabled);

    // Build a lookup map from identifier to prompt content
    const promptMap = {};
    for (const prompt of preset.prompts) {
        promptMap[prompt.identifier] = prompt;
    }

    // Collect stable entry content only
    const stableContent = [];
    for (const entry of enabledEntries) {
        const prompt = promptMap[entry.identifier];
        const content = prompt ? prompt.content : '';
        if (!isVolatile(entry.identifier, content)) {
            if (content) {
                stableContent.push(content);
            }
        }
    }

    const concatenated = stableContent.join('\n');
    const estimatedTokens = tokenizer(concatenated);

    if (estimatedTokens >= threshold) {
        return findings;
    }

    // Determine severity based on how far below threshold
    const ratio = estimatedTokens / threshold;
    let severity;
    if (ratio >= 0.9) {
        // Within 10% below threshold
        severity = 'warning';
    } else if (ratio >= 0.8) {
        // Within 20% below threshold
        severity = 'info';
    } else {
        // More than 20% below
        severity = 'info';
    }

    findings.push({
        id: `token-thresholds-${provider}`,
        rule: 'token-thresholds',
        severity: severity,
        title: `Stable prefix below ${provider} cache threshold`,
        description: `The stable prefix is estimated at ${estimatedTokens} tokens, which is below the ${provider} caching threshold of ${threshold} tokens. The prompt prefix will not be cached, resulting in full re-processing on every request.`,
        affectedEntry: 'all',
        recommendation: `Add more static content to your prompt entries before the chat history, or consolidate prompt entries to reach at least ${threshold} tokens in the stable prefix.`,
        provider: provider,
        meta: {
            estimatedTokens: estimatedTokens,
            threshold: threshold,
            deficit: threshold - estimatedTokens,
            ratio: ratio
        }
    });

    return findings;
}

function defaultTokenizer(text) {
    return Math.ceil(text.length / 4);
}

if (typeof module !== 'undefined') module.exports = { checkTokenThresholds };
