import {OP_RECV_LEAVEROOM, OP_RECV_RESETROOM, OP_RECV_SYNC} from './network';
import { clamp, repeat, hueFromRgb, updatetextContent, getMinutes, getSeconds } from './util';
import Firework from './firework';
import { NO_TEAM } from './ball';
import { NetPlayer, OwnPlayer, Player } from './player';
import { getConnection, getName } from '.';
import {getInitialDelay, SOUND_MANAGER} from './components/app';
import {
    BALL_RADIUS,
    CIRCLE_RADIUS,
    FIELD_HEIGHT,
    FIELD_WIDTH,
    LINE_WIDTH, POWERUP_COLOR, POWERUP_NEGATIVE_COLOR,
    TEAM_COLORS, TEAM_COLORS_INT
} from "./config";
import createPowerUp from "./powerup";
import createFilterTracker from "./post-processing/filtertracker";
import {
    AH_YES_VERY_TACTICAL,
    BRONZE, COMBO, EXECUTE_ORDER,
    GOLD,
    ITS_OVER, MULTIPLAYER_CHAOS,
    MY_PARENTS_BELIEFS, POWERUP_EXPERIENCE,
    SILVER, THE_ANSWER,
    unlockAchievement
} from "./achievement";
//import Stats from 'stats.js';

/// Only send moves every `MOVE_ACCUMULATION` frames to save bandwidth & overhead.
const MOVE_ACCUMULATION = 2;

const MAX_MOVE = Math.PI / 20;

/// How many seconds before the match starts?
const TIME_WAIT_BEFORE_START = 3;

/// Starting from > 125 pixels, we have an out-of-bound for the ball.
const OUTSIDE_THRESHOLD = 125;

/// How many points do you get with bonus powerup.
const POWERUP_BONUS_POINTS = 10;

//const stats = new Stats();
//document.body.appendChild(stats.dom);

export default class PlayState {
    /**
     * @param {HTMLCanvasElement} canvas 
     * @param {Input} input
     * @param {number} myPlayerId 
     * @param {Object} players 
     * @param {Object} startState
     * @param {function(): void} resetCallback
     * @param {function(Object): void} setFinalScores
     * @param {function(number, number): void} resizeHandler
     */
    constructor(canvas, input, myPlayerId, players, startState, resetCallback, setFinalScores, resizeHandler) {
        console.log('constructing PlayState', startState, 'at time', Date.now());
        this.input = input;
        this._myPlayerId = myPlayerId;
        this._teamCount = startState.teamCount;
        this._matchTime = startState.matchTime;
        this._stupidObjects = [];
        const angle = Math.PI * 2 / this._teamCount;
        const myState = startState.states[myPlayerId];
        this._minPos = angle * myState.teamNr;
        this._maxPos = this._minPos + angle - myState.wAngle;
        input.angle = myState.pos;
        this._additionalRotationSpeed = 0;
        this._rotation = Math.PI / 2 - myState.teamNr * angle - angle / 2;
        SOUND_MANAGER.rotation = this._rotation;
        SOUND_MANAGER.ownTeamNr = myState.teamNr;
        this._player = new OwnPlayer(myState.pos, myState.wAngle, myState.teamNr, getName());
        this._players = {[myPlayerId]: this._player};
        for(const item of players) {
            const otherState = startState.states[item.clientId];
            this._players[item.clientId] = new NetPlayer(otherState.pos, otherState.wAngle, otherState.teamNr, item.name);
        }
        this._scores = Array(this._teamCount).fill(0);
        this._balls = startState.balls;
        this._ctx = canvas.getContext("2d");
        this._ctx.lineCap = 'round';

        this._spinTowardsCenter = startState.spinTowardsCenter;
        this._powerup = null;

        // Cache common update packets
        this._movePacket = new DataView(new ArrayBuffer(1 + 4 + 1 + 4 + 1 + 4));
        this._movePacket.setUint8(0, 0);
        this._movePacket.setUint8(5, 252);

        this._pendingInputs = [];
        this._accumulatedPos = 0;
        this._accumulatedFrames = 0;
        this._hitBall = NO_TEAM;

        this._prevCounter = 0;
        this._tick = this._tick.bind(this);

        this._resetCallback = resetCallback;
        this._setFinalScores = setFinalScores;

        this._oldLeaveRoomHandler = getConnection().replaceHandler(OP_RECV_LEAVEROOM, this._NETLeave.bind(this));
        getConnection().addHandler(OP_RECV_SYNC, this._NETSync.bind(this));
        getConnection().addTempHandler(OP_RECV_RESETROOM, this._NETReset.bind(this));

        this.scale = 1;

        this._timerElem = document.getElementById('timer');

        this._powerUpTimer = false;
        this._speedFactor = 1;
        this._filterTracker = null;

        this._setupPlayerList();
        this._updateScoreboard();

        this._powerUpAchievementBitVector = 0;
        this._scoringCombo = 0;

        //resetAchievements();
        //setTimeout(() => unlockAchievement(AH_YES_VERY_TACTICAL), 1000);

        //setTimeout(() => this._setupSplitFilter(true), 500);
        //setTimeout(() => this._setupSplitFilter(false), 2500);
        //setTimeout(() => this._setupSplitFilter(true), 3500);
        //setTimeout(() => this._setupSplitFilter(false), 4500);

        this._startTime = performance.now() - getInitialDelay();
        this._resizeHandler = resizeHandler;
        this._animFrame = window.requestAnimationFrame(this._tick);
    }

