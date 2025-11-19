// This file was extracted from map.js
import { TILE_TYPE } from '../map-tile-types.js';
import { project } from '../game/projection.js';

export class MapRenderer {
    constructor(map) {
        this.map = map;
        this.grassPattern2_5d = null;
    }

    getTallObjects(drawStartX, drawEndX, drawStartY, drawEndY) {
        const tallObjects = [];
        for (let j = drawStartY; j < drawEndY; j++) {
            for (let i = drawStartX; i < drawEndX; i++) {
                if (j < 0 || j >= this.map.height || i < 0 || i >= this.map.width) continue;
                const tileType = this.map.grid[j] ? this.map.grid[j][i] : TILE_TYPE.GRASS;
                const z = this.map.getHeight(i + 0.5, j + 0.5);
                
                if (tileType === TILE_TYPE.TREE) {
                    tallObjects.push({
                        type: 'tree',
                        x: i,
                        y: j,
                        z: z, 
                        image: this.map.treeTile,
                    });
                } else if (tileType === TILE_TYPE.LOGS || tileType === TILE_TYPE.BUSHES) {
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

        ctx.translate(-cameraX, -cameraY);

        // Expand range slightly to cover projection overlap
        const pad = 4;
        const safeStartX = Math.max(0, drawStartX - pad);
        const safeEndX = Math.min(this.map.width, drawEndX + pad);
        const safeStartY = Math.max(0, drawStartY - pad);
        const safeEndY = Math.min(this.map.height, drawEndY + pad);

        for (let j = safeStartY; j < safeEndY; j++) {
            for (let i = safeStartX; i < safeEndX; i++) {
                // Sample height at tile center so slopes are smooth
                const h = this.map.getHeight(i + 0.5, j + 0.5);
                
                const pos = project(i, j, h, viewMode, ts);
                
                if (viewMode === '2.5d') {
                    // --- Render each grid cell with its own grass tile sprite in 2.5D ---

                    // Center of this tile in projected space
                    const centerPos = project(i + 0.5, j + 0.5, h, viewMode, ts);

                    // Size the grass sprite to fit nicely inside the isometric diamond
                    const spriteWidth = ts;
                    const spriteHeight = ts * 0.55; // slightly squashed for isometric feel

                    const drawX = centerPos.x - spriteWidth / 2;
                    const drawY = centerPos.y - spriteHeight * 0.5;

                    ctx.drawImage(this.map.grassTile, drawX, drawY, spriteWidth, spriteHeight);

                    // Overlay flowers on top of the sloped ground
                    const tileType = this.map.grid[j][i];
                    if (tileType === TILE_TYPE.FLOWER_PATCH && this.map.flowerPatchTile && this.map.flowerPatchTile.complete) {
                        const flowerSize = ts * 0.5;
                        const flowerX = centerPos.x - flowerSize / 2;
                        const flowerY = centerPos.y - flowerSize * 0.75;
                        ctx.drawImage(this.map.flowerPatchTile, flowerX, flowerY, flowerSize, flowerSize);
                    }

                } else {
                    // 2D
                    const drawX = i * ts;
                    const drawY = j * ts;
                    ctx.drawImage(this.map.grassTile, drawX, drawY, ts, ts);
                    const tileType = this.map.grid[j][i];
                    if (tileType === TILE_TYPE.FLOWER_PATCH && this.map.flowerPatchTile && this.map.flowerPatchTile.complete) {
                        ctx.drawImage(this.map.flowerPatchTile, drawX, drawY, ts, ts);
                    }
                    if (tileType === TILE_TYPE.LOGS && this.map.logsTile && this.map.logsTile.complete) {
                        ctx.drawImage(this.map.logsTile, drawX, drawY, ts, ts);
                    }
                    if (tileType === TILE_TYPE.BUSHES && this.map.bushesTile && this.map.bushesTile.complete) {
                        ctx.drawImage(this.map.bushesTile, drawX, drawY, ts, ts);
                    }

                    // Very subtle height tint in 2D so terrain isn't visually flat
                    if (h > 0) {
                        const alpha = Math.min(0.4, h * 0.05);
                        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
                        ctx.fillRect(drawX, drawY, ts, ts);
                    }
                }
            }
        }

        ctx.restore();
    }
}