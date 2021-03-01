import {SOUND_MANAGER} from "./components/app";

export const AH_YES_VERY_TACTICAL = {
    id: 0,
    name: 'Ah yes, very tactical',
    description: 'Your team gets an own goal',
};

export const GOLD = {
    id: 1,
    name: 'Gold',
    description: 'Get first place',
};

export const SILVER = {
    id: 2,
    name: 'Silver',
    description: 'Get second place',
};

export const BRONZE = {
    id: 3,
    name: 'Bronze',
    description: 'Get third place',
};

export const ITS_OVER = {
    id: 4,
    name: 'It\'s over',
    description: 'Get a score above 100',
};

export const POWERUP_EXPERIENCE = {
    id: 5,
    name: 'Power-up experience',
    description: 'Your team activates all power-ups in a single match',
};

export const LONG_LIVING = {
    id: 6,
    name: 'Long living',
    description: 'Let a ball survive for 25 hits',
};

export const MULTIPLAYER_CHAOS = {
    id: 7,
    name: 'Multiplayer chaos',
    description: 'Finish a game with more than 10 people',
};

export const MY_PARENTS_BELIEFS = {
    id: 8,
    name: 'My parents beliefs',
    description: 'Finish with exactly 0 points',
};

export const THE_ANSWER = {
    id: 9,
    name: 'The answer',
    description: 'Finish with exactly 42 points',
};

export const EXECUTE_ORDER = {
    id: 10,
    name: 'Execute order',
    description: 'Finish with exactly 66 points',
};

export const COMBO = {
    id: 11,
    name: 'Combo',
    description: 'Score 10 goals in a row as a team without letting a ball past your lines',
};

export const ACHIEVEMENT_LIST = [
    GOLD,
    SILVER,
    BRONZE,
    AH_YES_VERY_TACTICAL,
    MY_PARENTS_BELIEFS,
    THE_ANSWER,
    EXECUTE_ORDER,
    ITS_OVER,
    COMBO,
    LONG_LIVING,
    POWERUP_EXPERIENCE,
    MULTIPLAYER_CHAOS,
];

/**
 * Simple xor encryption & decryption
 * @param {string} s
 * @returns {string}
 */
function _encDec(s) {
    const key = 'PingBong!';
    const array = [];
    for(let i = 0; i < s.length; ++i) {
        const xor = s.charCodeAt(i) ^ key.charCodeAt(i % key.length);
        array.push(xor);
    }
    return String.fromCharCode.apply(null, array);
}

/**
 * Get the achievement string
 * @returns {Array}
 */
function _getAchievementArray() {
    const item = localStorage.getItem('ach');
    if(!item) return [];
    return _encDec(atob(item)).split('|');
}

/**
 * Set the achievement string
 * @param {Array} s
 */
function _setAchievementArray(s) {
    localStorage.setItem('ach', btoa(_encDec(s.join('|'))));
}

let _achievementCallback;

/**
 * Unlocks an achievement.
 * @param achievement
 */
export function unlockAchievement(achievement) {
    const array = _getAchievementArray();
    const element = achievement.id.toString();
    if(array.indexOf(element) > -1) return;
    array.push(element);
    _setAchievementArray(array);
    _achievementCallback(achievement);
    SOUND_MANAGER.achievement.playMono();
}

/**
 * Set the achievement callback
 * @param {function({name: string, description: string, id: number}): void} cb
 */
export function setAchievementSpawnCallback(cb) {
    _achievementCallback = cb;
}

/**
 * Reset achievements.
 */
export function resetAchievements() {
    _setAchievementArray([]);
}

/**
 * Get human readable achievement array.
 * @returns {{achievement: {name: string, description: string, id: number}, unlocked}[]}
 */
export function getHumanReadableAchievementArray() {
    const unlockedArray = _getAchievementArray();
    return ACHIEVEMENT_LIST.map(achievement => {
        return {
            achievement,
            unlocked: !!unlockedArray.find(id => +id === achievement.id),
        };
    });
}
