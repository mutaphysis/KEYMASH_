import type { Demo } from '../../ui/storage';
import { t } from './messages';

export const DEMOS: Demo[] = [
  { name: t('demoDog'), src: 'jfkdlsöä asdfghjkl JJJJJJJJJ 🐶\nkkkkk  ddddd h h hhhh\nWOOF!!! ölkjhg 🐾🐾🐾 qqqqqqqq' },
  { name: t('demoDrum'), src: 'd..h.dk.h.d..h.k.\nh h h h h h h hhhh\nb . . b . . b . b . . b . bb .\nqwertzuiop . poiuztrewq . asdf ~' },
  { name: t('demoKid'), src: 'hallo ich bin 6 und kann programmieren!!!\n2+2= 7*6= 100-1=\nMAMA PAPA 🦄🌈🐶\nlalala ~~~ 🎵🎵' },
  { name: t('demoHack'), src: 'HACK THE PLANET ### 💻\n[asdf] & 3(qwer) {{{ ~~~\nsudo rm -rf / !!! 😎\n1337 * 42 = 🕶️ %' },
  { name: t('demoMath'), src: '3+4*2= 12/0= 2^10= 9^9^9=\n~~~ % ~ @@ 🧮 📈\n1 2 3 4 5 6 7 8 9 0' },
  { name: t('demoBallet'), src: '🐾 ölkjhgfdsa ~ asdfghjklö ~ 🐾\n{ yxcvbnm } { mnbvcxy } mmmm %\n...ooooooooooo... 🫧 ✨' },
  { name: t('demoTunnel'), src: 'eeeeeeee 🌀 rrrrrr\n@@@ %% ~~~~~~\n💫 zzzz ZZZZ zzzz !!!!' },
];
