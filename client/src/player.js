import { TIME_DELAY } from "./network";
import { CIRCLE_RADIUS, W_PADDING, BALL_RADIUS, BALL_RADIUS_ANGLE, FIELD_WIDTH, FIELD_HEIGHT, LINE_WIDTH } from "./config";
import { clamp } from "./util";

export class Player {
    /**
     * Constructor for Player.
     * @param {number} pos 
     * @param {number} wAngle 
     * @param {number} teamNr 
     * @param {string} name 
     */
    constructor(pos, wAngle, teamNr, name) {
        this.wAngle = wAngle;
        this.boundingRect = {
            topLeftX: 0,
            topLeftY: 0,
            topRightX: 0,
            topRightY: 0,
            bottomLeftX: 0,
            bottomLeftY: 0,
            bottomRightX: 0,
            bottomRightY: 0,
        };
        this.spin = 0;
        this.pos = pos; // Fix undefined var.
        this.moveTo(pos);
        this.teamNr = teamNr;
        this.name = name;
    }

    /**
     * Rebalance for teaming.
     * @param {number} minPos 
     * @param {number} maxPos 
     * @param {number} wAngle 
     */
    rebalance(minPos, maxPos, wAngle) {
        const diffWAngle = wAngle - this.wAngle;
        this.wAngle = wAngle;
        this.moveTo(clamp(this.pos - diffWAngle / 2, minPos, maxPos));
        // Must override the old pos.
        this.oldPos = this.pos;
    }

    /**
     * Move to.
     * @param {number} pos 
     */
    moveTo(pos) {
        this.oldPos = this.pos;
        this.pos = pos;
        const a = 1/4;
        this.spin = this.spin * (1 - a) + a * (this.pos - this.oldPos) * 2;
        this._recalcBoundingRect();
    }

    /**
     * Recalculate bounding rect
     */
    _recalcBoundingRect() {
        const factorRight = CIRCLE_RADIUS + (LINE_WIDTH + 3 + W_PADDING + BALL_RADIUS) / 2;
        const factorLeft = CIRCLE_RADIUS - (LINE_WIDTH - 3 + W_PADDING + BALL_RADIUS) / 2;
        let co1 = Math.cos(this.pos - BALL_RADIUS_ANGLE);
        let co2 = Math.cos(this.pos + this.wAngle + BALL_RADIUS_ANGLE);
        let si1 = Math.sin(this.pos - BALL_RADIUS_ANGLE);
        let si2 = Math.sin(this.pos + this.wAngle + BALL_RADIUS_ANGLE);
        this.boundingRect.topLeftX = co2 * factorLeft + FIELD_WIDTH / 2;
        this.boundingRect.topLeftY = si2 * factorLeft + FIELD_HEIGHT / 2;
        this.boundingRect.topRightX = co1 * factorLeft + FIELD_WIDTH / 2;
        this.boundingRect.topRightY = si1 * factorLeft + FIELD_HEIGHT / 2;
        const shift = 0.030543261909900768; // 1.75 / 180 * Math.PI;
        co1 = Math.cos(this.pos + shift - BALL_RADIUS_ANGLE);
        co2 = Math.cos(this.pos - shift + this.wAngle + BALL_RADIUS_ANGLE);
        si1 = Math.sin(this.pos + shift - BALL_RADIUS_ANGLE);
        si2 = Math.sin(this.pos - shift + this.wAngle + BALL_RADIUS_ANGLE);
        this.boundingRect.bottomLeftX = co2 * factorRight + FIELD_WIDTH / 2;
        this.boundingRect.bottomLeftY = si2 * factorRight + FIELD_HEIGHT / 2;
        this.boundingRect.bottomRightX = co1 * factorRight + FIELD_WIDTH / 2;
        this.boundingRect.bottomRightY = si1 * factorRight + FIELD_HEIGHT / 2;
    }

    /**
     * @param {CanvasRenderingContext2D} ctx 
     */
    static prepareRender(ctx) {
        ctx.strokeStyle = 'white';
        ctx.lineWidth = LINE_WIDTH + W_PADDING;
        ctx.globalAlpha = 0.8;
    }

    /**
     * @param {CanvasRenderingContext2D} ctx 
     */
    static endRender(ctx) {
        ctx.globalAlpha = 1;
    }

