// The rest of the little WebGL2 that COOKIE_ needs (programs: src/engine/gl.ts): one render target, 4x4 matrices.
// Matrices are column-major Float32Array(16), as GL wants them.
import type { GL } from '../../engine/gl';

export interface Target {
  fbo: WebGLFramebuffer;
  tex: WebGLTexture;
  depth: WebGLRenderbuffer;
  w: number;
  h: number;
}

/** RGBA8 colour (linear filter, clamped) with a 24 bit depth buffer */
export function target(gl: GL, w: number, h: number): Target {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const depth = gl.createRenderbuffer()!;
  gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
  const fbo = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { fbo, tex, depth, w, h };
}

export function freeTarget(gl: GL, t: Target): void {
  gl.deleteFramebuffer(t.fbo);
  gl.deleteTexture(t.tex);
  gl.deleteRenderbuffer(t.depth);
}

export type Vec3 = [number, number, number];

export function perspective(fovy: number, aspect: number, near: number, far: number): Float32Array {
  const f = 1 / Math.tan(fovy / 2);
  const m = new Float32Array(16);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = (far + near) / (near - far);
  m[11] = -1;
  m[14] = (2 * far * near) / (near - far);
  return m;
}

export function lookAt(eye: Vec3, at: Vec3, up: Vec3): Float32Array {
  let fx = at[0] - eye[0];
  let fy = at[1] - eye[1];
  let fz = at[2] - eye[2];
  const fl = Math.hypot(fx, fy, fz) || 1;
  fx /= fl;
  fy /= fl;
  fz /= fl;
  let sx = fy * up[2] - fz * up[1];
  let sy = fz * up[0] - fx * up[2];
  let sz = fx * up[1] - fy * up[0];
  const sl = Math.hypot(sx, sy, sz) || 1;
  sx /= sl;
  sy /= sl;
  sz /= sl;
  const ux = sy * fz - sz * fy;
  const uy = sz * fx - sx * fz;
  const uz = sx * fy - sy * fx;
  const m = new Float32Array(16);
  m[0] = sx;
  m[4] = sy;
  m[8] = sz;
  m[1] = ux;
  m[5] = uy;
  m[9] = uz;
  m[2] = -fx;
  m[6] = -fy;
  m[10] = -fz;
  m[12] = -(sx * eye[0] + sy * eye[1] + sz * eye[2]);
  m[13] = -(ux * eye[0] + uy * eye[1] + uz * eye[2]);
  m[14] = fx * eye[0] + fy * eye[1] + fz * eye[2];
  m[15] = 1;
  return m;
}

/** a * b */
export function mul(a: Float32Array, b: Float32Array): Float32Array {
  const m = new Float32Array(16);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r]! * b[c * 4 + k]!;
      m[c * 4 + r] = s;
    }
  return m;
}
