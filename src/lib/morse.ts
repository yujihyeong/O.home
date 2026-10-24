// 모스부호 변환 (사용자 요청 — 모스부호 위젯) — 한글은 자모로 풀어 한글 모스부호(SKATS), 영문·숫자는 국제 모스부호
const KO: Record<string, string> = {
  'ㄱ': '.-..', 'ㄴ': '..-.', 'ㄷ': '-...', 'ㄹ': '...-', 'ㅁ': '--', 'ㅂ': '.--', 'ㅅ': '--.', 'ㅇ': '-.-',
  'ㅈ': '.--.', 'ㅊ': '-.-.', 'ㅋ': '-..-', 'ㅌ': '--..', 'ㅍ': '---', 'ㅎ': '.---',
  'ㅏ': '.', 'ㅑ': '..', 'ㅓ': '-', 'ㅕ': '...', 'ㅗ': '.-', 'ㅛ': '-.', 'ㅜ': '....', 'ㅠ': '.-.',
  'ㅡ': '-..', 'ㅣ': '..-', 'ㅐ': '--.-', 'ㅔ': '-.--',
};
const EN: Record<string, string> = {
  A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....', I: '..', J: '.---',
  K: '-.-', L: '.-..', M: '--', N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.', S: '...', T: '-',
  U: '..-', V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..',
  '0': '-----', '1': '.----', '2': '..---', '3': '...--', '4': '....-', '5': '.....', '6': '-....',
  '7': '--...', '8': '---..', '9': '----.', '.': '.-.-.-', ',': '--..--', '?': '..--..', '!': '-.-.--',
};
const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const JUNG = ['ㅏ', 'ㅐ', 'ㅑ', 'ㅑㅣ', 'ㅓ', 'ㅔ', 'ㅕ', 'ㅕㅣ', 'ㅗ', 'ㅗㅏ', 'ㅗㅐ', 'ㅗㅣ', 'ㅛ', 'ㅜ', 'ㅜㅓ', 'ㅜㅔ', 'ㅜㅣ', 'ㅠ', 'ㅡ', 'ㅡㅣ', 'ㅣ'];
const JONG = ['', 'ㄱ', 'ㄱㄱ', 'ㄱㅅ', 'ㄴ', 'ㄴㅈ', 'ㄴㅎ', 'ㄷ', 'ㄹ', 'ㄹㄱ', 'ㄹㅁ', 'ㄹㅂ', 'ㄹㅅ', 'ㄹㅌ', 'ㄹㅍ', 'ㄹㅎ', 'ㅁ', 'ㅂ', 'ㅂㅅ', 'ㅅ', 'ㅅㅅ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
const DOUBLE: Record<string, string> = { 'ㄲ': 'ㄱㄱ', 'ㄸ': 'ㄷㄷ', 'ㅃ': 'ㅂㅂ', 'ㅆ': 'ㅅㅅ', 'ㅉ': 'ㅈㅈ' };

/** 한 글자 → 부호 ('.'·'-'), 못 바꾸면 null. 한글 한 글자는 자모 부호를 이어 붙인 것 */
function codeOf(ch: string): string | null {
  const c = ch.charCodeAt(0) - 0xac00;
  if (c >= 0 && c <= 11171) {
    const cho = CHO[Math.floor(c / 588)];
    const jamo = (DOUBLE[cho] ?? cho) + JUNG[Math.floor((c % 588) / 28)] + JONG[c % 28];
    return [...jamo].map(j => KO[j] ?? '').join('');
  }
  if (KO[ch]) return KO[ch];
  return EN[ch.toUpperCase()] ?? null;
}

export type MorseUnit = { ch: string; code: string } | { space: true };

/** 문장 → 글자별 부호 (띄어쓰기는 space, 바꿀 수 없는 기호는 건너뜀) */
export function toMorse(text: string): MorseUnit[] {
  const out: MorseUnit[] = [];
  for (const ch of text.normalize('NFC')) {
    if (/\s/.test(ch)) { if (out.length && !('space' in out[out.length - 1])) out.push({ space: true }); continue; }
    const code = codeOf(ch);
    if (code) out.push({ ch, code });
  }
  while (out.length && 'space' in out[out.length - 1]) out.pop();
  return out;
}