    /**
     * Draws a triangle marking a player.
     * @param {CanvasRenderingContext2D} ctx 
     * @param {number} alpha 
     */
    drawTriangle(ctx, alpha) {
        ctx.globalAlpha = alpha;
        ctx.fillStyle = 'white';
        const rotation = this.pos + this.wAngle / 2;
        ctx.translate(FIELD_WIDTH/2, FIELD_HEIGHT/2);
        ctx.rotate(rotation);
        const s = 16;
        const ox = CIRCLE_RADIUS + 16;
        const oy = 0;
        ctx.beginPath();
        ctx.moveTo(ox - s / 4, oy);
        ctx.lineTo(ox + s / 4, oy + -s / 2);
        ctx.lineTo(ox + s / 4, oy +  s / 2);
        ctx.fill();
        ctx.rotate(-rotation);
        ctx.translate(-FIELD_WIDTH/2, -FIELD_HEIGHT/2);
        ctx.globalAlpha = 1;
    }

    /**
     * Tick.
     * @param {CanvasRenderingContext2D} ctx
     */
    tick(ctx) {
        this.spin *= 0.8;
        //document.title=this.spin;

        ctx.beginPath();
        ctx.arc(FIELD_WIDTH / 2, FIELD_HEIGHT / 2, CIRCLE_RADIUS, this.pos, this.pos + this.wAngle, false);
        ctx.stroke();

        /*// DEBUG
        if(this.realPos!==undefined){
            ctx.save();
            ctx.strokeStyle = 'purple';
            ctx.beginPath();
            ctx.arc(FIELD_WIDTH / 2, FIELD_HEIGHT / 2, CIRCLE_RADIUS, this.realPos, this.realPos + this.wAngle, false);
            ctx.stroke();
            ctx.restore();
        }*/

        /*// DEBUG
        ctx.strokeStyle = 'black';
        ctx.beginPath();
        ctx.arc(ctx.canvas.width / 2, ctx.canvas.height / 2, CIRCLE_RADIUS, this.pos + this.wAngle/2 - 0.02, this.pos + this.wAngle/2 + 0.02, false);
        ctx.stroke();*/

        /*// DEBUG
        const rect = this.boundingRect;
        ctx.fillStyle = 'red';
        ctx.fillRect(rect.topLeftX, rect.topLeftY, 2, 2);
        ctx.fillRect(rect.bottomLeftX, rect.bottomLeftY, 2, 2);
        ctx.fillRect(rect.topRightX, rect.topRightY, 2, 2);
        ctx.fillRect(rect.bottomRightX, rect.bottomRightY, 2, 2);*/
    }
}

export class OwnPlayer extends Player {
}

export class NetPlayer extends Player {
    /**
     * Constructor for NetPlayer.
     * @param {number} pos 
     * @param {number} wAngle 
     * @param {number} teamNr 
     * @param {string} name 
     */
    constructor(pos, wAngle, teamNr, name) {
        super(pos, wAngle, teamNr, name);
        this._positionBuffer = [];
    }

    /**
     * Buffer a move.
     * @param {number} pos 
     */
    bufferMove(pos) {
        this._positionBuffer.push({pos, ts: Date.now()});
    }

    /**
     * @return {number}
     */
    get _adjustedTime() {
        // Rendering happens at the server update timestamp.
        return Date.now() - TIME_DELAY;
    }

    /**
     * Tick.
     * @param {CanvasRenderingContext2D} ctx
     */
    tick(ctx) {
        this._interpolatePosition();
        super.tick(ctx);
    }

    /**
     * Interpolate position.
     */
    _interpolatePosition() {
        const renderTs = this._adjustedTime;

        // Drop old positions, but try to keep the most recent one, even if it's outdated.
        while(this._positionBuffer.length >= 2 && this._positionBuffer[1].ts <= renderTs) {
            this._positionBuffer.shift();
        }

        // Hack around the fact that we don't always send player position and we still need to interpolate that.
        // Idea is that if it's two ticks old, we need to apply it.
        if(this._positionBuffer.length === 1 && this._positionBuffer[0].ts <= renderTs - TIME_DELAY) {
            this.moveTo(this._positionBuffer[0].pos);
        }
        // Interpolate between two surrounding positions.
        else if(this._positionBuffer.length >= 2 && this._positionBuffer[0].ts <= renderTs && renderTs <= this._positionBuffer[1].ts) {
            const p0 = this._positionBuffer[0];
            const p1 = this._positionBuffer[1];
            const t = (renderTs - p0.ts) / (p1.ts - p0.ts);
            this.moveTo(p0.pos + (p1.pos - p0.pos) * t);
        }
    }
}
