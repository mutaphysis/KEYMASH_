import type { Demo } from '../../ui/storage';
import { t } from './messages';

export const DEMOS: Demo[] = [
  { name: t('petriFirst'), src: 'asdf jkl ölk 🌿\nqwert zuiop . 5 . 5\n☀️ * 🌱 7 . 7' },
  { name: t('petriHunters'), src: 'mmm nnn bbb yyy xxx ccc vvv 🌿\nHUNTER GRRR >>\n🌿 9 . 9 . 9 ☀️' },
  { name: t('petriSymbiosis'), src: 'aaa sss & ddd 🌱\nooo ppp & iii\n☀️ 4 . 4 . 4 💞' },
  { name: t('petriSpores'), src: 'fungi . . . . 🍄\nxcvb !!! ☠️\n🌿 6 . 6 #' },
  { name: t('petriSwirl'), src: 'sss @@ sss ~~~\n💧 ~ 💧 ~ 🌿 3\nvolvox ((( ooo ))) ☀️' },
  { name: t('petriWinter'), src: 'qwqwqw ~ erer 🌿\n❄️ . . . 3 . . .\nlkjh gfds ☀️' },
  { name: t('petriDog'), src: 'jfkdlsöä asdfghjkl JJJJJJJJJ\nkkkkk ddddd h h hhhh 🌿 5\nWOOF!!! ölkjhg 🐾 qqqqqqqq ☀️' },
  { name: t('petriMath'), src: '3*7= 12+30= 🌿\nasdf * jklö * ☀️\n"look, it grows"' },
];
