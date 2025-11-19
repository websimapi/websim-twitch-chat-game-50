// This file was extracted from map.js
import { TILE_TYPE } from '../map-tile-types.js';
import { project } from '../game/projection.js';

export class MapRenderer {
    constructor(map) {
        this.map = map;
    }

    getTallObjects(drawStartX, drawEndX, drawStartY, drawEndY) {
        const tallObjects = [];
        for (let j = drawStartY; j < drawEndY; j++) {
            for (let i = drawStartX; i < drawEndX; i++) {
                if (j < 0 || j >= this.map.height || i < 0 || i >= this.map.width) continue;
                const tileType = this.map.grid[j] ? this.map.grid[j][i] : TILE_TYPE.GRASS;
                const z = this.map.getHeight(i, j);
                
                if (tileType === TILE_TYPE.TREE) {
                    tallObjects.push({
                        type: 'tree',
                        x: i,
                        y: j,
                        z: z, 
                        image: this.map.treeTile,
                    });
                } else if (tileType === TILE_TYPE.LOGS || tileType === TILE_TYPE.BUSHES) {
                    // Include logs and bushes here for height rendering consistency in 2.5D
                    // They will be filtered in renderer.js if viewMode is 2D and we decide to draw them flat there.
                    // But for Z correctness, they are entities.
                    tallObjects.push({
                         type: tileType === TILE_TYPE.LOGS ? 'logs' : 'bushes',
                         x: i,
                         y: j,
                         z: z,
                         image: tileType === TILE_TYPE.LOGS ? this.map.logsTile : this.map.bushesTile
                    });
                }
            }
        }
        return tallObjects;
    }

