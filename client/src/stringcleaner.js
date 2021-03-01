const badWordsRegex = (function() {
    const commonReplacements = new Map;
    commonReplacements.set('a', '4');
    commonReplacements.set('g', '6');
    commonReplacements.set('s', '5');
    commonReplacements.set('z', '2');
    commonReplacements.set('e', '3');
    commonReplacements.set('i', '1');
    commonReplacements.set('o', '0');
    const badWords = [
        'anal',
        'anus',
        'asshole',
        'bitch',
        'blowjob',
        'boobs',
        'breast',
        'clit',
        'cocaine',
        'cock',
        'condom',
        'cum',
        'cunt',
        'dick',
        'dildo',
        'doggystyle',
        'ejaculate',
        'faggot',
        'fetish',
        'foreskin',
        'fuck',
        'gangbang',
        'handjob',
        'hooker',
        'jackoff',
        'jizz',
        'masturbate',
        'meatspin',
        'nigger',
        'nigga',
        'nutsack',
        'orgasm',
        'orgy',
        'penis',
        'porn',
        'prositute',
        'pussy',
        'rape',
        'retard',
        'rimjob',
        'scrotum',
        'semen',
        'sexual',
        'sex',
        'slut',
        'sperm',
        'testical',
        'testicle',
        'threesome',
        'tits',
        'twat',
        'vagina',
        'vulva',
        'whore',
    ];
    return new RegExp(badWords.map(word => {
        const result = [];
        let last = void 0;
        for(let i = 0; i < word.length; ++i) {
            const current = word[i];
            if(last === current) {
                result[result.length - 1] = '{2,}';
            } else {
                const replacement = commonReplacements.get(current);
                if (replacement) {
                    result.push(`(${current}[ ]*|${replacement}[ ]*)`);
                } else {
                    result.push(`(${current}[ ]*)`);
                }
                result.push('+');
                last = current;
            }
        }
        result.pop();
        return result.join('');
    }).join('|'), 'gi');
})();
const normalWords = [
    'cat',
    'dog',
    'sofa',
    'couch',
    'water',
    'lemonade',
    'apple',
    'mango',
    'party',
    'angel',
    'come',
    'piano',
    'guitar',
];

/**
 * @param {string} s
 * @return {string}
 */
export function cleanString(s) {
    return s.replace(badWordsRegex, x => {
        // Calculate (bad) hash
        let h = 0;
        for(let i = 0; i < x.length; ++i) {
            h = Math.imul(h, 31) + x.charCodeAt(i)|0;
        }
        // Replace with friendlier word.
        return normalWords[Math.abs(h) % normalWords.length];
    });
}
