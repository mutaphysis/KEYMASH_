// Shared types: the event protocol between the pure VM and the engines (audio, renderer, UI).

export interface Color { h: number; s: number; l: number }
export type Point = [number, number];

/** Every op the VM's effect library knows. Spells, emoji powers and symbols all resolve to these. */
export const OPS = [
  // shapes
  'circle', 'square', 'tri', 'star', 'heart', 'flower', 'ring', 'spiral', 'tree', 'sun', 'moon', 'grid', 'poly', 'dot', 'snowflake',
  // curves
  'sin', 'cos', 'tan', 'wave', 'rose', 'zigzag', 'bounce', 'dna', 'knot', 'scribble', 'math',
  // turtle
  'go', 'back', 'left', 'right', 'turn', 'home', 'jump', 'up', 'down',
  // colour
  'red', 'green', 'blue', 'yellow', 'orange', 'pink', 'purple', 'cyan', 'white', 'gold', 'rainbow', 'dark', 'light', 'invert',
  // particles
  'fire', 'rain', 'snow', 'confetti', 'boom', 'fireworks', 'bubbles', 'smoke', 'sparkle', 'stars', 'money',
  // screen
  'glitch', 'spin', 'zoom', 'shrink', 'shake', 'flip', 'mirror', 'kaleido', 'tunnel', 'warp', 'tilt', 'calm', 'trails',
  // sound
  'beep', 'boop', 'bassdrop', 'drum', 'kick', 'snare', 'clap', 'hat', 'laser', 'siren', 'chord', 'arp', 'chime',
  'bark', 'meow', 'moo', 'quack', 'oink', 'roar', 'fart', 'vroom',
  // instruments
  'i_piano', 'i_organ', 'i_bell', 'i_bass', 'i_chip', 'i_pad', 'i_robot', 'i_pluck', 'i_lead',
  // music
  'fast', 'slow', 'major', 'minor', 'blues', 'spooky', 'japan',
  // hacker
  'hack', 'access', 'mainframe', 'virus', 'download', 'matrix',
  // creatures and things
  'dog', 'paws', 'cat', 'cow', 'duck', 'pig', 'bird', 'fish', 'dino', 'dragon', 'unicorn', 'ghost', 'alien', 'robot',
  'rocket', 'ball', 'bone', 'squirrel', 'poop', 'pizza', 'cake', 'banana', 'car', 'train',
  // control
  'fork', 'random', 'chaos',
] as const;
export type Op = (typeof OPS)[number];

export type Instrument = 'pluck' | 'bass' | 'bell' | 'chip' | 'lead' | 'pad' | 'organ' | 'piano' | 'robot';
export type DrumKind = 'kick' | 'snare' | 'hat' | 'clap' | 'tom' | 'crash';
export type SfxKind =
  | 'data' | 'computer' | 'granted' | 'spawn' | 'boing' | 'ooh' | 'rumble' | 'sweep' | 'whoosh' | 'chirp' | 'zap'
  | 'laser' | 'gliss' | 'question' | 'explode' | 'chime' | 'crunch' | 'kaching' | 'fire' | 'rain' | 'party'
  | 'whistle' | 'bubbles' | 'warp' | 'bloop' | 'drop' | 'siren' | 'bark' | 'meow' | 'moo' | 'quack' | 'oink'
  | 'roar' | 'fart' | 'vroom' | 'robot' | 'ghost' | 'ufo' | 'rocket' | 'train';
export type ShapeKind = 'circle' | 'ring' | 'dot' | 'square' | 'tri' | 'poly' | 'star' | 'heart' | 'flower' | 'sun' | 'moon' | 'cross';
export type ParticleKind =
  | 'burst' | 'dots' | 'stream' | 'stars' | 'sparkle' | 'confetti' | 'chars' | 'emoji' | 'paws' | 'fire' | 'rain'
  | 'snow' | 'smoke' | 'bubbles' | 'money' | 'matrix' | 'warp';
export type TextStyle = 'float' | 'big' | 'num' | 'sub';
export type ActorKind = 'run' | 'drive' | 'fly' | 'swim' | 'ufo' | 'stomp' | 'rocket' | 'ball' | 'firework' | 'float' | 'pop';

/** Fields every event can carry. `dt` = fraction of the tick, `at` = extra seconds. */
export interface EvBase { dt: number; th?: number; pan?: number; at?: number }

export interface ParticleSpec { kind: ParticleKind; n: number; x: number; y: number; color?: Color; ch?: string; spread?: number }

export type VMEvent = EvBase & (
  // sound
  | { type: 'note'; inst: Instrument; midi: number; dur: number; vel: number; glide: number; vib: number; echo: number }
  | { type: 'drum'; kind: DrumKind; vel: number }
  | { type: 'sfx'; kind: SfxKind; vel: number; p: number }
  | { type: 'dtmf'; digits: string }
  | { type: 'say'; text: string; pitch: number; rate: number }
  // drawing
  | { type: 'stroke'; pts: Point[]; w: number; dur: number; color: Color; delay?: number; paw?: boolean }
  | { type: 'shape'; kind: ShapeKind; x: number; y: number; r: number; rot: number; color: Color; fill: boolean; w: number; life: number; grow: number; n?: number }
  | ({ type: 'particles' } & ParticleSpec)
  | { type: 'text'; s: string; x: number; y: number; size: number; style: TextStyle; color: Color }
  | { type: 'math'; s: string; x: number; y: number; color: Color; big?: boolean }
  | { type: 'emoji'; ch: string; x: number; y: number; size: number; life: number }
  | { type: 'actor'; kind: ActorKind; ch?: string; x: number; y: number; ang?: number; size?: number; color?: Color; delay?: number }
  | { type: 'banner'; text: string; progress?: boolean }
  // screen
  | { type: 'glitch'; amt: number; dur: number }
  | { type: 'view'; zoom?: number; zoomTo?: number; shake?: number; rot?: number; spin?: number; wobble?: number; flip?: boolean }
  | { type: 'feedback'; amt: number; zoom: number; rot: number; dur: number }
  | { type: 'mode'; mirror?: 'toggle'; kaleido?: 'toggle' }
  | { type: 'flash'; color: Color; a: number }
  | { type: 'bg'; h?: number; l?: number }
  | { type: 'invert'; dur: number }
  | { type: 'siren'; dur: number }
  | { type: 'trails'; v: number }
  | { type: 'calm' }
  | { type: 'rainbow' }
  // ui
  | { type: 'hl'; g0: number; g1: number; hue: number }
  | { type: 'log'; text: string }
  | { type: 'gen'; gen: number }
  | { type: 'die' }
);

export type EventType = VMEvent['type'];
export type EventOf<T extends EventType> = Extract<VMEvent, { type: T }>;

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
/** What VM code passes to emit(): everything but the timing, which emit() fills in. */
export type EvInput = DistributiveOmit<VMEvent, 'dt'>;

export type SoundEvent = EventOf<'note' | 'drum' | 'sfx' | 'dtmf'>;
export const isSound = (e: VMEvent): e is SoundEvent =>
  e.type === 'note' || e.type === 'drum' || e.type === 'sfx' || e.type === 'dtmf';
