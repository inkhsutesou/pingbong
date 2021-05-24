import {getInitialDelay, SOUND_MANAGER} from './components/app';
import { TPF } from './network';
import { BALL_RADIUS, BALL_RADIUS_ANGLE, CIRCLE_RADIUS, FIELD_HEIGHT, FIELD_WIDTH, TEAM_COLORS } from './config';
import { clamp } from './util';
import {LONG_LIVING, unlockAchievement} from "./achievement";

const ACC = 0.25;

const MAX_IGNORE_COLLISION = 3 + 1;

const MAX_RALLIES = 5;

export const NO_TEAM = 0b1111;

class Ball {
    /**
     * Creates a new Ball.
     * @param {number} x 
     * @param {number} y 
     * @param {number} dx 
     * @param {number} dy 
     * @param {number} spin 
     */
    constructor(x, y, dx, dy, spin) {
        this.x = x;
        this.y = y;
        this._dx = dx;
        this._dy = dy;
        this._ignoreCollision = 0;
        this._ignoreServerPositionSyncTimer = 0;
        this._spin = spin;
        this._hitTeam = NO_TEAM;
        this.rallies = 0;
        // Deviation from real server (x, y)
        this._drsx = 0;
        this._drsy = 0;
        this._hitsWithoutRespawning = 0;
    }

    /**
     * @returns {number}
     * @protected
     */
    _calculateSpin() {
        return this._spin;
    }

    /**
     * Calculate color for border
     * @return {string}
     */
    _calculateColor() {
        //if(this._hitTeam === NO_TEAM) return 'white';
        return TEAM_COLORS/*_PASTEL*/[this._hitTeam];
    }

    /**
     * Play hit sound.
     * @param {number} oldDx 
     * @param {number} oldDy 
     */
    _playHitSound(oldDx, oldDy) {
        const invMagOld = 1 / Math.sqrt(oldDx * oldDx + oldDy * oldDy);
        oldDx *= invMagOld;
        oldDy *= invMagOld;
        const invMagNew = 1 / Math.sqrt(this._dx * this._dx + this._dy * this._dy);
        const dx = this._dx * invMagNew;
        const dy = this._dy * invMagNew;

        const f = oldDx * dx + oldDy * dy;
        //console.log(oldDx, dx, oldDy, dy, f);

        // Note: have to do a magic trick because f32/f64 and server networking BS and also double collision extra BS.
        if(f < 0.7) {
            SOUND_MANAGER.playStereoWithVolumeDependingOnTeam(SOUND_MANAGER.hit, this.x, this.y, CIRCLE_RADIUS, this._hitTeam);
        }
    }

    /**
     * Sync with server
     * @param {number} deltaFrame 
     * @param {number} x 
     * @param {number} y 
     * @param {number} dx 
     * @param {number} dy 
     * @param {number} spin 
     * @param {number} hitTeam
     * @param {number} flags
     * @param {number} rallies
     */
    sync(deltaFrame, x, y, dx, dy, spin, hitTeam, flags, rallies) {
        //console.log('current: ', this._dx, this._dy, ' new: ', dx, dy);
        const oldDx = this._dx;
        const oldDy = this._dy;

        const odx = dx;
        const ody = dy;
        // *dt is not a mistake!
        dx -= spin * ody * ACC * deltaFrame;
        dy += spin * odx * ACC * deltaFrame;
        const nx = x + dx * deltaFrame;
        const ny = y + dy * deltaFrame;

        if(flags === 1 || this._ignoreServerPositionSyncTimer === 0) {
            // If the distance is at most the amount of distance in one TPF => ignore.
            const d = (nx - this.x) * (nx - this.x) + (ny - this.y) * (ny - this.y);
            const TPF_TOL = TPF * 2;
            //console.log('sync with distance', d, (dx * dx + dy * dy) * TPF_TOL * TPF_TOL);
            if (d > (dx * dx + dy * dy) * TPF_TOL * TPF_TOL) {
                this.x = nx;
                this.y = ny;
                //console.log('long distance sync', d);
            } else {
                this._drsx = nx - this.x;
                this._drsy = ny - this.y;
                //console.log(this.drsx, this.drsy);
            }

            this._dx = dx;
            this._dy = dy;
            this._spin = spin;
            this.rallies = rallies;
            this._hitTeam = hitTeam;
        }

        if(flags === 1) {
            this._ignoreCollision = MAX_IGNORE_COLLISION;
            this._ignoreServerPositionSyncTimer = 0;
            this._playHitSound(oldDx, oldDy);

            if(++this._hitsWithoutRespawning === 25) {
                unlockAchievement(LONG_LIVING);
            }
        } else if(flags === 2) {
            this._hitsWithoutRespawning = 0;
        }

        //this.rx=x;
        //this.ry=y;
    }

