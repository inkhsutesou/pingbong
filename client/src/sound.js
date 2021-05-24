import { FIELD_HEIGHT, FIELD_WIDTH } from './config';
import { clamp, isRunningInBg } from './util';
import fw1 from './assets/firework1.mp3';
import fw2 from './assets/firework2.mp3';
import hit1 from './assets/hit1.mp3';
import hit2 from './assets/hit2.mp3';
import achievement from './assets/achievement.mp3';

let audioCtx = null;
let isMuted = false;

/**
 * Hacks
 */
function webAudioTouchUnlock() {
    // Fucking Apple
    if(audioCtx && audioCtx.state === 'suspended'/* && 'ontouchstart' in window*/) {
        const unlock = () => {
            audioCtx.resume().then(() => {
                document.body.removeEventListener('click', unlock);
                document.body.removeEventListener('touchstart', unlock);
                document.body.removeEventListener('touchend', unlock);
            });
        };

        document.body.addEventListener('click', unlock, false);
        document.body.addEventListener('touchstart', unlock, false);
        document.body.addEventListener('touchend', unlock, false);
    }
}

/**
 * Init sound system.
 */
export function initSoundSystem() {
    // Audio context (if supported). If unsupported, will fall back to non-DOM-attached <audio> elements.
    // Sometimes initialization fails because of undocumented limits.
    try {
        const ctx = window.AudioContext || window['webkitAudioContext'];
        if(ctx)
            audioCtx = new ctx();
    } catch(_e) {
        console.log("Could not initialize audio context, using fallback");
    }

    // Fuck Webkit & co
    webAudioTouchUnlock();
}

class Sound {
    /**
     * @param {string} url 
     */
    constructor(url) {
        if(audioCtx) {
            this.data = null;
            fetch(url).then(x => x.arrayBuffer()).then(x => audioCtx.decodeAudioData(x, x => {
                this.data = x;
            }));
        } else {
            this.data = document.createElement('audio');
            this.data.src = url;
        }
    }

    /**
     * @return {boolean}
     */
    _shouldPlay() {
        return !isMuted && !isRunningInBg() && this.data;
    }

    /**
     * Play mono.
     */
    playMono() {
        if(this._shouldPlay()) {
            if(audioCtx) {
                const snd = audioCtx.createBufferSource();
                snd.connect(audioCtx.destination);
                snd.buffer = this.data;
                snd.start(0);
            } else {
                // noinspection JSIgnoredPromiseFromCall
                this.data.play();
            }
        }
    }

    /**
     * Play stereo.
     * @param {number} pan 
     * @param {number} volume
     */
    playStereo(pan, volume=1) {
        if(this._shouldPlay()) {
            if(audioCtx) {
                pan = clamp(pan, -0.3, 0.3);
                const snd = audioCtx.createBufferSource();
                const gain = audioCtx.createGain();
                gain.gain.value = volume;
                gain.connect(audioCtx.destination);
                if(audioCtx.createStereoPanner) { // Fuck Safari
                    const panner = audioCtx.createStereoPanner();
                    panner.pan.value = pan;
                    panner.connect(gain);
                    snd.connect(panner);
                } else {
                    snd.connect(gain);
                }
                snd.buffer = this.data;
                snd.start(0);
            } else {
                this.data.volume = volume;
                // noinspection JSIgnoredPromiseFromCall
                this.data.play();
            }
        }
    }
}

class SoundWithVariations {
    /**
     * Sound with variations. Will play a random sound from the array.
     * @param {Array<Sound>} variations Sound variations.
     */
    constructor(variations) {
        this._variations = variations;
    }

    /**
     * @return {Sound}
     */
    _rnd() {
        return this._variations[Math.floor(Math.random() * this._variations.length)];
    }

    /**
     * Play mono.
     */
    playMono() {
        this._rnd().playMono();
    }

    /**
     * Play stereo.
     * @param {number} pan 
     * @param {number} volume
     */
    playStereo(pan, volume=1) {
        this._rnd().playStereo(pan, volume);
    }
}

export class SoundManager {
    constructor() {
        const HIT1 = new Sound(hit1);
		const HIT2 = new Sound(hit2);
		const FW1 = new Sound(fw1);
		const FW2 = new Sound(fw2);
		this.hit = new SoundWithVariations([HIT1, HIT2]);
        this.fw = new SoundWithVariations([FW1, FW2]);
        this.achievement = new Sound(achievement);
        this.co = 1;
        this.si = 0;
        this.ownTeamNr = 0;
    }

    /**
     * @param {number} rotation
     */
    set rotation(rotation) {
        this.co = Math.cos(rotation);
        this.si = Math.sin(rotation);
    }

    /**
     * Play sound stereo.
     * @param {Sound} snd 
     * @param {number} x 
     * @param {number} y 
     * @param {number} r Radius of circle (could be more CIRCLE_RADIUS + THRESHOLD)
     * @param {number} volume
     */
    playStereo(snd, x, y, r, volume=1) {
        const translatedX = x - FIELD_WIDTH / 2;
        const translatedY = y - FIELD_HEIGHT / 2;
        const rotatedX = this.co * translatedX - this.si * translatedY;
        snd.playStereo(rotatedX / r / 6, volume);
    }

    /**
     * Play sound stereo with volume depending on team nr.
     * @param {Sound} snd
     * @param {number} x
     * @param {number} y
     * @param {number} r Radius of circle (could be more CIRCLE_RADIUS + THRESHOLD)
     * @param {number} teamNr
     */
    playStereoWithVolumeDependingOnTeam(snd, x, y, r, teamNr) {
        this.playStereo(snd, x, y, r, teamNr === this.ownTeamNr ? 1.0 : 0.5);
    }
}

/**
 * @return {boolean}
 */
export function getIsMuted() {
    return isMuted;
}

/**
 * @param {boolean} muted
 */
export function setIsMuted(muted) {
    isMuted = muted;
}
