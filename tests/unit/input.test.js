import { describe, it, expect } from 'vitest';
import { InputMap } from '../../src/input/InputMap.js';
import bindings from '../../src/data/keybindings.json';

const key = (code) => ({ code, preventDefault() {} });

describe('InputMap', () => {
  it('les touches physiques WASD donnent ZQSD sur AZERTY (mêmes codes)', () => {
    const m = new InputMap(bindings);
    m.handleKeyDown(key('KeyW')); // touche "Z" sur un clavier AZERTY
    m.handleKeyDown(key('KeyA')); // touche "Q" sur un clavier AZERTY
    expect(m.moveAxes()).toEqual({ x: -1, y: -1 });
    m.handleKeyUp(key('KeyW'));
    expect(m.moveAxes()).toEqual({ x: -1, y: 0 });
  });

  it('les directions opposées s’annulent et les flèches fonctionnent aussi', () => {
    const m = new InputMap(bindings);
    m.handleKeyDown(key('KeyD'));
    m.handleKeyDown(key('ArrowLeft'));
    expect(m.moveAxes().x).toBe(0);
  });

  it('détecte un appui une seule fois (front montant)', () => {
    const m = new InputMap(bindings);
    m.handleKeyDown(key('F3'));
    expect(m.justPressed('debugOverlay')).toBe(true);
    m.endFrame();
    m.handleKeyDown(key('F3')); // répétition automatique du clavier
    expect(m.justPressed('debugOverlay')).toBe(false);
    m.handleKeyUp(key('F3'));
    m.handleKeyDown(key('F3'));
    expect(m.justPressed('debugOverlay')).toBe(true);
  });

  it('relâche toutes les touches à la perte du focus', () => {
    const m = new InputMap(bindings);
    m.handleKeyDown(key('KeyD'));
    m.releaseAll();
    expect(m.isDown('moveRight')).toBe(false);
  });

  it('réassigne une touche et la retire de l’action qui l’utilisait', () => {
    const m = new InputMap(bindings);
    const stolen = m.rebind('run', ['KeyD']);
    expect(stolen).toEqual(['moveRight']);
    expect(m.exportBindings().moveRight).toEqual(['ArrowRight']);
    m.handleKeyDown(key('KeyD'));
    expect(m.isDown('run')).toBe(true);
    expect(m.isDown('moveRight')).toBe(false);
  });
});
