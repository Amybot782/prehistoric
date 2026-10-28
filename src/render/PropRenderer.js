import { objectDepth } from '../iso/depth.js';

/**
 * One sprite per static prop, anchored on its ground position and sorted
 * with the shared depth rule. Sprites outside the camera view are hidden
 * (cheap visibility culling), and tall props that hide the player are made
 * translucent so the character is never lost behind trees or walls.
 */
export class PropRenderer {
  constructor(scene, world, projection, origins) {
    this.scene = scene;
    this.world = world;
    this.proj = projection;
    this.origins = origins;
    this.views = [];
    this.visibleCount = 0;
    this._p = { x: 0, y: 0 };
  }

  buildAll() {
    for (const prop of this.world.props) this.addView(prop);
  }

  addView(prop) {
    const p = this.proj.worldToScreen(prop.x, prop.y, 0, this._p);
    const key = prop.def.texture;
    const o = this.origins[key] ?? { x: 0.5, y: 1 };
    const sprite = this.scene.add.image(p.x, p.y, key).setOrigin(o.x, o.y);
    sprite.setDepth(objectDepth(prop.x, prop.y));
    const view = { prop, sprite, faded: false };
    this.views.push(view);
    return view;
  }

  /**
   * @param {Phaser.Geom.Rectangle} worldView camera view in screen pixels
   * @param {{x:number,y:number,depth:number}} focus player's screen position and depth
   */
  update(worldView, focus) {
    let visible = 0;
    const margin = 64;
    const left = worldView.x - margin, right = worldView.right + margin;
    const top = worldView.y - margin, bottom = worldView.bottom + margin * 2;
    for (const v of this.views) {
      const s = v.sprite;
      const inView = s.x > left && s.x < right && s.y > top && s.y < bottom;
      s.setVisible(inView);
      if (!inView) continue;
      visible++;
      let fade = false;
      if (v.prop.def.occludes && s.depth > focus.depth) {
        const b = s.getBounds();
        fade = focus.x > b.x && focus.x < b.right && focus.y > b.y && focus.y < b.bottom;
      }
      if (fade !== v.faded) {
        v.faded = fade;
        s.setAlpha(fade ? 0.45 : 1);
      }
    }
    this.visibleCount = visible;
  }
}
