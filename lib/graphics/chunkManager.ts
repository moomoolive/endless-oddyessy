type NoiseGenerator = (x: number, y: number) => number

/**
 * 
 * @param noiseFn 
 * @param {number} x 
 * @param {number} y 
 * @param {number} scale  
 * @param {number} octaves increase detail of terrain, requires integer value
 * @param {number} persistence controls frequency over time
 * @param {number} exponentiation controls the general height of terrain
 * @returns {number}
 */

export const fractionalBMotion = (
    noiseFn: NoiseGenerator,
    x: number,
    y: number,
    scale: number,
    octaves: number,
    persistence: number,
    exponentiation: number,
    lacunarity: number,
) => {
    const xs = x / scale
    const ys = y / scale
    let amplitude = 1.0
    let frequency = 1.0
    let normalization = 0
    let total = 0
    for (let octave = 0; octave < octaves; octave++) {
        total += noiseFn(xs * frequency, ys * frequency) * amplitude
        normalization += amplitude
        amplitude *= persistence
        frequency *= lacunarity
    }
    total /= normalization
    // negative base always returns NaN for some reason. need
    // to cast to positive then add negative sign back
    //return total < 0 ? 
    //    -(Math.abs(total) ** exponentiation)
    //    : total ** exponentiation
    const exp = total < 0 ? 
        -(Math.abs(total) ** exponentiation)
        : total ** exponentiation
    return exp
}

export const enum voxel {
    air,
    stone,
    grass,
    dirt,
    water,
    sand,
    snow
}

const CHUNK_X_DIM = 16
const CHUNK_Z_DIM = 16
const CHUNK_Y_DIM = 128
const TERRAIN_MID = 50

const oceanLevel = ~~(CHUNK_Y_DIM * 0.25)
const beachLevel = oceanLevel + 4
const snowLevel = ~~(CHUNK_Y_DIM * 0.67)
const mountainLevel = ~~(CHUNK_Y_DIM * 0.48)

export const biome = (elevation: number, moisture: number) => {
    if (elevation < beachLevel) {
        return voxel.sand
    } else if (elevation > snowLevel) {
        return voxel.snow
    } else if (elevation > mountainLevel) {
        if (moisture < 0.1) {
            return voxel.stone
        } else {
            return voxel.grass
        }
    } else {
        return voxel.grass
    }
}