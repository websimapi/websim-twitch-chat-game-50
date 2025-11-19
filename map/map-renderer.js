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
        const pad = 12; // Increased padding to account for taller terrain
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
                    if (h > 0) {
                        const dirtTexture = dirt && dirt.complete ? dirt : null;
                        let fillStyleSouth = '#5d4037'; // Fallback Dark Brown
                        let fillStyleEast = '#4e342e'; // Fallback
                        
                        if (dirtTexture) {
                            // Create a pattern for the dirt
                            const pattern = ctx.createPattern(dirtTexture, 'repeat');
                            // We can adjust pattern transform if needed, but default usually works for vertical walls
                            fillStyleSouth = pattern;
                            fillStyleEast = pattern;
                        }

                        // Check South neighbor (j+1)
                        const southH = (j + 1 < this.map.height) ? this.map.getHeight(i, j + 1) : -999;
                        if (h > southH) {
                            const heightPx = (h - Math.max(0, southH)) * ts * 0.5;
                            
                            ctx.save();
                            ctx.translate(pos.x, pos.y);
                            
                            ctx.fillStyle = fillStyleSouth;
                            ctx.beginPath();
                            ctx.moveTo(-0.5*ts, 0.25*ts);
                            ctx.lineTo(0, 0.5*ts);
                            ctx.lineTo(0, 0.5*ts + heightPx);
                            ctx.lineTo(-0.5*ts, 0.25*ts + heightPx);
                            ctx.closePath();
                            ctx.fill();
                            
                            // Add a border/shadow line for definition
                            ctx.strokeStyle = 'rgba(0,0,0,0.3)';
                            ctx.stroke();
                            ctx.restore();
                        }
                        
                        // Check East neighbor (i+1)
                        const eastH = (i + 1 < this.map.width) ? this.map.getHeight(i + 1, j) : -999;
                        if (h > eastH) {
                            const heightPx = (h - Math.max(0, eastH)) * ts * 0.5;
                            
                            ctx.save();
                            ctx.translate(pos.x, pos.y);
                            
                            // Darken the east face slightly if using texture
                            ctx.fillStyle = fillStyleEast;
                            
                            ctx.beginPath();
                            ctx.moveTo(0, 0.5*ts);
                            ctx.lineTo(0.5*ts, 0.25*ts);
                            ctx.lineTo(0.5*ts, 0.25*ts + heightPx);
                            ctx.lineTo(0, 0.5*ts + heightPx);
                            ctx.closePath();
                            ctx.fill();

                            if (dirtTexture) {
                                // Overlay a semi-transparent black to shade the east side
                                ctx.fillStyle = 'rgba(0,0,0,0.2)';
                                ctx.fill();
                            }
                            
                            ctx.strokeStyle = 'rgba(0,0,0,0.3)';
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