    // https://codeincomplete.com/articles/javascript-pong/part4/
    collide(nx, ny, x3, y3, x4, y4, p) {
        const x2 = nx - this.x;
        const y2 = ny - this.y;
        const denom = ((y4-y3) * x2) - ((x4-x3) * y2);
        if (denom !== 0) {
            const a = (((x4-x3) * (this.y-y3)) - ((y4-y3) * (this.x-x3))) / denom;
            if (a >= 0 && a <= 1) {
                const c = ((x2 * (this.y-y3)) - (y2 * (this.x-x3))) / denom;
                if (c >= 0 && c <= 1) {
                    const x = this.x + (a * x2);
                    const y = this.y + (a * y2);
                    return { x, y, x3, y3, x4, y4, p };
                }
            }
        }
        return null;
    }

    /**
     * Tick.
     * @param {CanvasRenderingContext2D} ctx
     * @param {number} delta
     * @param {Array<Player>} players 
     */
    tick(ctx, delta, players) {
        // https://gamedev.stackexchange.com/questions/9254/adding-swerve-to-a-direction
        const odx = this._dx;
        const ody = this._dy;
        // *dt is not a mistake!
        const spin = this._calculateSpin();
        this._dx -= spin * ody * ACC * delta;
        this._dy += spin * odx * ACC * delta;

        const REAL_BLEND = 0.125 / 4.0;
        const nx = (this.x + this._drsx * REAL_BLEND) + this._dx * delta;
        const ny = (this.y + this._drsy * REAL_BLEND) + this._dy * delta;
        this._drsx *= 1 - REAL_BLEND;
        this._drsy *= 1 - REAL_BLEND;

        let pt;
        if(this._ignoreCollision === 0) {
            let angle = Math.atan2(this.y - FIELD_WIDTH / 2, this.x - FIELD_HEIGHT / 2);
            if(angle < 0.0) {
                angle += Math.PI * 2;
            }
            for(const idx in players) {
                const player = players[idx];

                // Filter to make this less expensive.
                if(player.pos > angle + BALL_RADIUS_ANGLE || player.pos + player.wAngle < angle - BALL_RADIUS_ANGLE)
                    continue;

                const rect = player.boundingRect;

                pt = this.collide(nx, ny, rect.topLeftX, rect.topLeftY, rect.topRightX, rect.topRightY, player);
                if(!pt) pt = this.collide(nx, ny, rect.bottomLeftX, rect.bottomLeftY, rect.topRightX, rect.topRightY, player);
                if(pt) {
                    break;
                }
            }
        } else {
            --this._ignoreCollision;
        }

        if(this._ignoreServerPositionSyncTimer > 0) {
            --this._ignoreServerPositionSyncTimer;
        }

        this.x = nx;
        this.y = ny;

        let result = null;
        if(pt) {
            // Circle reflection is useless, because the direction will always be perpendicular on the tangent.
            // Reflection of vector, first calculate the normal
            let ny = pt.x3 - pt.x4;
            let nx = pt.y4 - pt.y3;
            let invMag = 1 / Math.sqrt(nx * nx + ny * ny);
            nx *= invMag;
            ny *= invMag;

            // 2 * dot(d, n)
            const dot = 2 * (nx * this._dx + ny * this._dy);

            // Dot product will be more and more positive if roughly pointing to the same direction.
            // In that case, ignore the collision because it's a double.
            console.log('dot product', dot);
            if(dot <= 0) {
                this.x = pt.x;
                this.y = pt.y;

                // Reflection
                const oldDx = this._dx;
                const oldDy = this._dy;
                this._dx -= dot * nx;
                this._dy -= dot * ny;

                result = pt.p;

                // Spin
                const SPIN_MAX = 0.05;
                this._spin = clamp(this._spin * 0.5 + result.spin, -SPIN_MAX, SPIN_MAX);

                this._ignoreCollision = MAX_IGNORE_COLLISION;
                this._playHitSound(oldDx, oldDy);

                this._hitTeam = result.teamNr;
                this.rallies = Math.min(this.rallies + 1, MAX_RALLIES);
                this._ignoreServerPositionSyncTimer = Math.ceil(getInitialDelay() * 0.06) + 1;
            }
        }

        /*if(this._hitTeam !== NO_TEAM) {
            const gradient = ctx.createRadialGradient(this.x, this.y, BALL_RADIUS / 2 - this.rallies + 1, this.x, this.y, BALL_RADIUS);
            gradient.addColorStop(0, 'white');
            //gradient.addColorStop(1-(this.rallies - 1)/MAX_RALLIES*0.25, this._calculateColor());
            gradient.addColorStop(1, this._calculateColor());
            ctx.fillStyle = gradient;
        } else {
            ctx.fillStyle = 'white';
        }
        ctx.beginPath();
        ctx.arc(this.x, this.y, BALL_RADIUS, 0, Math.PI * 2);
        ctx.fill();*/

        ctx.fillStyle = 'white';

        /*if(this._ignoreCollision) {
            ctx.fillStyle = 'green';
        } else {
            ctx.fillStyle = 'white';
        }*/

        ctx.beginPath();
        ctx.arc(this.x, this.y, BALL_RADIUS, 0, Math.PI * 2);
        ctx.fill();
        if(this._hitTeam !== NO_TEAM) {
            ctx.strokeStyle = this._calculateColor();
            ctx.lineWidth = 1 + this.rallies;
            ctx.beginPath();
            ctx.arc(this.x, this.y, BALL_RADIUS - ctx.lineWidth/2 + 0.5, 0, Math.PI * 2);
            ctx.stroke();
        }

        // DEBUG
        /*ctx.strokeStyle='red';
        ctx.lineWidth=1;
        ctx.beginPath();
        ctx.moveTo(this.x+this.dx*delta*5, this.y+this.dy*delta*5);
        ctx.lineTo(nx,ny);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(this.x-this.dy*delta*5, this.y+this.dx*delta*5);
        ctx.lineTo(nx,ny);
        ctx.stroke();*/

        return result;
    }
}

class BallSpinTowardsCenter extends Ball {
    _calculateSpin() {
        const baseSpin = super._calculateSpin();

        let centerDirX = FIELD_WIDTH / 2 - this.x;
        let centerDirY = FIELD_HEIGHT / 2 - this.y;
        let norm = Math.sqrt(centerDirX * centerDirX + centerDirY * centerDirY);
        if(norm > 0.0000001) {
            norm = 1 / norm;
            centerDirX *= norm;
            centerDirY *= norm;
        }

        const cross = this._dx * centerDirY - this._dy * centerDirX;

        return clamp(cross * 0.01, -0.05, 0.05) + baseSpin;
    }
}

/**
 * Factory for balls, with additional property support.
 *
 * @param {number} x
 * @param {number} y
 * @param {number} dx
 * @param {number} dy
 * @param {number} spin
 * @param {boolean} spinTowardsCenter
 */
export function createBall(x, y, dx, dy, spin, spinTowardsCenter) {
    if(spinTowardsCenter) {
        return new BallSpinTowardsCenter(x, y, dx, dy, spin);
    } else {
        return new Ball(x, y, dx, dy, spin);
    }
}