    /**
     * Destructor
     */
    destructor() {
        getConnection().addHandler(OP_RECV_LEAVEROOM, this._oldLeaveRoomHandler);
        getConnection().removeHandler(OP_RECV_SYNC);
        window.cancelAnimationFrame(this._animFrame);
    }

    /**
     * Sets up the player list.
     */
    _setupPlayerList() {
        const transformTeamNr = n => (n + this._teamCount - this._player.teamNr) % this._teamCount;

        const target = document.getElementById('players');
        const teams = Array(this._teamCount);
        for(let i = 0; i < this._teamCount; ++i) {
            teams[transformTeamNr(i)] = document.createDocumentFragment();
        }

        for(const k in this._players) {
            const player = this._players[k];
            const elem = document.createElement('li');
            elem.id = `playerlist--${k}`;
            elem.textContent = player.name;
            elem.style.color = TEAM_COLORS[player.teamNr];
            teams[transformTeamNr(player.teamNr)].appendChild(elem);
        }

        for(const t of teams)
            target.appendChild(t);

        //console.log(teams);
    }

    /**
     * @param {PacketDecoder} _view
     */
    _NETReset(_view) {
        console.log('reset');
        this._resetCallback();
    }

    /**
     * @param {PacketDecoder} view 
     */
    _NETLeave(view) {
        // Also notify old handler in UI.
        this._oldLeaveRoomHandler(view);
        view.reset();

        // Handle in play state.
        const pid = view.getVarInt();
        const _newHost = view.getVarInt();
        const teamNr = this._players[pid].teamNr;
        delete this._players[pid];

        document.getElementById(`playerlist--${pid}`).remove();

        if(view.getUint8()) {
            const minPos = view.getFloat32();
            const maxPos = view.getFloat32();
            const wAngle = view.getFloat32();
            this._applyResizing(teamNr, minPos, maxPos, wAngle);
        }
    }

    /**
     * Apply player team resizing.
     * @param {number} teamNr
     * @param {number} minPos
     * @param {number} maxPos
     * @param {number} wAngle
     */
    _applyResizing(teamNr, minPos, maxPos, wAngle) {
        for(const idx in this._players) { // for .. of doesn't work because sparse
            const player = this._players[idx];
            if(player.teamNr === teamNr) {
                player.rebalance(minPos, maxPos, wAngle);
            }
        }
        if(this._player.teamNr === teamNr) {
            this._minPos = minPos;
            this._maxPos = maxPos;
        }
    }

