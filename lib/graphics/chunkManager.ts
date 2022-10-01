import {
    Mesh,
    VertexData,
} from "babylonjs"
import alea from "alea"
import {createNoise2D} from "simplex-noise"

const noise1 = createNoise2D(alea("seed1"))
const noise2 = createNoise2D(alea("seed2"))

/**
 * 
 * @param noiseFn 
 * @param {number} x 
 * @param {number} y 
 * @param {number} scale  
 * @param {number} octaves increase detail of terrain
 * @param {number} persistence controls frequency over time
 * @param {number} exponentiation controls the general height of terrain
 * @returns {number}
 */
 const fractionalBMotion = (
    noiseFn = noise1,
    x: number,
    y: number,
    scale: number,
    octaves: number,
    persistence: number,
    exponentiation: number
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
        frequency *= 2.0;
    }
    total /= normalization
    // negative base always returns NaN for some reason. need
    // to cast to positive then add negative sign back
    return total < 0 ? 
        -(Math.abs(total) ** exponentiation)
        : total ** exponentiation
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

const CHUNK_SIZE = 128

const voxelMaxHeight = 128
const oceanLevel = ~~(voxelMaxHeight * 0.25)
const beachLevel = oceanLevel + 4
const snowLevel = ~~(voxelMaxHeight * 0.67)
const mountainLevel = ~~(voxelMaxHeight * 0.48)

