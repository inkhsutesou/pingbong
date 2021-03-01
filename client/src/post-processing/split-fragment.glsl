precision highp float;

varying vec2 texCoords;
uniform sampler2D texture;
uniform vec2 canvasDimensions;
uniform float time;
uniform vec3 amps;

#define M_PI 3.14159265358979

vec2 transform(vec2 x) {
  return x * 40.0;
}

vec2 getShift(float amp) {
  return transform(vec2(cos(amp * time) + sin(M_PI * time), sin(amp * time) + cos(M_PI * time)));
}

float fmod(float x, float y) {
  return x - y * floor(x/y);
}

// https://stackoverflow.com/questions/15095909/from-rgb-to-hsv-in-opengl-glsl
vec3 rgb2hsv(vec3 c) {
    vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
    vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
    vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
    float d = q.x - min(q.w, q.y);
    float e = 1.0e-10;
    return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main() {
  vec2 redShift = getShift(amps.x);
  vec2 greenShift = getShift(amps.y);
  vec2 blueShift = getShift(amps.z);

  redShift /= canvasDimensions * 2.0;
  greenShift /= canvasDimensions * 2.0;
  blueShift /= canvasDimensions * 2.0;

  vec4 redSample = texture2D(texture, texCoords + redShift);
  vec4 greenSample = texture2D(texture, texCoords + greenShift);
  vec4 blueSample = texture2D(texture, texCoords + blueShift);

  vec3 hsv = rgb2hsv(vec3(redSample.r, greenSample.g, blueSample.b));
  hsv.yz = clamp(hsv.yz * vec2(0.85, 1.25), 0.0, 1.0);
  gl_FragColor = vec4(hsv2rgb(hsv), (redSample.a+greenSample.a+blueSample.a)/3.0);
}
