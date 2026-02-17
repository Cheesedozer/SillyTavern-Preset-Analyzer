// rules/provider-specific.js
// Provider-specific cache behavior checks.

const VOLATILE_IDENTIFIERS = new Set([
    'chatHistory',
    'dialogueExamples'
]);

const DYNAMIC_MACRO_REGEX = /\{\{(random|roll|time|date|weekday|isotime|isodate|idle_duration|time_UTC)(::|\}\})/gi;

function isVolatile(identifier, content) {
    if (VOLATILE_IDENTIFIERS.has(identifier)) return true;
    if (content) {
        DYNAMIC_MACRO_REGEX.lastIndex = 0;
        if (DYNAMIC_MACRO_REGEX.test(content)) return true;
    }
    return false;
}

function getStablePrefixTokens(preset, tokenizer) {
    let orderArray = preset.prompt_order;
    if (Array.isArray(orderArray) && orderArray.length > 0 && orderArray[0].order) {
        orderArray = orderArray[0].order;
    }

    const enabledEntries = orderArray.filter(entry => entry.enabled);
    const promptMap = {};
    for (const prompt of preset.prompts) {
        promptMap[prompt.identifier] = prompt;
    }

    const stableContent = [];
    for (const entry of enabledEntries) {
        const prompt = promptMap[entry.identifier];
        const content = prompt ? prompt.content : '';
        if (!isVolatile(entry.identifier, content) && content) {
            stableContent.push(content);
        }
    }

    const concatenated = stableContent.join('\n');
    return tokenizer(concatenated);
}

function defaultTokenizer(text) {
    return Math.ceil(text.length / 4);
}

function checkProviderSpecific(preset, options = {}) {
    const findings = [];

    if (!preset || !preset.prompts || !preset.prompt_order) {
        return findings;
    }

    const provider = options.provider;
    if (!provider) return findings;

    if (provider === 'anthropic') {
        return checkAnthropic(preset, options);
    } else if (provider === 'openai') {
        return checkOpenAI(preset, options);
    } else if (provider === 'google') {
        return checkGoogle(preset, options);
    }

    return findings;
}

function checkAnthropic(preset, options) {
    const findings = [];
    const tokenizer = options.tokenizer || defaultTokenizer;

    // Get enabled entries
    let orderArray = preset.prompt_order;
    if (Array.isArray(orderArray) && orderArray.length > 0 && orderArray[0].order) {
        orderArray = orderArray[0].order;
    }
    const enabledIdentifiers = new Set(
        orderArray.filter(e => e.enabled).map(e => e.identifier)
    );

    // Count system role prompts
    const systemPrompts = preset.prompts.filter(p =>
        p.enabled && p.role === 'system' && enabledIdentifiers.has(p.identifier)
    );

    if (systemPrompts.length > 1) {
        if (preset.squash_system_messages === true) {
            findings.push({
                id: 'provider-specific-anthropic-squash-on',
                rule: 'provider-specific',
                severity: 'info',
                title: 'System message squashing enabled',
                description: `squash_system_messages is enabled with ${systemPrompts.length} system prompts. This consolidates them into a single system message, which is optimal for Anthropic prompt caching.`,
                affectedEntry: 'all',
                recommendation: 'No action needed — this is the recommended configuration for Anthropic caching.',
                provider: 'anthropic',
                meta: {
                    systemPromptCount: systemPrompts.length,
                    squashEnabled: true
                }
            });
        } else {
            findings.push({
                id: 'provider-specific-anthropic-squash-off',
                rule: 'provider-specific',
                severity: 'warning',
                title: 'Fragmented system messages without squashing',
                description: `${systemPrompts.length} separate system prompts detected but squash_system_messages is not enabled. Anthropic treats each system message as a separate cache-breaking boundary.`,
                affectedEntry: 'all',
                recommendation: 'Enable squash_system_messages in your preset settings to consolidate system prompts into a single message for better cache utilization.',
                provider: 'anthropic',
                meta: {
                    systemPromptCount: systemPrompts.length,
                    squashEnabled: false
                }
            });
        }
    }

    return findings;
}

function checkOpenAI(preset, options) {
    const findings = [];
    const tokenizer = options.tokenizer || defaultTokenizer;
    const estimatedTokens = getStablePrefixTokens(preset, tokenizer);

    // Check 128-token alignment
    const remainder = estimatedTokens % 128;
    if (remainder !== 0) {
        const padding = 128 - remainder;
        findings.push({
            id: 'provider-specific-openai-alignment',
            rule: 'provider-specific',
            severity: 'info',
            title: 'Stable prefix not aligned to 128-token boundary',
            description: `The stable prefix is estimated at ${estimatedTokens} tokens (remainder ${remainder} when divided by 128). OpenAI caches at 128-token boundaries, so ${padding} tokens are wasted in the current boundary.`,
            affectedEntry: 'all',
            recommendation: `Consider adding ~${padding} tokens of static content to align your prefix to the next 128-token boundary for optimal cache utilization.`,
            provider: 'openai',
            meta: {
                estimatedTokens: estimatedTokens,
                remainder: remainder,
                paddingNeeded: padding
            }
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
            id: 'provider-specific-google-threshold',
            rule: 'provider-specific',
            severity: 'warning',
            title: 'Stable prefix below Google caching threshold',
            description: `The stable prefix is estimated at ${estimatedTokens} tokens, below Google's ${threshold}-token minimum for context caching. The prefix will not be cached.`,
            affectedEntry: 'all',
            recommendation: `Add more static content to reach at least ${threshold} tokens in your stable prefix for Google context caching to activate.`,
            provider: 'google',
            meta: {
                estimatedTokens: estimatedTokens,
                threshold: threshold,
                deficit: threshold - estimatedTokens
            }
        });
    }

    return findings;
}

if (typeof module !== 'undefined') module.exports = { checkProviderSpecific };
