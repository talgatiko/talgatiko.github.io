// @ts-check

const WINDOWS_DRIVE_PATH = /^[A-Za-z]:[\\/]/;

/**
 * Convert an absolute Windows drive path into a standards-compliant file URL.
 * This uses URL path-segment encoding without depending on the current host OS,
 * which also makes the conversion directly testable on non-Windows runners.
 * @param {string} specifier
 * @returns {string}
 */
export function toFileUrl(specifier) {
    const normalized = specifier.replaceAll('\\', '/');
    const match = /^([A-Za-z]:)\/(.*)$/.exec(normalized);
    if (!match) return specifier;
    const segments = match[2].split('/').map(segment => encodeURIComponent(segment));
    return `file:///${match[1]}/${segments.join('/')}`;
}

/**
 * Adapt only drive-letter absolute specifiers emitted by Teq DI on Windows.
 * @param {string} specifier
 * @param {object} context
 * @param {(specifier: string, context: object) => Promise<object>} nextResolve
 * @returns {Promise<object>}
 */
export async function resolve(specifier, context, nextResolve) {
    const normalized = process.platform === 'win32' && WINDOWS_DRIVE_PATH.test(specifier)
        ? toFileUrl(specifier)
        : specifier;
    return nextResolve(normalized, context);
}
