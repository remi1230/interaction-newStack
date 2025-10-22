// src/engine/MeshLines.ts
import { Geometry, Mesh, Shader } from "pixi.js";

/**
 * MeshLines : rend N segments (x0,y0 → x1,y1) en 1 draw call.
 * - Épaisseur en pixels (aThickness)
 * - Couleur par segment (aColor, aAlpha)
 * - Caps "butt"
 *
 * API :
 *   const ml = new MeshLines(maxSegments);
 *   ml.setViewport(w, h); // pour l'extrusion en pixels
 *   ml.setSegments(segmentsArray); // [{x0,y0,x1,y1,width,color,alpha}, ...]
 */
export type LineSeg = {
  x0: number; y0: number; x1: number; y1: number;
  width: number;      // en pixels (épaisseur totale)
  color: number;      // 0xRRGGBB
  alpha: number;      // 0..1
};

export class MeshLines extends Mesh {
  private maxSegments: number;

  // CPU-side typed arrays (réutilisées chaque frame)
  private aPosBuf: Float32Array;     // vec2
  private aOtherBuf: Float32Array;   // vec2
  private aSideBuf: Float32Array;    // float
  private aThickBuf: Float32Array;   // float
  private aColorBuf: Float32Array;   // vec3 (rgb 0..1)
  private aAlphaBuf: Float32Array;   // float
  private indexBuf: Uint32Array;

  constructor(maxSegments: number) {
    const vert = /* glsl */`
      precision mediump float;

      attribute vec2 aPos;       // p
      attribute vec2 aOther;     // q (autre extrémité)
      attribute float aSide;     // -1.0 / +1.0
      attribute float aThickness;// en pixels
      attribute vec3  aColor;
      attribute float aAlpha;

      uniform mat3 projectionMatrix;
      uniform vec2 uViewport;    // (width, height) en pixels

      varying vec4 vColor;

      void main() {
        // pos clip-space (Pixi proj -> clip -1..+1 déjà)
        vec3 P = projectionMatrix * vec3(aPos, 1.0);
        vec3 Q = projectionMatrix * vec3(aOther, 1.0);

        vec2 dir = normalize(Q.xy - P.xy);
        vec2 n = vec2(-dir.y, dir.x);

        // pixels -> clip (référence axe Y)
        float halfPx = aThickness * 0.5;
        float pxToClip = (halfPx / uViewport.y) * 2.0;

        vec2 offset = n * pxToClip * aSide;

        gl_Position = vec4(P.xy + offset, 0.0, 1.0);
        vColor = vec4(aColor, aAlpha);
      }
    `;

    const frag = /* glsl */`
      precision mediump float;
      varying vec4 vColor;
      void main() {
        gl_FragColor = vColor;
      }
    `;

    const vCount = maxSegments * 4;
    const iCount = maxSegments * 6;

    const aPosBuf    = new Float32Array(vCount * 2);
    const aOtherBuf  = new Float32Array(vCount * 2);
    const aSideBuf   = new Float32Array(vCount);
    const aThickBuf  = new Float32Array(vCount);
    const aColorBuf  = new Float32Array(vCount * 3);
    const aAlphaBuf  = new Float32Array(vCount);
    const indexBuf   = new Uint32Array(iCount);

    const geom = new Geometry()
      .addAttribute("aPos", aPosBuf, 2)
      .addAttribute("aOther", aOtherBuf, 2)
      .addAttribute("aSide", aSideBuf, 1)
      .addAttribute("aThickness", aThickBuf, 1)
      .addAttribute("aColor", aColorBuf, 3)
      .addAttribute("aAlpha", aAlphaBuf, 1)
      .addIndex(indexBuf);

    // indices fixes par segment
    for (let s = 0; s < maxSegments; s++) {
      const vb = s * 4;
      const ib = s * 6;
      indexBuf[ib + 0] = vb + 0;
      indexBuf[ib + 1] = vb + 1;
      indexBuf[ib + 2] = vb + 2;
      indexBuf[ib + 3] = vb + 2;
      indexBuf[ib + 4] = vb + 1;
      indexBuf[ib + 5] = vb + 3;
    }

    const shader = new Shader({
      gl: { vertex: vert, fragment: frag },
      resources: {},
      uniforms: { uViewport: { x: 1, y: 1 } as any },
    });

    super({ geometry: geom, shader });

    this.maxSegments = maxSegments;
    this.aPosBuf   = aPosBuf;
    this.aOtherBuf = aOtherBuf;
    this.aSideBuf  = aSideBuf;
    this.aThickBuf = aThickBuf;
    this.aColorBuf = aColorBuf;
    this.aAlphaBuf = aAlphaBuf;
    this.indexBuf  = indexBuf;

    this.state.culling = false;
  }

  setViewport(w: number, h: number) {
    (this.shader.uniforms as any).uViewport = { x: w, y: h };
  }

  setSegments(segments: LineSeg[]) {
    const n = Math.min(segments.length, this.maxSegments);

    for (let s = 0; s < n; s++) {
      const { x0, y0, x1, y1, width, color, alpha } = segments[s];

      const r = ((color >> 16) & 255) / 255;
      const g = ((color >> 8)  & 255) / 255;
      const b = ( color        & 255) / 255;

      const vb = s * 4;

      // positions
      this.aPosBuf.set([x0, y0,  x0, y0,  x1, y1,  x1, y1], vb * 2);
      // other (l’extrémité opposée)
      this.aOtherBuf.set([x1, y1,  x1, y1,  x0, y0,  x0, y0], vb * 2);
      // sides
      this.aSideBuf.set([-1, +1, -1, +1], vb);
      // épaisseur
      this.aThickBuf.set([width, width, width, width], vb);
      // couleur
      this.aColorBuf.set([r,g,b,  r,g,b,  r,g,b,  r,g,b], vb * 3);
      // alpha
      this.aAlphaBuf.set([alpha, alpha, alpha, alpha], vb);
    }

    // tronque les vues GPU au nombre utile
    this.geometry.getIndex().update(this.indexBuf.subarray(0, n * 6));
    this.geometry.getAttribute("aPos").update(this.aPosBuf.subarray(0, n * 8));
    this.geometry.getAttribute("aOther").update(this.aOtherBuf.subarray(0, n * 8));
    this.geometry.getAttribute("aSide").update(this.aSideBuf.subarray(0, n * 4));
    this.geometry.getAttribute("aThickness").update(this.aThickBuf.subarray(0, n * 4));
    this.geometry.getAttribute("aColor").update(this.aColorBuf.subarray(0, n * 12));
    this.geometry.getAttribute("aAlpha").update(this.aAlphaBuf.subarray(0, n * 4));
  }
}