const biome = (elevation: number, moisture: number) => {
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

const LOADED_CHUNKS = 7
const X_BIAS = CHUNK_SIZE * CHUNK_SIZE * LOADED_CHUNKS
const Z_BIAS = CHUNK_SIZE
const VOXELS_PER_CHUNK = CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE
const SIZEOF_VOXEL = 2
const TERRAIN_MID = 50
const CHUNK_BUFFER_SIZE = VOXELS_PER_CHUNK * SIZEOF_VOXEL

class Chunk {
    voxelBuffer: Int32Array
    mesh: Mesh
    x: number
    y: number
    z: number
    vPtr: number
    vertexData: VertexData
    id: number
    xGrid: number
    zGrid: number
    absoluteOffset: number

    constructor({
        id, x, y, z, voxBuf, xGrid, zGrid
    }: {
        x: number, 
        y: number, 
        z: number,
        voxBuf: SharedArrayBuffer,
        id: number,
        xGrid: number,
        zGrid: number
    }) {
        this.id = id
        this.voxelBuffer = new Int32Array(voxBuf)
        this.mesh = new Mesh("rand")
        this.x = x
        this.y = y
        this.z = z
        this.vPtr = 0
        this.vertexData = new VertexData()
        this.xGrid = xGrid
        this.zGrid = zGrid
    }

    voxel(x: number, y: number, z: number) {
        this.vPtr = (x * X_BIAS + z * Z_BIAS + y) * SIZEOF_VOXEL
        return this
    }

    get active () {
        return Boolean(this.voxelBuffer[this.vPtr + 1])
    }

    set active(a: boolean) {
        this.voxelBuffer[this.vPtr + 1] = Number(a)
    }

    get type() {
        return this.voxelBuffer[this.vPtr]
    }

    set type(t: number) {
        this.voxelBuffer[this.vPtr] = t
    }

    init() {
        const xBase = this.x
        const zBase = this.z
        const xGrid = this.xGrid
        const zGrid = this.zGrid
        for (let x = 0; x < CHUNK_SIZE; x++) {
            const xReal = xBase + x
            const xG = xGrid + x
            for (let z = 0; z < CHUNK_SIZE; z++) {
                const zReal = zBase + z
                const zG = zGrid + z
                const elevation = fractionalBMotion(
                    noise1, xReal, zReal, 200.0, 6.0, 0.4, 2.00
                )
                const height = Math.abs(~~(elevation * 128.0) + TERRAIN_MID)
                const moisture = fractionalBMotion(
                    noise2, xReal, zReal, 512.0, 4.0, 0.5, 4.0
                )
                for (let y = 0; y < height; y++) {
                    const v = this.voxel(xG, y, zG)
                    v.active = true
                    v.type = biome(height, moisture)
                }
                /* water generation => do later
                for (let y = height; y < oceanLevel; y++) {
                    const v = this.voxel(x, y, z)
                    v.active = true
                    v.type = voxel.water
                }
                */
            }
        }
        return this
    }

    render() {
        const xBase = this.x
        const yBase = this.y
        const zBase = this.z
        const xGrid = this.xGrid
        const zGrid = this.zGrid
        const indices: number[] = []
        const vertices: number[] = []
        const colors: number[] = []
        for (let x = 0; x < CHUNK_SIZE; x++) {
            const xG = xGrid + x
            const xReal = xBase + x
            for (let z = 0; z < CHUNK_SIZE; z++) {
                const zG = zGrid + z
                const zReal = zBase + z
                for (let y = 0; y < CHUNK_SIZE; y++) {
                    const {active, type} = this.voxel(xG, y, zG)
                    if (!active) {
                        continue
                    }

                    const renderNegativeX = !this.voxel(xG - 1, y, zG).active
                    const renderPositiveX = !this.voxel(xG + 1, y, zG).active
                    const renderNegativeY = y > 0 && !this.voxel(xG, y - 1, zG).active
                    const renderPositiveY = y < CHUNK_BUFFER_SIZE - 2 && !this.voxel(xG, y + 1, zG).active
                    const renderNegativeZ = !this.voxel(xG, y, zG - 1).active
                    const renderPositiveZ = !this.voxel(xG, y, zG + 1).active

                    if (
                        !renderNegativeX && !renderPositiveX
                        && !renderNegativeY && !renderPositiveY
                        && !renderNegativeZ && !renderPositiveZ
                    ) {
                        continue
                    }

                    
                    const yReal = yBase + y
                    const b = vertices.length / 3
                    vertices.push(
                        xReal + 0, yReal + 0, zReal + 0,
                        xReal + 0, yReal + 0, zReal + 1,
                        xReal + 1, yReal + 0, zReal + 0,
                        xReal + 1, yReal + 0, zReal + 1,
                        xReal + 0, yReal + 1, zReal + 0,
                        xReal + 0, yReal + 1, zReal + 1,
                        xReal + 1, yReal + 1, zReal + 0,
                        xReal + 1, yReal + 1, zReal + 1
                    )
                    switch(type) {
                        case voxel.grass:
                            colors.push(
                                0.45, 1, 0.45, 1,
                                0.45, 1, 0.45, 1,
                                0.45, 1, 0.45, 1,
                                0.45, 1, 0.45, 1,
                                0.45, 1, 0.45, 1,
                                0.45, 1, 0.45, 1,
                                0.45, 1, 0.45, 1,
                                0.45, 1, 0.45, 1,
                            )
                            break
                        case voxel.water:
                            colors.push(
                                0.3, 0.3, 1, 1,
                                0.3, 0.3, 1, 1,
                                0.3, 0.3, 1, 1,
                                0.3, 0.3, 1, 1,
                                0.3, 0.3, 1, 1,
                                0.3, 0.3, 1, 1,
                                0.3, 0.3, 1, 1,
                                0.3, 0.3, 1, 1,
                            )
                            break
                        case voxel.dirt:
                            colors.push(
                                0.55, 0.15, 0.08, 1,
                                0.55, 0.15, 0.08, 1,
                                0.55, 0.15, 0.08, 1,
                                0.55, 0.15, 0.08, 1,
                                0.55, 0.15, 0.08, 1,
                                0.55, 0.15, 0.08, 1,
                                0.55, 0.15, 0.08, 1,
                                0.55, 0.15, 0.08, 1,
                            )
                            break
                        case voxel.stone:
                            colors.push(
                                0.8, 0.8, 0.8, 1,
                                0.8, 0.8, 0.8, 1,
                                0.8, 0.8, 0.8, 1,
                                0.8, 0.8, 0.8, 1,
                                0.8, 0.8, 0.8, 1,
                                0.8, 0.8, 0.8, 1,
                                0.8, 0.8, 0.8, 1,
                                0.8, 0.8, 0.8, 1,
                            )
                            break
                        case voxel.snow:
                            colors.push(
                                1.0, 1.0, 1.0, 1,
                                1.0, 1.0, 1.0, 1,
                                1.0, 1.0, 1.0, 1,
                                1.0, 1.0, 1.0, 1,
                                1.0, 1.0, 1.0, 1,
                                1.0, 1.0, 1.0, 1,
                                1.0, 1.0, 1.0, 1,
                                1.0, 1.0, 1.0, 1,
                            )
                            break
                        case voxel.sand:
                            colors.push(
                                0.9, 0.87, 0.65, 1,
                                0.9, 0.87, 0.65, 1,
                                0.9, 0.87, 0.65, 1,
                                0.9, 0.87, 0.65, 1,
                                0.9, 0.87, 0.65, 1,
                                0.9, 0.87, 0.65, 1,
                                0.9, 0.87, 0.65, 1,
                                0.9, 0.87, 0.65, 1,
                            )
                            break
                        default:
                            colors.push(
                                0, 1, 0, 1,
                                0, 1, 0, 1,
                                0, 1, 0, 1,
                                0, 1, 0, 1,
                                0, 1, 0, 1,
                                0, 1, 0, 1,
                                0, 1, 0, 1,
                                0, 1, 0, 1,
                            )
                            break
                    }
                    if (renderNegativeX) {
                        indices.push(
                            b + 0, b + 5, b + 1,
                            b + 4, b + 5, b + 0,
                        )
                    }
                    if (renderPositiveX) {
                        indices.push(
                            b + 2, b + 3, b + 7,
                            b + 2, b + 7, b + 6,
                        )
                    }
                    
                    if (renderNegativeY) {
                        indices.push(
                            b + 0, b + 1, b + 2,
                            b + 3, b + 2, b + 1,
                        )
                    }
            
                    if (renderPositiveY) {
                        indices.push(
                            b + 4, b + 6, b + 5,
                            b + 7, b + 5, b + 6,
                        )
                    }
            
                    if (renderNegativeZ) {
                        indices.push(
                            b + 0, b + 2, b + 4,
                            b + 4, b + 2, b + 6,
                        )
                    }
                    
                    if (renderPositiveZ) {
                        indices.push(
                            b + 1, b + 5, b + 3,
                            b + 5, b + 7, b + 3,
                        )
                    }
                }
            }
        }
        const vertexData = this.vertexData
        vertexData.indices = indices
        vertexData.positions = vertices
        vertexData.colors = colors
        this.mesh.dispose()
        const mesh = new Mesh(`chunk[${this.x.toString()}][${this.y.toString()}][${this.z.toString()}]`)
        vertexData.applyToMesh(mesh, true)
        this.mesh = mesh
        return this
    }
}

export class ChunkManager {
    chunks: Chunk[]
    originX: number
    originZ: number
    originColumn: number
    originRow: number
    originChunkIndex: number
    chunkDimensions: number
    
    constructor() {
        this.chunks = []
        this.originX = 0
        this.originZ = 0
        this.originChunkIndex = 0
        this.chunkDimensions = LOADED_CHUNKS
    }

    initGeneration() {
        const chunkDim = LOADED_CHUNKS
        const bufNum = chunkDim * chunkDim
        const voxBuf = new SharedArrayBuffer(
            CHUNK_BUFFER_SIZE * bufNum * Int32Array.BYTES_PER_ELEMENT
        )
        const chunks: Chunk[] = []
        const xbase = 0
        const zbase = 0
        let xOffset = xbase
        let zOffset = zbase
        for (let row = 0; row < chunkDim; row++) {
            for (let column = 0; column < chunkDim; column++) {
                const chunk = new Chunk({
                    x: xOffset, y: 0, z: zOffset, 
                    voxBuf, id: (row * chunkDim) + column,
                    xGrid: row * CHUNK_SIZE, 
                    zGrid: column * CHUNK_SIZE,
                }).init()
                chunks.push(chunk)
                zOffset += CHUNK_SIZE
            }
            zOffset = zbase
            xOffset += CHUNK_SIZE
        }
        this.chunks = chunks
        return this
    }

    initRender() {
        const chunkDim = this.chunkDimensions
        const c = this.chunks
        for (let x = 1; x < chunkDim - 1; x++) {
            for (let z = 1; z < chunkDim - 1; z++) {
                const id = (x * chunkDim) + z
                c[id].render()
            }
        }
        return this
    }

    isVoxelSolid(x: number, y: number, z: number) {
        const row = ~~(x / CHUNK_SIZE)
        const col = ~~(z / CHUNK_SIZE)
        const targetChunk = (row * this.chunkDimensions) + col
        const xReal = row * CHUNK_SIZE + x % CHUNK_SIZE
        const zReal = col * CHUNK_SIZE + z % CHUNK_SIZE
        return this.chunks[targetChunk].voxel(xReal, y, zReal)
    }
}