    renderBase(ctx, cameraX, cameraY, drawStartX, drawEndX, drawStartY, drawEndY, viewMode) {
        if (!this.map.grassTile || !this.map.grassTile.complete) return;

        ctx.save();
        
        const ts = this.map.tileSize;
        const dirt = this.map.dirtTile;

        // In 2D mode, we just draw from top-left. Z is usually ignored or just tint.
        // In 2.5D, we draw blocks.
        
        // We need to manually project if we want to handle Z-height blocks.
        // The previous matrix transform approach is great for flat planes, but hard for stacks of blocks.
        // Let's switch to manual projection for tile drawing to support height.
        
        ctx.translate(-cameraX, -cameraY);

        // Expand range slightly to cover tall blocks or projection overlap
        const pad = 4;
        const safeStartX = Math.max(0, drawStartX - pad);
        const safeEndX = Math.min(this.map.width, drawEndX + pad);
        const safeStartY = Math.max(0, drawStartY - pad);
        const safeEndY = Math.min(this.map.height, drawEndY + pad);

        for (let j = safeStartY; j < safeEndY; j++) {
            for (let i = safeStartX; i < safeEndX; i++) {
                const h = this.map.getHeight(i, j);
                
                // Project the "floor" of the tile at height h
                const pos = project(i, j, h, viewMode, ts);
                
                // Draw the top face (Grass)
                if (viewMode === '2.5d') {
                    // Manual isometric draw for top face
                    // We can use the transform or just draw the sprite skewed?
                    // Actually, simpler: keep the context transform? No, Z changes per tile.
                    // Let's just use a helper to draw an iso tile if we don't want to change the transform 1000 times.
                    // Or, assume the sprite is already isometric? No, they are square textures.
                    
                    ctx.save();
                    ctx.translate(pos.x, pos.y);
                    ctx.transform(0.5, 0.25, -0.5, 0.25, 0, 0);
                    ctx.drawImage(this.map.grassTile, 0, 0, ts, ts);
                    
                    // Flower patches are flat on top of grass
                    const tileType = this.map.grid[j][i];
                    if (tileType === TILE_TYPE.FLOWER_PATCH) {
                        ctx.drawImage(this.map.flowerPatchTile, 0, 0, ts, ts);
                    }
                    
                    ctx.restore();

                    // Draw Cliffs (Side Faces)
                    if (dirt && dirt.complete && h > 0) {
                        // Check South neighbor (j+1)
                        const southH = (j + 1 < this.map.height) ? this.map.getHeight(i, j + 1) : -999;
                        if (h > southH) {
                            const drop = h - Math.max(0, southH); // Draw down to neighbor or 0
                            // South Face geometry in screen space
                            // Top edge is the bottom-left and bottom-right of the Top Face.
                            // Iso Top Face corners (relative to pos):
                            // Top: (0, -ts*0.5) ? No, 0,0 is top-left of image pre-transform.
                            // Transformed (0,0) -> (0,0). (ts,0) -> (0.5ts, 0.25ts). (0,ts) -> (-0.5ts, 0.25ts). (ts,ts) -> (0, 0.5ts).
                            // So Bottom Corner is (0, 0.5ts). Left is (-0.5ts, 0.25ts). Right is (0.5ts, 0.25ts).
                            
                            // South face connects Left-Bottom-Right.
                            // Actually, South face corresponds to the Y-axis side?
                            // In our projection, x-axis is right-down, y-axis is left-down?
                            // project: x_scr = (x-y), y_scr = (x+y).
                            // x+ goes Right-Down. y+ goes Left-Down? No.
                            // x=1, y=0 -> 0.5, 0.25 (Right Down)
                            // x=0, y=1 -> -0.5, 0.25 (Left Down)
                            // So y+ direction is "Left-Down" visually.
                            
                            // South (j+1) is Left-Down.
                            // So the face exposed by a lower South neighbor is the "South-East" face? 
                            // No, it's the face along the x-axis edge.
                            // Let's just draw vertical rectangles dropped down from the edge.
                            
                            // Left Edge: (-0.5ts, 0.25ts) to (0, 0.5ts).
                            // Right Edge: (0, 0.5ts) to (0.5ts, 0.25ts).
                            
                            // The face facing "South" (j increasing) is the one defined by the x-axis (i varying)?
                            // It's the face from (0, ts) to (ts, ts) in texture coords.
                            // In screen coords: (-0.5ts, 0.25ts) to (0, 0.5ts).
                            
                            // We need to draw dirt extending downwards by Z units.
                            // Z units in screen space: z * ts * 0.5.
                            
                            // Draw a transformed rectangle for the side?
                            // Or simply: Draw the dirt tile, darker, skewed, and stretched vertically?
                            // Simple blocky look: Just draw vertical strips.
                            
                            // Let's try simpler:
                            // Draw the South Face
                            const heightPx = (h - southH) * ts * 0.5;
                            // Vertices:
                            // TL: (-0.5ts, 0.25ts)
                            // TR: (0, 0.5ts)
                            // BL: (-0.5ts, 0.25ts + heightPx)
                            // BR: (0, 0.5ts + heightPx)
                            
                            // We can use a transform to draw the texture here.
                            // Shear Y?
                            ctx.save();
                            ctx.translate(pos.x, pos.y);
                            // We want to map (0,0)-(ts,ts) image to the parallelogram.
                            // Transform:
                            // (0,0) -> (-0.5ts, 0.25ts)
                            // (ts,0) -> (0, 0.5ts)
                            // (0,heightPx) -> ... vertical
                            
                            // This is getting complex for canvas 2d. 
                            // Alternative: Draw a solid color polygon.
                            ctx.fillStyle = '#5d4037'; // Dark Brown
                            ctx.beginPath();
                            ctx.moveTo(-0.5*ts, 0.25*ts);
                            ctx.lineTo(0, 0.5*ts);
                            ctx.lineTo(0, 0.5*ts + heightPx);
                            ctx.lineTo(-0.5*ts, 0.25*ts + heightPx);
                            ctx.closePath();
                            ctx.fill();
                            ctx.strokeStyle = '#3e2723';
                            ctx.stroke();
                            ctx.restore();
                        }
                        
                        // Check East neighbor (i+1)
                        const eastH = (i + 1 < this.map.width) ? this.map.getHeight(i + 1, j) : -999;
                        if (h > eastH) {
                            const heightPx = (h - eastH) * ts * 0.5;
                            // East face (facing x+)
                            // From (0, 0.5ts) to (0.5ts, 0.25ts)
                            ctx.save();
                            ctx.translate(pos.x, pos.y);
                            ctx.fillStyle = '#4e342e'; // Slightly different brown for shading
                            ctx.beginPath();
                            ctx.moveTo(0, 0.5*ts);
                            ctx.lineTo(0.5*ts, 0.25*ts);
                            ctx.lineTo(0.5*ts, 0.25*ts + heightPx);
                            ctx.lineTo(0, 0.5*ts + heightPx);
                            ctx.closePath();
                            ctx.fill();
                            ctx.strokeStyle = '#3e2723';
                            ctx.stroke();
                            ctx.restore();
                        }
                    }

                } else {
                    // 2D
                    const drawX = i * ts;
                    const drawY = j * ts;
                    ctx.drawImage(this.map.grassTile, drawX, drawY, ts, ts);
                    // Draw 2D flat objects
                    const tileType = this.map.grid[j][i];
                    if (tileType === TILE_TYPE.FLOWER_PATCH) ctx.drawImage(this.map.flowerPatchTile, drawX, drawY, ts, ts);
                    if (tileType === TILE_TYPE.LOGS) ctx.drawImage(this.map.logsTile, drawX, drawY, ts, ts);
                    if (tileType === TILE_TYPE.BUSHES) ctx.drawImage(this.map.bushesTile, drawX, drawY, ts, ts);
                    
                    // Render height indication in 2D? Maybe text or shade.
                    if (h > 0) {
                        ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(0.5, h * 0.1)})`;
                        ctx.fillRect(drawX, drawY, ts, ts);
                    }
                }
            }
        }

        ctx.restore();
    }
}