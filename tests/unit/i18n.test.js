import { describe, it, expect } from 'vitest';
import { t, setLocale } from '../../src/i18n/index.js';

describe('i18n', () => {
  it('traduit et remplace les paramètres', () => {
    expect(t('debug.player', { x: 1, y: 2 })).toBe('Joueur monde : x 1  y 2');
  });
  it('renvoie la clé si elle est absente et refuse une langue inconnue', () => {
    expect(t('inconnu.cle')).toBe('inconnu.cle');
    expect(() => setLocale('xx')).toThrow();
  });
});
