import "./style.scss";
import Swal from "sweetalert2";

import {
  ACESFilmicToneMapping,
  AxesHelper,
  Clock,
  Color,
  DirectionalLight,
  HemisphereLight,
  MathUtils,
  Mesh,
  MeshPhongMaterial,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  Vector3,
  WebGLRenderer,
} from "three";

import InfiniteGridHelper from "./helpers/gridhelper.js";

import { Sky } from "three/addons/objects/Sky.js";

import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { resizeRendererToDisplaySize } from "./helpers/responsiveness.js";

import AnimatedSprite from "./helpers/animatedsprite.js";

const CANVAS_ID = "scene";
const POKEMON_ID_MIN = 1;
const POKEMON_ID_MAX = 351;


function getRandomInt(min: number, max: number) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min) + min); // The maximum is exclusive and the minimum is inclusive
}


class PokemonScene {
  canvas: HTMLElement;
  renderer: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  cameraControls: OrbitControls;
  clock: Clock;
  sky: Sky;
  sun: Vector3;
  effectController: {
    turbidity: number;
    rayleigh: number;
    mieCoefficient: number;
    mieDirectionalG: number;
    elevation: number;
    azimuth: number;
    exposure: number;
  };
  sprite?: AnimatedSprite;
  shadow?: AnimatedSprite;
  constructor() {
    this.canvas = document.querySelector(`canvas#${CANVAS_ID}`)!;
    this.renderer = new WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    this.querystring = new URLSearchParams(document.location.search);
    this.pokemonId = parseInt(this.querystring.get('pokemonid')) || this.getRandomPokemonId();


    this.scene = new Scene();
    this.scene.background = new Color(0xeeeeee);

    this.sky = new Sky();
    this.sky.scale.setScalar(450000);

    this.scene.add(this.sky);

    this.sun = new Vector3();

    this.effectController = {
      turbidity: 0,
      rayleigh: 0.116,
      mieCoefficient: 0.019,
      mieDirectionalG: 0.508,
      elevation: 30,
      azimuth: -90,
      exposure: this.renderer.toneMappingExposure,
    };

    const uniforms = this.sky.material.uniforms;
    uniforms["turbidity"].value = this.effectController.turbidity;
    uniforms["rayleigh"].value = this.effectController.rayleigh;
    uniforms["mieCoefficient"].value = this.effectController.mieCoefficient;
    uniforms["mieDirectionalG"].value = this.effectController.mieDirectionalG;

    const phi = MathUtils.degToRad(90 - this.effectController.elevation);
    const theta = MathUtils.degToRad(this.effectController.azimuth);

    this.sun.setFromSphericalCoords(1, phi, theta);

    uniforms["sunPosition"].value.copy(this.sun);

    const hemiLight = new HemisphereLight(0xffffff, 0x444444);
    hemiLight.position.set(0, 20, 0);
    this.scene.add(hemiLight);

    const dirLight = new DirectionalLight(0xffffff);
    dirLight.position.set(3, 10, 10);
    dirLight.castShadow = true;
    dirLight.shadow.camera.top = 2;
    dirLight.shadow.camera.bottom = -2;
    dirLight.shadow.camera.left = -2;
    dirLight.shadow.camera.right = 2;
    dirLight.shadow.camera.near = 0.1;
    dirLight.shadow.camera.far = 40;
    this.scene.add(dirLight);

    const grassMaterial = new MeshPhongMaterial({
      color: 0xffffff,
    });

    const mesh = new Mesh(new PlaneGeometry(100, 100), grassMaterial);
    mesh.geometry.rotateX(-Math.PI / 2);
    mesh.receiveShadow = true;
    this.scene.add(mesh);

    const axesHelper = new AxesHelper(4);
    axesHelper.visible = false;
    this.scene.add(axesHelper);

    const gridHelper = new InfiniteGridHelper(2, 2, new Color("#BBBBBB"), 500);
    gridHelper.position.y = 0.01;

    this.scene.add(gridHelper);

    this.camera = new PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      0.1,
      100
    );
    this.camera.position.set(2, 0.5, 2);

    this.cameraControls = new OrbitControls(this.camera, this.canvas);

    this.cameraControls.enableDamping = true;
    this.cameraControls.autoRotate = false;
    this.cameraControls.target.set(0, 0.5, 0);
    this.cameraControls.update();

    this.clock = new Clock();

    this.getPokemon();

    this.animate();
  }

  async getPokemon() {
    if (this.shadow) this.scene.remove(this.shadow);
    if (this.sprite) this.scene.remove(this.sprite);

    const pid = this.pokemonId;
    const baseUrl =
      "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/showdown/";
    this.shadow = new AnimatedSprite(true);
    this.sprite = new AnimatedSprite();
    await this.shadow.load(baseUrl + pid + ".gif");
    await this.sprite.load(baseUrl + pid + ".gif");
    this.scene.add(this.sprite);
    this.scene.add(this.shadow);

    const info = async () => {
      const res = await fetch("https://pokeapi.co/api/v2/pokemon/" + pid);
      const data = await res.json();

      const name = (data.name as string).toUpperCase();
      Swal.fire({
        template: "#popup",
        html: `A WILD <strong>${name}</strong> APPEARED. ${data.id}`,
        position: "top",
        backdrop: false,
        preConfirm: async () => {
          this.pokemonId = this.getRandomPokemonId();
          return await this.getPokemon();
        },
      });
      // Swal.fire({
      //   html: `A WILD <strong>${name}</strong> APPEARED.`,
      //   backdrop: false,
      //   confirmButtonText: "LOAD NEW",
      //   preConfirm: async () => {
      //     return await this.getPokemon();
      //   },
      //   position: "top",
      // });
    };

    info();
  }

  animate() {
    requestAnimationFrame(() => {
      this.animate();
    });

    const delta = this.clock.getDelta();

    if (resizeRendererToDisplaySize(this.renderer)) {
      const canvas = this.renderer.domElement;
      this.camera.aspect = canvas.clientWidth / canvas.clientHeight;
      this.camera.updateProjectionMatrix();
    }

    if (this.sprite && this.sprite.loaded) {
      this.sprite.update(delta, this.camera);
    }

    if (this.shadow && this.shadow.loaded) {
      this.shadow.update(delta, this.camera);
    }

    this.cameraControls.update();

    this.renderer.render(this.scene, this.camera);
  }

  getRandomPokemonId() {
    return getRandomInt(POKEMON_ID_MIN, POKEMON_ID_MAX);
  }
}

new PokemonScene();
