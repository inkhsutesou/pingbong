import {POWERUP_COLOR, POWERUP_NEGATIVE_COLOR} from "./config";

export const POWERUP_LINE_WIDTH = 2;
export const POWERUP_SIZE = 16;

class PowerUpBase {
    /**
     * @param {number} x
     * @param {number} y
     */
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }

    /**
     * Tick
     * @param {CanvasRenderingContext2D} ctx
     * @param {number} rotation
     */
    tick(ctx, rotation) {
        ctx.translate(this.x, this.y);
        ctx.rotate(-rotation);
        this._tickInternal(ctx);
        ctx.rotate(rotation);
        ctx.translate(-this.x, -this.y);
    }

    /**
     * Tick
     * @param {CanvasRenderingContext2D} ctx
     */
    _tickInternal(ctx) {
        ctx.lineWidth = POWERUP_LINE_WIDTH;
        ctx.beginPath();
        ctx.arc(0, 0, POWERUP_SIZE, 0, 2 * Math.PI);
    }
}

class PowerUp extends PowerUpBase {
    /**
     * Tick
     * @param {CanvasRenderingContext2D} ctx
     */
    _tickInternal(ctx) {
        ctx.strokeStyle = POWERUP_COLOR;
        super._tickInternal(ctx);
    }
}

class PowerDown extends PowerUpBase {
    /**
     * Tick
     * @param {CanvasRenderingContext2D} ctx
     */
    _tickInternal(ctx) {
        ctx.strokeStyle = POWERUP_NEGATIVE_COLOR;
        super._tickInternal(ctx);
    }
}


class GrowOwnTeamPowerUp extends PowerUp {
    /**
     * Tick
     * @param {CanvasRenderingContext2D} ctx
     */
    _tickInternal(ctx) {
        super._tickInternal(ctx);

        // Line
        ctx.moveTo(-8, 0);
        ctx.lineTo(8, 0);
        // Left arrow
        ctx.moveTo(-8, 0);
        ctx.lineTo(-4, -4);
        ctx.moveTo(-8, 0);
        ctx.lineTo(-4, 4);
        // Right arrow
        ctx.moveTo(8, 0);
        ctx.lineTo(4, -4);
        ctx.moveTo(8, 0);
        ctx.lineTo(4, 4);
        ctx.stroke();
    }
}

class BonusPointPowerUp extends PowerUp {
    /**
     * Tick
     * @param {CanvasRenderingContext2D} ctx
     */
    _tickInternal(ctx) {
        super._tickInternal(ctx);

        ctx.moveTo(-8, 0);
        ctx.lineTo(8, 0);
        ctx.moveTo(0, -8);
        ctx.lineTo(0, 8);
        ctx.stroke();
    }
}

class SplitRGBPowerDown extends PowerDown {
    /**
     * Tick
     * @param {CanvasRenderingContext2D} ctx
     */
    _tickInternal(ctx) {
        super._tickInternal(ctx);

        ctx.moveTo(-8, -8);
        ctx.lineTo(8, 8);
        ctx.moveTo(8, -8);
        ctx.lineTo(-8, 8);
        ctx.stroke();
    }
}

class RotatePowerDown extends PowerDown {
    /**
     * Tick
     * @param {CanvasRenderingContext2D} ctx
     */
    _tickInternal(ctx) {
        super._tickInternal(ctx);

        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 0, POWERUP_SIZE / 2, 0, 2 * Math.PI);
        ctx.moveTo(POWERUP_SIZE / 2, -2);
        ctx.lineTo(POWERUP_SIZE / 2 - 5, 2);
        ctx.moveTo(POWERUP_SIZE / 2, -2);
        ctx.lineTo(POWERUP_SIZE / 2 + 4, 2);
        ctx.stroke();
    }
}

class SlowDownPowerDown extends PowerDown {
    /**
     * Tick
     * @param {CanvasRenderingContext2D} ctx
     */
    _tickInternal(ctx) {
        super._tickInternal(ctx);

        ctx.moveTo(-2-3, +0.5);
        ctx.lineTo(+2-3,  - 8);
        ctx.moveTo(-2-3, -0.5);
        ctx.lineTo(+2-3,  + 8);
        ctx.moveTo(-2+3, +0.5);
        ctx.lineTo(+2+3,  - 8);
        ctx.moveTo(-2+3, -0.5);
        ctx.lineTo(+2+3,  + 8);
        ctx.stroke();
    }
}

const _POWERUP_CONSTRUCTORS = [GrowOwnTeamPowerUp, BonusPointPowerUp, SplitRGBPowerDown, RotatePowerDown, SlowDownPowerDown];

/**
 * Factory for power ups.
 * @param {number} x
 * @param {number} y
 * @param {number} type
 */
export default function createPowerUp(x, y, type) {
    return new _POWERUP_CONSTRUCTORS[type](x, y);
}
