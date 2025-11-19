import * as StorageManager from '../storage-manager.js';
import { Map } from '../map.js';
import { TILE_TYPE } from '../map-tile-types.js';
import { createNoise2D } from 'https://esm.sh/simplex-noise';

export async function regenerateMapFeature(channel, worldName, feature, settings = null) {
    console.log(`Regenerating ${feature} for world ${worldName}...`);
    const worldState = await StorageManager.loadGameState(channel, worldName);
    if (!worldState) {
        alert(`Could not load world data for ${worldName}.`);
        return;
    }

    // Use a temporary Map instance to run the logic
    const tempMap = new Map(32); // tileSize is arbitrary here
    if (worldState.map && worldState.map.grid && worldState.map.grid.length > 0) {
        tempMap.grid = worldState.map.grid;
        // Sync dimensions to the loaded grid
        tempMap.height = tempMap.grid.length;
        tempMap.width = tempMap.grid[0].length;
    } else {
        // If map is empty, create a base grass grid
        tempMap.grid = Array(tempMap.height).fill(0).map(() => Array(tempMap.width).fill(TILE_TYPE.GRASS));
    }
    
    // Load existing height grid if available, or init new one
    if (worldState.map && worldState.map.heightGrid && worldState.map.heightGrid.length > 0) {
        tempMap.heightGrid = worldState.map.heightGrid;
        // Ensure heightGrid matches dimensions if resizing happened (basic check)
        while (tempMap.heightGrid.length < tempMap.height) {
             tempMap.heightGrid.push(Array(tempMap.width).fill(0));
        }
    } else {
        tempMap.heightGrid = Array(tempMap.height).fill(0).map(() => Array(tempMap.width).fill(0));
    }

    if (feature === 'trees') {
        tempMap.regenerateTrees();
    } else if (feature === 'flowers') {
        tempMap.regenerateFlowers();
    } else if (feature === 'terrain') {
        generateTerrain(tempMap, settings || { scale: 20, height_multiplier: 0, seed: Math.random() });
    }

    // Save the updated map back
    worldState.map.grid = tempMap.grid;
    worldState.map.heightGrid = tempMap.heightGrid;
    
    // We need to pass a Map-like object to saveGameState, not the full Player instances
    const dummyPlayers = new window.Map(); // Use window.Map to avoid conflict with the Map class from this module
    for (const id in worldState.players) {
        dummyPlayers.set(id, { getState: () => worldState.players[id] });
    }
    const dummyMap = { 
        grid: tempMap.grid, 
        heightGrid: tempMap.heightGrid,
        treeRespawns: worldState.map.treeRespawns || [] 
    };

    await StorageManager.saveGameState(channel, worldName, dummyPlayers, dummyMap, worldState.assets || {}, worldState.assetsGenerated || []);

    if (feature !== 'terrain') { // Terrain might be part of a larger reset, don't alert if silent
        alert(`${feature.charAt(0).toUpperCase() + feature.slice(1)} have been regenerated for "${worldName}"! The changes will be visible the next time you load the world.`);
    }
}

export function generateTerrain(map, settings) {
    console.log("Generating terrain with settings:", settings);
    let seed = settings.seed || Math.random();
    const noise2D = createNoise2D(() => {
        // Simple seeded random. Not perfect but sufficient.
        const x = Math.sin(seed++) * 10000;
        return x - Math.floor(x);
    });

    const scale = Math.max(1, settings.scale);
    const heightMult = settings.height_multiplier;

    // 1. Generate base noise
    for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
            let value = noise2D(x / scale, y / scale);
            
            // Add some detail with higher frequency noise (octaves)
            value += 0.5 * noise2D(2 * x / scale, 2 * y / scale);
            value += 0.25 * noise2D(4 * x / scale, 4 * y / scale);
            
            // Normalize. Simplex range approx -1 to 1. Sum of octaves increases range.
            // Max possible approx 1 + 0.5 + 0.25 = 1.75.
            // Normalize to 0..1
            const norm = (value + 1.75) / 3.5;
            
            // Apply power curve to flatten valleys and steepen peaks slightly (makes it look more like terrain)
            const shaped = Math.pow(norm, 1.5);

            const height = Math.floor(shaped * heightMult);
            map.heightGrid[y][x] = Math.max(0, height);
        }
    }

    // 2. Enforce slopes (Slope Constraint) - Make map walkable
    // Ensure difference between neighbors is at most 1
    let changed = true;
    let iterations = 0;
    const MAX_ITERATIONS = 100; // Prevent infinite loops

    while (changed && iterations < MAX_ITERATIONS) {
        changed = false;
        iterations++;

        // Pass 1: Top-Left to Bottom-Right
        for (let y = 0; y < map.height; y++) {
            for (let x = 0; x < map.width; x++) {
                const h = map.heightGrid[y][x];
                let newH = h;
                
                const neighbors = [];
                if (x > 0) neighbors.push(map.heightGrid[y][x-1]);
                if (y > 0) neighbors.push(map.heightGrid[y-1][x]);
                if (x < map.width - 1) neighbors.push(map.heightGrid[y][x+1]);
                if (y < map.height - 1) neighbors.push(map.heightGrid[y+1][x]);

                for (const nh of neighbors) {
                    // If I am much higher than neighbor, lower me
                    if (newH > nh + 1) {
                        newH = nh + 1;
                        changed = true;
                    }
                    // If I am much lower than neighbor, raise me (fill pits)
                    if (newH < nh - 1) {
                        newH = nh - 1;
                        changed = true;
                    }
                }
                map.heightGrid[y][x] = newH;
            }
        }

        // Pass 2: Bottom-Right to Top-Left (helps propagation speed)
        for (let y = map.height - 1; y >= 0; y--) {
            for (let x = map.width - 1; x >= 0; x--) {
                const h = map.heightGrid[y][x];
                let newH = h;
                
                const neighbors = [];
                if (x > 0) neighbors.push(map.heightGrid[y][x-1]);
                if (y > 0) neighbors.push(map.heightGrid[y-1][x]);
                if (x < map.width - 1) neighbors.push(map.heightGrid[y][x+1]);
                if (y < map.height - 1) neighbors.push(map.heightGrid[y+1][x]);

                for (const nh of neighbors) {
                     if (newH > nh + 1) {
                        newH = nh + 1;
                        changed = true;
                    }
                    if (newH < nh - 1) {
                        newH = nh - 1;
                        changed = true;
                    }
                }
                map.heightGrid[y][x] = newH;
            }
        }
    }

    console.log(`Terrain generation complete. Slope smoothing took ${iterations} iterations.`);
}