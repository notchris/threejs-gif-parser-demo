import { decompressFrames, ParsedFrame, parseGIF } from "gifuct-js";
import {
  Camera,
  DataTexture,
  DoubleSide,
  Mesh,
  Object3D,
  PlaneGeometry,
  RGBAFormat,
  ShaderMaterial,
} from "three";

export default class AnimatedSprite extends Object3D {
  frames: ParsedFrame[] = [];
  frameDurations: number[] = [];
  textures: DataTexture[] = [];
  material: ShaderMaterial | undefined;
  mesh: Mesh | undefined;
  currentFrame = 0;
  accumulatedTime = 0;
  loaded: boolean = false;
  shadow: boolean = false;
  constructor(shadow?: boolean) {
    super();

    this.shadow = shadow || false;
  }

  async load(url: string): Promise<void> {
    try {
      const img = new Image();
      img.src = url;
      await img.decode();

      const { width: gifWidth, height: gifHeight } = img;

      const req = await fetch(url);
      const buf = await req.arrayBuffer();
      const gif = parseGIF(buf);

      this.frames = decompressFrames(gif, true);
      this.frameDurations = this.frames.map((frame) => frame.delay / 1000);

      this.textures = this.frames.map((frame) => {
        const { width, height, top, left } = frame.dims;
        const overallPixelData = new Uint8Array(gifWidth * gifHeight * 4); // RGBA

        // Initialize with transparent pixels
        for (let i = 0; i < overallPixelData.length; i += 4) {
          overallPixelData[i + 0] = 0; // R
          overallPixelData[i + 1] = 0; // G
          overallPixelData[i + 2] = 0; // B
          overallPixelData[i + 3] = 0; // A
        }

        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const frameIndex = y * width + x;
            const overallIndex = ((top + y) * gifWidth + (left + x)) * 4;

            const colorIndex = frame.pixels[frameIndex];
            const [r, g, b] = frame.colorTable[colorIndex];
            const a = colorIndex === frame.transparentIndex ? 0 : 255; // Handle transparency

            overallPixelData[overallIndex + 0] = this.shadow ? 0 : r;
            overallPixelData[overallIndex + 1] = this.shadow ? 0 : g;
            overallPixelData[overallIndex + 2] = this.shadow ? 0 : b;
            overallPixelData[overallIndex + 3] = a;
          }
        }

        const texture = new DataTexture(
          overallPixelData,
          gifWidth,
          gifHeight,
          RGBAFormat
        );
        texture.needsUpdate = true;
        return texture;
      });

      const vertexShader = `
    varying vec2 vUv;

    void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

      const fragmentShader = `
    uniform sampler2D pixels;
    varying vec2 vUv;

    void main() {
        vec4 color = texture2D(pixels, vUv);
        if (color.a < 0.5) discard;
        gl_FragColor = color;
        ${this.shadow ? "gl_FragColor.a = 0.1;" : ""}
    }
`;

      this.material = new ShaderMaterial({
        uniforms: {
          pixels: { value: this.textures[0] },
        },
        vertexShader,
        fragmentShader,
        transparent: true,
        side: DoubleSide,
      });

      const geometry = new PlaneGeometry(gifWidth, gifHeight);
      this.mesh = new Mesh(geometry, this.material);
      this.add(this.mesh);
      this.mesh.scale.set(0.01, -0.01, 0);
      this.mesh.position.y += (gifHeight * 0.01) / 2;

      if (this.shadow) {
        this.mesh.rotation.x = Math.PI / 2;
        this.mesh.position.y = 0.01;
        this.mesh.position.z = (gifHeight * 0.01) / 2;
      }

      this.loaded = true;
    } catch (error) {
      throw new Error("Bad frames idk");
    }
  }

  update(delta: number, camera: Camera) {
    this.accumulatedTime += delta;

    if (this.frames.length && this.material) {
      if (this.accumulatedTime >= this.frameDurations[this.currentFrame]) {
        this.accumulatedTime = 0;
        this.currentFrame = (this.currentFrame + 1) % this.frames.length;
        this.material.uniforms.pixels.value = this.textures[this.currentFrame];
      }
    }
    if (this.mesh && !this.shadow) {
      this.mesh.quaternion.copy(camera.quaternion);
    }
    if (this.mesh && this.shadow) {
      this.mesh.rotation.z = camera.quaternion.z;
    }
  }
}
