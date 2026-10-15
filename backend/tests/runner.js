'use strict';

/** Minimal test runner (no test framework is installed in this project). */

function ok(condition, message) {
    if (!condition) throw new Error(message || 'Assertion failed');
}

function includes(text, needle, label) {
    const t = String(text || '');
    const n = String(needle);
    if (!t.toLowerCase().includes(n.toLowerCase())) {
        throw new Error(`${label || 'Reply'} should contain "${n}". Was: ${JSON.stringify(t.slice(0, 300))}`);
    }
}

function notIncludes(text, needle, label) {
    const t = String(text || '');
    const n = String(needle);
    if (t.toLowerCase().includes(n.toLowerCase())) {
        throw new Error(`${label || 'Reply'} should NOT contain "${n}". Was: ${JSON.stringify(t.slice(0, 300))}`);
    }
}

function matches(text, regex, label) {
    if (!regex.test(String(text || ''))) {
        throw new Error(`${label || 'Reply'} should match ${regex}. Was: ${JSON.stringify(String(text).slice(0, 300))}`);
    }
}

function equal(actual, expected, label) {
    if (actual !== expected) {
        throw new Error(`${label || 'Value'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
}

function closeTo(actual, expected, tol, label) {
    if (!(Math.abs(Number(actual) - Number(expected)) <= (tol ?? 0.01))) {
        throw new Error(`${label || 'Number'}: expected ~${expected} (±${tol}), got ${actual}`);
    }
}

function createRunner(suiteName) {
    const results = [];
    let currentGroup = '';

    async function group(name, fn) {
        currentGroup = name;
        console.log(`\n=== ${suiteName} — ${name} ===`);
        await fn();
    }

    async function test(name, fn) {
        const started = Date.now();
        try {
            await fn();
            results.push({ name, ok: true });
            console.log(`  [PASS] ${name} (${Date.now() - started}ms)`);
        } catch (err) {
            results.push({ name, ok: false, error: err.message });
            console.log(`  [FAIL] ${name} — ${err.message}`);
        }
    }

    function summary() {
        const passed = results.filter(r => r.ok).length;
        const failed = results.length - passed;
        console.log(`\n--- ${suiteName}: ${passed} passed, ${failed} failed, ${results.length} total ---`);
        if (failed) {
            console.log('Failed cases:');
            results.filter(r => !r.ok).forEach(r => console.log(`  · ${r.name}: ${r.error}`));
        }
        return { passed, failed, total: results.length };
    }

    return { group, test, summary, results, ok, includes, notIncludes, matches, equal, closeTo };
}

module.exports = { createRunner, ok, includes, notIncludes, matches, equal, closeTo };
