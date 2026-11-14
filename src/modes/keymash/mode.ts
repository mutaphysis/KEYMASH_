// KEYMASH_'s code, loaded on first use (index.ts has what the shell needs up front).
import type { ModeCode } from '../types';
import type { VoiceMode } from '../../engine/audio';
import { lex } from '../../lang/lexer';
import { Player } from './player';
import { MatrixRain } from './backdrop';
import { DEMOS } from './demos';
import { SHEET } from './sheet';
import { t } from './messages';

const KEYS = [
  '!',
  '?',
  '~',
  '(',
  ')',
  '[',
  ']',
  '{',
  '}',
  '#',
  '*',
  '@',
  '&',
  '%',
  '$',
  '^',
  ':',
  '.',
  '"',
  '<',
  '>',
  '|',
  '/',
  '-',
  '+',
  '=',
  '🐶',
  '🐾',
  '💥',
  '🔥',
  '🌈',
  '❤️',
  '⭐',
  '✨',
  '🚀',
  '👻',
  '🦄',
  '🦖',
  '🎵',
  '🌀',
  '💻',
  '🐿️',
  '🎾',
  '🦴',
  '💩',
  '🍕',
];

export const mode: ModeCode = {
  emptyToast: t('emptyToast'),
  typing: 'lounge',
  demos: DEMOS,
  keys: KEYS,
  sheet: SHEET,
  backdrop: () => new MatrixRain(),
  status(src) {
    const L = lex(src);
    return { ok: t('errors0'), count: L.lines.filter((l) => l.some((x) => x.t !== 'space')).length, unit: t('threads') };
  },
  player: (audio) => new Player(audio),
  drawer({ audio, item, refresh }) {
    const voices: [VoiceMode, string, string][] = [
      ['system', t('voiceSystem'), t('voiceSystemSub')],
      ['babble', t('voiceBabble'), t('voiceBabbleSub')],
    ];
    return [
      {
        title: t('voice'),
        items: voices.map(([vm, name, sub]) =>
          item((audio.voice === vm ? '✓ ' : '') + name, sub, () => {
            audio.setVoice(vm);
            audio.init();
            setTimeout(() => audio.speak(t('voiceHello'), 1, 1), 150);
            refresh();
          }),
        ),
      },
    ];
  },
};
