// What the audio engine can play. Every mode builds its sound events from these; the engine
// knows nothing about any mode. A sound carries its own stereo position (pan: -1 left … 1 right).

export type Instrument = 'pluck' | 'bass' | 'bell' | 'chip' | 'lead' | 'pad' | 'organ' | 'piano' | 'robot';
export type DrumKind = 'kick' | 'snare' | 'hat' | 'clap' | 'tom' | 'crash';
export type SfxKind =
  | 'data'
  | 'computer'
  | 'granted'
  | 'spawn'
  | 'boing'
  | 'ooh'
  | 'rumble'
  | 'sweep'
  | 'whoosh'
  | 'chirp'
  | 'zap'
  | 'laser'
  | 'gliss'
  | 'question'
  | 'explode'
  | 'chime'
  | 'crunch'
  | 'kaching'
  | 'fire'
  | 'rain'
  | 'party'
  | 'whistle'
  | 'bubbles'
  | 'warp'
  | 'bloop'
  | 'drop'
  | 'squish'
  | 'siren'
  | 'bark'
  | 'meow'
  | 'moo'
  | 'quack'
  | 'oink'
  | 'roar'
  | 'fart'
  | 'vroom'
  | 'robot'
  | 'ghost'
  | 'ufo'
  | 'rocket'
  | 'train'
  | 'buzz'
  | 'ribbit'
  | 'hoot'
  | 'whalesong'
  | 'hiss';

export type Sound =
  | { type: 'note'; inst: Instrument; midi: number; dur: number; vel: number; glide: number; vib: number; echo: number }
  | { type: 'drum'; kind: DrumKind; vel: number }
  | { type: 'sfx'; kind: SfxKind; vel: number; p: number }
  | { type: 'dtmf'; digits: string };
export type SoundOf<T extends Sound['type']> = Extract<Sound, { type: T }>;
/** a sound placed in the stereo field */
export type Panned = Sound & { pan?: number };