    /**
     * @param {PacketDecoder} view 
     */
    _NETSync(view) {
        const myFrameNr = (performance.now() - this._startTime) * 0.06;
        const serverFrameNr = view.getFloat32();

        const difference = (myFrameNr - serverFrameNr) - getInitialDelay() * 0.06;
        const deltaFrame = Math.max(0, difference);
        //console.log(myFrameNr, serverFrameNr, 'deltaFrame', deltaFrame);

        // Handle syncs
        this._handlePlayerSyncPacket(view);
        this._handleBallSyncPacket(view, deltaFrame);

        // Power-up handling
        const powerUpPacketType = view.getUint8();
        if(powerUpPacketType > 0) {
            this._handlePowerUpPacket(view, powerUpPacketType);
        }

        // Forward sequence number and time management:
        //   decreasing the start time will mean the time since the start becomes bigger => forward time movement.
        // Balls will be synced earlier such that this difference is correct.
        if(difference < 0) {
            console.log('huh?, adjust by', difference / 0.06);
            this._startTime += difference / 0.06;
        }
    }

    /**
     * @param {PacketDecoder} view
     * @param {number} deltaFrame
     * @private
     */
    _handleBallSyncPacket(view, deltaFrame) {
        let len = view.getUint8();
        for(let i = 0; i < len; ++i) {
            const ballIdRalliesPacked = view.getUint8();
            const ballId = ballIdRalliesPacked >> 4;
            const rallies = ballIdRalliesPacked & 15;
            const hitPair = view.getUint8();
            let hitTeam = hitPair >> 4;
            const flags = view.getUint8();
            const x = view.getFloat32();
            const y = view.getFloat32();
            const dx = view.getFloat32();
            const dy = view.getFloat32();
            const spin = view.getFloat32();
            const ball = this._balls[ballId];
            if(flags === 2) {
                // A team scored.
                const receivingTeam = hitPair & 15;
                const isOwnGoal = receivingTeam === hitTeam;
                if(hitTeam !== NO_TEAM) {
                    if(isOwnGoal) {
                        if(hitTeam === this._player.teamNr) {
                            unlockAchievement(AH_YES_VERY_TACTICAL);
                        }

                        for(let i = 0; i < this._scores.length; ++i) {
                            if(i !== hitTeam) {
                                this._scores[i] += rallies;
                            }
                        }
                    } else {
                        this._scores[hitTeam] += rallies;

                        // Achievement handling.
                        if(hitTeam === this._player.teamNr) {
                            if(++this._scoringCombo === 10) {
                                unlockAchievement(COMBO);
                            }
                        } else if(receivingTeam === this._player.teamNr) {
                            this._scoringCombo = 0;
                        }
                    }

                    this._updateScoreboard();
                    this._addFirework(TEAM_COLORS_INT[hitTeam], ball.x, ball.y);
                    hitTeam = NO_TEAM;
                }
            }
            ball.sync(deltaFrame, x, y, dx, dy, spin, hitTeam, flags, rallies);
        }
    }

    /**
     * @param {PacketDecoder} view
     * @private
     */
    _handlePlayerSyncPacket(view) {
        let len = view.getUint8();
        for(let i = 0; i < len; ++i) {
            const playerId = view.getVarInt();
            const pos = view.getFloat32();
            const seqNr = view.getVarInt();
            const player = this._players[playerId];
            if(this._myPlayerId === playerId) {
                player.moveTo(pos);
                //player.realPos=pos; // DEBUG
                this._serverReconciliation(seqNr);
            } else {
                player.bufferMove(pos);
            }
        }
    }

    /**
     * Toggle power up timer.
     * @param {boolean} isPositive
     * @private
     */
    _togglePowerUpTimer(isPositive) {
        this._powerUpTimer = !this._powerUpTimer;
        document.getElementById('meter').style.display = this._powerUpTimer ? 'block' : 'none';
        document.getElementById('meter-inner').style.background = isPositive ? POWERUP_COLOR : POWERUP_NEGATIVE_COLOR;
    }

    /**
     * Setup the split filter
     * @param {boolean} enabled
     * @private
     */
    _setupSplitFilter(enabled) {
        if(enabled) {
            this._filterTracker = createFilterTracker(this._ctx.canvas, this._resizeHandler);
        } else {
            this._filterTracker.dispose();
            this._filterTracker = null;
        }
    }

    /**
     * Setup the field rotation effect
     * @param {boolean} enabled
     * @private
     */
    _setupRotation(enabled) {
        if(enabled) {
            this._additionalRotationSpeed = 0.01;
        } else {
            this._additionalRotationSpeed = 0;
        }
    }

