// The rest of the little WebGL2 that MYCELIUM_ needs (programs: src/engine/gl.ts): meshes, an offscreen target,
// textures from decoded pictures. Everything is 2D (a side view panned in x and y), so no matrices.
import type { GL } from '../../engine/gl';
/** a float vertex buffer of `bytes`, refilled with bufferSubData as the meshes change */
export function vertexBuffer(gl: GL, bytes: number): WebGLBuffer {
  const vbo = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, bytes, gl.DYNAMIC_DRAW);
  return vbo;
}

/**
 * A vertex array over `vbo`, interleaved floats: attribute i (the shaders' `layout(location = i)`) takes `sizes[i]`
 * of them, one after the other, so a vertex is their sum. `indices` become its element buffer. A wireframe is a second
 * one over the same buffer with line indices (its shader reads location 0 only).
 */
export function vao(gl: GL, vbo: WebGLBuffer, sizes: readonly number[], indices: Uint16Array): WebGLVertexArrayObject {
  const v = gl.createVertexArray()!;
  gl.bindVertexArray(v);
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  const stride = sizes.reduce((s, n) => s + n, 0) * 4;
  let at = 0;
  sizes.forEach((n, i) => {
    gl.enableVertexAttribArray(i);
    gl.vertexAttribPointer(i, n, gl.FLOAT, false, stride, at);
    at += n * 4;
  });
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
  gl.bindVertexArray(null);
  return v;
}

export interface Target {
  fbo: WebGLFramebuffer;
  tex: WebGLTexture;
  /** painter's order as depth (render.ts), so opaque layers in front hide what is behind them before it is shaded */
  depth: WebGLRenderbuffer;
  w: number;
  h: number;
}

/** RGBA8 colour, linear filter, clamped; a 16-bit depth buffer beside it */
export function target(gl: GL, w: number, h: number): Target {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const fbo = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  const depth = gl.createRenderbuffer();
  gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, w, h);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { fbo, tex, depth, w, h };
}

export function freeTarget(gl: GL, t: Target): void {
  gl.deleteFramebuffer(t.fbo);
  gl.deleteTexture(t.tex);
  gl.deleteRenderbuffer(t.depth);
}

export type Wrap = 'clamp' | 'repeat' | 'mirror';

const MAX_LEVELS = (w: number, h: number) => Math.floor(Math.log2(Math.max(w, h))) + 1;

/**
 * A mipmapped texture from a premultiplied bitmap (the preloader decodes with premultiplyAlpha), so blending and
 * mipmaps never bleed the colour of transparent texels into edges. `wrapS`/`wrapT` as GL wraps.
 */
export function texture(gl: GL, src: ImageBitmap, wrapS: Wrap, wrapT: Wrap): WebGLTexture {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texStorage2D(gl.TEXTURE_2D, MAX_LEVELS(src.width, src.height), gl.RGBA8, src.width, src.height);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, src);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, glWrap(gl, wrapS));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, glWrap(gl, wrapT));
  return tex;
}

/** pictures of one size as the layers of a repeating, mipmapped array texture (the soil horizons) */
export function textureArray(gl: GL, layers: ImageBitmap[]): WebGLTexture {
  const { width: w, height: h } = layers[0]!;
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texStorage3D(gl.TEXTURE_2D_ARRAY, MAX_LEVELS(w, h), gl.RGBA8, w, h, layers.length);
  layers.forEach((b, i) => gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, i, w, h, 1, gl.RGBA, gl.UNSIGNED_BYTE, b));
  gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.REPEAT);
  return tex;
}

function glWrap(gl: GL, w: Wrap): number {
  return w === 'mirror' ? gl.MIRRORED_REPEAT : w === 'repeat' ? gl.REPEAT : gl.CLAMP_TO_EDGE;
}
