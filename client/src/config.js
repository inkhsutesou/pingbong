import {isLikelyMobile} from "./util";

export const TEAM_COLORS_INT = [0xC5082B, 0xf5a612, 0x58ab20, 0x00A8E8, 0xb12a7d];
export const TEAM_COLORS = TEAM_COLORS_INT.map(x => `#${x.toString(16).padStart(6, '0')}`);
//export const TEAM_COLORS_PASTEL = ['#FFCCD5', '#FFE6B6', '#D8FFBE', '#D1F2FF', '#F8BBE0'];

export const HIGH_PING_THRESHOLD = 150;

export const PROTOCOL_VERSION = 9;

export const POWERUP_COLOR = '#ABD844';
export const POWERUP_NEGATIVE_COLOR = '#EA3050';

/// Circle radius in pixels.
export const CIRCLE_RADIUS = 300;

export const FIELD_WIDTH = 800;
export const FIELD_HEIGHT = 800;
export const CANVAS_PADDING = isLikelyMobile() ? -40 : 0;

export const BACKGROUND_COLOR_R = 0x0b;
export const BACKGROUND_COLOR_G = 0x12;
export const BACKGROUND_COLOR_B = 0x21;
//export const BACKGROUND_COLOR = `rgb(${BACKGROUND_COLOR_R},${BACKGROUND_COLOR_G},${BACKGROUND_COLOR_B})`;

/// Visual padding of player.
export const W_PADDING = 4;

export const LINE_WIDTH = 10;

/// Ball.
export const BALL_RADIUS = 8;
export const BALL_RADIUS_ANGLE = Math.atan(BALL_RADIUS / CIRCLE_RADIUS);