    /**
     * @param {PacketDecoder} view
     * @param {number} packetType
     * @private
     */
    _handlePowerUpPacket(view, packetType) {
        console.log("power up packet", packetType);

        // Handle this separately for convenience of the packets structure.
        if(packetType === 1) {
            const x = view.getFloat32();
            const y = view.getFloat32();
            const powerUpType = view.getUint8();
            this._powerup = createPowerUp(x, y, powerUpType);
            console.log('spawned powerup at', x, y);
            return;
        }

        // The power-up is taken, so set it to null.
        this._powerup = null;

        // Common for all non-spawn packets.
        const teamNr = view.getUint8();

        // Track achievement stuff.
        if(teamNr === this._player.teamNr) {
            this._powerUpAchievementBitVector |= 1 << packetType;

            const ALL_POWER_UPS = (
                (1 << 2) |
                (1 << 3) |
                (1 << 4) |
                (1 << 5) |
                (1 << 6)
            );

            if(this._powerUpAchievementBitVector === ALL_POWER_UPS) {
                unlockAchievement(POWERUP_EXPERIENCE);
                // Cheap hack to quickly escape this test in the future.
                ++this._powerUpAchievementBitVector;
            }
        }

        switch(packetType) {
            // Resize players
            case 2: {
                const minPos = view.getFloat32();
                const maxPos = view.getFloat32();
                const wAngle = view.getFloat32();
                this._togglePowerUpTimer(true);
                this._applyResizing(teamNr, minPos, maxPos, wAngle);
                break;
            }

            // Bonus point
            case 3: {
                this._scores[teamNr] += POWERUP_BONUS_POINTS;
                this._updateScoreboard();
                break;
            }

            // Split RGB
            case 4: {
                this._togglePowerUpTimer(false);
                if(teamNr !== this._player.teamNr) {
                    this._setupSplitFilter(this._powerUpTimer);
                }
                break;
            }

            // Rotate field
            case 5: {
                this._togglePowerUpTimer(false);
                if(teamNr !== this._player.teamNr) {
                    this._setupRotation(this._powerUpTimer);
                }
                break;
            }

            // Slow down
            case 6: {
                const factor = view.getFloat32();
                this._togglePowerUpTimer(false);
                if(teamNr !== this._player.teamNr) {
                    this._speedFactor = factor;
                }
                break;
            }
        }
    }

    /**
     * Update scoreboard
     */
    _updateScoreboard() {
        for(let i = 0; i < this._teamCount; ++i) {
            document.getElementById(`score-team${i}`).textContent = this._scores[i];
        }
    }

    /**
     * Adds a firework
     * @param {number} c Color to generate particle hue from
     * @param {number} x
     * @param {number} y
     */
    _addFirework(c, x, y) {
        const r = (c >> 16) & 0xff;
        const g = (c >> 8) & 0xff;
        const b = c & 0xff;
        this.addEffect(new Firework(hueFromRgb(r, g, b), x, y, this.scale));
        SOUND_MANAGER.playStereo(SOUND_MANAGER.fw, x, y, CIRCLE_RADIUS + OUTSIDE_THRESHOLD);
    }

    /**
     * Add effect
     * @param {Firework} o 
     */
    addEffect(o) {
        if(this._stupidObjects.length < 15) {
            this._stupidObjects.push(o);
        }
    }

    /**
     * Begin rendering
     */
    _beginRender() {
        const hw = this._ctx.canvas.width / 2;
        const hh = this._ctx.canvas.height / 2;
        this._ctx.save();
        this._ctx.translate(hw, hh);
        this._ctx.rotate(this._rotation);
        this._ctx.translate(-hw, -hh);
        this._ctx.scale(this.scale, this.scale);
        this._ctx.translate(
            (hw/this.scale) - (FIELD_WIDTH / 2),
            (hh/this.scale) - (FIELD_HEIGHT / 2),
        );
    }

    /**
     * End rendering
     */
    _endRender() {
        this._ctx.restore();

        if(this._filterTracker)
            this._filterTracker.tick();
    }

