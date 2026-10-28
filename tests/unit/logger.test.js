import { describe, it, expect, vi } from 'vitest';
import { Logger } from '../../src/core/Logger.js';

describe('Logger', () => {
  it('garde un historique borné et transmet au journal fichier', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const sink = vi.fn();
    const l = new Logger({ capacity: 3, sink });
    for (let i = 0; i < 5; i++) l.log('info', 'test', `m${i}`);
    l.log('error', 'test', 'boom', new Error('x'));
    expect(l.entries).toHaveLength(3);
    expect(l.entries.at(-1).data.message).toBe('x');
    expect(sink).toHaveBeenCalledTimes(6);
  });

  it('un journal fichier défaillant ne fait pas planter le jeu', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const l = new Logger({ sink: () => { throw new Error('disque plein'); } });
    expect(() => l.log('info', 'test', 'ok')).not.toThrow();
  });
});
