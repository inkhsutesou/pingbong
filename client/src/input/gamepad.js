export default class GamepadInputProvider {
    /**
     * Constructor for GamepadInputProvider
     * @param {Input} input The input
     */
    constructor(input) {
        this._gamepads = [];
        this._onConnected = this._onConnected.bind(this);
        this._onDisconnected = this._onDisconnected.bind(this);
        this.tick = this.tick.bind(this);
        window.addEventListener('gamepadconnected', this._onConnected, false);
        window.addEventListener('gamepaddisconnected', this._onDisconnected, false);
        this._input = input;
        this._ticking = false;
    }

    /**
     * Destructor
     */
    destructor() {
        window.removeEventListener('gamepadconnected', this._onConnected, false);
        window.removeEventListener('gamepaddisconnected', this._onDisconnected, false);
    }

    /**
     * Get gamepad
     * @return {Gamepad}
     */
    _getGamepad() {
        for(const idx of this._gamepads) {
            return navigator.getGamepads()[idx];
        }

        return null;
    }

    /**
     * Gamepad got connected
     * @param {GamepadEvent} e
     */
    _onConnected(e) {
        this._gamepads.push(e.gamepad.index);
        if(!this._ticking) {
            this._ticking = true;
            requestAnimationFrame(this.tick);
        }
    }

    /**
     * Gamepad got disconnected
     * @param {GamepadEvent} e
     */
    _onDisconnected(e) {
        this._gamepads.splice(this._gamepads.indexOf(e.gamepad.index));
        if(this._gamepads.length === 0) {
            this._ticking = false;
        }
    }

    /**
     * Gamepads need to be polled. Epic.
     */
    tick() {
        const gp = this._getGamepad();
        if(gp) {
            const a = gp.axes[0];
            const b = gp.axes[1];
            if(a * a + b * b > 0.25) {
                this._input.setAngle(a, b);
            }
        }

        if(this._ticking) {
            requestAnimationFrame(this.tick);
        }
    }
}