    /**
     * Draws the field
     */
    _drawField() {
        //this._ctx.fillStyle = 'orange';
        //this._ctx.fillRect(0, 0, this._ctx.canvas.width, this._ctx.canvas.height);
        this._ctx.clearRect(0, 0, this._ctx.canvas.width, this._ctx.canvas.height);
        this._beginRender();

        this._ctx.lineWidth = LINE_WIDTH/*/2*/;
        const angle = Math.PI * 2 / this._teamCount;
        for(let i = 0; i < this._teamCount; ++i) {
            this._ctx.strokeStyle = TEAM_COLORS[i];
            this._ctx.beginPath();
            this._ctx.arc(FIELD_WIDTH / 2, FIELD_HEIGHT / 2, CIRCLE_RADIUS/*48/2-8*/, i * angle, i * angle + angle);
            this._ctx.stroke();
        }

        this._ctx.lineWidth = 1;
        this._ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        this._ctx.beginPath();
        this._ctx.arc(FIELD_WIDTH / 2, FIELD_HEIGHT / 2, BALL_RADIUS, 0, Math.PI * 2);
        this._ctx.stroke();
        if(this._spinTowardsCenter) {
            this._ctx.beginPath();
            this._ctx.arc(FIELD_WIDTH / 2, FIELD_HEIGHT / 2, BALL_RADIUS + 6, 0, Math.PI * 2);
            this._ctx.stroke();
            this._ctx.beginPath();
            this._ctx.arc(FIELD_WIDTH / 2, FIELD_HEIGHT / 2, BALL_RADIUS + 6*2, 0, Math.PI * 2);
            this._ctx.stroke();
        }
    }

    /**
     * Match over handler.
     */
    _matchOverHandler() {
        if(this._timerElem.textContent.length > 0) {
            let seconds = 5;
            const countdownElem = document.getElementById('matchover-countdown');
            const countdownUpdate = () => {
                countdownElem.innerText = `Returning in ${seconds}s`;
                --seconds;
                if(seconds > 0)
                    setTimeout(countdownUpdate, 1000);
            };
            countdownUpdate();

            this._timerElem.textContent = '';
            this._timerElem.style.display = 'none';
            document.getElementById('matchover').style.display = 'flex';

            console.log(this._scores);
            const items = this._scores.map((score, teamNr) => ({score, teamNr})).sort((a, b) => b.score - a.score);
            this._setFinalScores(items);

            // Due to shared x-places, we need to do the checking like this
            if(items[0].teamNr === this._player.teamNr) {
                unlockAchievement(GOLD);
            } else if(items[1].teamNr === this._player.teamNr) {
                unlockAchievement(SILVER);
            } else if(items.length > 2 && items[2].teamNr === this._player.teamNr) {
                unlockAchievement(BRONZE);
            }
            const myScore = items.find(item => item.teamNr === this._player.teamNr).score;
            if(myScore > 100) {
                unlockAchievement(ITS_OVER);
            } else if(myScore === 66) {
                unlockAchievement(EXECUTE_ORDER);
            } else if(myScore === 42) {
                unlockAchievement(THE_ANSWER);
            } else if(myScore === 0) {
                unlockAchievement(MY_PARENTS_BELIEFS);
            }

            if(this._players.length > 10) {
                unlockAchievement(MULTIPLAYER_CHAOS);
            }
        }
    }

