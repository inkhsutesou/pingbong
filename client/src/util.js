import { route } from 'preact-router';

let runningInBg = false;

/**
 * @param {string} url
 * @param {boolean} replace
 */
export function fixedRoute(url, replace = false) {
    route(`/pingbong${url}`, replace);
}

/**
 * Convert match time nr to string.
 * @param {number} nr
 * @returns {string}
 */
export function matchTimeStrFromNr(nr) {
    if(nr === 0) return '02:30';
    return '05:00';
}

/**
 * Clamp a numeric value
 * @param {number} v Value
 * @param {number} l Lower bound
 * @param {number} u Upper bound
 */
export function clamp(v, l, u) {
    if(v < l) return l;
    if(v > u) return u;
    return v;
}

/**
 * Loop a value t, such that it's never > l || < 0
 * @param {number} t 
 * @param {number} l 
 */
export function repeat(t, l) {
    return clamp(t - Math.floor(t / l) * l, 0, l);
}

/**
 * Init utils.
 */
export function initUtils() {
    window.addEventListener('blur', _e => runningInBg = true);
    window.addEventListener('focus', _e => runningInBg = false);
}

/**
 * @return {boolean}
 */
export function isRunningInBg() {
    return runningInBg;
}

/**
 * Hue from RGB
 * @param {number} r 
 * @param {number} g 
 * @param {number} b 
 * @return {number}
 */
export function hueFromRgb(r, g, b) {
    const min = Math.min(r, g, b);
    const max = Math.max(r, g, b);

    if(min === max) return 0;

    let hue = 0;
    if(max === r) {
        hue = (g - b) / (max - min);
    } else if(max === g) {
        hue = 2 + (b - r) / (max - min);
    } else /* if(max === b) */ {
        hue = 4 + (r - g) / (max - min);
    }

    hue *= 60;
    if(hue < 0) hue += 360;

    return Math.round(hue);
}

/**
 * @return {boolean}
 */
export function isLikelyMobile() {
    return 'ontouchstart' in window || window['TouchEvent'];
}

/**
 * @param {HTMLElement} e 
 * @param {*} t 
 */
export function updatetextContent(e, t) {
    // Type juggling is intended.
    if(e.textContent != t) e.textContent = t;
}

/**
 * Get minutes display
 * @param {number} s 
 * @return {string}
 */
export function getMinutes(s) {
    return (Math.floor(s / 60).toString()).padStart(2, '0');
}

/**
 * Get seconds display
 * @param {number} s 
 * @return {string}
 */
export function getSeconds(s) {
    return (s % 60).toString().padStart(2, '0');
}

/**
 * @return {boolean}
 */
export function browserHasVerySlowTextureUpload() {
    return !!window['netscape'];
}