    /**
     * Tick.
     * @param {number} delta Delta time
     */
    _tick(delta) {
        //stats.begin();

        const msSinceStart = delta - this._startTime; // Not really delta actually
        const secondsSinceStart = Math.floor(msSinceStart / 1000);
        //console.log(delta, performance.now());
        if(this._prevCounter === 0) {
            this._prevCounter = delta;
            //console.log(initialDelay);
            delta = 0; // First tick: nothing happens
        } else {
            delta -= this._prevCounter;
            this._prevCounter += delta;
            delta *= 0.06;
        }

        let ballDelta = delta;
        if(secondsSinceStart < TIME_WAIT_BEFORE_START) {
            delta = ballDelta = 0;
            updatetextContent(this._timerElem, `Starting in ${TIME_WAIT_BEFORE_START - secondsSinceStart}`);
        } else {
            const remaining = this._matchTime - secondsSinceStart + TIME_WAIT_BEFORE_START;
            if(remaining <= 0) {
                ballDelta = 0;
                this._matchOverHandler();
            } else {
                updatetextContent(this._timerElem, `${getMinutes(remaining)}:${getSeconds(remaining)}`);
            }
        }

        if(this._additionalRotationSpeed > 0) {
            this._rotation += this._additionalRotationSpeed * delta;
            SOUND_MANAGER.rotation = this._rotation;
        }

        const seqNr = Math.floor((msSinceStart - getInitialDelay()) * 0.06);

        {
            // Subtract half of width angle to make sure the cursor is in the middle of the bat.
            let diff = repeat(this.input.angle - this._player.wAngle / 2 - this._player.pos - this._rotation, Math.PI * 2);
            if(diff > Math.PI) diff -= Math.PI * 2;
            diff = clamp(diff, -MAX_MOVE, MAX_MOVE) * this._speedFactor;
            if(Math.abs(diff) > 0.0001) {
                const old = this._player.pos;
                this._updatePlayerPos(diff);
                if(Math.abs(this._player.pos - old) > 0.0001) {
                    this._accumulatedPos += diff;
                    this._pendingInputs.push({diff, nr: seqNr});
                }
            }
        }

        this._drawField();

        if(this._powerup)
            this._powerup.tick(this._ctx, this._rotation);

        Player.prepareRender(this._ctx);
        for(const idx in this._players) { // for .. of doesn't work because sparse
            this._players[idx].tick(this._ctx);
        }
        this._renderTriangle(msSinceStart);
        Player.endRender(this._ctx);

        for(let i = 0; i < this._balls.length; ++i) {
            const ball = this._balls[i];
            if(ball.tick(this._ctx, ballDelta, this._players) === this._player) {
                this._hitBall = i;
                this._accumulatedFrames = MOVE_ACCUMULATION;
            }
        }

        for(let i = 0; i < this._stupidObjects.length;) {
            const o = this._stupidObjects[i];
            if(o.tick(this._ctx, delta)) {
                this._stupidObjects.splice(i, 1);
            } else {
                ++i;
            }
        }

        this._endRender();

        if(++this._accumulatedFrames >= MOVE_ACCUMULATION) {
            if(this._accumulatedPos !== 0 || this._hitBall !== NO_TEAM) {
                this._movePacket.setFloat32(1, this._accumulatedPos, true);
                this._movePacket.setUint32(6, seqNr, true);
                this._movePacket.setUint8(10, this._hitBall);
                this._movePacket.setFloat32(11, this._player.spin, true);
                getConnection().send(this._movePacket);

                this._accumulatedPos = 0;
                this._hitBall = NO_TEAM;
            }
            this._accumulatedFrames = 0;
        }

        //stats.end();
        this._animFrame = window.requestAnimationFrame(this._tick);
    }

    /**
     * Render player marker triangle.
     * @param {number} msSinceStart 
     */
    _renderTriangle(msSinceStart) {
        const TIME_WAIT_MS = TIME_WAIT_BEFORE_START * 1000;
        if(msSinceStart < TIME_WAIT_MS) {
            const percentage = msSinceStart / TIME_WAIT_MS;
            const PERCENTAGE_CUTOFF = 0.75;
            let amp;
            if(percentage > PERCENTAGE_CUTOFF) {
                amp = 0.25 + 0.75 * (1 - percentage) / (1 - PERCENTAGE_CUTOFF);
            } else {
                const NR_PULSES = 2;
                amp = 0.6 + Math.cos(percentage / PERCENTAGE_CUTOFF * NR_PULSES * 2 * Math.PI) * 0.4;
            }
            this._player.drawTriangle(this._ctx, amp);
        } else {
            this._player.drawTriangle(this._ctx, 0.25);
        }
    }

    /**
     * @param {number} diff
     * @private
     */
    _updatePlayerPos(diff) {
        this._player.moveTo(clamp(this._player.pos + diff, this._minPos, this._maxPos));
    }

    /**
     * Server reconciliation for local inputs
     * @param {number} receivedSeqNr The seq nr of the server message
     */
    _serverReconciliation(receivedSeqNr) {
        let i = 0;
        while(i < this._pendingInputs.length) {
            const input = this._pendingInputs[i];
            if(input.nr <= receivedSeqNr) {
                // Already processed, drop it.
                this._pendingInputs.splice(i, 1);
            } else {
                // Not processed by the server yet, re-apply.
                this._updatePlayerPos(input.diff);
                ++i;
            }
        }
    }
}
